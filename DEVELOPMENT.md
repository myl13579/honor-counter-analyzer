# 开发指南

## 架构概览

```
┌─────────────────────────────────────────────┐
│  前端 React + Vite + TDesign (port 5173)     │
│  ├─ 英雄快捷选择面板                           │
│  ├─ 图片上传入口                               │
│  ├─ 聊天流式对话                               │
│  └─ 会话管理                                   │
└──────────────┬──────────────────────────────┘
               │ REST + SSE (/api/*)
┌──────────────▼──────────────────────────────┐
│  后端 Express (port 3000)                     │
│  ├─ /api/chat      → Agent query() / demo    │
│  ├─ /api/heroes    → 读取本地英雄数据          │
│  ├─ /api/upload    → 图片落盘                  │
│  └─ SQLite 会话持久化                          │
└──────────────┬──────────────────────────────┘
               │ @tencent-ai/agent-sdk
┌──────────────▼──────────────────────────────┐
│  Agent（多模态模型）                           │
│  ├─ 系统提示词：王者对局分析专家               │
│  └─ Read/Grep 工具 → 读知识库 + 读图识别英雄   │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  本地数据 data/                               │
│  ├─ knowledge/  heroes.json / items.json /   │
│  │               summoners.json / counters.md │
│  └─ uploads/    用户上传的待识别截图（临时）     │
└─────────────────────────────────────────────┘
```

## 双模式实现

后端 `routes/chat.ts` 根据 `AGENT_MODE` 环境变量与认证凭据决定模式：

1. **Agent 模式**：调用 `agentService.runAgent()`，基于 `@tencent-ai/agent-sdk` 的 `query()` 异步迭代器，逐段提取 `assistant` 消息的文本/工具块，转发为 SSE 事件。
   - 仅开放 `Read`/`Grep`/`Glob` 工具，Agent 无法执行危险操作。
   - `systemPrompt` 指示 Agent「分析前必须先读取知识库」。
2. **演示模式**：调用 `demoService.buildAnalysis()`，从输入提取英雄名 → 检索 `counters.md` → 生成结构化分析文本 → 分块模拟流式输出。

## 关键设计

- **克制关系数据流**：`counters.md` 是唯一克制事实来源。字段 `countered_by`（谁克制它）/ `counters`（它克制谁）相互印证。
- **英雄名容错**：`knowledge.ts` 的 `resolveHero` 支持模糊匹配（「后裔」→「后羿」），`extractHeroes` 从自由文本提取英雄名。
- **会话持久化**：SQLite（`data/sessions.db`），会话与消息两张表，支持多会话切换与历史恢复。

## 常见问题

### better-sqlite3 安装失败
Windows 上若编译失败，确认 Node 版本 ≥ 18 且已安装构建工具；或改用 Node LTS 预编译二进制。

### 前端 5173 无法访问后端
确认后端 3000 已启动；Vite 已配置 `/api`、`/uploads` 代理到 3000。

### Agent 模式报认证错误
未配置 `CODEBUDDY_API_KEY` 或未执行 `codebuddy login`；可设 `AGENT_MODE=demo` 强制演示模式。
