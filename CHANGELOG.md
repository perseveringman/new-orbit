# Changelog

> 倒序记录（最新在最前）。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

## [Unreleased]

### Added

- **Notes autosave foundation**：Notes 编辑器新增 1s debounce 自动保存、失焦立即 flush、Saved/Unsaved/Saving/Error 状态提示；自动保存只写回 Note，不会触发 Workbench 强制分析。
- **Notes Markdown Live Preview editor foundation**：Notes 正文编辑器切换到 CodeMirror 6 source-first 模型，默认 Live Preview 隐藏常见 Markdown 标记并在当前编辑行露出源码，同时保留 Source 模式查看/编辑完整 Markdown。
- **Notes AI Workbench foundation**：把 Notes 从 Markdown CRUD 升级为 AI-native 处理队列，新增 inbox/connect/express/settled queue、`summary.entity` / `relate.notes` synthesis artifacts、可接受/驳回的 Area/Resource/tag/task/distill/relation suggestions、`orbit note ...` CLI、Ask-Anywhere agent note tools，以及 Notes 右侧 Workbench UI。
- **cc-connect External Gateway 集成**：落地 ADR-017 的 Orbit 侧域层实现，新增 JSONL/Unix Socket 协议、External Orchestrator、session → Conversation 持久桥接、Capability Registry、Ask/Capture/Library/Task/Inbox/Synthesis/Memory/Delegate adapters、请求日志/限流/权限配置，以及 Settings → External Gateway 状态与绑定查看；现有 Telegram Gateway 保留为自建 channel 兜底。
- **Ask-Anywhere UX Revamp**：把悬浮球从"跳转开关"改造成真正的就地弹层对话框（复用 ChatView，顶部会话下拉 + 新建 + 展开到全页），并把全页从四列（Session/Context/Chat/Stage）压成两列 + 顶部可折叠 Context 条 + 按需 Stage 抽屉。落地 ADR-015 D-2 的弹层形态，不扩展 D-3/D-5/D-6。
- **Gateway Telegram 可用化**：参照 openclaw 的 channel lifecycle 思路，把原本只会本地切状态的 Gateway 骨架升级为真实 Telegram Bot 长轮询运行时；支持 auto-start、关闭窗口后保持本地主进程运行、绑定码授权、未绑定用户拒绝、Telegram 回执、重连退避、channel 状态/错误/log 展示，并继续把 URL / `#thought` / 普通文本分别路由到 Library、Thoughts、Ask-Anywhere。
- **Phase 2 Resource 主题工作站**：补充 `06-resource-workstation.md`，新增 Resource shared contract、main-process store/IPC、preload API、Resources 工作区入口、TraceableEvent/Timeline 投影和 Resource store 测试；支持创建主题工作站、六段目录、链接引用、手动 engagement、从 Notes tags 自下而上生成 Resource suggestions。
- **Phase 2 Knowledge Stack 一次性落地**：新增 Notes 一级入口（Markdown frontmatter CRUD / 搜索 / 归档）、Library / Feeds / Knowledge Base / Scheduled / Timeline / Gateway 工作区入口；补齐 Notes、KB 导入/激活、定时任务、Daily Timeline、Ask-Anywhere Stage Artifact、Gateway channel 管理的 IPC/preload/renderer 闭环，并把 Phase 2 事件接入 TraceableEvent 与 Timeline 投影。
- **Chat 解耦重构 P1-P5 落地差距收尾**：
  - **P1 Conversation 一等公民**：TaskOrchestrator 在 `getOrCreateConversation` / `appendTurn` 同时双写到新 ConversationStore（anchor:task）；启动时一次性迁移旧 `.orbit/orchestration/conversations/<taskUid>.json` 到新格式（幂等）；新增 Conversations 中心视图（左侧统一对话列表 + 右侧只读 ChatView 历史回放），Sidebar 增加「Conversations」入口。
  - **P3 AppBus 闭环**：ConversationOrchestrator 在 `createConversation` / `appendTurn` / `addAnchor` / `endConversation` 上发布 TraceableEvent（`conversation.started/turn.added/anchor.added/ended`），`TRACEABLE_EVENT_SOURCES` 增加 `'conversation'`。
  - **P4 Planner 退役**：Ask-Anywhere system prompt 优先读取 vault 内 `.orbit/skills/ask-anywhere-planning.md`，找不到时回退到内置默认。
  - **P5 Channel ingest stub**：`AskAnywhereOrchestrator.ingestExternalMessage({source, threadId, text})` 提供未来 SMS/IM/邮件等外部入口的统一接入点（创建/复用 anchor=channel_thread Conversation 并写 user turn）。
