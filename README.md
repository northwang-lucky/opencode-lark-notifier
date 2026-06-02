# opencode-lark-notifier

OpenCode 插件，监听会话事件并通过飞书（Lark）机器人向用户发送卡片通知。

## 功能

- 监听 `session.idle`、`session.error`、`question.asked`、`permission.asked` 事件
- 通过飞书企业自建应用发送带颜色主题的卡片消息
- 支持企业邮箱 / open_id / user_id 多种用户标识
- 可配置速率限制和 idle 冷却时间
- 缺少配置时优雅降级（不崩溃）

## 安装

```bash
npm install opencode-lark-notifier
```

在 `opencode.json` 中添加：

```json
{
  "plugin": ["opencode-lark-notifier"]
}
```

## 配置

创建 `.env` 文件：

```bash
# 必填
LARK_APP_ID=cli_xxx
LARK_APP_SECRET=xxx

# 用户标识（三选一，优先邮箱）
LARK_USER_EMAIL=xxx@company.com
# LARK_USER_OPEN_ID=ou_xxx
# LARK_USER_ID=xxx

# 可选
LARK_NOTIFIER_EVENTS=          # 额外事件（逗号分隔）
LARK_NOTIFIER_RATE_LIMIT_MS=30000  # 速率限制（毫秒）
LARK_NOTIFIER_COOLDOWN_MS=5000     # idle 冷却（毫秒）
```

生产环境配置可放在 `~/.config/opencode/.env`。

## 事件→卡片映射

| 事件 | 卡片主题 | 说明 |
|------|---------|------|
| `session.idle` | 🟢 青绿 | OpenCode 等待用户操作 |
| `session.error` | 🔴 红色 | 会话发生错误 |
| `question.asked` | 🟡 黄色 | 需要用户回答 |
| `permission.asked` | 🟠 橙色 | 需要用户授权 |

## 开发

```bash
bun install
bun run typecheck
bun test
bun run build
```

### 真实飞书集成测试

根目录 `.env` 配置好飞书应用和目标用户后，可以执行真实请求测试。该测试会调用 `LarkNotifierPlugin`，向飞书 API 真实获取 token 并发送事件卡片消息；默认 `bun test` 会跳过它，避免在普通单测中误发通知。

```bash
bun run test:lark:real
```

## License

MIT
