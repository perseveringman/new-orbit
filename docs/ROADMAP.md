# Orbit — Roadmap

> 本文档记录 Orbit 各阶段的目标、当前状态和下一步计划。随每个里程碑更新。

---

## 已完成

### M1–M7：核心基础设施

| 里程碑 | 内容                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------- |
| M1     | Electron 骨架、workspace/settings IPC、WelcomeView                                                                |
| M2     | 文件系统层（`fs:*`）、refmap、chokidar 监听、MiniSearch 索引、CodeMirror 编辑器                                   |
| M3     | PARA 目录结构、Zod schemas、任务索引、`para:*` IPC、Kanban                                                        |
| M4     | Claude Code agent runner、hydration protocol、cost NDJSON 记录、RunnerPool                                        |
| M5     | Git worktree 管理、ghost-commit 流程、pre-merge check（构建 + 密钥扫描）、safety gate、InstallLock、PortAllocator |
| M6     | Token 预算系统（BudgetGate + BudgetWatch）、每日 cost 报告                                                        |
| M7     | 项目 Distillation、hash-trick vector store、experience wake-up                                                    |

### R1–R7：v1.0 二期改造（Project-as-Folder）

| 里程碑 | 内容                                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| R1     | 项目即文件夹（`01_Projects/<slug>/`）、per-project git repo                                                                             |
| R2     | Vision-first Dashboard、+ New Project wizard（blank/web-app/research/writing 模板）                                                     |
| R3     | 四段式 Task Editor（Description/Thinking/Execution Log/Summary）                                                                        |
| R4     | Project Room（Kanban + 嵌入式终端 + Sessions），xterm.js + node-pty                                                                     |
| R5     | Orbit Hooks MCP server（7 个工具：search_vault、get_file、create_task、update_task、search_memories、save_memory、query_project_graph） |
| R6     | Night Shift 批处理调度器、worktree-per-task、自动 PR                                                                                    |
| R7     | Worktree GC（launch + 24h 周期）、Daily Review 生成与历史                                                                               |

### 近期交付（2026-04）

| 功能                          | 描述                                                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contextual Right Sidebar      | 右侧栏跟随当前页面上下文（Editor/Dashboard/Project Room），三级 tab（Overview/Focus/Execution）                                                                 |
| Workspace Inspector           | 右侧统一 `Files / Changes` 工作台：完整项目树、目录分组变更树、staged-only commit、GitHub publish / PR 表单                                                     |
| `.orbit`-First Agent Exposure | 项目 Orbit 数据收敛到 `.orbit/`；`agent_exposure` 策略（isolated/bridge/compatible）；社区规范文件兼容                                                          |
| GitHub Integration            | 以 `gh` CLI 为基础的 GitHub 连接、导入、发布、PR 创建、状态读取                                                                                                 |
| Project Session History       | 终端 agent 会话作为项目级历史记录，支持 Claude/Codex transcript 导入，Session History tab                                                                       |
| Area Room + Vision System     | Area 升级为独立工作单元（Kanban / Terminal / Sessions）；内置 Vision 模板、笔记接入、Vision 冷启动与 review 工作流                                              |
| Orchestration System          | 落地 Planner proposal 历史与发布、Local Runtime registry、Dispatch lease/report 流、Global Role Templates/Bindings，以及 Project Room 的 Planner/Roles 工作面板 |
| Orchestration Workspace UI    | 新增 workspace 级 Runtimes / Agents 工作面板，并将 Project Planner 升级为 React Flow proposal canvas                                                            |

---

## 进行中

| 功能                              | 文档                                                                          | 状态               |
| --------------------------------- | ----------------------------------------------------------------------------- | ------------------ |
| Agent Context System              | `docs/plans/2026-04-22-orbit-agent-context-architecture.md`（+ scheme-a/c/d） | 设计中，待选型落地 |
| Capture & Knowledge Funnel        | `docs/plans/2026-04-24-capture-knowledge-funnel.md`                           | 设计中             |
| Planner Agent + Agent Dispatching | `docs/plans/2026-04-24-orbit-planner-agent-dispatch-design.md`                | 已落地             |
| Local Runtime Architecture        | `docs/plans/2026-04-24-orbit-local-runtime-architecture.md`                   | 已落地             |
| Global Role Template Agents       | `docs/plans/2026-04-25-orbit-role-template-agent-design.md`                   | 已落地             |

---

## 计划中

> 按优先级排列（随实际情况调整）

### P1 — Agent Context System（落地优先）

让 Orbit 终端中运行的任意 agent（claude/codex/gemini）都能稳定理解：

- Orbit 是什么、能提供哪些工具
- 当前项目的目标、状态、任务
- 推荐的工作方式（AGENT.md persona + .orbit/ context）

参考 `docs/plans/` 中的设计方案。

### P2 — Capture & Knowledge Funnel

- Universal Quick Capture（`Task / Note / Link`）
- Resource Workspace（captured / imported / distilled 统一入口）
- Reading Capture（URL / 摘录 → resource）
- Voice transcript-first（延后）

### P3 — Planner Agent + Agent Dispatching

- Planner Agent 将高层目标拆分为任务图与依赖图
- 规划画布支持版本切换、图结构 diff 与人工确认发布
- 看板新增 `waiting` 列；`todo` 任务支持 agent 自动认领
- 任务引入 owner / release / retry 语义，逐步替代 Night Shift 作为主执行入口

### P4 — Local Runtime Architecture

- 引入 LocalRuntimeManager / RuntimeProbe / ProviderAdapter / DispatchService
- 将 Claude-only runner 泛化为多 provider runtime registry
- 用进程内 runtime 协议替代直接散落的 `startTask` 触发
- 为未来本地 sidecar daemon 预留 transport / lease / execution 接口

### P5 — Global Role Template Agents

- 全局沉淀 `planner / executor / reviewer / researcher` 等角色模板
- 项目通过 binding 引用模板，并支持轻量 project overlay
- 角色模板版本化发布，项目显式升级
- 任务 owner / history / run detail 围绕 binding 而非单一 agent 展开

### P6 — GitHub 深度集成

- Issue → Task 双向同步
- PR review 状态在 Project Room 展示
- Night Shift 结果直接推到指定远程分支

### P7 — 性能与稳定性

- 大 vault（>1000 文件）的索引性能优化
- Electron 启动时间优化
- 自动崩溃恢复改善

### P8 — 跨平台支持

- Linux（AppImage/snap）
- Windows（NSIS installer）
- MCP server 跨平台路径处理

---

## 版本约定

Orbit 目前处于 v1.x 阶段，尚未发布正式语义化版本号。发布策略待定。