- **Chat 解耦重构 P0 Ask-Anywhere 真实 runtime 调度**（前序提交）。
- **Chat 解耦重构 Wave A UI 完整性**（前序提交）：ChatView 渲染 `runtime.awaiting_user / interrupt / cost / done`、ToolCard 接 Approve/Reject、MessageBubble 流式光标、HelpRequestRenderer 切到 InboxChatHost。
- **Chat 解耦重构 M7 Planner 退役 banner**：在 `ProjectPlannerView` 顶部加入弃用提示条，引导用户跳转到新版 Ask Anywhere；现有 Planner 仍可使用作为兼容兜底。
- **Chat 解耦重构 M6 Ask Anywhere 骨架**：新增 `src/main/ask-anywhere/orchestrator.ts`（封装 ConversationOrchestrator，使用 `ask_anywhere_session` 锚点）、`src/renderer/src/views/AskAnywhereView.tsx`（左栏会话列表 + 右侧 ChatView），在 `WorkspaceSidebar` 加入「Ask Anywhere」入口、`para.ts` 增加 `askAnywhere` view kind、`VaultView` 路由。
- **Chat 解耦重构 M5 Host 适配层**：新增 `TaskChatHost`（Task 维度 host：拉取/订阅 TaskConversation，把旧 AgentEvent 流通过 `agentEventToRuntime` 翻译为 RuntimeEvent[]，渲染 ChatView）；`InboxChatHost` 骨架（消费 chat IPC + onRuntimeEvent）；`AskAnywhereChatHost` 由 AskAnywhereView 直接合并实现。`TaskDetailsHost` 切换为 `TaskChatHost` 替换原内嵌 `TaskConversationTab`，旧组件保留作为回滚点。
- **Chat 解耦重构 M4 业务无关 Chat 组件**：新增 `src/renderer/src/components/Chat/`：`ChatView.tsx` 纯渲染器（输入 RuntimeEvent[]，输出 ChatAction）、子组件 `MessageBubble` / `ThinkingBlock` / `ToolCard` / `InputArea` / `ActionBar`、hooks `useRuntimeEvents` / `useChatActions`。Chat 目录 grep `'task|inbox|proposal|planner|vault|project'` 验证为空。把原 `chat/approvalCardModel.ts` 迁至 `approval/` 子目录以满足业务无关约束。
- **Chat 解耦重构 M3 Conversation 数据模型**：新增 `src/shared/conversation/{types,index}.ts` 定义 `Conversation`、`ConversationAnchor`、`ConversationTurn` 数据契约，新增 `src/main/conversation/{store,orchestrator,ipc}.ts` 实现 NDJSON 持久化（`<vault>/.orbit/conversations/<id>.{ndjson,meta.json}`）、生命周期编排和 IPC（`chat.conversation*`）；preload 暴露 `chat.{getConversation,listConversations,createConversation,appendTurn,findConversationsByAnchor}`。
- **Chat 解耦重构 M2 RuntimeEvent 协议**：新增 `src/shared/chat-protocol/`（`events.ts` 17 个 RuntimeEventKind、`actions.ts` 9 个 ChatActionKind、`host.ts` ChatHost 接口）、`src/main/agent/adapter/runtime_event_bridge.ts`（UnifiedAgentEvent → RuntimeEvent 翻译层）；新增 `IPC.chat.{runtimeEvent, action}` 通道；`broadcastPool` 在原有 agent:event 之外同步推送 RuntimeEvent；preload 暴露 `chat.onRuntimeEvent` / `chat.sendAction`。adapter 层暂保留 UnifiedAgentEvent 内部表示，仅在 IPC 边界翻译。
- **Chat 解耦重构 M1 基础设施升级**：新增 `src/shared/events/kinds.ts`（27 个 TraceableEventKind 枚举）、`src/shared/events/payloads.ts`（按 kind 强类型 payload 映射），并升级 `src/shared/events.ts` 与 `src/main/events/bus.ts`，使 `publishTraceableEvent` 支持 `kind` 入参且自动与 `type` 双向镜像，旧 publisher 行为零变化。
- **Orbit Phase 3.6 文档与收尾**：将 Phase 3 plans 标记为 completed，更新 `docs/architecture.md` 与 `docs/ROADMAP.md` 为 Phase 3 现状，并在 `docs/CHANGELOG.v2-implementation.md` 增补 Phase 3 偏离、权衡与后续观察项。
- **Orbit Phase 3.5 Global Dashboard**：新增 Dashboard 聚合 IPC 与五象限工作台，覆盖待处理事项、Agent 进行中、知识增长、思考轨迹和系统健康，并接入 Activity、Inbox、Runtime、Budget、Git dirty、磁盘用量与 Developer Console 跳转。
- **Orbit Phase 3.4 Event Replay Infrastructure**：新增 TraceableEvent schema、`.orbit/events/` NDJSON 按日写入与 GC、全局事件总线、agent/activity/inbox/ipc 四源接入、agent raw/abstract/ui-render 三层录像，以及 Developer Console 的实时流、trace/source/kind/task 过滤和基础 playback。
- **Orbit Phase 3.2 / 3.3 Activity + Session + Fallback 基础**：任务详情 Chat tab 改为 Activity 体验，新增 Timeline cards 与流式 Markdown 展示；Task-Session 绑定支持 vendor session reverse scan、Claude resume 参数与运行中 `agent:sendMessage`；Auto-runner settings 扩展默认预算、15 分钟 stale timeout、runtime priority，并新增 fallback / budget guard 基础规则。
- **Orbit Phase 3.1 Runtime Adapter Layer**：新增 `UnifiedAgentEvent` 通用事件协议、Claude / Codex / Copilot RuntimeAdapter 层、legacy `AgentEvent` 兼容转换、PoolEvent unified 旁路，以及 runtime 选择元数据，为 Activity Timeline、session resume、fallback 和 replay 铺底。
- **Orbit Phase 3.0 Agent Playground**：新增 9 个 agent scenario fixture、`orbit dev:scenarios` / `orbit dev:golden` 调试命令、三层 run recorder（raw-vendor / abstract / ui-render）与 golden 文件比对测试，为后续 runtime adapter、event replay 和 Dashboard 提供可重复验证基础。
- **Orbit v2 阶段 6 清理与文档收尾**：删除 Night Shift 与 MCP runtime 旧路径，停用项目 `.mcp.json` 自动写入，归档 v1 架构到 `docs/archive/architecture-v1.md`，重写 `docs/architecture.md` 为 v2 现状，并新增 `docs/CHANGELOG.v2-implementation.md` 记录偏离、权衡与后续观察项。
- **Orbit v2 阶段 5 Capture + CLI**：完成 Feed / Library / Thoughts 基础数据流、Thought-only Quick Capture 与 `orbit` CLI 对现有 v1 MCP 等价能力和 v2 foundation 的主要命令覆盖，保留 MCP 启动到清理阶段处理。
- **Capture / Quick Capture 基础能力**：新增 Feed RSS 订阅与去重刷新、Feed History 淡出、Library 保存/阅读进度/Promote to Resource、Thoughts 生命周期与 `⌘⇧I` Thought-only Quick Capture 浮层，并接入 Inbox v2、IPC/preload 类型和 Activity Log。
- **Orbit v2 阶段 5 CLI 全量覆盖**：补齐 `orbit` CLI 对 v1 MCP 等价能力与现有 v2 foundation 的命令面，包括 project/task/inbox/activity/approval/auto-runner/agent/run；新增 stdin/`--file` 长内容输入、稳定 unavailable 错误与命令覆盖测试，Capture/Memory 后端缺失时仅暴露 help 与结构化不可用错误。
- **Orbit v2 阶段 4 Auto-runner 调度器**：新增 `src/main/auto_runner/` dispatcher / scheduler / event bridge / settings，按 ready-set 自动拾取已授权且依赖满足的 `todo` task，支持并发与小时限额、Sandbox unsupported Inbox 求助事件、Activity Log 运行事件，以及 `orbit auto-runner status/start/stop` 控制。
- **Orbit v2 阶段 3 任务依赖系统**：新增 `depends_on` 拓扑图、循环检测、ready-set 计算、依赖删除/归档级联阻塞与 C1 Inbox 警示，并让 Planner publish 物化依赖边。
- **Orbit v2 阶段 2 Inbox 枢纽**：完成 Inbox v2 的 message/capture/archive 存储、事件 emitter、Activity Log 接入、Proposal 双通道同步、IPC 合约与 renderer 的 Capture/Messages/Archive + Stage View 基础 UI。
- **Inbox v2 架构基础**：新增 Inbox Messages/Capture/Archive NDJSON store、事件 service、Proposal 双通道同步、IPC/preload 类型与 Capture/Messages/Archive Stage View 壳，覆盖消息/捕获计数规则和基础渲染测试。
- **Orbit v2 阶段 1 授权链路**：完成 task 授权 frontmatter 字段与一次性迁移脚本，并新增 Proposal 审批状态机、持久化 store、Activity Log 接入、只读/处理 IPC 与最小 chat 审批卡片模型，建立 `propose → approve/reject → materialize` 基础闭环。
- **Proposal 审批系统**：新增 `src/main/approval/`，提供 proposal schema、pending/archive NDJSON 存储、状态机、chat/Inbox `proposal_id` 同步占位、IPC 合约与 `new_task` 审批后任务物化。
- **Task v2 授权链路 schema**：扩展 task frontmatter / TaskRecord 的授权、proposal 与依赖兼容字段，并新增一次性迁移为既有 task 回填用户授权默认值。
- **Orbit v2 阶段 0 基础设施**：完成 ExecutionContext 抽象、Activity Log 基础设施与 `orbit` CLI Phase 0 脚手架，为后续授权链路、Inbox、依赖调度与 Auto-runner 改造铺底。
- **ExecutionContext 抽象基础**：新增 `src/main/execution/`，以 `WorktreeExecutionContext` 适配现有 worktree 行为，并在项目配置中支持 `execution_context: worktree | sandbox`（默认 `worktree`，`sandbox` 暂为未实现上下文）。
- **Activity Log 基础设施**：新增 `src/main/activity/`，提供 Activity Event 类型、NDJSON 按日存储、fire-and-forget emitter、查询过滤与只读 IPC，并补充 emit / query / concurrency 单元测试。
- **Orbit CLI Phase 0 脚手架**：新增 `src/cli/` 命令行入口、稳定 help / `--json` 输出、退出码与本地 socket bridge；新增 `src/main/cli_server/` 薄协议层，先暴露 `search`、`cat`、`task list`，并保留 MCP 启动流程不变

