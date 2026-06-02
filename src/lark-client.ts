import type { CardPayload, LarkConfig, LarkTokenResponse, UserInfo } from "./types";

const LARK_API_BASE = "https://open.feishu.cn/open-apis";
const TOKEN_REFRESH_THRESHOLD_MS = 60 * 1000; // Refresh 60s before expiry
const REQUEST_TIMEOUT_MS = 5000;

// Shared Promise cache for concurrent token requests
let tokenPromise: Promise<string> | null = null;
let tokenExpiry: number = 0;

/**
 * Get tenant_access_token with shared Promise cache for concurrency safety.
 * Implements proactive refresh (60s before expiry) and reactive refresh (on 401).
 */
export async function getToken(config: LarkConfig): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid (with 60s buffer)
  if (tokenPromise && now < tokenExpiry - TOKEN_REFRESH_THRESHOLD_MS) {
    return tokenPromise;
  }

  // Create new token request (shared by concurrent callers)
  tokenPromise = fetch(`${LARK_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
  })
    .then(async (res) => {
      const data = (await res.json()) as LarkTokenResponse;
      if (data.code !== 0 || !data.tenant_access_token) {
        throw new Error(`Token fetch failed: ${data.msg}`);
      }
      tokenExpiry = Date.now() + (data.expire ?? 7200) * 1000;
      return data.tenant_access_token;
    })
    .catch((err) => {
      tokenPromise = null;
      throw err;
    });

  return tokenPromise;
}

/**
 * Resolve user identifier for sending messages.
 * Priority: email → open_id → user_id
 * No API call needed - receive_id_type directly supports all three.
 */
export function resolveUser(config: LarkConfig): UserInfo | null {
  if (config.userEmail) {
    return { receiveId: config.userEmail, receiveIdType: "email" };
  }
  if (config.userOpenId) {
    return { receiveId: config.userOpenId, receiveIdType: "open_id" };
  }
  if (config.userId) {
    return { receiveId: config.userId, receiveIdType: "user_id" };
  }
  return null;
}

/**
 * Send an interactive card message to a user.
 */
export async function sendCardMessage(token: string, user: UserInfo, cardJson: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${LARK_API_BASE}/im/v1/messages?receive_id_type=${user.receiveIdType}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receive_id: user.receiveId,
        msg_type: "interactive",
        content: cardJson,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Handle 401 by clearing token and letting caller retry
      if (res.status === 401) {
        tokenPromise = null;
      }
      return false;
    }

    const data = (await res.json()) as { code: number; msg: string };
    return data.code === 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Unified entry point: get token → resolve user → send card.
 * Returns true if message sent successfully.
 */
export async function sendNotification(config: LarkConfig, card: CardPayload): Promise<boolean> {
  const user = resolveUser(config);
  if (!user) return false;

  const token = await getToken(config);
  const cardJson = JSON.stringify(card);

  const success = await sendCardMessage(token, user, cardJson);

  // Retry once on failure (could be expired token)
  if (!success) {
    try {
      const newToken = await getToken(config);
      return await sendCardMessage(newToken, user, cardJson);
    } catch {
      return false;
    }
  }

  return success;
}
