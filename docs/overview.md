# Orbit v2 — Architecture Overview

> **Status**: accepted (2026-04-26)
> **Scope**: 本文是 Orbit v2 演进方向的统一总览，吸收了 2026-04-26 那次 v2 方向确立对话的全部共识。
> **Audience**: 产品决策者、贡献者、接手迭代的 AI agent。
> **How to read**: 先读本文建立全局认知；细节决定读 `docs/decisions/ADR-*.md`；实施方案读 `docs/plans/`；想理解"为什么这样想"读 `docs/thinking-trail/`。

---

## 1. Orbit 是什么

**Orbit 是 Building a Second Brain (BASB) 方法论在本地 AI 协作形态下的完整实现。**

具体拆开来说：

- **Building a Second Brain** 是 Tiago Forte 提出的个人知识管理方法论，核心是 **CODE** 四阶段（**C**apture / **O**rganize / **D**istill / **E**xpress）和 **PARA** 目录结构（**P**rojects / **A**reas / **R**esources / **A**rchives）。
- Orbit 完整实现了这四阶段：
  - **Capture** — 通过 Inbox 的 Feed / Library / Thoughts 三类入口捕获外部信息与内部灵感
  - **Organize** — 通过 `01_Projects / 02_Areas / 03_Resources / 04_Archives` 目录落地 PARA
  - **Distill** — 通过项目 Distillation + 向量 wake-up 把经验提炼为可复用的 Resource
  - **Express** — 通过 AI agent 把思考转化为真实执行产物（代码、文档、设计、研究）
- **AI agent 不是 Orbit 的附加能力，而是 Express 阶段的执行引擎。** 这是 Orbit 区别于 Obsidian / Notion / Logseq 等笔记应用的根本。

### 一句话定位

> **Orbit = 本地 Markdown/Git vault + PARA 目录 + Capture 信息漏斗 + 人审 AI 执行的自动化工作台。**

---

## 2. 三大核心哲学

Orbit 的所有设计决策都可以追溯到以下三条哲学。当面临设计取舍时，优先遵守它们。

### 2.1 本地优先 (Local-First)

- 所有用户数据以 plain Markdown + Git 存储在用户自己选择的文件夹（vault）里
- 应用状态与索引隔离在 `<vault>/.orbit/` 目录中，不污染用户笔记
- 无云同步绑定、无专有格式、无供应商锁定
- Obsidian / VSCode / 任何 Markdown 编辑器都可以直接读写同一套文件

### 2.2 愿景驱动 (Vision-Driven)

- 用户的 `Vision.md` 是整个工作台的北极星
- Vision 被注入到每个 agent 的 system prompt，让 agent 知道"用户到底想成为谁"
- 项目、任务、Capture 的组织都围绕 vision 收敛
- 当系统里有太多碎片时，Vision 是收拢焦点的回拉力

### 2.3 人机对等 (AI-Native)

- **用户能做的，AI 都能做；AI 能做的，都有清晰的能力接口**
- 所有业务能力通过统一的 `orbit` CLI 暴露给 agent（详见 ADR-008）
- UI 是人的界面，CLI 是 AI 的界面，两者背后是同一套业务逻辑
- **破坏性或扩大范围的动作一定走审批流**（方案 B 审批模式，详见 ADR-006）

---

## 3. 核心抽象层次

Orbit 的领域模型由以下几层构成，自下而上：

```
┌─────────────────────────────────────────────────────┐
│  Vault                 （用户选择的文件夹）            │
│   └── PARA 目录        （01_P / 02_A / 03_R / 04_A）  │
│       └── Project      （01_Projects/<slug>/）        │
│           ├── Tasks    （可以是单个 .md 或 checklist） │
│           ├── Runs     （一次 agent 执行实例）         │
│           └── ExecutionContext （Worktree / Sandbox）  │
└─────────────────────────────────────────────────────┘
```

**关键概念**（完整定义见 `docs/architecture.md`）：

