import type { ConfigValidationResult, LarkConfig, NotifierConfig } from "./types";

const DEFAULT_RATE_LIMIT_MS = 30000;
const DEFAULT_COOLDOWN_MS = 5000;

/**
 * Read and parse a .env file manually (no dotenv dependency).
 * Supports: KEY=value, KEY="value", # comments, empty lines.
 */
export async function readEnvFile(path: string): Promise<Record<string, string>> {
  try {
    const file = Bun.file(path);
    const exists = await file.exists();
    if (!exists) return {};

    const content = await file.text();
    const result: Record<string, string> = {};

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      // Strip surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }

    return result;
  } catch {
    return {};
  }
}

/**
 * Load configuration from environment with 3-tier fallback:
 * 1. `process.env` — direct environment variables
 * 2. `$PWD/.env` — project-level .env file
 * 3. `$XDG_CONFIG_HOME/opencode/.env` — global config (defaults to ~/.config)
 */
export async function loadConfig(): Promise<LarkConfig & NotifierConfig> {
  // Tier 1: Direct process.env
  const envVars: Record<string, string | undefined> = { ...process.env };

  // Tier 2: Project-level .env file
  const projectEnv = await readEnvFile(".env");
  for (const [key, value] of Object.entries(projectEnv)) {
    if (!(key in envVars)) {
      envVars[key] = value;
    }
  }

  // Tier 3: XDG_CONFIG_HOME global .env file
  const xdgConfigHome = process.env["XDG_CONFIG_HOME"] ?? `${process.env["HOME"] ?? "/tmp"}/.config`;
  const globalEnv = await readEnvFile(`${xdgConfigHome}/opencode/.env`);
  for (const [key, value] of Object.entries(globalEnv)) {
    if (!(key in envVars)) {
      envVars[key] = value;
    }
  }

  // Parse and construct config (conditionally include optional fields for exactOptionalPropertyTypes)
  const appId = envVars["LARK_APP_ID"] ?? "";
  const appSecret = envVars["LARK_APP_SECRET"] ?? "";
  const userEmail = envVars["LARK_USER_EMAIL"];
  const userOpenId = envVars["LARK_USER_OPEN_ID"];
  const userId = envVars["LARK_USER_ID"];
  const eventsRaw = envVars["LARK_NOTIFIER_EVENTS"];
  const rateLimitRaw = envVars["LARK_NOTIFIER_RATE_LIMIT_MS"];
  const cooldownRaw = envVars["LARK_NOTIFIER_COOLDOWN_MS"];

  return {
    appId,
    appSecret,
    ...(userEmail && { userEmail }),
    ...(userOpenId && { userOpenId }),
    ...(userId && { userId }),
    ...(eventsRaw && {
      events: eventsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    }),
    rateLimitMs: rateLimitRaw ? parseInt(rateLimitRaw, 10) : DEFAULT_RATE_LIMIT_MS,
    cooldownMs: cooldownRaw ? parseInt(cooldownRaw, 10) : DEFAULT_COOLDOWN_MS,
  };
}

/**
 * Validate that minimum required configuration is present.
 * Returns `{ valid: true }` if both `appId` and `appSecret` are set.
 */
export function isConfigValid(config: LarkConfig): ConfigValidationResult {
  if (!config.appId) {
    return { valid: false, reason: "Missing LARK_APP_ID" };
  }
  if (!config.appSecret) {
    return { valid: false, reason: "Missing LARK_APP_SECRET" };
  }
  return { valid: true };
}
