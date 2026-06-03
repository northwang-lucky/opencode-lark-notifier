import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { LarkNotifierPlugin } from "../index";

const MESSAGE_ENDPOINT = "/im/v1/messages";
const TOKEN_ENDPOINT = "/auth/v3/tenant_access_token/internal";

type FetchObservation = {
  method: string;
  url: string;
};

type EnvSnapshot = Record<string, string | undefined>;

const managedEnvKeys = [
  "LARK_APP_ID",
  "LARK_APP_SECRET",
  "LARK_USER_EMAIL",
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

function installFeishuMockFetch(): void {
  const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    // Record all Feishu API calls for assertions
    if (url.includes("open.feishu.cn/open-apis")) {
      observations.push({ method: init?.method ?? "GET", url });
    }

    // Mock token endpoint
    if (url.includes(TOKEN_ENDPOINT)) {
      return new Response(JSON.stringify({ code: 0, tenant_access_token: "mock-token", expire: 7200 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Mock message send endpoint
    if (url.includes(MESSAGE_ENDPOINT)) {
      return new Response(JSON.stringify({ code: 0, msg: "success" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("OK", { status: 200 });
  };

  globalThis.fetch = Object.assign(mockFetch, {
    preconnect: realFetch.preconnect,
  }) as typeof globalThis.fetch;
}

interface SessionGetResult {
  data: {
    parentID?: string;
  };
}

function makePluginInput(sessionGetMock: () => Promise<SessionGetResult>): PluginInput {
  return {
    client: {
      app: {
        log: async () => {},
      },
      session: {
        get: sessionGetMock,
      },
    },
    project: {
      id: "opencode-lark-notifier-idle-test",
      worktree: process.cwd(),
    },
    directory: process.cwd(),
    worktree: process.cwd(),
    serverUrl: "http://127.0.0.1:4096",
    $: Bun.$,
  } as unknown as PluginInput;
}

async function createHooks(sessionGetMock: () => Promise<SessionGetResult>): Promise<Hooks> {
  const hooks = await LarkNotifierPlugin(makePluginInput(sessionGetMock));

  expect(hooks.event).toBeFunction();

  return hooks;
}

async function emit(hooks: Hooks, event: unknown): Promise<void> {
  await hooks.event?.({ event } as never);
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe("subagent idle 过滤行为", () => {
  beforeEach(() => {
    observations = [];
    envSnapshot = snapshotEnv();
    installFeishuMockFetch();

    // Base env config — tests can override as needed
    process.env.LARK_APP_ID = "test-id";
    process.env.LARK_APP_SECRET = "test-secret";
    process.env.LARK_USER_EMAIL = "test@example.com";
    process.env.LARK_NOTIFIER_RATE_LIMIT_MS = "0";
    process.env.LARK_NOTIFIER_COOLDOWN_MS = "50";
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    restoreEnv(envSnapshot);
  });

  // ── Test 1: Default behavior — subagent idle should NOT notify ────────────
  test("默认不通知 subagent idle（LARK_NOTIFIER_NOTIFY_SUBAGENT_IDLE 未设置）", async () => {
    const hooks = await createHooks(async () => ({
      data: { parentID: "parent-123" },
    }));

    await emit(hooks, {
      type: "session.idle",
      properties: { sessionID: "subagent-idle-session" },
    });

    // Wait for cooldown to expire (50ms) + buffer
    await wait(70);

    const messageCalls = observations.filter((o) => o.url.includes(MESSAGE_ENDPOINT));
    expect(messageCalls).toHaveLength(0);
  });

  // ── Test 2: Main session (no parentID) should always notify ──────────────
  test("主 session idle 正常通知（parentID 为 undefined）", async () => {
    const hooks = await createHooks(async (): Promise<SessionGetResult> => ({
      data: {},
    }));

    await emit(hooks, {
      type: "session.idle",
      properties: { sessionID: "main-session-idle" },
    });

    await wait(70);

    const messageCalls = observations.filter((o) => o.url.includes(MESSAGE_ENDPOINT));
    expect(messageCalls.length).toBeGreaterThan(0);
  });

  // ── Test 3: Explicit opt-in notifies subagent idle ────────────────────────
  test("显式 LARK_NOTIFIER_NOTIFY_SUBAGENT_IDLE=true 时通知 subagent idle", async () => {
    process.env.LARK_NOTIFIER_NOTIFY_SUBAGENT_IDLE = "true";

    const hooks = await createHooks(async () => ({
      data: { parentID: "parent-123" },
    }));

    await emit(hooks, {
      type: "session.idle",
      properties: { sessionID: "subagent-idle-opted-in" },
    });

    await wait(70);

    const messageCalls = observations.filter((o) => o.url.includes(MESSAGE_ENDPOINT));
    expect(messageCalls.length).toBeGreaterThan(0);
  });

  // ── Test 4: API failure should degrade gracefully (not drop notification) ─
  test("session.get API 失败时降级不丢通知", async () => {
    const hooks = await createHooks(async () => {
      throw new Error("API unavailable");
    });

    await emit(hooks, {
      type: "session.idle",
      properties: { sessionID: "api-failure-session" },
    });

    await wait(70);

    const messageCalls = observations.filter((o) => o.url.includes(MESSAGE_ENDPOINT));
    expect(messageCalls.length).toBeGreaterThan(0);
  });

  // ── Test 5: cooldown busy cancel not affected by subagent filtering ──────
  test("subagent idle 被过滤不干扰 cooldown cancel 机制", async () => {
    const hooks = await createHooks(async () => ({
      data: { parentID: "parent-123" },
    }));

    await emit(hooks, {
      type: "session.idle",
      properties: { sessionID: "subagent-cooldown-test" },
    });

    // Immediately cancel — even though subagent idle would be filtered,
    // the cooldown mechanism must handle this gracefully
    await emit(hooks, {
      type: "session.status",
      properties: {
        sessionID: "subagent-cooldown-test",
        status: { type: "busy" },
      },
    });

    await wait(70);

    const messageCalls = observations.filter((o) => o.url.includes(MESSAGE_ENDPOINT));
    expect(messageCalls).toHaveLength(0);
  });
});