- **Vault**：用户的主数据根目录，本地文件夹
- **Project**：一个独立文件夹，有自己的 `README.md / AGENT.md / .agent/ / git repo`
- **Task**：frontmatter `type: task` 的 `.md` 文件，或 inline `- [ ]` checkbox
- **Run**：agent 在某个 task 上的一次执行实例
- **ExecutionContext**：Run 的隔离容器（v2 起支持 Worktree + Sandbox 两种，详见 ADR-003）

---

## 4. v2 的主要子系统

### 4.1 Inbox — 人机协作的统一枢纽

> 详见 ADR-004 + `plans/2026-04-26-inbox-v2-architecture.md`

Inbox 是 "**用户注意力在场时的统一入口**"，承载所有需要用户看/处理的事件。它不是通知中心，也不是审批中心——它是"**待处理事件清单**"。

**一级分层（按处理模式）**：

```
Inbox
├── 📥 Capture              # 原材料（沉浸式处理）
│   ├── 🌊 Feed             # 低信号被动扫描（RSS 等）
│   ├── 📚 Library          # 高信号主动阅读
│   └── ✨ Thoughts          # 灵感笔记 / Voice Log / Scratch
├── 💬 Messages             # 操作决策（扫描式处理）
│   ├── A 审批类              # 批合并 / 批新任务 / 批 proposal
│   ├── B 求助类              # agent 信息不足 / 方案选择 / 执行失败
│   ├── C 警示类              # 依赖连锁 / 预算告警 / agent 主动发现
│   └── D 纪律类              # Daily Review 就绪 / 项目待归档 / GC 报告
└── 📦 Archive              # 统一归档视图（Feed 不入此处）
```

**右侧是通用内容舞台**：点击左侧条目，右侧渲染对应组件（chat / diff / 阅读器 / 笔记编辑器 / proposal 预览）。同一个事件在 chat 和 Inbox 里同步（共享 `proposal_id`），任一处处理两处一起消失。

---

### 4.2 Capture — BASB 的 C 阶段

> 详见 ADR-010 + `plans/2026-04-26-capture-foundation.md`

Capture 是 Orbit 的信息入口层。本期落地 Feed / Library / Thoughts 三类，每一类对应不同的信号强度和用户姿态：

| 类别 | 信号 | 姿态 | v1 范围 |
|------|------|------|---------|
| 🌊 Feed | 低 | 扫过即忘，感兴趣的 Save 到 Library | RSS only |
| 📚 Library | 高 | 沉浸阅读 + 记录进度 + Promote to Resource | 全功能 |
| ✨ Thoughts | 高 | 自己产生的灵感快速落地 | Quick Capture Thought-only |

**数据流**：

```
外部订阅  ──→  Feed  ──(★Save)──→  Library  ──(🔥Promote)──→  03_Resources
                 │                     │
                 ↓ 扫过淡出               ↓ 放弃
            Feed History (agent 检索池)  Archive
```

Feed History 永久保留，不占前台 UI，作为 **agent 的长期兴趣记忆池**存在。

---

### 4.3 Agent 执行模型 — v2 的根本变革

> 详见 ADR-001 / ADR-002 / ADR-006 + `plans/2026-04-26-auto-runner-dispatcher.md`

v2 废弃 Night Shift（按时间分段的批量执行）的概念，转向 **24×7 Auto-runner**：

- Agent 随时可以拾取看板里处于 ready 状态的任务执行，不区分昼夜
- 看板是用户的**认知地图**而不是工作日志
- Agent 自主拆出来的子任务**折叠进主任务 Execution Log**，不入看板
- Agent 只有在"**新任务有独立价值 + 需要用户跟踪**"时才 `propose_new_task`
- 所有新入看板的任务都要通过**用户显式授权**（手动创建 or 审批 agent 提议）
- Agent 的产出都要经过人审合并

**授权链路**落地在任务的 frontmatter：