### Fixed

- **Notes Live Preview 光标抖动**：光标进入标题、引用、任务行等格式块时，现在只露出 Markdown 语法，不再移除块级排版样式，避免行高变化造成布局跳动。
- **Task 对话续跑身份对齐**：当 Inbox 里的 B1 补充信息触发 task conversation 继续执行时，新的 run segment 现在会继承原有 binding / vendor session 语义，不再把同一条长期 agent 会话错误显示成新的 `MANUAL · SESSION`；输入框也会按 idle / running / waiting 状态切换为“发送消息启动 / 追加消息 / 继续对话”。
- **Dispatch 求助状态对齐**：agent 首次执行如果只是要求补充信息，现在会落为 `needs_attention` 报告并保持 binding `healthy`，不再在 Recent Reports 里显示成 `FAILED`，也不会把 Executor 错误降级成 `DEGRADED`。
- **Inbox 红点与详情滚动回归修复**：侧栏 Inbox 红点和 Inbox 页面现在共享同一份 renderer inbox state，收到新消息会先乐观增量再回读校准，避免列表已有 3 条而侧栏仍显示 2；同时 Stage View 与任务 Activity 面板补齐 `min-h-0/overflow` 约束，长对话和图片在 Inbox 详情里可以正常滚动查看。
- **Inbox B1 求助消息嵌入任务对话**：Inbox Messages 的 B1 Agent help Stage View 不再显示占位说明，会根据 `task_uid` 嵌入对应任务的 Activity 对话页，用户可直接在 Inbox 里查看上下文并回复 agent。
- **左侧栏 Inbox 红点实时计数**：Workspace 左侧栏现在用 pending message id 集合维护 Inbox 红点，并忽略过期的异步刷新结果，避免连续产生多条消息时红点被旧请求覆盖成较小数字。
- **Inbox B1 详情滚动恢复**：B1 Agent help 的 Stage View 嵌入任务 Activity 后，详情容器现在会正确继承 `h-full/min-h-0` 高度约束，长对话可以在 Inbox 详情区内部滚动，不会被裁掉。
- **Task Editor 依赖编辑补齐**：任务详情的 Structured 表单现在可以直接编辑 `depends_on`，同时展示 `derived_from`、未完成依赖提示和缺失依赖引用；当循环依赖等保存被拒绝时，表单会自动回滚到磁盘状态，避免前端停留在假成功值。
- **左侧栏 Inbox 红点计数**：Workspace 左侧导航的 Inbox 入口现在会订阅 Inbox 事件并显示 `sidebarMessagesPending` 红色 badge，这样无需进入 Inbox 页面也能看到待处理消息数。

