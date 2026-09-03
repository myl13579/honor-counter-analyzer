# 开发指南

## 架构概览

```
┌─────────────────────────────────────────────┐
│  前端 React + Vite + TDesign (port 5173)     │
│  ├─ 英雄快捷选择面板                           │
│  ├─ 图片上传入口                               │
│  ├─ 聊天流式对话（分析计划卡片 + 工具时间线）    │
│  └─ 会话管理                                   │
└──────────────┬──────────────────────────────┘
               │ REST + SSE (/api/*)
┌──────────────▼──────────────────────────────┐
│  后端 Express (port 3000)                     │
│  ├─ /api/chat      → LangGraph 循环 / demo    │
│  ├─ /api/heroes    → 读取本地英雄数据          │
│  ├─ /api/upload    → 图片落盘                  │
│  └─ JSON 会话持久化（data/db.json）            │
└──────────────┬──────────────────────────────┘
               │ LangGraph（@langchain/langgraph）
┌──────────────▼──────────────────────────────┐
│  自主规划循环 langgraphService.ts             │
│  planner → executor → critic → synthesizer   │
│  ├─ planner：拆解分析步骤（JSON 计划）         │
│  ├─ executor：调用工具收集信息                 │
│  ├─ critic：评估充分性 / 超时检测 / 重试计数    │
│  └─ synthesizer：汇总输出最终分析              │
└──────────────┬──────────────────────────────┘
               │ DeepSeek（@langchain/deepseek）
┌──────────────▼──────────────────────────────┐
│  工具集 tools.ts                              │
│  ├─ read_knowledge：读知识库文件              │
│  ├─ grep_knowledge：搜索英雄名/关键词          │
│  └─ web_search：必应联网检索（searchProvider） │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  本地数据 data/                               │
│  ├─ knowledge/  heroes.json / items.json /   │
│  │   summoners.json / counters.md /          │
│  │   playstyle.md（打法/对线策略）            │
│  └─ uploads/    用户上传的待识别截图（临时）     │
└─────────────────────────────────────────────┘
```

## 双模式实现

后端 `routes/chat.ts` 根据 `hasDeepSeekKey()` 与 `AGENT_MODE` 环境变量决定模式：

1. **Agent 自主规划模式**（配置 `DEEPSEEK_API_KEY`）：调用 `langgraphService.runGraph()`，基于 LangGraph 的「规划 → 执行 → 反思 → 汇总」四节点循环，逐事件转发为 SSE（`plan` / `tool` / `text` / `done`）。
   - 工具白名单：`read_knowledge` / `grep_knowledge` / `web_search`，Agent 只能读知识库与联网检索，无法执行危险操作。
   - 安全约束：单轮 60s 超时注入「换思路」提示词；重试上限 3 次超限终止；循环上限 8 次。
   - 知识库无答案时，`planner` 规划 `web_search` 步骤，由必应联网检索兜底。
2. **演示模式**（未配置 Key，默认）：调用 `demoService.buildAnalysis()`，从输入提取英雄名 → 检索 `counters.md` → 生成结构化分析文本 → 分块模拟流式输出。

## 关键设计

- **克制关系数据流**：`counters.md` 是唯一克制事实来源。字段 `countered_by`（谁克制它）/ `counters`（它克制谁）相互印证。
- **英雄名容错**：`knowledge.ts` 的 `resolveHero` 支持模糊匹配（别名表 + 编辑距离，「后裔」→「后羿」），`extractHeroes` 从自由文本提取英雄名。
- **联网检索**：`searchProvider.ts` 抽象 `SearchProvider` 接口，默认 `BingProvider`（cn.bing.com，国内可达），`DuckDuckGoProvider` 作海外备选。
- **会话持久化**：JSON 文件（`data/db.json`，`db.ts`），原子写（tmp + rename）+ 防抖合并写盘。
- **超时/重试**：`langgraphService.ts` 用 `withTimeout` 给每次 LLM 调用加 60s 超时，超时置 `timeoutFlag`，`critic` 检测后注入换思路提示词并计数，超 3 次强制终止。

## 常见问题

### DeepSeek 报认证错误
未配置 `DEEPSEEK_API_KEY` 或 key 无效；确认 `server/.env` 已写入正确 key，且 `AGENT_MODE` 非 `demo`。

### 前端 5173 无法访问后端
确认后端 3000 已启动；Vite 已配置 `/api`、`/uploads` 代理到 3000。

### 联网检索无结果
必应国内可达但结果质量取决于查询词；若必应不可用，可在 `tools.ts` 将 `BingProvider` 换成 `DuckDuckGoProvider`（需海外网络）。

### LLM 返回结构化输出为空
`planner` 已内置 `FALLBACK_PLAN` 兜底（默认「搜英雄 → 读知识库」），结构化输出失败时不会中断流程。
