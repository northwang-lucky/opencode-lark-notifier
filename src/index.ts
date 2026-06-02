import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk/v2";

import { buildCard } from "./cards";
import { isConfigValid, loadConfig } from "./env";
import { sendNotification } from "./lark-client";
import { createCooldown, createRateLimiter, DEFAULT_COOLDOWN_MS, DEFAULT_RATE_LIMIT_MS } from "./rate-limiter";
import type { CardPayload } from "./types";

const LarkNotifierPlugin: Plugin = async (input: PluginInput) => {
  const config = await loadConfig();

  // Graceful degradation: return empty hooks if config invalid
  if (!isConfigValid(config).valid) {
    return {};
  }

  const rateLimiter = createRateLimiter(config.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS);
  const cooldown = createCooldown(config.cooldownMs ?? DEFAULT_COOLDOWN_MS);
  const { client } = input;

  // Build list of events to listen to
  const defaultEvents = ["session.idle", "session.error", "question.asked", "permission.asked"];
  const extraEvents = config.events ?? [];
  const listenEvents = new Set([...defaultEvents, ...extraEvents]);

  return {
    event: async ({ event: _e }) => {
      const event = _e as Event;
      const { properties, type: eventType } = event;

      // Handle session.status busy to reset cooldown
      if (eventType === "session.status") {
        if (properties.status.type === "busy") {
          cooldown.busy(properties.sessionID);
        }
        return;
      }

      // Skip events we're not listening to
      if (!listenEvents.has(eventType)) {
        return;
      }

      // Rate limiting check
      if ("sessionID" in properties) {
        const rateKey = `${eventType}:${properties.sessionID ?? "global"}`;
        if (!rateLimiter.canSend(rateKey)) {
          return;
        }
      }

      try {
        let cardPayload: CardPayload;

        switch (eventType) {
          case "session.idle": {
            cooldown.idle(properties.sessionID);
            // Don't send immediately - wait for cooldown
            // Use setTimeout to check after cooldown
            setTimeout(
              async (sessionID: string) => {
                if (!cooldown.shouldNotify(sessionID)) return;
                const card: CardPayload = {
                  eventType: "session.idle",
                  content: "OpenCode 已完成当前任务，等待你的下一步操作。",
                  theme: "turquoise",
                  sessionId: sessionID,
                };
                await sendNotification(config, card);
              },
              config.cooldownMs ?? DEFAULT_COOLDOWN_MS,
              properties.sessionID,
            );
            return;
          }

          case "session.error": {
            const errorMessage = properties.error?.data?.message;
            const { sessionID } = properties;
            cardPayload = {
              eventType: "session.error",
              content: `错误信息：${errorMessage ?? "未知错误"}`,
              theme: "red",
              ...(sessionID ? { sessionId: sessionID } : {}),
            };
            break;
          }

          case "question.asked": {
            const questions = properties.questions
              ?.map((q) => q.question)
              .filter(Boolean)
              .join("\n");
            cardPayload = {
              eventType,
              content: questions ?? "需要你回答",
              theme: "yellow",
              sessionId: properties.sessionID,
            };
            break;
          }

          case "permission.asked": {
            cardPayload = {
              eventType: "permission.asked",
              content: `需要授权：${properties.permission ?? "未知权限"}`,
              theme: "orange",
              sessionId: properties.sessionID,
            };
            break;
          }

          // Custom events
          default: {
            cardPayload = {
              eventType: eventType,
              content: `收到事件：${eventType}`,
              theme: "blue",
              ...("sessionID" in properties && typeof properties.sessionID === "string"
                ? { sessionId: properties.sessionID }
                : {}),
            };
          }
        }

        // Build card and send (fire-and-forget)
        const cardJson = buildCard(cardPayload);
        void sendNotification(config, JSON.parse(cardJson) as CardPayload).catch(() => {
          // Silently fail - don't block event loop
        });
      } catch (err) {
        // Log error but don't crash
        void client.app.log({
          body: {
            service: "opencode-lark-notifier",
            level: "error",
            message: `Failed to handle event ${eventType}: ${err instanceof Error ? err.message : String(err)}`,
          },
        });
      }
    },
  } as Hooks;
};

export default {
  id: "opencode-lark-notifier",
  server: LarkNotifierPlugin,
};