### Changed

- **项目模板执行上下文默认值**：新建 `research` / `writing` 项目时会按 ADR-003 预填 `execution_context: sandbox`，`blank` / `web-app` 保持 `worktree`；同时 `AGENT.md` 会显式写出当前执行上下文，减少 agent 对隔离方式的猜测。

- **Orbit v2 方向确立（2026-04-26）**：经过一次完整 Onboard 对话（~29 轮），确立 v2 演进方向。产出：
  - 新增 `docs/overview.md` — v2 完整架构总览
  - 新增 `docs/decisions/` 目录（10 份 ADR + README）：ADR-001 (废弃 Night Shift) / ADR-002 (Agent 子任务折叠) / ADR-003 (ExecutionContext 双轨) / ADR-004 (Inbox 枢纽) / ADR-005 (Plan Chat 定位) / ADR-006 (propose-approve) / ADR-007 (depends_on) / ADR-008 (AI-Native CLI-first) / ADR-009 (Activity Log) / ADR-010 (Capture 三分)
  - 新增 `docs/plans/2026-04-26-*.md` 共 8 份实施方案：execution-model-migration / auto-runner-dispatcher / task-dependency-system / inbox-v2-architecture / capture-foundation / activity-log-infrastructure / cli-migration / quick-capture-mvp
  - 新增 `docs/thinking-trail/2026-04-26-v2-direction/` — 完整对话留痕 + key-pivots + decisions-traced
  - 新增 `docs/open-questions.md` — 已识别但本期不做的 16 项待议事项
  - 重写 `docs/VISION.md` 和 `docs/ROADMAP.md`，对齐 v2 方向
  - `docs/architecture.md` 顶部加 v2 演进索引段（原文保留作为 v1 现状权威参考）
  - 原有 plans 中 `2026-04-22-orbit-agent-context-*.md` 4 份和 `2026-04-24-capture-knowledge-funnel.md` 标记为 `superseded`
  - `README.md` 和 `AGENTS.md` 更新：引入 BASB 定位、ADR / Thinking Trail 文档规范

