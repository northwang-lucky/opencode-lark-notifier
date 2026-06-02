import { mkdir, rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { isConfigValid, loadConfig, readEnvFile } from "../env";
import type { LarkConfig } from "../types";

const managedEnvKeys = [
  "LARK_APP_ID",
  "LARK_APP_SECRET",
  "LARK_USER_EMAIL",
  "LARK_USER_OPEN_ID",
  "LARK_USER_ID",
  "LARK_NOTIFIER_EVENTS",
  "LARK_NOTIFIER_RATE_LIMIT_MS",
  "LARK_NOTIFIER_COOLDOWN_MS",
] as const;

describe("readEnvFile", () => {
  test("parses KEY=value format", async () => {
    const tmpFile = `/tmp/test-env-${Date.now()}.env`;
    await Bun.write(tmpFile, "FOO=bar\nBAZ=qux");

    const result = await readEnvFile(tmpFile);
    expect(result.FOO).toBe("bar");
    expect(result.BAZ).toBe("qux");

    await Bun.file(tmpFile).delete();
  });

  test("parses quoted values (double and single)", async () => {
    const tmpFile = `/tmp/test-env-${Date.now()}.env`;
    await Bun.write(tmpFile, "FOO=\"bar\"\nBAZ='qux'");

    const result = await readEnvFile(tmpFile);
    expect(result.FOO).toBe("bar");
    expect(result.BAZ).toBe("qux");

    await Bun.file(tmpFile).delete();
  });

  test("ignores comments and empty lines", async () => {
    const tmpFile = `/tmp/test-env-${Date.now()}.env`;
    await Bun.write(tmpFile, "# comment\n\nFOO=bar\n# another comment\nBAZ=qux");

    const result = await readEnvFile(tmpFile);
    expect(result.FOO).toBe("bar");
    expect(result.BAZ).toBe("qux");
    expect(result["# comment"]).toBeUndefined();

    await Bun.file(tmpFile).delete();
  });

  test("handles whitespace around key and value", async () => {
    const tmpFile = `/tmp/test-env-${Date.now()}.env`;
    await Bun.write(tmpFile, "  FOO = bar  \nBAZ=qux");

    const result = await readEnvFile(tmpFile);
    expect(result.FOO).toBe("bar");
    expect(result.BAZ).toBe("qux");

    await Bun.file(tmpFile).delete();
  });

  test("skips lines without = separator", async () => {
    const tmpFile = `/tmp/test-env-${Date.now()}.env`;
    await Bun.write(tmpFile, "FOO=bar\ninvalidline\nBAZ=qux");

    const result = await readEnvFile(tmpFile);
    expect(result.FOO).toBe("bar");
    expect(result.BAZ).toBe("qux");

    await Bun.file(tmpFile).delete();
  });

  test("returns empty object for missing file", async () => {
    const result = await readEnvFile("/nonexistent/file.env");
    expect(Object.keys(result)).toHaveLength(0);
  });

  test("returns empty object for empty file", async () => {
    const tmpFile = `/tmp/test-env-${Date.now()}.env`;
    await Bun.write(tmpFile, "");

    const result = await readEnvFile(tmpFile);
    expect(Object.keys(result)).toHaveLength(0);

    await Bun.file(tmpFile).delete();
  });
});

describe("isConfigValid", () => {
  test("returns valid true when appId and appSecret present", () => {
    const config: LarkConfig = { appId: "test", appSecret: "secret" };
    const result = isConfigValid(config);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  test("returns valid false when appId is empty", () => {
    const config: LarkConfig = { appId: "", appSecret: "secret" };
    const result = isConfigValid(config);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Missing LARK_APP_ID");
  });

  test("returns valid false when appSecret is empty", () => {
    const config: LarkConfig = { appId: "test", appSecret: "" };
    const result = isConfigValid(config);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Missing LARK_APP_SECRET");
  });

  test("returns valid false when both are empty", () => {
    const config: LarkConfig = { appId: "", appSecret: "" };
    const result = isConfigValid(config);
    expect(result.valid).toBe(false);
    // appId check comes first
    expect(result.reason).toBe("Missing LARK_APP_ID");
  });
});

describe("loadConfig", () => {
  const originalEnv = { ...process.env };
  const originalCwd = process.cwd();
  let tmpDir = "";

  beforeEach(async () => {
    tmpDir = `/tmp/opencode-lark-notifier-env-test-${process.pid}-${Date.now()}`;
    await mkdir(tmpDir, { recursive: true });
    process.chdir(tmpDir);

    for (const key of managedEnvKeys) {
      delete process.env[key];
    }

    process.env.XDG_CONFIG_HOME = tmpDir;
  });

  afterEach(async () => {
    process.chdir(originalCwd);

    // Restore original env — delete only what we might have set
    delete process.env.LARK_APP_ID;
    delete process.env.LARK_APP_SECRET;
    delete process.env.LARK_USER_EMAIL;
    delete process.env.LARK_USER_OPEN_ID;
    delete process.env.LARK_USER_ID;
    delete process.env.LARK_NOTIFIER_EVENTS;
    delete process.env.LARK_NOTIFIER_RATE_LIMIT_MS;
    delete process.env.LARK_NOTIFIER_COOLDOWN_MS;
    for (const key of Object.keys(originalEnv)) {
      process.env[key] = originalEnv[key];
    }

    await rm(tmpDir, { force: true, recursive: true });
  });

  test("reads required fields from process.env", async () => {
    process.env.LARK_APP_ID = "test-id";
    process.env.LARK_APP_SECRET = "test-secret";

    const config = await loadConfig();
    expect(config.appId).toBe("test-id");
    expect(config.appSecret).toBe("test-secret");
  });

  test("uses default values for optional numeric fields", async () => {
    process.env.LARK_APP_ID = "test-id";
    process.env.LARK_APP_SECRET = "test-secret";

    const config = await loadConfig();
    expect(config.rateLimitMs).toBe(30000);
    expect(config.cooldownMs).toBe(5000);
  });

  test("parses events from comma-separated string", async () => {
    process.env.LARK_APP_ID = "test-id";
    process.env.LARK_APP_SECRET = "test-secret";
    process.env.LARK_NOTIFIER_EVENTS = "session.created, session.deleted";

    const config = await loadConfig();
    expect(config.events).toEqual(["session.created", "session.deleted"]);
  });

  test("filters empty event tokens", async () => {
    process.env.LARK_APP_ID = "test-id";
    process.env.LARK_APP_SECRET = "test-secret";
    process.env.LARK_NOTIFIER_EVENTS = "a,,b, ,c";

    const config = await loadConfig();
    expect(config.events).toEqual(["a", "b", "c"]);
  });

  test("reads optional user fields", async () => {
    process.env.LARK_APP_ID = "test-id";
    process.env.LARK_APP_SECRET = "test-secret";
    process.env.LARK_USER_EMAIL = "user@example.com";
    process.env.LARK_USER_OPEN_ID = "ou_xxx";
    process.env.LARK_USER_ID = "uid_xxx";

    const config = await loadConfig();
    expect(config.userEmail).toBe("user@example.com");
    expect(config.userOpenId).toBe("ou_xxx");
    expect(config.userId).toBe("uid_xxx");
  });

  test("parses custom rate limit and cooldown", async () => {
    process.env.LARK_APP_ID = "test-id";
    process.env.LARK_APP_SECRET = "test-secret";
    process.env.LARK_NOTIFIER_RATE_LIMIT_MS = "60000";
    process.env.LARK_NOTIFIER_COOLDOWN_MS = "10000";

    const config = await loadConfig();
    expect(config.rateLimitMs).toBe(60000);
    expect(config.cooldownMs).toBe(10000);
  });

  test("returns empty appId and appSecret when env vars not set", async () => {
    const config = await loadConfig();
    expect(config.appId).toBe("");
    expect(config.appSecret).toBe("");
  });
});
