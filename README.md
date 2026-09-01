# 王者对局分析 Agent（Honor Counter Analyzer）

基于 CodeBuddy Agent SDK 构建的全栈 Agent Web 应用：用户通过「勾选英雄」或「上传截图」输入敌方阵容，Agent 实时推荐对位 counter 英雄、召唤师技能与出装，并支持整队阵容克制分析。

> **核心定位**：这不是"后端硬编码 if-else 查表"的普通 Web 应用，而是一个真正的 Agent 应用——Agent 通过 SDK 内置工具（Read/Grep）读取本地知识库、识别上传图片，自主完成克制关系推理与讲解。

## 功能特性

| 优先级 | 功能 | 状态 |
|---|---|---|
| P0 | 英雄快捷选择面板（按定位筛选 132 英雄 + 搜索快速定位，勾选 1~5 人） | ✅ |
| P0 | 单英雄对位分析（⭐最推荐 + 其余 counter，每个均附克制理由/召唤师技能/出装） | ✅ |
| P0 | 整队阵容分析（整体克制思路 + 关键位置优先 counter + 协同建议） | ✅ |
| P0 | SSE 流式对话展示（工具调用可折叠） | ✅ |
| P1 | 官方数据知识库（132 英雄 / 121 装备 / 11 召唤师技能） | ✅ |
| P1 | 克制关系知识库（覆盖全部 132 英雄） | ✅ |
| P1 | 多会话管理（JSON 文件持久化） | ✅ |
| P1 | 图片上传 + 识别入口 | ✅ |
| P1 | 沉浸式 UI（深蓝暗调 + 蓝紫霓虹 + 金色强调；英雄头像/星级/装备卡片富元素渲染） | ✅ |

## 视觉设计

- **色彩体系**：深蓝暗调基底 + 蓝紫霓虹渐变（`#5b6cff → #a855f7`）+ 金色重点强调（`#f5b840`），营造 MOBA 电竞氛围与 AI 工具专业感。
- **布局层级**：左侧三模块（英雄选择 / 截图识别 / 会话历史）按权重分层，英雄选择为核心模块视觉最重；右侧对话区顶部标题栏 + 底部毛玻璃悬浮输入区。
- **富元素渲染**：分析结果将英雄名渲染为头像 + 定位标签、克制强度渲染为金色星级（★）、召唤师技能渲染为胶囊标签、装备渲染为反引号卡片、最推荐渲染为高亮徽章。
- **动效**：消息淡入上滑入场、英雄卡片 hover 放大发光、勾选弹跳、Logo/粒子动画。

## 技术栈

- **前端**：React 18 + Vite 5 + TypeScript + TDesign React
- **后端**：Express 4 + `@tencent-ai/agent-sdk` + multer
- **通信**：REST + SSE 流式
- **数据**：JSON 文件（会话持久化，`data/db.json`） + 本地 JSON/MD（知识库）

## 快速开始

### 环境要求

- Node.js ≥ 18（推荐 20+）
- 可访问 npm registry

### 安装与启动

```bash
# 1. 安装依赖（根 + server + web 三个 workspace）
npm install

# 2. 启动前后端（server:3000 + web:5173）
npm run dev
```

浏览器访问 `http://localhost:5173`，即可看到分析界面。

### 运行模式（双模式）

| 模式 | 触发条件 | 说明 |
|---|---|---|
| **Agent 推理** | 已配置 CodeBuddy 认证 | Agent 通过 SDK 的 Read/Grep 工具读取知识库，自主推理克制关系 |
| **演示模式** | 未配置认证（默认） | 后端直接检索本地知识库生成分析，保证无认证也能跑通完整闭环 |

认证方式（任选其一）：

```bash
# 方式一：CLI 登录
npm i -g @tencent-ai/codebuddy-code
codebuddy login

# 方式二：环境变量
export CODEBUDDY_API_KEY="your-key"   # 或 CODEBUDDY_AUTH_TOKEN
```