- **Project Brainstorm Skill**：新增 `.github/skills/project-brainstorm/` workspace skill，提供项目脑暴、项目接手考古、演进规划与文档体检四种模式，并附带 phases / checklists / templates / proactive patterns 等参考资料
- **Task Chat 流式执行 e2e**：新增 `e2e/task-chat-stream.spec.ts`，会自动创建测试 project/task，把任务前置为 `todo + autonomous`，打开 task 详情 Chat tab，发送一条消息并等待 live stream 文案出现，覆盖 task conversation 的真实 Electron 执行链
- **Task Conversation UI**：任务详情弹窗新增 `Detail / Chat` 双 tab；任务卡片点击会直接进入详情弹窗，Chat tab 统一承载自动 dispatch 执行记录与手动 task chat，对话数据持久化到 `.orbit/orchestration/conversations/*.json`，并复用 `agent:event` 展示运行中的实时输出
- **Orchestration Core Runtime / Planner / Roles**：新增 `src/shared/orchestration.ts` 与 main-process orchestration 模块，落地 runtime registry、plan proposal 存储与发布、dispatch/lease/report 状态流、全局角色模板与项目 binding 持久化；任务状态升级为 `backlog / waiting / todo / doing / blocked / done`，并补齐 ownership、recommended role、implementation report 等编排字段

### Fixed

- **Dispatch blocked 任务的 Inbox 求助消息**：当 agent 自动认领任务后退出但未将任务标记为 `done` 时，dispatch 现在会补发 Inbox message；澄清型退出生成 B1 help request，运行错误生成 B3 failure message，避免只在 task chat 里看到“等待补充信息”而 Inbox 缺失。

- **Orchestration UI Integration**：在 Project Room 中新增 Planner 和 Roles 两个 tab，提供计划管理和角色绑定的可视化界面；Planner tab 支持加载/创建/编辑/发布计划提案，显示节点依赖图和发布结果摘要；Roles tab 支持列出角色模板、创建项目绑定、配置调度模式/运行时偏好/覆盖指令/健康状态，查看绑定任务列表和实施报告；在 TaskRow 和 TaskCard 中展示任务的 origin、owner、blocked/ready 状态标记，帮助用户理解编排上下文

- **Orchestration Workspace UI Rollout**：新增 workspace 级 `Runtimes` 与 `Agents` 页面，采用 list/detail 工作区布局分别呈现 runtime registry、capabilities、leases/reports，以及全局 role templates、版本基线、跨项目 bindings / reports；Project Planner 升级为基于 React Flow 的 proposal canvas，支持节点布局保存、缩放/平移与节点详情检查，并补齐 Project Room 的 `planner` / `roles` 深链入口

- **Global Role Template Agents 设计方案**：新增 `docs/plans/2026-04-25-orbit-role-template-agent-design.md`，将 Orbit 的 agent 设计收敛为全局角色模板 + 项目角色绑定 + 运行实例三层模型，明确模板版本化、binding 调度模式、历史任务双入口、binding 健康状态，以及与 planner / dispatch / runtime 方案的衔接
- **Local Runtime Architecture 设计方案**：新增 `docs/plans/2026-04-24-orbit-local-runtime-architecture.md`，分析 Multica 的 runtime discovery / communication / runtime-aware orchestration，并为 Orbit 设计 Electron 本机本进程方案（LocalRuntimeManager、RuntimeProbe、DispatchService、ProviderAdapter），同时预留向本地 sidecar daemon 扩展的接口
- **Planner Agent + Agent Dispatching 设计方案**：新增 `docs/plans/2026-04-24-orbit-planner-agent-dispatch-design.md`，明确规划画布、依赖图、`waiting` 列、任务 ownership、事务性认领与 Night Shift 向 agent dispatching 演进的路线

- **Workspace Inspector Files + Changes（Task 4 / Task 6）**：右侧栏新增统一 `inspector` 面板；Files tab 在 project surface 下切换到完整项目树（`fs:listProjectTree`），提供搜索、刷新、折叠和二进制文件保护；Changes tab 提供按目录分组的变更树、行级 stage / unstage / discard、统一 diff 预览、staged-only commit bar，以及与 GitHub 发布 / Create PR 共用的受控表单流

- **Staged 感知 git 动作（Task 5）**：新建 `src/main/git/status.ts`，提供 `parsePorcelainStatus`（从 `mcp/tools.ts` 提取共享）、`getChanges`、`stagePaths`、`unstagePaths`、`discardPaths`、`commitSelection` 六个纯后端函数；在 IPC 合约（`src/shared/ipc.ts`、`src/shared/git.ts`）中注册 `git:getChanges`、`git:stagePaths`、`git:unstagePaths`、`git:discardPaths`、`git:commitSelection` 五个新 channel 并完成 preload 暴露与 main-side handler 注册；`commitSelection` 不执行隐式 `add -A`，空暂存区时抛出 `nothing_staged`；旧 `git:commit` 保持向后兼容

