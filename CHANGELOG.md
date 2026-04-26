# Changelog

> 倒序记录（最新在最前）。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

## [Unreleased]

### Added

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

- **Task Editor 依赖编辑补齐**：任务详情的 Structured 表单现在可以直接编辑 `depends_on`，同时展示 `derived_from`、未完成依赖提示和缺失依赖引用；当循环依赖等保存被拒绝时，表单会自动回滚到磁盘状态，避免前端停留在假成功值。
- **左侧栏 Inbox 红点计数**：Workspace 左侧导航的 Inbox 入口现在会订阅 Inbox 事件并显示 `sidebarMessagesPending` 红色 badge，这样无需进入 Inbox 页面也能看到待处理消息数。

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
