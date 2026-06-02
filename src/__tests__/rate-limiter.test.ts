import { describe, expect, test } from "bun:test";
import { createCooldown, createRateLimiter, DEFAULT_COOLDOWN_MS, DEFAULT_RATE_LIMIT_MS } from "../rate-limiter";

describe("createRateLimiter", () => {
  test("allows first send", () => {
    const limiter = createRateLimiter(30000);
    expect(limiter.canSend("key1")).toBe(true);
  });

  test("blocks duplicate within window", () => {
    const limiter = createRateLimiter(30000);
    limiter.canSend("key1");
    expect(limiter.canSend("key1")).toBe(false);
  });

  test("allows after window expires", async () => {
    const limiter = createRateLimiter(50); // 50ms window
    limiter.canSend("key1");
    await new Promise((r) => setTimeout(r, 60));
    expect(limiter.canSend("key1")).toBe(true);
  });

  test("always allows when windowMs is 0", () => {
    const limiter = createRateLimiter(0);
    expect(limiter.canSend("key1")).toBe(true);
    expect(limiter.canSend("key1")).toBe(true);
  });

  test("allows different keys independently", () => {
    const limiter = createRateLimiter(30000);
    limiter.canSend("key1");
    expect(limiter.canSend("key1")).toBe(false);
    expect(limiter.canSend("key2")).toBe(true);
  });

  test("default rate limit is exported", () => {
    expect(DEFAULT_RATE_LIMIT_MS).toBe(30000);
  });
});

describe("createCooldown", () => {
  test("shouldNotify returns false immediately after idle", () => {
    const cooldown = createCooldown(5000);
    cooldown.idle("ses-1");
    expect(cooldown.shouldNotify("ses-1")).toBe(false);
  });

  test("shouldNotify returns true after cooldown expires", async () => {
    const cooldown = createCooldown(50); // 50ms cooldown
    cooldown.idle("ses-1");
    await new Promise((r) => setTimeout(r, 60));
    expect(cooldown.shouldNotify("ses-1")).toBe(true);
  });

  test("busy resets cooldown", () => {
    const cooldown = createCooldown(5000);
    cooldown.idle("ses-1");
    cooldown.busy("ses-1");
    expect(cooldown.shouldNotify("ses-1")).toBe(false);
  });

  test("returns false for unknown session", () => {
    const cooldown = createCooldown(5000);
    expect(cooldown.shouldNotify("unknown")).toBe(false);
  });

  test("idle after busy resets and allows new cooldown", () => {
    const cooldown = createCooldown(5000);
    cooldown.idle("ses-1");
    cooldown.busy("ses-1");
    cooldown.idle("ses-1");
    expect(cooldown.shouldNotify("ses-1")).toBe(false);
  });

  test("only notifies once after cooldown expires", async () => {
    const cooldown = createCooldown(50);
    cooldown.idle("ses-1");
    await new Promise((r) => setTimeout(r, 60));

    // First call should return true and clear the idle time
    expect(cooldown.shouldNotify("ses-1")).toBe(true);
    // Second call should return false (already notified)
    expect(cooldown.shouldNotify("ses-1")).toBe(false);
  });

  test("default cooldown is exported", () => {
    expect(DEFAULT_COOLDOWN_MS).toBe(5000);
  });
});