设置后重启后端，右上角徽章会从「演示模式」切换为「Agent 推理」。可用环境变量 `AGENT_MODE=agent|demo|auto` 强制指定模式。

## 目录结构

```
honor-counter-analyzer/
├── data/
│   ├── knowledge/          # 知识库
│   │   ├── heroes.json     # 132 英雄（含定位映射）
│   │   ├── heroes_raw.json # 官网原始英雄数据
│   │   ├── items.json      # 121 装备
│   │   ├── summoners.json  # 11 召唤师技能
│   │   └── counters.md     # 克制关系知识库（核心）
│   └── uploads/            # 上传图片临时区
├── server/                 # 后端 Express
│   └── src/
│       ├── index.ts        # 入口
│       ├── config.ts       # 路径/模式配置
│       ├── knowledge.ts    # 知识库加载与检索
│       ├── db.ts           # JSON 文件会话持久化
│       ├── agent/          # 系统提示词 + 真 Agent + 演示服务
│       └── routes/         # /api/chat /api/heroes /api/upload 等
├── web/                    # 前端 React + Vite
│   └── src/
│       ├── App.tsx         # 主组件
│       ├── api.ts          # API + SSE 客户端
│       └── components/     # 英雄选择器 / 对话面板
└── scripts/                # 数据抓取脚本（构建期）
```

## 知识库数据来源

| 数据 | 接口 | 状态 |
|---|---|---|
| 132 英雄 | `https://pvp.qq.com/web201605/js/herolist.json` | ✅ |
| 121 装备 | `https://pvp.qq.com/web201605/js/item.json` | ✅ |
| 11 召唤师技能 | `https://pvp.qq.com/web201605/js/summoner.json` | ✅ |

抓取脚本：`python scripts/fetch-data.py`（构建期执行，运行期不依赖外网）。

克制关系知识库 `counters.md` 为人工整理，**克制关系随版本平衡调整，推荐仅供参考**。

## 测试验证记录（T1–T9）

按开发计划第四节测试用例逐项实测，结果如下：

| 编号 | 场景 | 验证方式 | 结果 |
|---|---|---|---|
| T1 | 单英雄对位 | `POST /api/chat` 输入「后羿」 | ✅ 输出 counter 英雄 + 召唤师技能 + 出装 + 克制理由 |
| T2 | 整队分析 | `POST /api/chat` 输入 5 人阵容 | ✅ 输出整体克制思路 + 关键位置优先 counter |
| T3 | 阵容超限/空阵容 | 前端 `toggleHero` / `analyzeSelected` 拦截 | ✅ 超过 5 人提示「最多 5 个」；空阵容禁用按钮并提示 |
| T4 | 知识库缺失英雄 | 输入未知英雄「赛文」 | ✅ 返回引导提示，不编造克制数据 |
| T5 | 冷门英雄/模糊匹配 | 输入「后裔」 | ✅ 模糊匹配命中「后羿」并给出分析 |
| T6 | 未认证 | `GET /api/auth/status` | ✅ 返回 `authenticated:false`，前端显示「演示模式」徽章 |
| T7 | 流式中断/会话恢复 | `GET /api/sessions/:id/messages` | ✅ 会话与消息 JSON 持久化，刷新可恢复 |
| T8 | 图片识别 | 上传 PNG → `/api/upload` | ✅ 落盘成功；演示模式回显引导，真 Agent 可读图识别 |
| T9 | 图片异常 | 上传 txt / 超大图 | ✅ 前端拦截格式与大小；后端返回 400 与明确错误 |

> 说明：T6/T8 中「真 Agent 推理」与「图片自动识别」需先完成 CodeBuddy 认证（见上文「运行模式」）；未认证时自动降级演示模式，仍可跑通「勾选英雄 → 流式分析」完整闭环。

## 免责声明

本项目仅供学习与演示，克制关系为游戏知识的整理归纳，不构成任何实际对局胜负保证。英雄、装备、召唤师技能数据版权归腾讯《王者荣耀》所有。
