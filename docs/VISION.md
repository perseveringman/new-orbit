# Orbit — Product Vision

> **Last rewritten**: 2026-04-26（随 v2 方向确立）
> **Companion documents**: `docs/overview.md` / `docs/decisions/` / `docs/ROADMAP.md`

---

## 一句话定位

**Orbit 是 Building a Second Brain (BASB) 方法论在本地 AI 协作形态下的完整实现。**

它不是"一个带终端的笔记软件"，也不是"又一个 AI 聊天工具"。Orbit 的目标是让用户把自己的长期方向 (Vision)、项目 (Projects)、任务 (Tasks)、资源 (Resources) 和灵感 (Captures) 沉淀在本地 Markdown + Git vault 中，并通过 AI agent **替自己执行**——以可追踪、可审计、可恢复的方式。

---

## 为什么需要 Orbit

个人知识与生产力工具在当下呈现出撕裂状态：

- **笔记工具**（Obsidian / Notion / Logseq）擅长整理，但**不会执行**——你写完 Vision 和 Project，下一步还得切到另一个工具里手动干活
- **AI 工具**（ChatGPT / Claude Desktop）擅长对话，但**没有持久的项目背景**——每次新对话都要重新告诉它"我在做什么"
- **IDE**（Cursor / Windsurf）擅长在代码里和 AI 协作，但**不懂得你为什么做这个项目**——没有 Vision、没有 PARA、没有跨项目知识

Orbit 的使命是把这三层**粘合起来**，让用户的思考、知识、执行在**同一个 vault 里闭环**。这个闭环就是 BASB 方法论里的 **CODE 四阶段**：

| 阶段 | 含义 | Orbit 的实现 |
|------|------|-------------|
| **Capture** | 捕获信息与灵感 | Inbox → Feed / Library / Thoughts |
| **Organize** | 按可执行性整理 | PARA 目录结构（Projects / Areas / Resources / Archives） |
| **Distill** | 逐步提炼为可复用知识 | 项目 Distillation + 向量 wake-up |
| **Express** | 把知识转化为产出 | AI agent 在 Worktree / Sandbox 中真实执行 |

---

## 核心原则

### 本地优先，数据主权属于用户

所有内容存储在用户自己的文件夹（vault）里，用 plain Markdown + Git 管理版本。没有云同步锁定，没有专有格式。任何 Markdown 编辑器（包括 Obsidian）都可以读写同一套文件。

Orbit 的应用状态集中在 `<vault>/.orbit/`，退出 Orbit 你的笔记依然是干净的 Markdown。

### 愿景驱动 (Vision-Driven)

用户的 `Vision.md` 是整个工作台的北极星。它被注入到每个 agent 的 system prompt 中，让 AI 知道"你到底想成为谁"，而不是只知道"这个任务要做什么"。

Dashboard、Kanban、Inbox、Capture 都围绕 Vision 的方向收敛。系统里的碎片越多，Vision 的回拉力就越关键。

### 人机对等 (AI-Native)

> **用户能做的，AI 都能做；AI 能做的，都有清晰的能力接口。**

这是 v2 引入的新原则（详见 `docs/decisions/ADR-008`），它意味着：

- Orbit 的所有业务能力（CRUD、查询、提议、审批触发）都通过 `orbit` CLI 暴露
- UI 是人的界面，CLI 是 AI 的界面，两者背后走同一套 IPC 业务逻辑
- 低频的"操作性"事情（清理文件、批量改 tag、重组目录）不做专门 UI，交给 AI 用文件系统能力完成

AI-Native 不是"AI 代替决策"——**决策仍然在人**，AI 只是把执行门槛降到极低。

### Agent 参与真实执行，而非只聊天

Agent 不是附属功能，而是执行系统的一部分。Orbit 通过：

- **ExecutionContext** 隔离（Worktree / Sandbox）——agent 的操作不会直接污染主 vault
- **Ghost commit 流程**——agent 产出先落到 `ghost/*` 分支，人审通过才合并
- **propose-approve 模式**——agent 提议新任务、扩大范围、破坏性操作都要人审
- **Activity Log**——所有 agent 动作都留痕可审计

