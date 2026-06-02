import { describe, test, expect } from "bun:test";
import { resolveUser, sendCardMessage } from "../lark-client";
import type { LarkConfig } from "../types";

describe("resolveUser", () => {
  test("returns email when userEmail configured", () => {
    const config: LarkConfig = {
      appId: "",
      appSecret: "",
      userEmail: "test@example.com",
    };
    const user = resolveUser(config);
    expect(user).toEqual({
      receiveId: "test@example.com",
      receiveIdType: "email",
    });
  });

  test("falls back to open_id when no email", () => {
    const config: LarkConfig = {
      appId: "",
      appSecret: "",
      userOpenId: "ou_123",
    };
    const user = resolveUser(config);
    expect(user).toEqual({ receiveId: "ou_123", receiveIdType: "open_id" });
  });

  test("falls back to user_id when no email/open_id", () => {
    const config: LarkConfig = {
      appId: "",
      appSecret: "",
      userId: "u123",
    };
    const user = resolveUser(config);
    expect(user).toEqual({ receiveId: "u123", receiveIdType: "user_id" });
  });

  test("returns null when no user configured", () => {
    const config: LarkConfig = { appId: "", appSecret: "" };
    expect(resolveUser(config)).toBeNull();
  });
});

describe("sendCardMessage", () => {
  test(
    "returns false on timeout",
    async () => {
      const originalFetch = global.fetch;
      global.fetch = ((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }
        });
      }) as unknown as typeof global.fetch;

      const result = await sendCardMessage(
        "token",
        { receiveId: "test", receiveIdType: "email" },
        "{}",
      );
      expect(result).toBe(false);

      global.fetch = originalFetch;
    },
    { timeout: 10000 },
  );
});
