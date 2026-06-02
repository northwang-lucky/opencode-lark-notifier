# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-02
**Commit:** 319e92b
**Branch:** main

## OVERVIEW

OpenCode 插件：监听会话事件，构建飞书交互卡片，并通过企业自建应用发送给目标用户。Bun + TypeScript ESM，发布产物从 `src/index.ts` 构建到 `dist/index.js`。

## STRUCTURE

```
opencode-lark-notifier/
├── src/index.ts        # 插件入口；事件分发、限流、idle 冷却、通知触发
├── src/env.ts          # 三层配置加载：process.env → .env → XDG_CONFIG_HOME/opencode/.env
├── src/lark-client.ts  # 飞书 token、用户标识解析、消息发送与一次重试
├── src/cards.ts        # 飞书 schema 2.0 交互卡片 JSON 构造
├── src/logger.ts       # 文件日志、按天轮转、7 天清理
├── src/rate-limiter.ts # 按事件/session 限流与 idle cooldown 状态
├── src/types.ts        # 公开配置、卡片、日志、飞书响应类型
└── src/__tests__/      # Bun 单测；真实飞书测试默认跳过
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 新增/修改监听事件 | `src/index.ts` | `defaultEvents`、`listenEvents`、`switch (eventType)` 必须同步；自定义事件走 default 蓝色卡片。 |
| 修改飞书卡片样式 | `src/cards.ts` | 当前卡片使用 `schema: "2.0"`；备注以 body markdown 元素渲染。 |
| 修改配置来源或默认值 | `src/env.ts`, `src/rate-limiter.ts`, `README.md` | README 的 `.env` 示例和开发说明要同步。 |
| 修改飞书 API 调用 | `src/lark-client.ts` | token 使用共享 Promise 缓存；发送失败会重新取 token 后重试一次。 |
| 修改日志行为 | `src/logger.ts`, `README.md` | 日志目录默认 `$XDG_STATE_HOME/opencode-lark-notifier/logs`。 |
| 增加类型字段 | `src/types.ts` | `exactOptionalPropertyTypes` 开启，返回对象避免写入 `undefined` 可选字段。 |
| 本地回归 | `src/__tests__/*.test.ts` | 涉及文件写入的测试必须放入 bubblewrap 沙箱运行。 |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `LarkNotifierPlugin` | plugin server | `src/index.ts` | OpenCode 插件主入口；配置无效时返回空 hooks。 |
| `buildCard` | function | `src/cards.ts` | 转义/截断标题正文，生成飞书交互卡片 JSON 字符串。 |
| `loadConfig` | function | `src/env.ts` | 合并三层环境配置并解析事件、限流、冷却参数。 |
| `isConfigValid` | function | `src/env.ts` | 只校验 `LARK_APP_ID` 和 `LARK_APP_SECRET`。 |
| `sendNotification` | function | `src/lark-client.ts` | 解析用户、获取 token、发送卡片并失败重试一次。 |
| `createLogger` | function | `src/logger.ts` | 异步写入本地日志；写入失败静默，不影响插件。 |
| `createRateLimiter` | function | `src/rate-limiter.ts` | 以 `eventType:sessionID` 为 key 控制发送频率。 |
| `createCooldown` | function | `src/rate-limiter.ts` | `session.idle` 延迟通知；`session.status busy` 取消待发 idle。 |

## CONVENTIONS

- 包管理与测试运行使用 Bun；`npm install` 只出现在用户安装文档中。
- Biome：2 空格、双引号、分号、尾逗号、120 列；`useImportType` 为 error。
- TypeScript：`strict`、`verbatimModuleSyntax`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noUnused*` 全开。
- OpenCode 事件处理实际依赖 `@opencode-ai/sdk/v2` 的 `Event`，`event` hook 入参在入口统一转成 v2 类型。
- 插件启动可优雅降级：配置缺失时记录日志并返回 `{}`，不要抛出导致 OpenCode 启动失败。
- `.env` 优先级：已有 `process.env` 最高；项目 `.env` 不覆盖已有变量；全局 `.env` 只填补缺失变量。

## ANTI-PATTERNS (THIS PROJECT)

- 不要默认运行 `bun run test:lark:real`；它会真实请求飞书并发送消息，只有显式需要且凭据齐全时才运行。
- 不要把会写 `/tmp`、`$XDG_STATE_HOME`、`.env` 的测试直接跑在宿主机；用 bubblewrap 绑定临时 HOME/XDG/PWD。
- 不要把 `session.idle` 立即发送；它必须经过 cooldown，并能被后续 `session.status busy` 取消。
- 不要把飞书消息 `content` 传对象；当前 `sendCardMessage` 发送的是 `content: cardJson` 字符串。
- 不要在可选字段中显式写 `undefined`；当前 tsconfig 会拒绝。
- 不要新增 `console.*` 作为长期日志方案；Biome 只 warn，但运行时日志应走 `createLogger` 或 `client.app.log`。

## COMMANDS

```bash
bun install
bun run typecheck
bun run lint
bun test
bun run build
bun run test:lark:real   # 真实飞书集成测试；默认不要跑
```

涉及文件写入的本地验证示例：

```bash
bwrap --dev-bind / / --tmpfs /tmp --tmpfs /home/northwong/.local/state --tmpfs /home/northwong/.config --chdir "$PWD" bun test
```

## NOTES

- 仓库规模小：目前只需要根级 AGENTS.md；`src/` 与 `src/__tests__/` 未达到独立子级知识库阈值。
- `package.json` 的 `main`/`exports` 指向 `dist/index.js`，发布前依赖 `prepublishOnly` 执行 `bun run build`。
- `src/__tests__/integration.test.ts` 的 token 缓存在模块级可能跨用例存在；断言应关注消息调用而不是 token 请求次数。
