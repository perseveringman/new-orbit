# Orbit — Roadmap

> **Status**: Phase 3 规划完成（2026-04-27），待实施
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

### v2 本期实施（2026-04-26）

**触发**：2026-04-26 的 v2 方向 Onboard 对话，确立 10 项核心决策（ADR-001 ~ ADR-010）。

**状态**：核心代码路径已落地，v1 architecture 已归档，Night Shift / MCP runtime 已清理。

| 子系统 | ADR | Plan | 状态 |
|--------|-----|------|------|
| 废弃 Night Shift → Auto-runner | [ADR-001](decisions/ADR-001-deprecate-night-shift.md) | [auto-runner-dispatcher](plans/2026-04-26-auto-runner-dispatcher.md) | completed |
| Agent 自主边界：子任务折叠 | [ADR-002](decisions/ADR-002-agent-autonomy-scope.md) | 同上 | completed |
| ExecutionContext 分化 | [ADR-003](decisions/ADR-003-execution-context-split.md) | [execution-model-migration](plans/2026-04-26-execution-model-migration.md) | completed |
| Inbox 作为人机协作枢纽 | [ADR-004](decisions/ADR-004-inbox-as-hub.md) | [inbox-v2-architecture](plans/2026-04-26-inbox-v2-architecture.md) | completed |
| Plan Chat 定位修正 | [ADR-005](decisions/ADR-005-plan-chat-reframing.md) | （合入 inbox-v2） | completed |
| 任务授权链路 (propose-approve) | [ADR-006](decisions/ADR-006-task-authorization-model.md) | 同 auto-runner | completed |
| 任务依赖模型 | [ADR-007](decisions/ADR-007-task-dependency-model.md) | [task-dependency-system](plans/2026-04-26-task-dependency-system.md) | completed |
| AI-Native + CLI-first | [ADR-008](decisions/ADR-008-ai-native-cli-first.md) | [cli-migration](plans/2026-04-26-cli-migration.md) | completed |
| Activity Log 基础设施 | [ADR-009](decisions/ADR-009-activity-log-infrastructure.md) | [activity-log-infrastructure](plans/2026-04-26-activity-log-infrastructure.md) | completed |
| Capture 三分 (Feed/Library/Thoughts) | [ADR-010](decisions/ADR-010-capture-tri-partition.md) | [capture-foundation](plans/2026-04-26-capture-foundation.md) | completed |
| Quick Capture MVP | 004 + 010 | [quick-capture-mvp](plans/2026-04-26-quick-capture-mvp.md) | completed |

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

## 进行中

### Phase 3 — Agent Observability & Resilience（2026-04-27）

**触发**：v2 实施完成后 dog-food 发现核心问题——agent 执行是黑盒（突然渲染、没有 tool use、resume 断裂）。同时确立了 Runtime 抽象贯通、全链路事件回放、Dashboard 重做等方向。

**状态**：规划完成，待实施。4 项新 ADR（ADR-011 ~ ADR-014）已 accepted。

| 子系统 | ADR | Plan | 状态 |
|--------|-----|------|------|
| Runtime 抽象贯通（通用 Agent Event 协议） | [ADR-011](decisions/ADR-011-runtime-abstraction-through-capabilities.md) | [phase-3 总纲](plans/2026-04-27-phase-3-agent-observability-resilience.md) | draft |
| Task-Session 绑定（原生 resume + 双向 stream） | [ADR-012](decisions/ADR-012-task-session-binding-model.md) | 同上 | draft |
| 统一事件回放（全链路 + Developer Console） | [ADR-013](decisions/ADR-013-unified-event-replay-infrastructure.md) | 同上 | draft |
| Runtime Fallback 决策规则 + Budget | [ADR-014](decisions/ADR-014-runtime-fallback-decision-rules.md) | 同上 | draft |
| Activity tab 时间线 UI（打字机 + 实时 markdown） | — | 同上 | draft |
| Agent Playground 调试基础设施 | — | 同上 | draft |
| Global Dashboard 重做（象限 3/4/5） | — | 同上 | draft |

**实施顺序**（6 个阶段，阶段间有依赖）：

1. **Phase 3.0**：调试基础设施（Playground + scenario harness + 事件录像）
2. **Phase 3.1**：Runtime 抽象贯通（adapter 接口 + Claude/Codex/Copilot adapters）
3. **Phase 3.2**：可观察性 UI（Activity tab + 时间线 + 打字机 + 实时 markdown）
4. **Phase 3.3**：延续性（Task-Session 绑定 + resume + 双向 stream）
5. **Phase 3.4**：全链路事件回放（统一总线 + Developer Console + Golden Files）
6. **Phase 3.5**：Global Dashboard 重做（象限 3: 知识增长 / 象限 4: 思考轨迹 / 象限 5: 系统健康）

---

## 计划中

> 按优先级排列。原 P1-P9 重新编号为 Phase 4+ 方向。

### Phase 4 方向（Phase 3 完成后）

| 方向 | 说明 | 原编号 |
|------|------|--------|
| **Sandbox ExecutionContext** | 非代码项目（research / writing）的执行环境，补齐功能断层 | 原 P2 |
| **Thinking Trail 自动化** | 每次 chat session 自动留痕、关键认知跃迁自动识别 | 原 P3 |
| **对话沉淀 → 项目** | 从 Thoughts / Chat 自然沉淀识别主题集聚，agent 主动提议立项 | 新增 |
| **Capture 多入口** | 剪贴板识别、Library Quick Capture、浏览器插件、手机 share、Voice Log | 原 P4 |
| **Review 页面 UI** | Activity Log 的用户可视化（时间轴、汇总、检索） | 原 P1 |

### 长期方向（Phase 5+）

| 方向 | 说明 | 原编号 |
|------|------|--------|
| **Orbit 自我进化** | Activity Log + Thinking Trail + Distillation 三向融合 | 原 P5 |
| **GitHub 深度集成** | Issue ↔ Task 双向同步、PR review 展示、远程分支推送 | 原 P6 |
| **性能与稳定性** | 大 vault 索引、启动时间、崩溃恢复 | 原 P7 |
| **跨平台支持** | Linux / Windows 打包 + CLI 跨平台路径 | 原 P8 |
| **CLI-first 观察期决策** | agent CLI 调用准确度监控，决定是否重新引入 MCP | 原 P9 |

---

## 版本约定

Orbit 目前处于 v1.x 阶段，尚未发布正式语义化版本号。v2 是**架构方向代号**，不一定对应 `package.json` 里的 `2.0.0` —— 版本发布策略待定。

---

## 如何更新本文件

1. 每个 milestone 落地后，把对应条目从"进行中"挪到"已完成"
2. 每次方向调整（新 ADR accepted），同步更新"计划中"的优先级和"废弃 / 被覆盖"列表
3. 每两周做一次文档 review（参考 `AGENTS.md`）：清理 `plans/` 中 `completed` 的方案、校验"进行中"列表仍有效