```yaml
type: task
status: todo
created_by: user | agent_run_XXX
approved_by: user | null
approved_at: 2026-04-26T10:12:00Z
proposed_by_agent_run: run_XXX      # 如果是 agent 提议的
proposed_during_task: task_YYY      # 在执行哪个任务时提议的
```

---

### 4.4 ExecutionContext — Worktree + Sandbox 双轨

> 详见 ADR-003 + `plans/2026-04-26-execution-model-migration.md`

不是所有项目都适合 Git worktree 隔离。v2 引入 **ExecutionContext 抽象**，Worktree 只是其中一种实现：

| ExecutionContext | 适用场景 | 隔离机制 |
|-----------------|---------|---------|
| **Worktree** | 代码项目（有构建/测试需求） | `git worktree` + ghost commit + pre-merge check |
| **Sandbox** | 非代码项目（笔记、写作、研究） | 轻量文件副本 + 变更快照 |

**判定信号**是"**项目是否需要构建/测试**"，而**不是"项目里有没有 `.git`"**——因为用户可能只用 git 管理版本（比如 vault 自身），不代表是代码项目。

Sandbox 的详细设计留待下一阶段，见 `docs/open-questions.md`。

---

### 4.5 任务依赖 — 轻量拓扑调度

> 详见 ADR-007 + `plans/2026-04-26-task-dependency-system.md`

任务之间存在两种关系，v2 明确分开：

- **衍生关系** (derived_from)：描述"任务怎么来的"（从哪个任务提议拆分）
- **依赖关系** (depends_on)：描述"任务执行需要等什么完成"

**依赖不改状态机**（方案 A）——`depends_on` 是独立字段，状态机仍然 `inbox → today → doing → blocked → done`，依赖逻辑在 Dispatcher 层拓扑计算 ready 集合。

**边界策略**：

- 拒绝循环依赖（publish 时检测）
- 依赖任务被删除/归档 → 当前任务自动 `blocked` + Inbox 警示
- 依赖任务长时间卡住 → Inbox 警示（C 类）
- 只支持 task-to-task 依赖，不支持跨项目依赖（v1）

---

### 4.6 Activity Log — 系统级用户行为留痕

> 详见 ADR-009 + `plans/2026-04-26-activity-log-infrastructure.md`

Orbit 里每一个"**状态改变**"都产生一条 Activity Event，统一写入 `<vault>/.orbit/activity/YYYY-MM-DD.ndjson`。

**覆盖的动作类别**：

- Task lifecycle（创建/修改/删除/移动状态）
- Project lifecycle（创建/归档）
- Inbox 事件（消息处理、Capture 入库）
- Capture 动作（订阅源变更、保存文章、新增笔记）
- Agent 执行（run 启停、proposal 提议/审批、merge 审批）
- Planner 动作（proposal 发布/修改）
- Settings 变更

**用途**：

- 未来 Review 页面（时间轴可视化，下一阶段 UI）
- Daily Review (Journal) 的 LLM 输入源
- 未来 Orbit 自我进化的数据基础

---

### 4.7 AI-Native 与 CLI — 能力暴露的唯一路径

> 详见 ADR-008 + `plans/2026-04-26-cli-migration.md`

v2 废弃 MCP server（`src/mcp/`），**所有 agent 能力通过 `orbit` CLI 暴露**。

**理由**：
- Token 开销：MCP 工具清单永久占据 system prompt（30+ 工具 → ~6000 tokens）；CLI 按需拉取 `orbit --help` 只占 ~200 tokens
- 架构简化：只维护一条业务接入通道（CLI → main process IPC handler）
- AI-Native 哲学的纯粹化：能力的唯一接口就是"命令行"

**Agent 与 Orbit 的交互**：

```
Agent 执行能力  ────→  orbit CLI  ──→  main process IPC handler
Agent 接收事件  ────→  stdin pipe（复用现有 hydration 通道）
```

