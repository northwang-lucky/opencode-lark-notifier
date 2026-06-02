import { describe, expect, test } from "bun:test";
import type {
  CardPayload,
  CardTheme,
  ConfigValidationResult,
  EventType,
  LarkApiError,
  LarkConfig,
  LarkTokenResponse,
  NotifierConfig,
  UserInfo,
} from "../types";

describe("LarkConfig", () => {
  test("accepts required fields", () => {
    const config: LarkConfig = {
      appId: "test",
      appSecret: "secret",
    };
    expect(config.appId).toBe("test");
    expect(config.appSecret).toBe("secret");
  });

  test("accepts optional user fields", () => {
    const config: LarkConfig = {
      appId: "test",
      appSecret: "secret",
      userEmail: "test@example.com",
      userOpenId: "ou_xxx",
      userId: "uid_xxx",
    };
    expect(config.userEmail).toBe("test@example.com");
    expect(config.userOpenId).toBe("ou_xxx");
    expect(config.userId).toBe("uid_xxx");
  });
});

describe("NotifierConfig", () => {
  test("accepts optional fields", () => {
    const config: NotifierConfig = {
      events: ["session.created"],
      rateLimitMs: 30000,
      cooldownMs: 5000,
    };
    expect(config.events).toHaveLength(1);
    expect(config.rateLimitMs).toBe(30000);
    expect(config.cooldownMs).toBe(5000);
  });

  test("works with empty config", () => {
    const config: NotifierConfig = {};
    expect(Object.keys(config)).toHaveLength(0);
  });
});

describe("CardPayload", () => {
  test("accepts required fields", () => {
    const payload: CardPayload = {
      eventType: "session.error",
      content: "Error message",
      theme: "red",
    };
    expect(payload.theme).toBe("red");
    expect(payload.content).toBe("Error message");
  });

  test("accepts optional fields", () => {
    const payload: CardPayload = {
      eventType: "question.asked",
      title: "Question",
      content: "Someone asked a question",
      theme: "yellow",
      sessionId: "ses_xxx",
      note: "Some note",
    };
    expect(payload.title).toBe("Question");
    expect(payload.sessionId).toBe("ses_xxx");
    expect(payload.note).toBe("Some note");
  });
});

describe("EventType", () => {
  test("accepts known event types", () => {
    const events: EventType[] = ["session.idle", "session.error", "question.asked", "permission.asked"];
    expect(events).toHaveLength(4);
  });

  test("accepts custom event types via string", () => {
    const custom: EventType = "custom.event";
    expect(typeof custom).toBe("string");
  });
});

describe("CardTheme", () => {
  test("accepts all valid themes", () => {
    const themes: CardTheme[] = ["turquoise", "green", "yellow", "orange", "red", "blue", "wathet", "grey"];
    expect(themes).toHaveLength(8);
  });
});

describe("UserInfo", () => {
  test("accepts email receiveIdType", () => {
    const info: UserInfo = {
      receiveId: "user@example.com",
      receiveIdType: "email",
    };
    expect(info.receiveIdType).toBe("email");
  });

  test("accepts open_id receiveIdType", () => {
    const info: UserInfo = {
      receiveId: "ou_xxx",
      receiveIdType: "open_id",
    };
    expect(info.receiveIdType).toBe("open_id");
  });

  test("accepts user_id receiveIdType", () => {
    const info: UserInfo = {
      receiveId: "uid_xxx",
      receiveIdType: "user_id",
    };
    expect(info.receiveIdType).toBe("user_id");
  });
});

describe("LarkApiError", () => {
  test("accepts error fields", () => {
    const err: LarkApiError = {
      code: 99991663,
      msg: "invalid parameter",
    };
    expect(err.code).toBe(99991663);
    expect(err.msg).toBe("invalid parameter");
  });
});

describe("LarkTokenResponse", () => {
  test("accepts success response", () => {
    const resp: LarkTokenResponse = {
      code: 0,
      msg: "ok",
      tenant_access_token: "t-xxx",
      expire: 7200,
    };
    expect(resp.tenant_access_token).toBe("t-xxx");
    expect(resp.expire).toBe(7200);
  });

  test("accepts error response without optional fields", () => {
    const resp: LarkTokenResponse = {
      code: 99991663,
      msg: "invalid parameter",
    };
    expect(resp.tenant_access_token).toBeUndefined();
  });
});

describe("ConfigValidationResult", () => {
  test("accepts valid result", () => {
    const result: ConfigValidationResult = { valid: true };
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  test("accepts invalid result with reason", () => {
    const result: ConfigValidationResult = {
      valid: false,
      reason: "Missing LARK_APP_ID",
    };
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Missing LARK_APP_ID");
  });
});
