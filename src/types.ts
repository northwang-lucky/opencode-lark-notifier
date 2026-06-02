// Re-export OpenCode plugin types
import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";

export type { Hooks, Plugin, PluginInput };

// Lark (Feishu) configuration
export interface LarkConfig {
  appId: string;
  appSecret: string;
  userEmail?: string;
  userOpenId?: string;
  userId?: string;
}

// Notifier behavior configuration
export interface NotifierConfig {
  events?: string[]; // Additional events to listen to
  rateLimitMs?: number; // Rate limit window in ms (0 = no limit)
  cooldownMs?: number; // Idle cooldown in ms
}

// Event types we handle
export type EventType = "session.idle" | "session.error" | "question.asked" | "permission.asked" | string; // For custom events

// Card color themes (maps to Feishu header.template values)
export type CardTheme = "turquoise" | "green" | "yellow" | "orange" | "red" | "blue" | "wathet" | "grey";

// Parameters for building a card message
export interface CardPayload {
  eventType: EventType;
  title?: string;
  content: string;
  theme: CardTheme;
  sessionId?: string;
  note?: string;
}

// Feishu API error response
export interface LarkApiError {
  code: number;
  msg: string;
}

// Token response from Feishu auth API
export interface LarkTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}

// User identification for sending messages
export interface UserInfo {
  receiveId: string;
  receiveIdType: "email" | "open_id" | "user_id";
}

// Configuration validation result
export interface ConfigValidationResult {
  valid: boolean;
  reason?: string;
}
