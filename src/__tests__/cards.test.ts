import { describe, expect, test } from "bun:test";
import { buildCard, escapeMarkdown, truncate } from "../cards";
import type { CardPayload } from "../types";

describe("escapeMarkdown", () => {
  test("escapes asterisks", () => {
    expect(escapeMarkdown("*bold*")).toBe("\\*bold\\*");
  });

  test("escapes underscores", () => {
    expect(escapeMarkdown("_italic_")).toBe("\\_italic\\_");
  });

  test("escapes backticks", () => {
    expect(escapeMarkdown("`code`")).toBe("\\`code\\`");
  });

  test("escapes brackets", () => {
    expect(escapeMarkdown("[link]")).toBe("\\[link\\]");
  });

  test("escapes backslash first", () => {
    expect(escapeMarkdown("\\star")).toBe("\\\\star");
  });
});

describe("truncate", () => {
  test("does not truncate short text", () => {
    expect(truncate("short", 100)).toBe("short");
  });

  test("truncates long text with ellipsis", () => {
    const text = "a".repeat(300);
    expect(truncate(text, 100)).toBe(`${"a".repeat(97)}...`);
  });

  test("returns empty string for empty input", () => {
    expect(truncate("", 100)).toBe("");
  });

  test("handles text exactly at maxLen", () => {
    const text = "a".repeat(100);
    expect(truncate(text, 100)).toBe(text);
  });

  test("handles text one char over maxLen", () => {
    const text = "a".repeat(101);
    expect(truncate(text, 100)).toBe(`${"a".repeat(97)}...`);
  });
});

describe("buildCard", () => {
  test("generates valid JSON for session.error", () => {
    const payload: CardPayload = {
      eventType: "session.error",
      content: "Test error",
      theme: "red",
      sessionId: "ses-123",
    };

    const card = buildCard(payload);
    const parsed = JSON.parse(card);

    expect(parsed.schema).toBe("2.0");
    expect(parsed.header.template).toBe("red");
    expect(parsed.body.elements[0].content).toContain("Test error");
  });

  test("generates turquoise theme for session.idle", () => {
    const payload: CardPayload = {
      eventType: "session.idle",
      content: "Idle",
      theme: "turquoise",
    };

    const card = buildCard(payload);
    const parsed = JSON.parse(card);
    expect(parsed.header.template).toBe("turquoise");
  });

  test("escapes markdown in content", () => {
    const payload: CardPayload = {
      eventType: "session.error",
      content: "Error *with* markdown",
      theme: "red",
    };

    const card = buildCard(payload);
    const parsed = JSON.parse(card);
    expect(parsed.body.elements[0].content).toContain("\\*with\\*");
  });

  test("uses default theme for unknown event type", () => {
    const payload: CardPayload = {
      eventType: "custom.event",
      content: "Custom event",
      theme: "blue",
    };

    const card = buildCard(payload);
    const parsed = JSON.parse(card);
    expect(parsed.header.template).toBe("blue");
  });

  test("includes note section with default value", () => {
    const payload: CardPayload = {
      eventType: "session.error",
      content: "Error",
      theme: "red",
    };

    const card = buildCard(payload);
    const parsed = JSON.parse(card);
    const noteElement = parsed.body.elements[2];
    expect(noteElement.tag).toBe("markdown");
    expect(noteElement.content).toBe("opencode-lark-notifier");
  });

  test("includes custom note when provided", () => {
    const payload: CardPayload = {
      eventType: "session.error",
      content: "Error",
      theme: "red",
      note: "My custom note",
    };

    const card = buildCard(payload);
    const parsed = JSON.parse(card);
    const noteElement = parsed.body.elements[2];
    expect(noteElement.content).toBe("My custom note");
  });

  test("includes horizontal rule as second element", () => {
    const payload: CardPayload = {
      eventType: "session.error",
      content: "Error",
      theme: "red",
    };

    const card = buildCard(payload);
    const parsed = JSON.parse(card);
    expect(parsed.body.elements[1].tag).toBe("hr");
  });

  test("uses provided title over event type title", () => {
    const payload: CardPayload = {
      eventType: "session.error",
      content: "Error",
      theme: "red",
      title: "Custom Title",
    };

    const card = buildCard(payload);
    const parsed = JSON.parse(card);
    expect(parsed.header.title.content).toContain("Custom Title");
  });
});
