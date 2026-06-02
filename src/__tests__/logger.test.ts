import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createLogger } from "../logger";
import type { Logger } from "../types";

/**
 * Override global Date for controlled time in tests.
 * Returns a restore function to reset Date to original.
 */
function freezeTime(dateStr: string): () => void {
  const fixedMs = new Date(dateStr).getTime();
  const OrigDate = Date;
  const OrigNow = Date.now;

  // @ts-expect-error: mock Date constructor for testing
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  globalThis.Date = class extends OrigDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(fixedMs);
      } else {
        super(...(args as ConstructorParameters<typeof Date>));
      }
    }
    static override now(): number {
      return fixedMs;
    }
  };
  Date.now = () => fixedMs;
  Date.parse = OrigDate.parse.bind(OrigDate);
  Date.UTC = OrigDate.UTC.bind(OrigDate);

  return () => {
    globalThis.Date = OrigDate as DateConstructor;
    Date.now = OrigNow;
  };
}

/** Wait for logger write queue to drain */
async function flushWrites(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

/** Read all content from all .log files in a directory */
async function readAllLogs(logDir: string): Promise<string> {
  try {
    const entries = await readdir(logDir);
    const logFiles = entries.filter((f) => f.endsWith(".log")).sort();
    const contents = await Promise.all(logFiles.map((f) => readFile(path.join(logDir, f), "utf-8")));
    return contents.join("");
  } catch {
    return "";
  }
}

/** Create a logger with common defaults and return cleanup fn */
function createTestLogger(
  overrides: Partial<{
    logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
    logDir: string;
    moduleName: string;
    maxRetentionDays: number;
  }> = {},
): Logger {
  return createLogger({
    logLevel: overrides.logLevel ?? "DEBUG",
    logDir: overrides.logDir ?? `/tmp/test-logger-${Date.now()}`,
    moduleName: overrides.moduleName ?? "test-module",
    maxRetentionDays: overrides.maxRetentionDays ?? 7,
  });
}

// ============================================================
// Format validation
// ============================================================
describe("logger format validation", () => {
  let logDir: string;
  let cleanupTime: (() => void) | null = null;

  afterEach(async () => {
    if (cleanupTime) {
      cleanupTime();
      cleanupTime = null;
    }
    await rm(logDir, { force: true, recursive: true });
  });

  test("log format matches [YYYY-MM-DD HH:mm:ss] [LEVEL] [module] message", async () => {
    logDir = `/tmp/test-logger-format-${Date.now()}`;
    cleanupTime = freezeTime("2026-06-02T06:30:15");

    const logger = createTestLogger({ logDir, moduleName: "app" });
    logger.info("hello world");
    await flushWrites();

    const content = await readAllLogs(logDir);
    expect(content).toContain("[2026-06-02 06:30:15] [INFO] [app] hello world\n");
  });

  test("all four log levels produce correct format", async () => {
    logDir = `/tmp/test-logger-levels-${Date.now()}`;
    cleanupTime = freezeTime("2026-06-02T12:00:00");

    const logger = createTestLogger({ logDir, moduleName: "mod" });
    logger.debug("debug msg");
    logger.info("info msg");
    logger.warn("warn msg");
    logger.error("error msg");
    await flushWrites();

    const content = await readAllLogs(logDir);
    expect(content).toContain("[2026-06-02 12:00:00] [DEBUG] [mod] debug msg\n");
    expect(content).toContain("[2026-06-02 12:00:00] [INFO] [mod] info msg\n");
    expect(content).toContain("[2026-06-02 12:00:00] [WARN] [mod] warn msg\n");
    expect(content).toContain("[2026-06-02 12:00:00] [ERROR] [mod] error msg\n");
  });

  test("newlines in message are replaced with spaces", async () => {
    logDir = `/tmp/test-logger-newline-${Date.now()}`;
    cleanupTime = freezeTime("2026-06-02T10:00:00");

    const logger = createTestLogger({ logDir });
    logger.info("line1\nline2\nline3");
    await flushWrites();

    const content = await readAllLogs(logDir);
    expect(content).toContain("[test-module] line1 line2 line3\n");
    expect(content).not.toContain("\nline2");
    expect(content).not.toContain("line1\n");
  });
});

// ============================================================
// Level filtering
// ============================================================
describe("logger level filtering", () => {
  let logDir: string;
  let cleanupTime: (() => void) | null = null;

  afterEach(async () => {
    if (cleanupTime) {
      cleanupTime();
      cleanupTime = null;
    }
    await rm(logDir, { force: true, recursive: true });
  });

  test("INFO level skips DEBUG messages", async () => {
    logDir = `/tmp/test-logger-filter-info-${Date.now()}`;
    cleanupTime = freezeTime("2026-06-02T10:00:00");

    const logger = createTestLogger({ logDir, logLevel: "INFO" });
    logger.debug("should be skipped");
    logger.info("should appear");
    await flushWrites();

    const content = await readAllLogs(logDir);
    expect(content).toContain("[INFO] [test-module] should appear");
    expect(content).not.toContain("should be skipped");
  });

  test("WARN level skips DEBUG and INFO messages", async () => {
    logDir = `/tmp/test-logger-filter-warn-${Date.now()}`;
    cleanupTime = freezeTime("2026-06-02T10:00:00");

    const logger = createTestLogger({ logDir, logLevel: "WARN" });
    logger.debug("debug skipped");
    logger.info("info skipped");
    logger.warn("warn appears");
    logger.error("error appears");
    await flushWrites();

    const content = await readAllLogs(logDir);
    expect(content).not.toContain("debug skipped");
    expect(content).not.toContain("info skipped");
    expect(content).toContain("[WARN] [test-module] warn appears");
    expect(content).toContain("[ERROR] [test-module] error appears");
  });

  test("DEBUG level writes all messages", async () => {
    logDir = `/tmp/test-logger-filter-debug-${Date.now()}`;
    cleanupTime = freezeTime("2026-06-02T10:00:00");

    const logger = createTestLogger({ logDir, logLevel: "DEBUG" });
    logger.debug("debug msg");
    logger.info("info msg");
    logger.warn("warn msg");
    logger.error("error msg");
    await flushWrites();

    const content = await readAllLogs(logDir);
    expect(content).toContain("[DEBUG] [test-module] debug msg");
    expect(content).toContain("[INFO] [test-module] info msg");
    expect(content).toContain("[WARN] [test-module] warn msg");
    expect(content).toContain("[ERROR] [test-module] error msg");
  });
});

// ============================================================
// XDG path
// ============================================================
describe("logger XDG path", () => {
  const originalEnv = { ...process.env };

  afterEach(async () => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
  });

  test("writes to XDG_STATE_HOME when set", async () => {
    const xdgBase = `/tmp/test-xdg-logger-${Date.now()}`;
    process.env.XDG_STATE_HOME = xdgBase;
    delete process.env.HOME;

    // Pass empty logDir to trigger XDG-based path computation
    const logger = createLogger({
      logLevel: "INFO",
      logDir: "",
      moduleName: "xdg-test",
      maxRetentionDays: 7,
    });

    const freezeTimeCleanup = freezeTime("2026-06-02T10:00:00");
    logger.info("xdg message");
    await flushWrites();
    freezeTimeCleanup();

    // File should be in XDG_STATE_HOME/opencode-lark-notifier/logs/
    const expectedDir = path.join(xdgBase, "opencode-lark-notifier", "logs");
    const content = await readAllLogs(expectedDir);
    expect(content).toContain("[xdg-test] xdg message");

    await rm(xdgBase, { force: true, recursive: true });
  });

  test("falls back to ~/.local/state when XDG_STATE_HOME unset", async () => {
    const homeBase = `/tmp/test-fallback-home-${Date.now()}`;
    delete process.env.XDG_STATE_HOME;
    process.env.HOME = homeBase;

    const logger = createLogger({
      logLevel: "INFO",
      logDir: "",
      moduleName: "fallback-test",
      maxRetentionDays: 7,
    });

    const freezeTimeCleanup = freezeTime("2026-06-02T10:00:00");
    logger.info("fallback message");
    await flushWrites();
    freezeTimeCleanup();

    // File should be in HOME/.local/state/opencode-lark-notifier/logs/
    const expectedDir = path.join(homeBase, ".local", "state", "opencode-lark-notifier", "logs");
    const content = await readAllLogs(expectedDir);
    expect(content).toContain("[fallback-test] fallback message");

    await rm(homeBase, { force: true, recursive: true });
  });
});

