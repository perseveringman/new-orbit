# Orbit — Roadmap

> **Status**: v2 方向确立（2026-04-26）
> **Update cadence**: 每个里程碑落地后更新；大方向调整随 ADR 同步刷新。

本文记录 Orbit 各阶段的目标、当前状态和下一步计划。**v2 方向的完整说明在 `docs/overview.md`，决策记录在 `docs/decisions/`。**

---

## 已完成

### v1 基础设施（M1–M7）

| 里程碑 | 内容 |
| ------ | ---- |
| M1 | Electron 骨架、workspace/settings IPC、WelcomeView |
| M2 | 文件系统层 (`fs:*`)、refmap、chokidar 监听、MiniSearch 索引、CodeMirror 编辑器 |
| M3 | PARA 目录结构、Zod schemas、任务索引、`para:*` IPC、Kanban |
| M4 | Claude Code agent runner、hydration protocol、cost NDJSON 记录、RunnerPool |
| M5 | Git worktree 管理、ghost-commit 流程、pre-merge check、safety gate、InstallLock、PortAllocator |
| M6 | Token 预算系统 (BudgetGate + BudgetWatch)、每日 cost 报告 |
| M7 | 项目 Distillation、hash-trick vector store、experience wake-up |

### v1 二期改造（R1–R7，Project-as-Folder）

| 里程碑 | 内容 |
| ------ | ---- |
| R1 | 项目即文件夹 (`01_Projects/<slug>/`)、per-project git repo |
| R2 | Vision-first Dashboard、+ New Project wizard |
| R3 | 四段式 Task Editor (Description/Thinking/Execution Log/Summary) |
| R4 | Project Room (Kanban + 嵌入式终端 + Sessions) |
| R5 | Orbit Hooks MCP server（7 个工具）**⚠️ v2 中废弃，见 ADR-008** |
| R6 | Night Shift 批处理 **⚠️ v2 中废弃，见 ADR-001** |
| R7 | Worktree GC + Daily Review |

### v1 近期交付（2026-04 前半月）

| 功能 | 描述 |
| ---- | ---- |
| Contextual Right Sidebar | 右侧栏跟随当前页面上下文 |
| Workspace Inspector | Files / Changes 工作台：项目树、staged-only commit、GitHub publish |
| `.orbit`-First Agent Exposure | Orbit 数据收敛 `.orbit/`、agent_exposure 策略 |
| GitHub Integration | `gh` CLI 驱动的 GitHub 连接、PR 创建、状态读取 |
| Project Session History | 终端会话作为项目级历史 + Session History tab |
| Area Room + Vision System | Area 升级为独立工作单元；Vision 冷启动与 review 工作流 |
| Orchestration System (v1) | Planner proposal 历史、Local Runtime registry、Dispatch lease/report 流、Role Templates/Bindings |
| Orchestration Workspace UI | workspace 级 Runtimes / Agents 面板，React Flow proposal canvas |

---

## 进行中 — v2 方向确立 (2026-04-26)

### 🎯 Orbit v2 演进

**触发**：2026-04-26 的 v2 方向 Onboard 对话，确立 10 项核心决策（ADR-001 ~ ADR-010）。

**状态**：方案落地（ADR + plans 已写完），待开始实施。

| 子系统 | ADR | Plan | 状态 |
|--------|-----|------|------|
| 废弃 Night Shift → Auto-runner | [ADR-001](decisions/ADR-001-deprecate-night-shift.md) | [auto-runner-dispatcher](plans/2026-04-26-auto-runner-dispatcher.md) | draft |
| Agent 自主边界：子任务折叠 | [ADR-002](decisions/ADR-002-agent-autonomy-scope.md) | 同上 | draft |
| ExecutionContext 分化 | [ADR-003](decisions/ADR-003-execution-context-split.md) | [execution-model-migration](plans/2026-04-26-execution-model-migration.md) | draft |
| Inbox 作为人机协作枢纽 | [ADR-004](decisions/ADR-004-inbox-as-hub.md) | [inbox-v2-architecture](plans/2026-04-26-inbox-v2-architecture.md) | draft |
| Plan Chat 定位修正 | [ADR-005](decisions/ADR-005-plan-chat-reframing.md) | （合入 inbox-v2） | draft |
| 任务授权链路 (propose-approve) | [ADR-006](decisions/ADR-006-task-authorization-model.md) | 同 auto-runner | draft |
| 任务依赖模型 | [ADR-007](decisions/ADR-007-task-dependency-model.md) | [task-dependency-system](plans/2026-04-26-task-dependency-system.md) | draft |
| AI-Native + CLI-first | [ADR-008](decisions/ADR-008-ai-native-cli-first.md) | [cli-migration](plans/2026-04-26-cli-migration.md) | draft |
| Activity Log 基础设施 | [ADR-009](decisions/ADR-009-activity-log-infrastructure.md) | [activity-log-infrastructure](plans/2026-04-26-activity-log-infrastructure.md) | draft |
| Capture 三分 (Feed/Library/Thoughts) | [ADR-010](decisions/ADR-010-capture-tri-partition.md) | [capture-foundation](plans/2026-04-26-capture-foundation.md) | draft |
| Quick Capture MVP | 004 + 010 | [quick-capture-mvp](plans/2026-04-26-quick-capture-mvp.md) | draft |

