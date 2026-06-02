import type { CardPayload, CardTheme } from "./types";

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 2000;

/**
 * Map event types to card themes (Feishu header.template values)
 */
const EVENT_THEME_MAP: Record<string, CardTheme> = {
  "session.idle": "turquoise",
  "session.error": "red",
  "question.asked": "yellow",
  "permission.asked": "orange",
};

/**
 * Map event types to human-readable titles with emoji
 */
const EVENT_TITLE_MAP: Record<string, string> = {
  "session.idle": "🟢 OpenCode 等待你的操作",
  "session.error": "🔴 会话发生错误",
  "question.asked": "🟡 OpenCode 需要你的回答",
  "permission.asked": "🟠 OpenCode 需要你的授权",
};

/**
 * Escape Markdown special characters for Feishu card content
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/`/g, "\\`")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

/**
 * Truncate text to max length with ellipsis
 */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

/**
 * Build a Feishu interactive card JSON string
 */
export function buildCard(payload: CardPayload): string {
  const theme = payload.theme || EVENT_THEME_MAP[payload.eventType] || "blue";
  const title = payload.title || EVENT_TITLE_MAP[payload.eventType] || "ℹ️ OpenCode 事件通知";
  const safeTitle = truncate(escapeMarkdown(title), MAX_TITLE_LENGTH);
  const safeContent = truncate(escapeMarkdown(payload.content), MAX_CONTENT_LENGTH);
  const note = payload.note ? escapeMarkdown(payload.note) : "opencode-lark-notifier";

  const card = {
    schema: "2.0",
    config: {
      update_multi: true,
    },
    header: {
      title: {
        tag: "plain_text",
        content: safeTitle,
      },
      template: theme,
    },
    body: {
      elements: [
        {
          tag: "markdown",
          content: safeContent,
        },
        {
          tag: "hr",
        },
        {
          tag: "note",
          elements: [
            {
              tag: "plain_text",
              content: note,
            },
          ],
        },
      ],
    },
  };

  return JSON.stringify(card);
}