// ============================================================
// Directory auto-creation
// ============================================================
describe("logger directory auto-creation", () => {
  let rootDir: string;

  afterEach(async () => {
    await rm(rootDir, { force: true, recursive: true });
  });

  test("auto-creates log directory if not exists", async () => {
    rootDir = `/tmp/test-logger-autocreate-${Date.now()}`;
    const logDir = path.join(rootDir, "subdir", "logs");

    await rm(rootDir, { force: true, recursive: true });

    const freezeTimeCleanup = freezeTime("2026-06-02T10:00:00");

    const logger = createTestLogger({ logDir });
    logger.info("auto-created");
    await flushWrites();
    freezeTimeCleanup();

    const content = await readAllLogs(logDir);
    expect(content).toContain("[test-module] auto-created");
  });
});

// ============================================================
// Daily rotation
// ============================================================
describe("logger daily rotation", () => {
  let logDir: string;

  afterEach(async () => {
    await rm(logDir, { force: true, recursive: true });
  });

  test("creates new file when date changes", async () => {
    logDir = `/tmp/test-logger-rotation-${Date.now()}`;

    // Day 1: June 1
    const restore1 = freezeTime("2026-06-01T10:00:00");
    const logger = createTestLogger({ logDir });
    logger.info("day one");
    await flushWrites();
    restore1();

    // Day 2: June 2
    const restore2 = freezeTime("2026-06-02T10:00:00");
    logger.info("day two");
    await flushWrites();
    restore2();

    const entries = await readdir(logDir);
    const logFiles = entries.filter((f) => f.endsWith(".log")).sort();
    expect(logFiles).toHaveLength(2);
    expect(logFiles[0]).toBe("2026-06-01.log");
    expect(logFiles[1]).toBe("2026-06-02.log");

    const day1 = await readFile(path.join(logDir, logFiles[0]!), "utf-8");
    const day2 = await readFile(path.join(logDir, logFiles[1]!), "utf-8");
    expect(day1).toContain("day one");
    expect(day2).toContain("day two");
  });

  test("file name format is YYYY-MM-DD.log", async () => {
    logDir = `/tmp/test-logger-filename-${Date.now()}`;
    const restore = freezeTime("2026-12-25T08:30:00");

    const logger = createTestLogger({ logDir });
    logger.info("christmas");
    await flushWrites();
    restore();

    const entries = await readdir(logDir);
    const logFiles = entries.filter((f) => f.endsWith(".log"));
    expect(logFiles).toHaveLength(1);
    expect(logFiles[0]).toMatch(/^\d{4}-\d{2}-\d{2}\.log$/);
    expect(logFiles[0]).toBe("2026-12-25.log");
  });
});