- **Workspace Inspector 骨架（Task 2）**：安装 `lucide-react`；新增 `useWorkspaceInspector` Zustand store（activeTab / fileQuery / changeQuery / selectedPath / commitMessage / expanded）；新增 `inspectorTheme.ts` 语义化 class token 映射；扩展 Tailwind 配置和 `styles.css`，添加 `inspector-surface-0/1/2/3`、`inspector-border-subtle/strong`、`inspector-text-primary/secondary/dim`、`inspector-git-added/modified/deleted/renamed`、`inspector-accent` CSS 变量与颜色 token（支持 light / dark 双主题）；重写 `WorkspaceInspectorPane` 展示 Files / Changes 两个 tab（含 lucide 图标），不再使用原始 `neutral-*` 类名
- **Project FS IPC（Task 3）**：新增 `ProjectFileNode` 类型；新增 `fs:listProjectTree` 与 `fs:createDirectory` IPC 通道；`src/main/project_fs.ts` 实现全量文件树（含非 Markdown 文件，忽略 `.git` / `node_modules` / `.orbit`）和安全目录创建（拒绝 `..`、`/`、`\`）；原有 vault `fs:listTree` Markdown-only 行为不变

### Changed

- **v2 文档状态同步**：`docs/plans/2026-04-26-*.md` 标记为 completed，`README.md` 与 `docs/ROADMAP.md` 更新为 v2 已实施后的描述。
- **任务执行 Prompt 边界**：agent task prompt 追加 `# Boundary` 段，明确只能处理当前任务范围、越界工作需新建任务、不得修改其他任务状态，并要求输出完成摘要
- **Agent 任务生命周期契约**：task prompt 与内置 executor 角色现在都会先要求 agent 审视项目上下文和任务信息是否充分；若信息不足，必须先提出澄清、把任务保留在非 `done` 状态，并在真正完成后才通过 Orbit MCP 标记 `done`
- **Planner 交互模型**：Project Planner 从“左侧 proposal 列表 + 主画布”调整为“中间 planner chat + 右侧产物画布”；默认对话 agent 为 Plan Agent，可切换 Architect / Executor 视角，只有生成任务拆分后才显示右侧 React Flow artifact，并在 artifact header 中切换 proposal 版本
- **Planner Agent 接入**：Project Planner 的 `Send` / `Generate Split` 已接入真实 planner agent；中间 chat 会把完整对话历史发给 main-process planner service 生成回复，`Generate Split` 会让 agent 直接产出并保存 versioned proposal，再同步到右侧 React Flow artifact panel

### Fixed

