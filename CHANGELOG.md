# Changelog

## 1.0.1 (2026-06-02)

### Bug Fixes

- 修复 npm 发布时未包含 dist 目录的问题：将 `files` 字段从 `src` 改为 `dist`

---

## 1.0.0 (2026-06-02)

### Features

- **Core Plugin**: 实现 OpenCode 插件入口点，监听 4 个核心事件（`session.idle`, `session.error`, `question.asked`, `permission.asked`）
- **Lark Client**: 实现飞书 API 客户端，支持 tenant_access_token 管理与卡片消息发送
- **Card Builder**: 实现卡片消息构建器，支持飞书交互式卡片与多主题颜色
- **Config Loader**: 实现环境变量配置读取器，支持三级降级（process.env → 项目 .env → 全局 ~/.config/opencode/.env）
- **Rate Limiter**: 实现速率限制与冷却时间模块，防止通知轰炸
- **File Logger**: 实现基于文件的结构化日志系统，支持级别过滤、按天轮转、自动清理
- **Test Coverage**: 为核心模块提供完整的单元测试与集成测试覆盖

### Bug Fixes

- 修复事件属性访问路径，使用 v2 Event 类型
- 修正卡片发送内容类型
- 使用 schema 2.0 支持的备注渲染
- 修复构建配置，添加 `main` 字段指向编译产物

### Chores

- 搭建项目骨架，配置 TypeScript、Biome、VS Code
- 添加 `@opencode-ai/plugin` 和 `@opencode-ai/sdk` 依赖
- 构建脚本添加 dist 目录清理，避免旧文件残留
- 添加 `prepublishOnly` 脚本，发布前自动构建

---

## 0.1.1 (2026-06-02)

### Bug Fixes

- 修复 npm 包加载失败问题：添加 `main` 字段指向 `dist/index.js`
- 修改 `exports` 指向编译后的 JS 文件

### Chores

- 构建脚本添加 `rimraf` 清理 dist 目录
- 添加 `prepublishOnly` 脚本

## 0.1.0 (2026-06-02)

### Features

- 初始版本实现
- 支持 `session.idle`, `session.error`, `question.asked`, `permission.asked` 事件通知
- 支持飞书企业自建应用发送卡片消息
- 支持企业邮箱 / open_id / user_id 多种用户标识
- 可配置速率限制和 idle 冷却时间
- 缺少配置时优雅降级（不崩溃）
- 基于文件的结构化日志系统
