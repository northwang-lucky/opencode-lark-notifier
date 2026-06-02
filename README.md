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

## 日志

插件使用基于文件的结构化日志系统，记录运行时的关键事件和错误信息。

### 日志文件路径

日志文件存储在 `$XDG_STATE_HOME/opencode-lark-notifier/logs/` 目录下。如果未设置 `XDG_STATE_HOME` 环境变量，默认回退到 `~/.local/state/opencode-lark-notifier/logs/`。

### 日志格式

每条日志的格式如下：

```
[2026-06-02 10:30:15] [INFO] [lark-client] Token refreshed successfully
```

具体字段说明：

| 字段 | 说明 |
|------|------|
| `时间戳` | `YYYY-MM-DD HH:mm:ss` 格式的本地时间 |
| `级别` | `DEBUG` / `INFO` / `WARN` / `ERROR` |
| `模块` | 产生日志的模块名称（如 `lark-client`、`env`） |
| `消息` | 日志内容文本 |

### 日志级别

| 级别 | 说明 |
|------|------|
| `DEBUG` | 调试信息，用于开发和排查问题 |
| `INFO` | 常规运行信息，如服务启动、Token 刷新成功 |
| `WARN` | 警告信息，表示潜在问题但不影响运行 |
| `ERROR` | 错误信息，表示功能异常或 API 调用失败 |

### 配置

通过 `LARK_NOTIFIER_LOG_LEVEL` 环境变量控制日志输出级别，默认值为 `INFO`。只有大于等于当前级别的日志才会被写入文件。

```bash
# 输出所有日志（含调试信息）
LARK_NOTIFIER_LOG_LEVEL=DEBUG

# 仅输出警告和错误
LARK_NOTIFIER_LOG_LEVEL=WARN
```

### 日志轮转

日志文件按天轮转，每天的日志写入独立的文件中，文件名为 `opencode-lark-notifier-YYYY-MM-DD.log`。系统自动保留最近 7 天的日志文件，超出期限的旧日志会被自动清理。

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