- **Manual run 不持久化 vendorSessionId 导致 resume 链路断**：`recordRunCompletion` 此前只在 dispatch 路径（lease 命中时）被调用，manual `sendAndRun` 启动的 run 完成时既没有把 assistant turn 落盘也没把 Claude 真实 `session_id` 写回 segment；后续 manual 续写虽然会从 conversation 取出"最近一个" `vendorSessionId`，但它停留在最初 dispatch 那一次的 checkpoint，永远不会推进。改为在 `dispatch.ts handlePoolEvent` 的 lease 守卫之前先调用 `recordRunCompletion`，让所有 run（manual + auto）都按真实 Claude 输出更新 segment 的 `vendorSessionId`，下一次 `--resume` 才能接到当前对话末尾
- **Vault watcher 启动崩溃 / glob ignore 失效**：chokidar v4 已移除 glob 支持，原 `**/.orbit/logs/**` 等忽略模式实际不生效，导致 `.orbit/cli-socket` Unix domain socket 被纳入监听并让 `fs.watch` 抛出 `UNKNOWN: unknown error` 击穿 main 进程；改为基于路径的 `ignored` 函数，正确过滤 `.orbit/logs|cost|trash`、`.git`、`node_modules` 与 `.orbit/cli-socket`
- **Task Chat / Agent 日志重复 key warning**：事件流列表不再把 `event.idx` 当成唯一 React key；`TaskConversationTab` 与 `AgentPanel` 现在使用稳定组合 key，避免 live output 中出现重复 key warning
- **Claude 对话流正文缺失**：runner 现在会解析真实 Claude stream-json 的嵌套 `assistant.message.content[]` 文本，不再把 live 对话误判成空字符串；task chat 会显示 agent 的逐步输出，而不是只剩 `✅ 执行完成: exit 0`
- **自主任务误判完成**：dispatch 结束时不再按进程 `exit 0` 自动把任务写成 `done`；现在会先读回任务文件，只有 agent 通过 MCP 明确标记 `done` 才算真正完成，否则会落到 `needs_attention` / 非 done 流程，并在 task chat 里显示“等待补充信息”
- **任务上下文补全与完成守门**：task prompt 现在会携带任务正文、当前 summary 和最近执行日志，agent 能先判断信息是否充分；conversation completion 也新增兜底，只要任务文件还没被明确标成 `done`，成功退出也会显示为“等待补充信息”而不是 `✅ 执行完成: exit 0`
- **Task Chat 首次发送空白态**：首次对一个还没有 conversation 文件的任务发消息后，前端现在会立即重新拉取并 hydrate 新建的 conversation，确保 running segment 和 live stream 不会因为 store 里还没有 conversation 而整块缺失
- **自动认领任务卡死启动态**：Claude runner 改为默认 one-shot 执行，不再把 task / planner / distill run 混入 stdin 回写协议；子进程现在以 `-p <prompt> --output-format stream-json` 启动并直接忽略 stdin，避免进程活着却一直不产出首条事件
- **任务执行上下文挂载**：task run 会优先在所属 worktree / project / area 目录启动，而不是退回 vault 根目录；runner 还会显式注入本地 `.orbit/.mcp.json`，即使项目处于 isolated agent exposure，也能稳定拿到 Orbit MCP 工具；dispatch 仍会忽略运行中的中间 stderr warning，避免被误判成失败
- **GUI 启动 PATH 修复**：main process 启动最前面新增 PATH bootstrap，macOS / Linux 从 Dock / Launchpad 启动时会先恢复 login shell 的 PATH，并补齐 `/opt/homebrew/bin`、`/usr/local/bin`、`~/.local/bin` fallback，避免 `claude` / `codex` / `git` 等 CLI 因 `ENOENT` 无法拉起
- **Dashboard Areas 计数口径**：Dashboard 的 `Areas` 卡片改为按真实 area 目录（`workspace.areas`）计数，不再把 `02_Areas/` 下 frontmatter 为 `type: area` 的文档文件重复算进总数
- **Changes 面板浏览器兼容性**：移除 `buildChangeRows.ts` 对 renderer 中 `node:path` 的依赖，改用浏览器安全的 POSIX 风格字符串路径处理，修复 Workspace Inspector 的 Changes tab 打开即崩溃
- **Prompt-free GitHub 操作流**：Project GitHub View 与 Project Room 顶栏不再依赖 `window.prompt` / `window.confirm` 创建仓库或 PR；统一改为受控表单，Project Room 的快捷入口会直接带你进入 GitHub 工作面板完成发布或 PR 创建
- **discardPaths 修复（Task 5 spec）**：`indexStatus='A'`（新增暂存文件）在 discard 时不再尝试 `git restore --source=HEAD`（因 HEAD 中不存在该文件会失败），改为 unstage 后直接删除文件；新增回归测试覆盖此路径
- **diff 层兼容导出（Task 5 spec）**：`diff.ts` 新增 `getStagedFileSummary`，封装 `git diff --cached --numstat`，供 Changes 面板使用；`git_diff.test.ts` 新增对应集成测试

- **终端可读性主题**：xterm 终端补齐完整 ANSI 调色板，修复浅色模式下白色系输出接近白底白字的问题；同时提高终端字号/行高，并让 `system` 主题下的终端配色跟随实际界面明暗
- **Vision 启动提示词投递**：Vision 的启动 / review 动作不再把中文提示词直接写进 shell；现在会先启动 `claude`，等待进入交互态后再自动发送 prompt
- **Vision 页浏览器兼容性**：移除 renderer 里的 `gray-matter` 依赖，改为浏览器安全的 frontmatter 解析，修复 `Buffer is not defined`
- **Vault 切换文件树竞态**：`fs:listTree` 不再因旧 session 与新 vault 路径短暂交错而抛出 `path escapes vault`；文件树订阅初始化也会主动丢弃过期 listener
- **Session 详情页信息降噪**：精简 Project Session 详情头部，移除 sessionId / pane / prompt / permission / vendor 等内部字段；仅保留会话标题、状态、时间与入口动作，并将 transcript 文案调整为更面向用户的表述
- **Inbox 终端审批同步**：terminal approval 卡片在终端里批准/继续执行后会及时清除待审批状态；`Notification` hook 统一按进度事件处理，避免审批消息卡住
- **Area / Vision 用户旅程闭环**：补齐 Vision 冷启动、笔记接入、Area 级任务创建、Area Session 历史，以及 vault 创建后进入 Vision Room 的导航链路

### Added

- **Area Room + Vision System 设计方案**：`docs/plans/2026-04-23-area-room-vision-system-design.md`（status: completed）；设计 Area 升级为文件夹单元（含 Kanban + Terminal + Sessions）；内置 Vision 模板（基于 45 题访谈协议 + 笔记接入 + 迭代 review 流程）；vault 创建时自动 scaffold vision area
- **Vision 冷启动交互**：新增 `NotesConnectPanel`、Vision 冷启动/活跃态切换、启动访谈与 review 预填命令、外部笔记目录链接/导入、`ORBIT_EXTERNAL_NOTES_PATHS` 终端注入
- **Area 日常工作流**：Area Room 改为 `Kanban / Terminal / Sessions`，普通 Area 支持 area-owned task 文件与 Kanban；Vision Area 支持 transcript 历史与回顾入口