// ============================================================
// Old file cleanup
// ============================================================
describe("logger old file cleanup", () => {
  let logDir: string;

  afterEach(async () => {
    await rm(logDir, { force: true, recursive: true });
  });

  test("deletes log files older than 7 days", async () => {
    logDir = `/tmp/test-logger-cleanup-${Date.now()}`;
    await mkdir(logDir, { recursive: true });

    // Create fake old log files (8 days old, 7 days old, and 1 day old)
    await writeFile(path.join(logDir, "2026-05-24.log"), "old entry 1\n"); // 9 days ago
    await writeFile(path.join(logDir, "2026-05-25.log"), "old entry 2\n"); // 8 days ago
    await writeFile(path.join(logDir, "2026-05-26.log"), "almost old\n"); // 7 days ago (boundary)
    await writeFile(path.join(logDir, "2026-06-01.log"), "recent 1\n"); // 1 day ago
    await writeFile(path.join(logDir, "other-file.txt"), "not a log\n"); // Non-log file

    // "Now" is June 2 — trigger a write to invoke cleanup
    const restore = freezeTime("2026-06-02T10:00:00");
    const logger = createTestLogger({
      logDir,
      maxRetentionDays: 7,
    });
    logger.info("trigger cleanup");
    await flushWrites();
    restore();

    const entries = await readdir(logDir);
    // Files 8+ days old should be deleted, 7 days (May 26) should stay
    expect(entries).not.toContain("2026-05-24.log"); // 9 days → deleted
    expect(entries).not.toContain("2026-05-25.log"); // 8 days → deleted
    expect(entries).toContain("2026-05-26.log"); // 7 days (boundary) → kept
    expect(entries).toContain("2026-06-01.log"); // 1 day → kept
    expect(entries).toContain("other-file.txt"); // Non-log → untouched
  });
});