**设计规范**：
- 所有命令支持 `--json`（agent 消费）和 `--help`（agent 发现）
- 长内容通过 stdin / `--file` 传入，规避 shell quoting 问题
- 统一退出码约定（0 成功 / 1 业务错误 / 2 参数错误）

**观察期策略**：本期上线后监控 agent 对 CLI 的调用准确度，若错误率过高则重新引入 MCP 作为补充。MCP 代码保留在 git history，不立即删除。

---

### 4.8 Plan Chat — 通用产物画布的一个实例

> 详见 ADR-005

v2 修正原先把 "Plan Chat" 当作特殊物种的设计：**Plan Chat 不是新组件，而是 `chat + 产物画布` 这个通用模式的一个具体应用**。

通用模式：**聊天面板 + 右侧产物（画布/文档/图表）** 是 Orbit 多处共享的抽象，未来会有更多产物类型接入这套模式。Inbox 的右侧内容舞台、Planner 的 proposal 画布、未来的长文档协作都是同一个抽象的实例。

---

## 5. 工作流全景

### 5.1 典型一天

```
早晨
├── 打开 Orbit → Dashboard 看到 Daily Review (Journal 自动生成)
├── 进 Inbox → Messages：快速处理昨夜 agent 的求助/审批 (几分钟)
└── 进 Capture → Library：沉浸阅读昨天 Save 的文章 (半小时)

工作时段
├── 进 Project Room → 看板：选一个任务 → 交互式和 Claude Code CLI 对话
├── Agent 遇到问题 → Inbox 出现 B 类求助 → 回应（或在 chat 原地）
└── 被外界打断 → Quick Capture ⌘⇧I → 一条 Thought 进 Inbox

碎片时间
├── 手机看到好文章 → share 进 Library（下一阶段）
└── 刷 Feed → 感兴趣的 Save 进 Library

夜间
├── 关了 Orbit 去睡觉，agent 继续 7×24 工作
└── 遇到需要决定的 → 累积在 Inbox Messages → 第二天早晨处理
```

### 5.2 Agent 执行一个任务的完整流程

```
User 批准一个 task (inbox → todo)
        ↓
Dispatcher 检测 task ready
        ↓
分配 agent + 选择 ExecutionContext (Worktree 或 Sandbox)
        ↓
Agent 启动 → 读 Vision + project context + task 内容
        ↓
Agent 执行：
  - 需要新增 task → propose_new_task → A2 审批事件入 Inbox
  - 需要的信息不够 → emit B1 求助事件
  - 发现相关内容 → emit C3 主动汇报事件
  - 自主拆子步骤 → 折叠入主任务 Execution Log（不入看板）
        ↓
Agent 完成 → 生成合并产出
        ↓
A1 审批事件入 Inbox + chat 原地卡片
        ↓
User 批准 merge → pre-merge check → 正式合并
        ↓
Task 标记 done → Activity Log 记录
```

---

## 6. 本期范围

v2 首轮演进（本次 Onboard 的目标）落地以下能力：

| 子系统 | 范围 | ADR | Plan |
|--------|------|-----|------|
| 执行模型 | 废弃 Night Shift + Auto-runner + 子任务折叠 + propose-approve | 001, 002, 006 | `auto-runner-dispatcher` |
| ExecutionContext | Worktree 适配新抽象（Sandbox 下一阶段） | 003 | `execution-model-migration` |
| 任务依赖 | depends_on 字段 + 拓扑调度 + 边界策略 | 007 | `task-dependency-system` |
| Inbox | Capture + Messages + Archive 完整架构 | 004 | `inbox-v2-architecture` |
| Capture | Feed (RSS only) + Library + Thoughts 基础 | 010 | `capture-foundation` |
| Activity Log | 基础设施 (schema / emitter / 存储) | 009 | `activity-log-infrastructure` |
| CLI 迁移 | 废弃 MCP + orbit CLI 实施 | 008 | `cli-migration` |
| Quick Capture | 最小版（Thought-only，跑通 Inbox 流程） | 004, 010 | `quick-capture-mvp` |
| Plan Chat | 通用化（不是本期独立 feature，是 Inbox/Planner 共享抽象） | 005 | — |