### Changed

- **Areas 左侧导航层级**：移除 Workspace 区的 `Area Overview` 入口，并恢复 `Areas` 独立分组，让它以 `Workspace → Areas → Projects` 的层级出现在左栏
- **Areas 侧边栏**：改为 Vision 置顶、按 tag 分组展示，且新建 Area 后会直接进入对应 Area Room
- **Area 创建流**：`NewAreaModal` 现在支持 blank / vision 模板与 GitHub 仓库导入；GitHub 导入内容会落入 Area 目录但不会保留独立 `.git`
- **Capture 文档基线**：归档旧版 `2026-04-23-capture-and-content-system.md`，新增 `2026-04-24-capture-knowledge-funnel.md`；方案重心从孤立内容模块调整为 `task / resource` 双实体漏斗，并同步更新 ROADMAP 对应条目

---

## [2026-04-23]

### Added

- **Contextual Right Sidebar**：右侧栏改为跟随当前页面上下文，三级 tab（Overview / Focus / Execution）；Project Room 下的 task detail、session list、run log、diff 各归其位
- **`.orbit`-First Agent Exposure**：项目级 Orbit 数据统一收敛到 `.orbit/`；新增 `agent_exposure` 项目配置（isolated / bridge / compatible）；社区规范文件（`AGENT.md` / `AGENTS.md` / `.mcp.json`）仅作兼容桥接
- **GitHub Integration**：以 `gh` CLI 为基础的 GitHub 连接、仓库导入、发布、PR 创建与状态读取；`src/main/github/` 模块 + IPC surface
- **Project Session History**：终端 agent 会话升级为项目级历史记录系统；支持 Claude / Codex 本地 transcript 导入；Project Room 新增 Sessions 外层页签 + Session History tab；`src/main/agent/terminal_sessions.ts`、`src/main/project_session_history.ts`
- **Capture & Content System 方案文档**：`docs/plans/2026-04-23-capture-and-content-system.md`（status: draft）

### Changed

- 终端环境注入优化：`ORBIT_VAULT_PATH`、`ORBIT_PROJECT_UID`、`ORBIT_PROJECT_SLUG` 注入时机提前；pty 启动更稳定

---

## [2026-04-22]

### Added

- **Agent Context Architecture 设计**：`docs/plans/` 新增整体方案分析 + 方案 A / C / D 详细设计（status: draft）
- **Terminal Session Awareness 设计**：`docs/plans/2026-04-22-orbit-terminal-session-awareness.md`（已落地为 Project Session History）

---

## [2026-04 初期 — v1.0 基础功能]

### Added

- Electron 三进程架构（main / preload / renderer），contextBridge + `window.orbit` typed API
- PARA vault（`01_Projects` / `02_Areas` / `03_Resources` / `04_Archives`）+ refmap UID 系统
- 文件系统 IPC（`fs:*`）：原子写入、backlink-safe rename、watcher rename heuristic、MiniSearch 全文索引
- PARA Zod schemas、task index、Kanban（dnd-kit）、`para:*` IPC
- Claude Code agent runner：stream-json、hydration protocol、cost NDJSON、RunnerPool（单任务单 runner 限制）
- Git worktree 管理：ghost-branch policy、GitQueue（global + per-cwd）、pre-merge check（build + secrets scan）、CheckCache、SafetyGate
- Token 预算系统：BudgetGate（pre-spawn）+ BudgetWatch（runtime）、每日 cost 报告
- 项目 Distillation：composeDistillPrompt、parseDistillResponse、hash-trick vector store（512-d）、experience wake-up
- 项目即文件夹（`01_Projects/<slug>/`）、per-project git repo、模板系统（blank/web-app/research/writing）
- Vision-first Dashboard、+ New Project wizard
- 四段式 Task Editor（Description / Thinking / Execution Log / Summary）、per-section auto-save
- Project Room：Kanban + xterm.js 嵌入式终端 + Sessions 三模式
- Orbit Hooks MCP server（`out/mcp/server.cjs`，7 工具）、auto-written `.mcp.json`
- Night Shift：per-task worktree、headless runner、自动 PR、🌙 History drawer
- Worktree GC（launch + 24h 周期）
- Daily Review 生成（LLM + fallback 模板）、Journal 历史列表
- Legacy → v3 项目迁移（dryRun、snapshot commit、幂等）
- Command Palette（`⌘K`）、Settings（Budget/API/Vectors/Worktree GC）
- 崩溃日志（NDJSON at `<vault>/.orbit/crash/`）、ErrorBoundary + Reload
