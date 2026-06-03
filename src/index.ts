import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk/v2";

import { buildCard } from "./cards";
import { isConfigValid, loadConfig } from "./env";
import { sendNotification } from "./lark-client";
import { createLogger } from "./logger";
import { createCooldown, createRateLimiter, DEFAULT_COOLDOWN_MS, DEFAULT_RATE_LIMIT_MS } from "./rate-limiter";
import type { CardPayload, LogLevel } from "./types";

export const LarkNotifierPlugin: Plugin = async (input: PluginInput): Promise<Hooks> => {
  const { client } = input;
  void client.app.log({
    body: {
      service: "opencode-lark-notifier",
      level: "info",
      message: "🚀 插件正在启动...",
    },
  });

  const config = await loadConfig();

  const logger = createLogger({
    logLevel: (process.env.LARK_NOTIFIER_LOG_LEVEL ?? "INFO") as LogLevel,
    logDir: "",
    moduleName: "notifier",
    maxRetentionDays: 7,
  });

  logger.info("插件已加载，开始初始化...");

  // Graceful degradation: return empty hooks if config invalid
  const validation = isConfigValid(config);
  if (!validation.valid) {
    const msg = `配置无效，跳过启动: ${validation.reason}`;
    logger.warn(msg);
    void client.app.log({
      body: {
        service: "opencode-lark-notifier",
        level: "warn",
        message: msg,
      },
    });
    return {};
  }

  logger.info("配置验证通过");

  const rateLimiter = createRateLimiter(config.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS);
  const cooldown = createCooldown(config.cooldownMs ?? DEFAULT_COOLDOWN_MS);

  // Build list of events to listen to
  const defaultEvents = ["session.idle", "session.error", "question.asked", "permission.asked"];
  const extraEvents = config.events ?? [];
  const listenEvents = new Set([...defaultEvents, ...extraEvents]);

  return {
    event: async ({ event: _e }) => {
      const event = _e as Event;
      const { properties, type: eventType } = event;

      logger.debug(`收到事件: type=${eventType}, session=${"sessionID" in properties ? properties.sessionID : "N/A"}`);

      // Handle session.status busy to reset cooldown
      if (eventType === "session.status") {
        if (properties.status.type === "busy") {
          cooldown.busy(properties.sessionID);
        }
        return;
      }

      // Skip events we're not listening to
      if (!listenEvents.has(eventType)) {
        logger.debug(`跳过非监听事件: ${eventType}`);
        return;
      }

      // Rate limiting check
      if ("sessionID" in properties) {
        const rateKey = `${eventType}:${"sessionID" in properties ? properties.sessionID : "global"}`;
        if (!rateLimiter.canSend(rateKey)) {
          logger.info(`速率限制拦截: ${rateKey}`);
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
                logger.info(`session.idle 冷却到期: session=${sessionID}`);
                const card: CardPayload = {
                  eventType: "session.idle",
                  content: "OpenCode 已完成当前任务，等待你的下一步操作。",
                  theme: "turquoise",
                  sessionId: sessionID,
                };
                await sendNotification(config, buildCard(card));
              },
              config.cooldownMs ?? DEFAULT_COOLDOWN_MS,
              properties.sessionID,
            );
            return;
          }

          case "session.error": {
            const errorMessage = properties.error?.data?.message;
            logger.info(`发送 session.error 通知: ${errorMessage ?? "未知错误"}`);
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
            logger.info(
              `发送 question.asked 通知: session=${"sessionID" in properties ? properties.sessionID : "N/A"}`,
            );
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
            logger.info(`发送 permission.asked 通知: ${properties.permission ?? "未知权限"}`);
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
            logger.info(`发送自定义事件通知: ${eventType}`);
            cardPayload = {
              eventType,
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
        void sendNotification(config, cardJson).catch((err) => {
          logger.warn(`fire-and-forget 发送失败: ${err instanceof Error ? err.message : String(err)}`);
        });
      } catch (err) {
        // Log error but don't crash
        logger.error(`事件处理异常: ${err instanceof Error ? err.message : String(err)}`);
        void client.app.log({
          body: {
            service: "opencode-lark-notifier",
            level: "error",
            message: `Failed to handle event ${eventType}: ${err instanceof Error ? err.message : String(err)}`,
          },
        });
      }
    },
  };
};

export default {
  id: "opencode-lark-notifier",
  server: LarkNotifierPlugin,
};