**显式不在本期范围**的见 `docs/open-questions.md`。

---

## 7. 不做什么

沿袭原 VISION 并补充 v2 的强化：

- **不做实时协作**（多人同时编辑）—— Orbit 是个人工具
- **不做专有云存储** —— vault 永远是用户本地文件
- **不做 AI 聊天界面封装** —— Orbit 不做另一个 ChatGPT UI，AI 通过 CLI 在终端/后台工作，产物进 Inbox
- **不强制绑定特定 AI 提供商** —— 通过 CLI + 环境变量可接任何能识别命令行的 agent
- **不做"通知中心"** —— Inbox 是用户主动来看的，不是系统推给人看的（AI-Native 原则的克制体现）
- **不做团队看板** —— 看板是 **个人的认知地图**，不是协作面板

---

## 8. 如何继续阅读

- **想理解决策过程** → `docs/thinking-trail/2026-04-26-v2-direction/`
- **想理解某条具体决策** → `docs/decisions/ADR-*.md`
- **想实施某个子系统** → `docs/plans/2026-04-26-*.md`
- **想理解现有代码架构** → `docs/architecture.md`（现状描述，本文未取代它）
- **想理解产品愿景** → `docs/VISION.md`（v2 更新版）
- **想理解开发环境** → `docs/DEVELOPMENT.md`
- **想看现状和路线** → `docs/ROADMAP.md`（v2 更新版）
- **想看未来空白** → `docs/open-questions.md`

---

## 9. 术语表

| 术语 | 含义 |
|------|------|
| **BASB** | Building a Second Brain —— Tiago Forte 的个人知识管理方法论 |
| **CODE** | BASB 的四阶段：Capture / Organize / Distill / Express |
| **PARA** | BASB 的目录结构：Projects / Areas / Resources / Archives |
| **Vault** | 用户选择的主数据根文件夹 |
| **Project** | PARA 中 `01_Projects/<slug>/` 下的独立项目文件夹 |
| **Task** | 项目内的执行单元 (`.md` frontmatter `type: task` 或 inline checkbox) |
| **Run** | agent 在一个 task 上的一次执行实例 |
| **ExecutionContext** | Run 的隔离容器抽象（v2 新增，包括 Worktree / Sandbox） |
| **Worktree** | 基于 `git worktree` 的代码隔离环境（ExecutionContext 的一种实现） |
| **Sandbox** | 非代码项目的轻量隔离环境（ExecutionContext 的一种实现，下一阶段） |
| **Inbox** | 用户处理待决定事件的统一入口，含 Capture + Messages |
| **Capture** | BASB 的 C 阶段，在 Orbit 下分为 Feed / Library / Thoughts |
| **Feed** | 低信号扫描式信息流（RSS 等订阅） |
| **Library** | 高信号主动阅读队列 |
| **Thoughts** | 用户自产的灵感笔记 |
| **Messages** | Inbox 中的操作决策事件（A/B/C/D 四类） |
| **Activity Log** | 系统级用户行为留痕，`<vault>/.orbit/activity/*.ndjson` |
| **Thinking Trail** | AI 对话记录的结构化留痕（下一阶段子系统） |
| **Auto-runner** | v2 的 24×7 任务执行器（替代 Night Shift） |
| **Proposal** | Agent 提议但需要人审批的"拟入库"事项（任务、合并、新订阅源等） |
| **Ghost Commit** | Agent 产出先落到 `ghost/*` 分支的机制，审批通过才合并 |

---

**本文件是 Orbit v2 的入口文档。发现与代码/其他文档不一致时，更新本文是优先级最高的文档维护动作。**
