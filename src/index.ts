import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import type { CardPayload } from "./types";
import { loadConfig, isConfigValid } from "./env";
import { sendNotification } from "./lark-client";
import { buildCard } from "./cards";
import { createRateLimiter, createCooldown, DEFAULT_RATE_LIMIT_MS, DEFAULT_COOLDOWN_MS } from "./rate-limiter";

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
    event: async ({ event }) => {
      // Cast to string: v2 events (question.asked, permission.asked) are not in the union
      const eventType: string = event.type;
      
      // Handle session.status busy to reset cooldown
      if (eventType === "session.status") {
        const statusEvent = event as unknown as { properties: { status: { type: string } }; sessionID: string };
        if (statusEvent.properties?.status?.type === "busy") {
          cooldown.busy(statusEvent.sessionID);
        }
        return;
      }
      
      // Skip events we're not listening to
      if (!listenEvents.has(eventType)) return;
      
      // Rate limiting check
      const rateKey = `${eventType}:${(event as unknown as { sessionID?: string }).sessionID ?? "global"}`;
      if (!rateLimiter.canSend(rateKey)) return;
      
      try {
        let cardPayload: CardPayload;
        
        switch (eventType) {
          case "session.idle": {
            const idleEvent = event as unknown as { sessionID: string };
            cooldown.idle(idleEvent.sessionID);
            
            // Don't send immediately - wait for cooldown
            // Use setTimeout to check after cooldown
            setTimeout(async () => {
              if (!cooldown.shouldNotify(idleEvent.sessionID)) return;
              
              const card: CardPayload = {
                eventType: "session.idle",
                content: "OpenCode 已完成当前任务，等待你的下一步操作。",
                theme: "turquoise",
                sessionId: idleEvent.sessionID,
              };
              
              await sendNotification(config, card);
            }, config.cooldownMs ?? DEFAULT_COOLDOWN_MS);
            return;
          }
          
          case "session.error": {
            const errorEvent = event as unknown as { sessionID?: string; error?: { message?: string } };
            cardPayload = {
              eventType: "session.error",
              content: `错误信息：${errorEvent.error?.message ?? "未知错误"}`,
              theme: "red",
              ...(errorEvent.sessionID && { sessionId: errorEvent.sessionID }),
            };
            break;
          }
          
          case "question.asked": {
            const questionEvent = event as unknown as { sessionID: string; questions?: Array<{ text?: string }> };
            const questions = questionEvent.questions?.map(q => q.text).filter(Boolean).join("\n") ?? "需要你的回答";
            cardPayload = {
              eventType: "question.asked",
              content: questions,
              theme: "yellow",
              sessionId: questionEvent.sessionID,
            };
            break;
          }
          
          case "permission.asked": {
            const permissionEvent = event as unknown as { sessionID: string; permission?: string };
            cardPayload = {
              eventType: "permission.asked",
              content: `需要授权：${permissionEvent.permission ?? "未知权限"}`,
              theme: "orange",
              sessionId: permissionEvent.sessionID,
            };
            break;
          }
          
          default: {
            // Custom events
            const customEvent = event as unknown as { sessionID?: string };
            cardPayload = {
              eventType: eventType,
              content: `收到事件：${eventType}`,
              theme: "blue",
              ...(customEvent.sessionID && { sessionId: customEvent.sessionID }),
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