// ============================================================
// Error handling
// ============================================================
describe("logger error handling", () => {
  let logDir: string;

  afterEach(async () => {
    await rm(logDir, { force: true, recursive: true });
  });

  test("write failure does not throw", async () => {
    logDir = `/tmp/test-logger-nothrow-${Date.now()}`;

    // Create logDir as a regular file — mkdir will fail, causing write to fail
    await writeFile(logDir, "block dir creation");

    const restoreTime = freezeTime("2026-06-02T10:00:00");

    // Should not throw even though writing will fail
    let threw = false;
    try {
      const logger = createTestLogger({ logDir });
      logger.info("this will fail");
      await flushWrites();
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    restoreTime();
  });

  test("write failure does not block subsequent writes", async () => {
    logDir = `/tmp/test-logger-unblock-${Date.now()}`;

    // First logger: attempts to write to a path where mkdir will fail
    const badDir = path.join(logDir, "blocked");
    // Create badDir as a regular file
    await mkdir(logDir, { recursive: true });
    await writeFile(badDir, "block dir");

    const restoreTime = freezeTime("2026-06-02T10:00:00");

    const logger = createTestLogger({ logDir: badDir });
    logger.info("failing write");
    await flushWrites();

    // Now write to a valid path using the same logger
    // Remove the blocking file and create the directory
    await rm(badDir, { force: true, recursive: true });

    logger.info("recovered write");
    await flushWrites();

    // The recovered write should have created the directory
    const content = await readAllLogs(badDir);
    expect(content).toContain("recovered write");

    restoreTime();
  });
});

// ============================================================
// Message truncation
// ============================================================
describe("logger message truncation", () => {
  let logDir: string;
  let cleanupTime: (() => void) | null = null;

  afterEach(async () => {
    if (cleanupTime) {
      cleanupTime();
      cleanupTime = null;
    }
    await rm(logDir, { force: true, recursive: true });
  });

  test("messages longer than 4096 chars are truncated", async () => {
    logDir = `/tmp/test-logger-truncate-${Date.now()}`;
    cleanupTime = freezeTime("2026-06-02T10:00:00");

    const logger = createTestLogger({ logDir });

    // Create a message of exactly 5000 characters
    const longMsg = "A".repeat(5000);
    logger.info(longMsg);
    await flushWrites();

    const content = await readAllLogs(logDir);
    // Total line length: "[YYYY-MM-DD HH:mm:ss] [LEVEL] [module] " + message + "\n"
    // The message portion should be at most 4096 chars
    const lineMatch = content.match(/\[test-module\] (.+)\n/);
    expect(lineMatch).not.toBeNull();

    const loggedMsg = lineMatch![1]!;
    expect(loggedMsg.length).toBeLessThanOrEqual(4096);
    expect(loggedMsg.length).toBe(4096);
    // Should not be the full 5000 chars
    expect(loggedMsg.length).toBeLessThan(5000);
    // Should start with A's
    expect(loggedMsg.startsWith("A")).toBe(true);
  });
});
