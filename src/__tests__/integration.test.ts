import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildCard } from "../cards";
import { sendNotification } from "../lark-client";
import type { CardPayload, LarkConfig } from "../types";

const originalFetch = global.fetch;

/**
 * Known Feishu error codes
 */
const FEISHU_ERR_INVALID_TOKEN = 99991668;
const FEISHU_ERR_INTERNAL = 500;

/**
 * Mock fetch behavior configuration
 */
interface MockBehavior {
  tokenBehavior?: "success" | "fail";
  messageBehavior?: "success" | "retry-401" | "error";
}

/**
 * Call record for assertions
 */
interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Parsed message body from an API call
 */
interface MessageBody {
  receive_id: string;
  msg_type: string;
  content: string;
}

/**
 * Cast fetch call body to a MessageBody for safe access
 */
function asMessageBody(call: FetchCall): MessageBody {
  return call.body as MessageBody;
}

/**
 * Create a mock global.fetch that records calls and returns configured responses.
 * Uses closure state to track per-test message call counts.
 *
 * Note: module-level `tokenPromise` cache in lark-client.ts persists across tests.
 * Tests are designed to be resilient to cached tokens — assertions check the
 * message calls rather than requiring exact fetch call counts.
 */
function createMockFetch(behavior: MockBehavior = {}) {
  const { tokenBehavior = "success", messageBehavior = "success" } = behavior;
  let messageCallCount = 0;

  const mockFn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    const body = init?.body ? JSON.parse(init.body as string) : null;

    const headers: Record<string, string> = {};
    const rawHeaders = init?.headers;
    if (rawHeaders) {
      if (rawHeaders instanceof Headers) {
        const h = new Headers(rawHeaders);
        const keys = [...h.keys()];
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i]!;
          const val = h.get(key);
          if (val !== null) {
            headers[key] = val;
          }
        }
      } else if (Array.isArray(rawHeaders)) {
        for (let i = 0; i < rawHeaders.length; i++) {
          const entry = rawHeaders[i]!;
          headers[entry[0]!] = entry[1]!;
        }
      } else {
        Object.assign(headers, rawHeaders);
      }
    }
    const method = init?.method ?? "GET";

    fetchCalls.push({ url, method, headers, body });

    // Token endpoint
    if (url.includes("/auth/v3/tenant_access_token/internal")) {
      if (tokenBehavior === "fail") {
        return new Response(JSON.stringify({ code: 999, msg: "auth failed" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ code: 0, msg: "ok", tenant_access_token: "t-mock-token", expire: 7200 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Message endpoint
    if (url.includes("/im/v1/messages")) {
      messageCallCount++;
      if (messageBehavior === "retry-401" && messageCallCount === 1) {
        return new Response(JSON.stringify({ code: FEISHU_ERR_INVALID_TOKEN, msg: "Invalid token" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (messageBehavior === "error") {
        return new Response(JSON.stringify({ code: FEISHU_ERR_INTERNAL, msg: "Internal server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ code: 0, msg: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  };

  return mockFn as unknown as typeof global.fetch;
}

let fetchCalls: FetchCall[];

describe("Integration: End-to-end notification flow", () => {
  beforeEach(() => {
    fetchCalls = [];
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("complete flow: token → send card → success with email", async () => {
    global.fetch = createMockFetch({ tokenBehavior: "success", messageBehavior: "success" });

    const config: LarkConfig = {
      appId: "test-app-integration",
      appSecret: "test-secret",
      userEmail: "test@example.com",
    };

    const card: CardPayload = {
      eventType: "session.error",
      content: "Test error message",
      theme: "red",
      sessionId: "ses-123",
    };

    const result = await sendNotification(config, buildCard(card));

    expect(result).toBe(true);

    // Find message calls
    const messageCalls = fetchCalls.filter((c) => c.url.includes("/im/v1/messages"));
    expect(messageCalls.length).toBe(1);
    const messageCall = messageCalls[0]!;

    // Verify message endpoint
    expect(messageCall.url).toContain("receive_id_type=email");
    expect(messageCall.method).toBe("POST");
    expect(messageCall.headers.Authorization).toBe("Bearer t-mock-token");
    expect(messageCall.headers["Content-Type"]).toBe("application/json");

    // Verify message body structure
    const msgBody = asMessageBody(messageCall);
    expect(msgBody.receive_id).toBe("test@example.com");
    expect(msgBody.msg_type).toBe("interactive");

    const content = JSON.parse(msgBody.content);
    expect(content.schema).toBe("2.0");
    expect(content.header.template).toBe("red");
    expect(content.body.elements[0].content).toBe("Test error message");
  });

  test("complete flow with open_id fallback", async () => {
    global.fetch = createMockFetch({ tokenBehavior: "success", messageBehavior: "success" });

    const config: LarkConfig = {
      appId: "test-app-integration",
      appSecret: "test-secret",
      userOpenId: "ou_123",
    };

    const card: CardPayload = {
      eventType: "session.idle",
      content: "Idle notification",
      theme: "turquoise",
    };

    const result = await sendNotification(config, buildCard(card));

    expect(result).toBe(true);

    const messageCalls = fetchCalls.filter((c) => c.url.includes("/im/v1/messages"));
    expect(messageCalls.length).toBe(1);
    const messageCall = messageCalls[0]!;

    expect(messageCall.url).toContain("receive_id_type=open_id");
    const msgBody = asMessageBody(messageCall);
    expect(msgBody.receive_id).toBe("ou_123");
    expect(msgBody.msg_type).toBe("interactive");
  });

  test("complete flow with user_id fallback", async () => {
    global.fetch = createMockFetch({ tokenBehavior: "success", messageBehavior: "success" });

    const config: LarkConfig = {
      appId: "test-app-integration",
      appSecret: "test-secret",
      userId: "u456",
    };

    const card: CardPayload = {
      eventType: "question.asked",
      content: "Question?",
      theme: "yellow",
    };

    const result = await sendNotification(config, buildCard(card));

    expect(result).toBe(true);

    const messageCalls = fetchCalls.filter((c) => c.url.includes("/im/v1/messages"));
    expect(messageCalls.length).toBe(1);
    const messageCall = messageCalls[0]!;

    expect(messageCall.url).toContain("receive_id_type=user_id");
    const msgBody = asMessageBody(messageCall);
    expect(msgBody.receive_id).toBe("u456");
    expect(msgBody.msg_type).toBe("interactive");
  });

  test("retries on 401 failure by re-fetching token", async () => {
    global.fetch = createMockFetch({ tokenBehavior: "success", messageBehavior: "retry-401" });

    const config: LarkConfig = {
      appId: "test-app-integration",
      appSecret: "test-secret",
      userEmail: "test@example.com",
    };

    const card: CardPayload = {
      eventType: "question.asked",
      content: "Retry test question?",
      theme: "yellow",
    };

    const result = await sendNotification(config, buildCard(card));

    // Should succeed after retry
    expect(result).toBe(true);

    // Should have exactly 2 message calls (first failed with 401, second succeeded)
    const messageCalls = fetchCalls.filter((c) => c.url.includes("/im/v1/messages"));
    expect(messageCalls.length).toBe(2);

    // The second message call should have Authorization header
    const firstCall = messageCalls[0]!;
    const secondCall = messageCalls[1]!;
    expect(secondCall.headers.Authorization).toBe("Bearer t-mock-token");
    const secondBody = asMessageBody(secondCall);
    expect(secondBody.receive_id).toBe("test@example.com");
    expect(secondBody.msg_type).toBe("interactive");

    // The body content should be identical for both calls (same card payload)
    const content1 = JSON.parse(asMessageBody(firstCall).content);
    const content2 = JSON.parse(asMessageBody(secondCall).content);
    expect(content1).toEqual(content2);
  });

  test("returns false when no user identifier configured", async () => {
    global.fetch = createMockFetch();

    const config: LarkConfig = {
      appId: "test-app-integration",
      appSecret: "test-secret",
    };

    const card: CardPayload = {
      eventType: "permission.asked",
      content: "Permission needed",
      theme: "orange",
    };

    const result = await sendNotification(config, buildCard(card));

    expect(result).toBe(false);
    // No API calls should be made when no user is configured
    expect(fetchCalls).toHaveLength(0);
  });

  test("handles empty userEmail (empty string treated as no user)", async () => {
    global.fetch = createMockFetch();

    const config: LarkConfig = {
      appId: "test-app-integration",
      appSecret: "test-secret",
      userEmail: "",
    };

    const card: CardPayload = {
      eventType: "session.error",
      content: "Should not send",
      theme: "red",
    };

    const result = await sendNotification(config, buildCard(card));

    expect(result).toBe(false);
    expect(fetchCalls).toHaveLength(0);
  });

  test("sends authorization header with bearer token", async () => {
    global.fetch = createMockFetch({ tokenBehavior: "success", messageBehavior: "success" });

    const config: LarkConfig = {
      appId: "test-app-integration",
      appSecret: "test-secret",
      userEmail: "auth-test@example.com",
    };

    const card: CardPayload = {
      eventType: "session.idle",
      content: "Auth header test",
      theme: "turquoise",
    };

    await sendNotification(config, buildCard(card));

    const messageCalls = fetchCalls.filter((c) => c.url.includes("/im/v1/messages"));
    expect(messageCalls.length).toBe(1);

    // Authorization header must contain "Bearer " prefix
    const authHeader = messageCalls[0]?.headers.Authorization;
    expect(authHeader).toMatch(/^Bearer .+$/);
    expect(authHeader).not.toBe("Bearer undefined");
  });

  test("card content is JSON-serialized correctly in message body", async () => {
    global.fetch = createMockFetch({ tokenBehavior: "success", messageBehavior: "success" });

    const config: LarkConfig = {
      appId: "test-app-integration",
      appSecret: "test-secret",
      userEmail: "card-test@example.com",
    };

    // Card with all optional fields populated
    const card: CardPayload = {
      eventType: "session.error",
      title: "Custom Title",
      content: "Custom content with **markdown**",
      theme: "red",
      sessionId: "ses-abc-123",
      note: "Custom note text",
    };

    await sendNotification(config, buildCard(card));

    const messageCalls = fetchCalls.filter((c) => c.url.includes("/im/v1/messages"));
    const msgBody = asMessageBody(messageCalls[0]!);
    const content = JSON.parse(msgBody.content);
    expect(content.schema).toBe("2.0");
    expect(content.header.title.content).toBe("Custom Title");
    expect(content.header.template).toBe("red");
    expect(content.body.elements[0].content).toBe("Custom content with \\*\\*markdown\\*\\*");
    expect(content.body.elements[2].content).toBe("Custom note text");
  });

  test("handles all eight card themes correctly", async () => {
    global.fetch = createMockFetch({ tokenBehavior: "success", messageBehavior: "success" });

    const config: LarkConfig = {
      appId: "test-app-integration",
      appSecret: "test-secret",
      userEmail: "theme-test@example.com",
    };

    const themes: Array<CardPayload["theme"]> = [
      "turquoise",
      "green",
      "yellow",
      "orange",
      "red",
      "blue",
      "wathet",
      "grey",
    ];

    for (const theme of themes) {
      const card: CardPayload = {
        eventType: "session.idle",
        content: `${theme} theme test`,
        theme,
      };

      const result = await sendNotification(config, buildCard(card));
      expect(result).toBe(true);
    }

    // Should have 1 message call per theme
    const messageCalls = fetchCalls.filter((c) => c.url.includes("/im/v1/messages"));
    expect(messageCalls.length).toBe(themes.length);

    // Verify each call's content has the correct theme
    for (let i = 0; i < themes.length; i++) {
      const msgBody = asMessageBody(messageCalls[i]!);
      const msgContent = JSON.parse(msgBody.content);
      expect(msgContent.header.template).toBe(themes[i]!);
    }
  });
});