的方式，让 agent 的产出**可以被审查、合并或拒绝**，留下完整的可追溯历史。

### 人审执行，但要快

因为 agent 的产出都要人审，审批流的**顺滑度**直接决定产品价值。Orbit 的 Inbox 架构围绕"**快速处理、原地合并、双通道兜底**"设计——chat 原地可审批、Inbox 同步为副本，任一处理完两处一起消失。

---

## Orbit 的工作流

```
用户：写 Vision + 开 Project → 提议任务或接受 agent 提议 → 审合并产出
  ↑                                                              ↓
  └──── 沉淀为 Resource ← Distill ←── Project 归档 ─────────────┘
                                         ↑
             Library 阅读 + Thought 记录 ←── Capture 入口
                                         ↑
                                   外部信息 / 手机 / 浏览器
```

---

## 长期方向

> v2 之后的演进方向，按优先级排列。详细条目见 `docs/ROADMAP.md` 和 `docs/open-questions.md`。

### 1. Thinking Trail — AI 对话的结构化留痕

记录用户和 AI 对话的全过程（不止结论），提取关键认知跃迁点，成为**"为什么这样想"**的长期档案。与 Activity Log 互补：Activity Log 记"做了什么"，Thinking Trail 记"为什么这样想"。

### 2. Sandbox ExecutionContext

为非代码项目（笔记、写作、研究、阅读）设计的轻量隔离容器，让 agent 可以在笔记项目里安全地实验、修改、合并。

### 3. Capture 能力扩展

Voice Log、手机 share、浏览器插件、Twitter / HN / GitHub Trending 等多来源 Feed、富文本/截图 capture。

### 4. Orbit 自我进化

基于 Activity Log + Thinking Trail + Distillation 的三向数据融合，让 agent 观察用户的工作模式，主动提出优化建议。

### 5. 跨平台与多 provider

- Linux / Windows 打包
- 接入更多 agent runtime（Codex、Gemini、本地模型等）
- CLI / MCP 接口的规范化（观察期后决定是否回补 MCP）

---

## 不做什么

- **不做实时协作** —— Orbit 是个人工具，不是团队 Wiki
- **不做专有云存储** —— vault 永远是用户本地的普通文件夹
- **不做 AI 聊天界面封装** —— Orbit 不做另一个 ChatGPT UI；AI 通过 CLI 在终端/后台工作，产物进 Inbox
- **不强制绑定特定 AI 提供商** —— 通过 CLI + 环境变量可接任何能识别命令行的 agent
- **不做通知中心** —— Inbox 是用户主动来看的，不是系统推给人的
- **不做团队看板** —— 看板是 **个人的认知地图**，不是多人协作面板

---

## 与 Orbit v1 的关系

v1（本文 2026-04-26 之前的所有版本）以"Project-as-Folder + Terminal + MCP + Night Shift"为核心。v2 在**保留全部数据格式和存储契约**的基础上，对工作模式做了以下根本性调整：

| v1 | v2 |
|---|---|
| Night Shift（批量夜间执行） | Auto-runner（24×7 持续） |
| Agent 可能自己创建 subtask 入看板 | Agent 自主步骤折叠进主任务 Execution Log |
| `create_task` 直接入库 | `propose_new_task` 两阶段审批 |
| Worktree 是唯一的执行隔离 | Worktree + Sandbox（双轨，ExecutionContext 抽象） |
| 无显式任务依赖 | `depends_on` + 拓扑解锁 |
| 审批分散在各个 view | Inbox 作为统一审批枢纽 |
| Capture 只在计划中 | Capture 三分（Feed + Library + Thoughts）落地 |
| MCP 是 agent 唯一能力接口 | CLI 是主通道，MCP 暂时废弃观察 |
| 无系统级操作留痕 | Activity Log 基础设施 |

见 `docs/decisions/` 下的 10 份 ADR 了解每项调整的理由。
