import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { LarkNotifierPlugin } from "../index";

const REAL_TEST_FLAG = "RUN_LARK_REAL_TESTS";
const MESSAGE_ENDPOINT = "/im/v1/messages";
const TOKEN_ENDPOINT = "/auth/v3/tenant_access_token/internal";

type FetchObservation = {
  method: string;
  url: string;
  status: number;
  ok: boolean;
  responseText: string;
};

type EnvSnapshot = Record<string, string | undefined>;

const managedEnvKeys = [
  "LARK_APP_ID",
  "LARK_APP_SECRET",
  "LARK_USER_EMAIL",
  "LARK_USER_OPEN_ID",
  "LARK_USER_ID",
  "LARK_NOTIFIER_EVENTS",
  "LARK_NOTIFIER_RATE_LIMIT_MS",
  "LARK_NOTIFIER_COOLDOWN_MS",
  "LARK_NOTIFIER_NOTIFY_SUBAGENT_IDLE",
] as const;

const realFetch = globalThis.fetch.bind(globalThis);
let observations: FetchObservation[] = [];
let envSnapshot: EnvSnapshot = {};

function snapshotEnv(): EnvSnapshot {
  const snapshot: EnvSnapshot = {};

  for (const key of managedEnvKeys) {
    snapshot[key] = process.env[key];
  }

  return snapshot;
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const key of managedEnvKeys) {
    const value = snapshot[key];

    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

function installFetchRecorder(): void {
  const fetchRecorder = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const response = await realFetch(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (!url.includes("open.feishu.cn/open-apis")) {
      return response;
    }

    const responseText = url.includes(TOKEN_ENDPOINT) ? "<redacted-token-response>" : await response.clone().text();

    observations.push({
      method: init?.method ?? "GET",
      url,
      status: response.status,
      ok: response.ok,
      responseText,
    });

    return response;
  };

  globalThis.fetch = Object.assign(fetchRecorder, { preconnect: realFetch.preconnect });
}

function makePluginInput(): PluginInput {
  return {
    client: {
      app: {
        log: async () => {},
      },
    },
    project: {
      id: "opencode-lark-notifier-real-test",
      worktree: process.cwd(),
    },
    directory: process.cwd(),
    worktree: process.cwd(),
    serverUrl: "http://127.0.0.1:4096",
    $: Bun.$,
  } as unknown as PluginInput;
}

function configureFastRealRun(extraEvents = "custom.coverage.event"): void {
  process.env.LARK_NOTIFIER_EVENTS = extraEvents;
  process.env.LARK_NOTIFIER_RATE_LIMIT_MS = "0";
  process.env.LARK_NOTIFIER_COOLDOWN_MS = "80";
}

async function createHooks(): Promise<Hooks> {
  configureFastRealRun();
  const hooks = await LarkNotifierPlugin(makePluginInput());

  expect(hooks.event).toBeFunction();

  return hooks;
}

async function emit(hooks: Hooks, event: unknown): Promise<void> {
  await hooks.event?.({ event } as never);
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMessageCount(count: number): Promise<FetchObservation[]> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const messageCalls = observations.filter((item) => item.url.includes(MESSAGE_ENDPOINT));

    if (messageCalls.length >= count) {
      return messageCalls;
    }

    await wait(100);
  }

  return observations.filter((item) => item.url.includes(MESSAGE_ENDPOINT));
}

function expectSuccessfulMessage(call: FetchObservation): void {
  expect(call.method).toBe("POST");
  expect(call.status).toBe(200);

  const body = JSON.parse(call.responseText) as { code: number; msg: string };
  expect(body.code).toBe(0);
}

const maybeDescribe = process.env[REAL_TEST_FLAG] === "1" ? describe : describe.skip;

maybeDescribe("LarkNotifierPlugin real Feishu integration", () => {
  beforeEach(() => {
    observations = [];
    envSnapshot = snapshotEnv();
    installFetchRecorder();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    restoreEnv(envSnapshot);
  });

  test("returns empty hooks when required config is missing", async () => {
    process.env.LARK_APP_ID = "";
    process.env.LARK_APP_SECRET = "";

    const hooks = await LarkNotifierPlugin(makePluginInput());

    expect(hooks).toEqual({});
    expect(observations).toHaveLength(0);
  });

  test(
    "sends real Feishu messages for every handled event branch",
    async () => {
      const hooks = await createHooks();

      await emit(hooks, {
        type: "session.error",
        properties: {
          sessionID: "real-session-error",
          error: { data: { message: "真实集成测试：session.error" } },
        },
      });

      await emit(hooks, {
        type: "question.asked",
        properties: {
          sessionID: "real-question-asked",
          questions: [{ question: "真实集成测试：question.asked 是否发送成功？" }],
        },
      });

      await emit(hooks, {
        type: "permission.asked",
        properties: {
          sessionID: "real-permission-asked",
          permission: "bash: bun test",
        },
      });

      await emit(hooks, {
        type: "custom.coverage.event",
        properties: {
          sessionID: "real-custom-event",
        },
      });

      await emit(hooks, {
        type: "session.idle",
        properties: {
          sessionID: "real-session-idle",
        },
      });

      const messageCalls = await waitForMessageCount(5);

      expect(messageCalls).toHaveLength(5);
      expect(observations.some((item) => item.url.includes(TOKEN_ENDPOINT))).toBe(true);

      for (const call of messageCalls) {
        expectSuccessfulMessage(call);
      }
    },
    { timeout: 30_000 },
  );

  test(
    "skips ignored events, rate-limited duplicates, and idle cancelled by busy status",
    async () => {
      process.env.LARK_NOTIFIER_EVENTS = "";
      process.env.LARK_NOTIFIER_RATE_LIMIT_MS = "30000";
      process.env.LARK_NOTIFIER_COOLDOWN_MS = "80";

      const hooks = await LarkNotifierPlugin(makePluginInput());
      expect(hooks.event).toBeFunction();

      await emit(hooks, {
        type: "session.updated",
        properties: {
          sessionID: "ignored-session",
        },
      });

      await wait(300);
      expect(observations).toHaveLength(0);

      await emit(hooks, {
        type: "session.error",
        properties: {
          sessionID: "rate-limited-session",
          error: { data: { message: "第一次错误会发送" } },
        },
      });

      await emit(hooks, {
        type: "session.error",
        properties: {
          sessionID: "rate-limited-session",
          error: { data: { message: "第二次错误应被限流" } },
        },
      });

      await emit(hooks, {
        type: "session.idle",
        properties: {
          sessionID: "idle-cancelled-session",
        },
      });

      await emit(hooks, {
        type: "session.status",
        properties: {
          sessionID: "idle-cancelled-session",
          status: { type: "busy" },
        },
      });

      const messageCalls = await waitForMessageCount(1);
      await wait(300);

      expect(messageCalls).toHaveLength(1);
      expect(observations.filter((item) => item.url.includes(MESSAGE_ENDPOINT))).toHaveLength(1);
      expectSuccessfulMessage(messageCalls[0]!);
    },
    { timeout: 30_000 },
  );
});