### v1 遗留中的 "进行中" 项（仍有效）

| 功能 | 文档 | 状态 |
| ---- | ---- | ---- |
| Planner Agent + Agent Dispatching | `plans/2026-04-24-orbit-planner-agent-dispatch-design.md` | 已落地 (v1)，v2 中接受依赖增强 |
| Local Runtime Architecture | `plans/2026-04-24-orbit-local-runtime-architecture.md` | 已落地 (v1) |
| Global Role Template Agents | `plans/2026-04-25-orbit-role-template-agent-design.md` | 已落地 (v1) |

---

## 显式废弃 / 被覆盖

| 项目 | 状态 | 被什么替代 |
|------|------|-----------|
| **Night Shift** (`src/main/night_shift/`) | 废弃 | 24×7 Auto-runner (ADR-001) |
| **MCP Server** (`src/mcp/`) | 废弃观察期 | `orbit` CLI (ADR-008) |
| **Agent 直接 `create_task` 入库** | 废弃 | `propose_new_task` 两阶段 (ADR-006) |
| **Agent 自主创建入看板的 subtask** | 废弃 | 折叠进主任务 Execution Log (ADR-002) |
| `plans/2026-04-22-orbit-agent-context-*.md` | superseded | ADR-008 (CLI-first 取代 context wrapper 路线) |
| `plans/2026-04-24-capture-knowledge-funnel.md` | superseded | ADR-010 + `capture-foundation` |

---

## 计划中

> 按优先级排列。

### P1 — v2 本期实施（见"进行中"）

**目标**：在未来若干迭代内落地 ADR-001 ~ ADR-010 的全部内容。顺序建议见 `plans/2026-04-26-execution-model-migration.md` 的总览章节。

### P2 — Review 页面 UI

Activity Log 基础设施已经是 v2 本期内容（ADR-009），但它的用户可视化（"Review 页面，时间轴看今天/本周做了什么"）留到下一期。

### P3 — Sandbox ExecutionContext 详细设计

ADR-003 确立了抽象分化，Worktree 侧 v2 本期落地，**Sandbox 的详细实现**单独开一期设计。

### P4 — Thinking Trail 子系统

AI 对话记录的结构化留痕。2026-04-26 的 v2 对话已经以手动方式实践了一次（见 `docs/thinking-trail/`），未来自动化。

### P5 — Capture 能力扩展

- 手机 share endpoint
- Voice Log + 本地转写
- 浏览器插件一键 save
- Feed 多来源（Twitter / GitHub / HN / Substack …）
- 剪贴板粘贴自动识别 URL / 长文本

### P6 — Orbit 自我进化

基于 Activity Log + Thinking Trail + Distillation 的三向数据融合，agent 主动提出优化建议。长期方向。

### P7 — GitHub 深度集成

- Issue → Task 双向同步
- PR review 状态在 Project Room 展示
- Auto-runner 结果直接推远程分支

### P8 — 性能与稳定性

- 大 vault（>1000 文件）索引性能
- Electron 启动时间
- 崩溃恢复改善

### P9 — 跨平台支持

- Linux (AppImage/snap)
- Windows (NSIS installer)
- CLI 跨平台路径处理

### P10 — MCP 观察期决策

v2 上线后观察 agent 对 CLI 的调用准确度，根据实际数据决定是否重新引入 MCP（作为补充 / 替代）。

---

## 版本约定

Orbit 目前处于 v1.x 阶段，尚未发布正式语义化版本号。v2 是**架构方向代号**，不一定对应 `package.json` 里的 `2.0.0` —— 版本发布策略待定。

---

## 如何更新本文件

1. 每个 milestone 落地后，把对应条目从"进行中"挪到"已完成"
2. 每次方向调整（新 ADR accepted），同步更新"计划中"的优先级和"废弃 / 被覆盖"列表
3. 每两周做一次文档 review（参考 `AGENTS.md`）：清理 `plans/` 中 `completed` 的方案、校验"进行中"列表仍有效
