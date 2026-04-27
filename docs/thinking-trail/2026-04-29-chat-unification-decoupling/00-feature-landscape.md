# 阶段 0：全功能盘点（架构压力表）

> **目的**：不是描述功能本身（那是 overview.md 的活），而是从**每个功能看骨架**——它需要什么接口、给 chat / runtime / bus 施加什么约束、最终能不能在同一骨架上装下。
>
> **约束输入**：本次盘点的结论是后续阶段 1/2/3/4 的参照物。任何未来阶段的设计取舍都必须回答："这 N 个功能能在这个设计上装下吗？"
>
> **方法**：每个功能只写 5 个字段——Runtime 需求 / Chat 需求 / Bus 事件 / 状态语义 / 外部接口。不写 UI、不写数据库 schema、不写时序图。

---

## 阅读顺序

1. 先读 §A 看"骨架必须支持的维度清单"（从所有功能归纳出来的）
2. 再读 §B 逐个功能的五字段表
3. §C 是针对每个功能的"对骨架的压力测试问题"，这是进入阶段 2/3/4 时的检查项
4. §D 是给你（用户）的"我还需要确认的功能细节"——有些功能我从文档看不清，得你口述

---

## §A 骨架必须支持的维度清单（从全盘点归纳）

基于 §B 所有功能的共同需求，骨架**至少**必须提供以下能力。这是应用总线 + chat + runtime 协议设计的硬约束。

### A1. 多 Runtime 抽象（Chat ⊥ Runtime）

- Runtime 种类：外置 CLI（Claude / Codex / Gemini / Copilot）/ 内置 Runtime（未来）/ 远程 Runtime（未来 Telegram 等 channel 让某个远程 agent 帮忙处理也算）
- 能力维度：resume / tool-use / thinking / stream / cancel / budget / multimodal（语音/图片）
- Runtime 间可切换（Phase 3 的 Switch Runtime 已在做，但范围局限在 task 执行）

### A2. 多 Chat Surface（同构 UI 组件）

现在 + 未来需要 chat 的地方：
- Task Conversation（现在）
- Inbox Help Request 内联（现在）
- Planner Chat（现在，v1 独立）
- Terminal Agent（现在，通过 PTY 而非 chat UI）
- 全局 Ask-Anywhere（未来）
- 阅读器内讨论文章（未来）
- 笔记内讨论/续写（未来）
- Canvas / Stage View 上的对话（未来）
- 外部 channel 到来的消息进入应用内 chat（未来，Telegram 等）

→ **Chat 组件必须是业务无关的纯渲染 + 事件发射器**

### A3. 应用总线（TraceableEvent 升格）

总线要承载的事件来源（现在 + 未来）：
- 所有 Activity（已有）
- Agent 执行事件（已有 UnifiedAgentEvent）
- Inbox 事件（已有）
- IPC 调用（已有）
- Chat 事件（新）—— 消息、awaiting_user、tool_render_request、cancel
- Runtime 事件（新）—— 启动、切换、fallback、budget 耗尽
- Capture 事件（已有，但目前是 Activity 子类）
- Task state machine 事件（已有，Phase 4.0 reducer）
- Schedule / Cron 事件（未来）
- Channel / Gateway 事件（未来）—— 入站消息、pairing、DM policy
- Sandbox 事件（未来）—— 变更快照、审查请求
- 向量 / 搜索事件（已有 distill，未来扩展）

### A4. 订阅声明 + 业务处理分离

每个业务模块声明"我订阅什么 + 我产出什么"，彼此不直接调用：
- Inbox 订阅：agent awaiting_user / task done / proposal 事件 → 生成 Inbox item
- Activity 订阅：几乎所有事件 → 转存 NDJSON
- Dashboard 订阅：若干聚合事件 → 刷新五象限
- Auto-runner 订阅：task ready / dependency resolved → 派发
- Canvas 订阅：Agent 发出"我想渲染这个"的事件 → 渲染产物

### A5. 跨边界消息（main ↔ renderer ↔ 外部 channel）

应用总线不只在 main 进程流动，还必须：
- 桥接到 renderer（现在的 `agent:event`、`inbox:*` 等 IPC 需要收编到统一通道）
- 桥接到外部 channel（未来 Telegram / Slack / Email webhook 等）
- 桥接到外部订阅者（未来 Webhook / iOS Node / macOS menubar app）

### A6. 可 Replay + 可时间旅行

所有事件都可 replay 重现状态。这是**本次升格的核心收益**：
- 调试：golden file 比对（已有）
- 事故回溯：任意时刻重建应用状态
- 测试：scenario-driven 端到端测试（已有 dev:lifecycle）
- Thinking Trail：历史对话完整保留，随时可重读

---

## §B 功能五字段表

> **字段约定**：
> - **Runtime 需求**：这个功能需要 runtime 层提供什么能力
> - **Chat 需求**：这个功能要不要 chat，要的话需要 chat 暴露什么能力
> - **Bus 事件**：这个功能会在应用总线上产出 / 订阅什么事件
> - **状态语义**：这个功能有什么状态机，归在 task/session/其他哪一层
> - **外部接口**：CLI / IPC / 外部 channel 的入口

### B1. 已落地的功能

#### B1.1 Project / Task / PARA 核心
- **Runtime 需求**：无（纯数据层）
- **Chat 需求**：无（但 task 详情页嵌 chat）
- **Bus 事件**：产出 `task.created / task.status_changed / task.deleted / project.created / project.archived` 等
- **状态语义**：Task 状态机（Phase 4.0 reducer）
- **外部接口**：`orbit task *` / `orbit project *`

#### B1.2 Task Conversation（当前的 Chat tab/Activity tab）
- **Runtime 需求**：Claude CLI（硬编码）
- **Chat 需求**：**当前耦合严重**——chat 组件知道 task / knows conversation storage / 直接调 `conversation:send` IPC
- **Bus 事件**：产出 `agent.run_started/completed/failed`；订阅 `agent:event` 渲染；**缺**：chat.message.sent、chat.awaiting_user、chat.cancelled 事件
- **状态语义**：RunSegment.sessionStatus（Phase 4.0 引入）
- **外部接口**：`conversation:get/send`

#### B1.3 Inbox Hub
- **Runtime 需求**：无（但需订阅 runtime 事件产出 Inbox item）
- **Chat 需求**：在右侧 Stage 里内联 chat（Help request 渲染器）
- **Bus 事件**：订阅 `agent.awaiting_user / agent.proposal / task.dep_blocked / capture.*`；产出 `inbox.item.resolved/dismissed/archived`
- **状态语义**：Inbox item 自己的状态机（pending → resolved/dismissed → archived）
- **外部接口**：`orbit inbox *`

#### B1.4 Capture（Feed / Library / Thoughts）
- **Runtime 需求**：未来 promote to resource 可能走 LLM；当前无
- **Chat 需求**：未来阅读时可能叠加 chat（见 B2.2）
- **Bus 事件**：产出 `feed.subscription_added / library.article_saved/read/promoted / thought.created`
- **状态语义**：Library article 状态机（unread → reading → read → processed）
- **外部接口**：`orbit feed/library/thought *`

#### B1.5 Quick Capture
- **Runtime 需求**：未来可能接入转写（Whisper）
- **Chat 需求**：无（轻量浮层）
- **Bus 事件**：产出 `thought.created`（触发 Inbox）
- **状态语义**：无
- **外部接口**：全局快捷键 `⌘⇧I`

#### B1.6 Auto-runner（Dispatcher）
- **Runtime 需求**：调度 Claude runtime 启动 task
- **Chat 需求**：无（但启动的 run 会被 Task Conversation 显示）
- **Bus 事件**：订阅 `task.status_changed / dependency.resolved`；产出 `autorunner.dispatched / lease.claimed/released`
- **状态语义**：无（无状态调度器）
- **外部接口**：`orbit auto-runner status/start/stop`

#### B1.7 Worktree + Execution Context + Ghost Commit
- **Runtime 需求**：无
- **Chat 需求**：无（但合并审批在 Inbox chat/stage 里）
- **Bus 事件**：产出 `worktree.created / ghost_commit.made / pre_merge_check.* / merge.approved/rejected`
- **状态语义**：Worktree 生命周期
- **外部接口**：内部（但 Inspector / Changes tab 可见）

#### B1.8 Activity Log
- **Runtime 需求**：无
- **Chat 需求**：无
- **Bus 事件**：订阅"几乎所有"事件 → NDJSON 存储
- **状态语义**：无
- **外部接口**：`orbit activity list/query`

#### B1.9 Event Replay（Phase 3）
- **Runtime 需求**：无
- **Chat 需求**：无
- **Bus 事件**：订阅所有 TraceableEvent → 三层 NDJSON（raw/abstract/ui）
- **状态语义**：无
- **外部接口**：Developer Console / `orbit dev:events`

#### B1.10 CLI + CLI Server
- **Runtime 需求**：无
- **Chat 需求**：无
- **Bus 事件**：产出 `ipc.*` 事件（每个 CLI 调用一条）
- **状态语义**：无
- **外部接口**：Unix socket `<vault>/.orbit/cli-socket`

#### B1.11 Planner Agent（v1 遗留）
- **Runtime 需求**：专用 planner agent（独立于 task agent）
- **Chat 需求**：**Plan Chat 独立实现**（ADR-005 明确不重构）
- **Bus 事件**：产出 `planner.proposal_published/revised`
- **状态语义**：Planner proposal 状态机
- **外部接口**：Planner tab UI

#### B1.12 Terminal Agent
- **Runtime 需求**：PTY 下直接跑 Claude / Codex / Gemini CLI
- **Chat 需求**：**不是 chat**（是终端），但 terminal_sessions 记录 transcript
- **Bus 事件**：产出 `terminal.session.*`
- **状态语义**：Terminal session 状态机
- **外部接口**：Terminal UI（用户在终端里敲命令）

#### B1.13 GitHub Integration
- **Runtime 需求**：无（用 gh CLI）
- **Chat 需求**：无
- **Bus 事件**：产出 `github.pr.created/merged/commented`
- **状态语义**：PR 状态
- **外部接口**：Project GitHub View

#### B1.14 Role Templates + Bindings
- **Runtime 需求**：每个 role 绑定到某个 runtime + prompt 模板
- **Chat 需求**：无
- **Bus 事件**：产出 `role.binding.*`
- **状态语义**：无
- **外部接口**：Roles tab

#### B1.15 Daily Review / Journal / Distill
- **Runtime 需求**：每日调度一次 LLM 生成 journal
- **Chat 需求**：无（单次生成，不是对话）
- **Bus 事件**：产出 `review.generated / distill.completed`
- **状态语义**：无
- **外部接口**：`orbit review daily`

#### B1.16 Runtime Adapter（Phase 3）
- **Runtime 需求**：Claude / Codex / Copilot adapter，声明能力，翻译 vendor 事件 → UnifiedAgentEvent
- **Chat 需求**：向 chat 提供标准化事件（当前已部分做到）
- **Bus 事件**：产出 UnifiedAgentEvent 流
- **状态语义**：无
- **外部接口**：内部

#### B1.17 Runtime Fallback + Budget（Phase 3）
- **Runtime 需求**：所有 adapter 声明错误分类
- **Chat 需求**：chat 里要能看到"切了 runtime"的提示
- **Bus 事件**：产出 `runtime.switched / budget.exceeded / budget.warning`
- **状态语义**：无（无状态规则）
- **外部接口**：Settings / Inbox 警示

#### B1.18 Switch Runtime（Phase 4.0 扩展）
- **Runtime 需求**：能在运行中切换 runtime，transcript 能续过去
- **Chat 需求**：chat 要能在"切 runtime"时保持历史连续性
- **Bus 事件**：产出 `runtime.switched`
- **状态语义**：会话级（不改 task 状态）
- **外部接口**：`orbit task switch-runtime`

#### B1.19 Task Lifecycle Reducer（Phase 4.0）
- **Runtime 需求**：无
- **Chat 需求**：chat 里发消息 → 某种事件进总线 → reducer 判断要不要改 task status
- **Bus 事件**：订阅 `user.message.in_chat / agent.awaiting_user / agent.completed / dependency.*`；产出 `task.status_changed / session.status_changed`
- **状态语义**：就是它本身
- **外部接口**：`orbit dev:lifecycle`

---

### B2. 明确要做但尚未动工的功能

#### B2.1 Sandbox ExecutionContext（open-question #1）
- **Runtime 需求**：非代码项目的执行容器，可能不是 git worktree 而是快照 + 副本
- **Chat 需求**：和代码项目的 chat 外观一致
- **Bus 事件**：产出 `sandbox.snapshot.* / sandbox.change.proposed`；审查流复用 Inbox
- **状态语义**：新一套 Sandbox 内部状态机，但**对外 task 状态机保持一致**
- **外部接口**：`orbit sandbox *`（新）
- **压力测试**：**ExecutionContext 抽象的真实考验**。如果 Sandbox 接不上 ADR-003 的抽象，说明抽象要改

#### B2.2 阅读器 + 订阅源扩展（open-question #4/#5）
- **Runtime 需求**：阅读中叠加"和文章对话"的能力（未来）；订阅源抓取本身可能需要调 LLM 做摘要
- **Chat 需求**：**阅读器 + 文章讨论 chat** 作为 Stage View 的一个新实例
- **Bus 事件**：产出 `library.read_progress / library.annotation.created`；订阅 `feed.new_items / chat.message.sent`（如果文章上叠 chat）
- **状态语义**：阅读进度 / 标注生命周期
- **外部接口**：`orbit library *` / 浏览器插件 / 手机 share endpoint

#### B2.3 Note 功能全套（目前只有底层 markdown 编辑）
- **Runtime 需求**：笔记上叠 agent（问 / 续写 / 提炼）
- **Chat 需求**：Note + Chat 的 Stage View 实例
- **Bus 事件**：产出 `note.* / annotation.*`；订阅 chat 事件（如果有）
- **状态语义**：待定
- **外部接口**：`orbit note *`（新）
- **压力测试**：**笔记和 chat 谁主谁次？** 是"笔记上叠 chat（chat 辅助）"还是"chat 产出笔记（chat 主，笔记是产物）"？

#### B2.4 全局 Ask-Anywhere / AI 助手
- **Runtime 需求**：全局启动一个 agent，访问整个 vault
- **Chat 需求**：**典型的 Chat 作为一等公民**的场景——没有 task 上下文
- **Bus 事件**：产出 `ask.query.* / ask.answer.*`；订阅几乎所有只读事件（作为 context）
- **状态语义**：每次会话独立，或持久的单一"助手对话"
- **外部接口**：全局快捷键 / 桌面 widget / 未来 iOS Node

#### B2.5 定时任务 Agent / Cron
- **Runtime 需求**：调度器触发 → agent 跑 → 结果入 Inbox
- **Chat 需求**：定时跑的 agent 产生的对话历史要落在某个地方（Thinking Trail？新 entity？）
- **Bus 事件**：产出 `cron.tick / scheduled_task.started/completed`；订阅 cron 配置变更
- **状态语义**：Scheduled task 生命周期（enabled / running / history）
- **外部接口**：`orbit scheduled-task *`（新）/ Settings 界面

#### B2.6 外部 Channel 控制（Telegram / WhatsApp / Email webhook / ...）
- **Runtime 需求**：**Runtime 也可以是"入站 channel 后面的 agent"**（openclaw 模型）
- **Chat 需求**：**入站消息 → 进入应用内某个 chat 会话**；**应用内 agent 产出 → 出站到 channel**
- **Bus 事件**：产出 `channel.inbound.message / channel.outbound.message / channel.paired / channel.dm_policy.*`
- **状态语义**：Channel pairing + allowlist 状态
- **外部接口**：Gateway 式的 WebSocket / HTTP endpoint
- **压力测试**：**最关键的压力点**。现在 Orbit 是 Electron 桌面应用，没有 Gateway。要不要建 Gateway？是应用内内置还是独立进程？

#### B2.7 任务执行全流程打通（create → execute → worktree → PR → merge）
- **Runtime 需求**：runtime 产出的代码走 ghost → pre-merge → PR 一条线
- **Chat 需求**：chat 里能看到每一步进展（"正在 pre-merge check…"、"已创建 PR #42…"）
- **Bus 事件**：订阅 task / runtime / worktree / github 全链路事件，pipeline 式串起来
- **状态语义**：**这其实是 task 状态机的完整呈现**
- **外部接口**：复用现有
- **压力测试**：**现状已经"基本打通"但细节碎（比如 PR 合入后 task 自动 done 的闭环还不顺滑）**。这是验收 task lifecycle 是否真正干净的试金石

#### B2.8 Thinking Trail 自动化（open-question #2）
- **Runtime 需求**：事后 LLM 分析对话识别关键跃迁点
- **Chat 需求**：任意 chat 都可以"保存为 Thinking Trail"
- **Bus 事件**：订阅 chat 历史、agent 事件；产出 `thinking_trail.created/pivot_identified`
- **状态语义**：Thinking Trail 生命周期
- **外部接口**：`orbit thinking-trail *`

#### B2.9 对话沉淀 → Project（ROADMAP Phase 4 后续）
- **Runtime 需求**：LLM 分析 Thoughts / Chat 主题聚集
- **Chat 需求**：如果是从 Ask-Anywhere 聊着聊着就"立项"——chat 必须能输出一个 "propose_new_project" 事件
- **Bus 事件**：产出 `chat.propose_project`
- **状态语义**：Propose → Approve 走 ADR-006 propose-approve
- **外部接口**：复用 propose-approve 流

#### B2.10 Review 页面 UI
- **Runtime 需求**：无
- **Chat 需求**：无
- **Bus 事件**：订阅历史 Activity → 时间轴渲染
- **状态语义**：无
- **外部接口**：Review view

---

### B3. 隐约要做但还没想透的（可能的未来）

#### B3.1 多设备 / iOS Node / macOS menubar app（类似 openclaw）
- 一台机器上的 Orbit 作为 Gateway，手机 / 平板作为 node 接入
- 压力点：应用总线必须可跨设备（WebSocket 桥接？）

#### B3.2 Voice Log / Voice Wake（open-question #4）
- 声音作为 channel，转写为文本消息进入 chat / Thought

#### B3.3 浏览器插件 / 手机 share endpoint
- 外部来源直接往应用总线投递 Capture 事件

#### B3.4 Orbit 自我进化（open-question #3）
- Agent 读 Activity + Thinking Trail + Distillation → 主动 propose

#### B3.5 跨 Vault / 多 Vault
- 一个用户多个 vault？Vault 间引用？（open-question 里隐约提及）

#### B3.6 跨项目任务依赖（open-question #10）
- 只支持同项目依赖的局限

#### B3.7 批量处理 Inbox（open-question #7）
- Gmail 式多选操作

---

## §C 压力测试问题（给后续阶段当检查项）

每个问题都是"新骨架能不能装下"的 sanity check。任何阶段 2/3/4 的设计如果不能回答 Yes，就是设计有缺陷。

### C1. 关于 Chat 的压力

1. Chat 组件能否在**没有任何业务订阅者**的情况下，挂一个 mock runtime 就能跑（只发消息、接收回复、展示工具调用）？—— 这是 Chat 业务无关的验证
2. Ask-Anywhere / 阅读器 chat / 笔记 chat 是**同一个 Chat 组件**的不同 host，还是不同组件？
3. 外部 channel（Telegram）的消息进来后**是否使用同一套 Chat 组件**？还是只是数据同构？
4. Chat 的"tool_use 卡片渲染"该谁注册？（runtime 声明 tool kind，chat 渲染框架提供插槽，宿主业务注册渲染器——这是我的直觉切法）
5. 如果 chat 不知道 task / proposal 的存在，**审批卡片**怎么渲染？（"渲染器插件"机制？chat 提供 `renderInline({kind, payload})`，业务模块提前注册 kind 对应的渲染器？）

### C2. 关于 Runtime 协议的压力

1. **内置 runtime**（未来如果 Orbit 内置一个不需要外部 CLI 的 agent）是否天然符合 UnifiedAgentEvent？
2. **外部 channel 后面的 agent**（Telegram 用户在对话）是否能被抽象成 runtime？（感觉不完全能——它们更像"另一个 chat surface"而非 runtime）
3. 未来如果要接 **OpenAI Assistants API / Anthropic Claude Agent SDK / Google ADK**（都是 API 形态，非 CLI）——现有 adapter 层能装下吗？
4. Sandbox 的 runtime 会不会和 Worktree runtime 完全一样？还是 runtime 需要声明"我支持哪种 ExecutionContext"？
5. 定时任务 runtime 和交互式任务 runtime 用**同一个 runtime adapter**，还是不同？

### C3. 关于应用总线的压力

1. Telegram 消息进来 → 总线上派发 → 某个 agent 捕获并回复 → 出站回 Telegram：**这条链路的事件如何不泄漏业务**？（用户不是关心"谁发的"，关心"什么问题"）
2. Cron 定时触发 → 总线上派发 → auto-runner 捕获 → 派发给某个 runtime：**如何避免 cron 模块知道 auto-runner 的存在**？
3. 全局 Ask-Anywhere 用户问"我最近在做什么"：总线如何提供"只读查询"能力？是纯事件流（让助手翻历史）还是可以 `bus.query(source=activity, filter=last-7d)`？
4. Replay 一整天的事件：能否精确重现那天的 UI 状态？（这是升格后的杀手级价值）
5. 日志式 vs 消息式：如果某个业务错过了事件（订阅者崩了），能不能靠重放恢复？如果可以，这就是日志式；如果订阅者失败就丢，这就是消息式

### C4. 关于架构干净度的压力

1. `grep 'task' src/components/chat/**` 能否返回 **0 行**？
2. `grep 'inbox' src/runtime/**` 能否返回 **0 行**？
3. Inbox 模块能否整体替换（比如换成 Plan B 视觉）**不需要动 chat/runtime/bus 一行代码**？
4. 新增一个 channel（比如 Slack）能否**只加一个 channel adapter + 在配置里声明订阅规则**，零侵入其他模块？
5. 关掉 Auto-runner 功能，其他功能是否**完全不受影响**（包括手动触发的 agent run）？

---

## §D 功能细节（用户已确认，2026-04-29 Round 5）

### D1. Ask-Anywhere ✅ 已确认

**定性**：随时待命的**深度助手**，用户能做的它都能做。**这不是弱 AI 助手**。

**多形态同一内核**：
- **左侧栏一级入口**：点击进入全功能页面，包含对话列表 + chat + 产物预览（Stage View 的极致体现）
- **应用内悬浮球**：点击在右下角展开极简对话框
- **未来展开成全屏**：细节后议

**能力**：完全操作 vault 内容。权限先不限制，以后再说。

**关键外延（用户主动提出）**：**应用内所有 chat 的对话都应该在一个统一页面能看到** —— Ask-Anywhere、Task Conversation、Inbox、Planner、外部 Channel 回显 **都进这个"统一对话中心"**。Ask-Anywhere 不只是一个 feature，是"对话聚合 view"的自然承载体。

### D2. 外部 Channel ✅ 已确认

- **双向通信**（入站 + 出站）
- **自建 Gateway**，独立于主进程之外（借鉴 openclaw）
- **用户主动抛出的关键问题**：channel 对接哪层 agent？Orbit 现有 agent 已经不少（Planner / Task by role / ...），如何让 channel 入站消息合理路由到应用能力？
  - 典型入站场景：做某个项目 / 捕获想法 / 保存阅读链接 / 设定时任务 等日常意图
  - → 需要**意图识别 + 路由机制**
- **动机**：从手机上远程操作 Orbit

### D3. 定时任务 Agent ✅ 已确认

- 跑完 → **进 Inbox 通知**
- 数据模型和项目任务很像，但**和项目解耦、全局**
- **左侧栏一级入口**：定时任务列表 → 某个定时任务 → 执行历史（success/fail）→ 单次执行详情
- **隐含结论**：定时任务本质上是 "Task 实体的一种订阅版本"

### D4. 任务全流程"卡点" ✅ 已确认，结论出乎意料

**用户坦白**："**现在任务没有走 worktree、PR、merge，还没跑通过，我怎么跑通一次，直接就执行了**"

- Phase 3/4.0 的代码已经铺好，但**完整 pipeline 从来没跑通过一次**
- 本次讨论的成功标准之一 = 跑通一次端到端

### D5. Sandbox ✅ 已确认

- **必须要做**，但可以延后
- 为"**没有 git 的对话**"打造的轻量模式
- 现阶段**可以裸跑任务**（不走 worktree 的兜底模式）
- **启示**：ExecutionContext 抽象要预留"裸跑 (bare)"这个第三形态：`worktree / sandbox / bare`

### D6. 笔记野心 ✅ 已确认

必须支持：**捕获 + 编辑 + AI 能力 + Obsidian 格式兼容**

**关键结构**：
- **Thought 是笔记的一种（短形式）**
- **LongForm 是笔记的另一种（长形式）**
- Note 是统一 primitive，Thought / LongForm / 未来其他都是 type 字段
- 含义：`Capture/Library/Thoughts` 的底层数据模型**统一收束到 Note**，frontmatter 区分类型

### D7. 应用内 Runtime ✅ 已确认

- 内置 agent 框架，**不依赖外部 CLI**
- 通过 LLM API key（用户填 or 应用内置）
- **动机**：对**普通用户友好**——用户不一定有外部 runtime
- **能力声明不做区分**（和外部 CLI runtime 同构）
- **目标**：比外部 CLI 体验更好
- **时机**：后面再做，不是现阶段
- **架构启示**：Runtime 抽象层必须**不能假设 runtime 总是外部进程**

### D8. openclaw 参考深度 ✅ 已确认

- **借鉴 channel/gateway 思路**即可
- **动机**：Orbit 需要"**从手机远程操作**"的入口

---

## §E 新增：从 §D 答案推导出的骨架 hard constraints

基于 D1 ~ D8 的明确答复，骨架设计**必须**满足以下硬约束。这是后续阶段 1/2/3/4 不能违背的：

### E1. Chat 组件必须承载多种 host
- 全功能页面、悬浮球、task tab、inbox stage、channel thread 全部用**同一个 Chat 组件**
- 不同 host 的差异只在 layout 和 action bar，Chat 内核不变

### E2. Conversation 必须跨 host 可见
- 统一对话中心页面里看到的所有对话**必须是同一层抽象**，不能是 "5 种对话混显"
- 说明 **Conversation 必须是一等实体**（分叉 3 方案 B 的硬证据）

### E3. Ask-Anywhere 是 agent 系统的第一"前台"
- 浮球 / 左侧栏 / 未来 Channel 入站，都是 Ask-Anywhere 的 UI surface
- Ask-Anywhere 以 **orbit CLI 为能力接口**，不需要新写业务代码
- ADR-008（AI-Native + CLI-first）被 Ask-Anywhere **第一次真正用到**

### E4. Gateway 是 UI surface 层，不是业务层
- channel 消息进来 → AppBus → Ask-Anywhere runtime 接手
- 业务模块（task/inbox/note 等）**完全不感知 channel 存在**

### E5. 定时任务是 Task 的兄弟实体，共享执行骨架
- 定时任务的执行走和普通 task 一样的 runtime / worktree / event 链路
- 只在 trigger（定时 vs 手动/auto-runner）和 ownership（全局 vs 项目）上不同

### E6. ExecutionContext 三形态
- `worktree`（代码项目）
- `sandbox`（非代码，延后）
- `bare`（无隔离，现阶段 task 跑通用这个模式）

### E7. Note 是底层 primitive
- Capture / Library / Thoughts 的底层数据是 Note（`type` 字段区分 thought / article / longform / annotation）
- Obsidian 格式兼容 = frontmatter + wikilink + tag 不动

### E8. Runtime 抽象**不假设**是外部进程
- 当前实现全是外部 CLI（Claude/Codex/Gemini/Copilot）
- 未来必须能无缝装下"内置 runtime"（HTTP/SDK 直连）
- UnifiedAgentEvent / Adapter 层已经不假设外部，但 **runner.ts / dispatch.ts 里仍有 shell/process 假设** → 阶段 5 迁移时要清理

### E9. 统一对话中心的"对话列表"需要排序 / 搜索 / 过滤
- 按 anchor 类型、最近更新、涉及的 task/project、状态分面
- 这把 Conversation 从"数据"推向"实体"（需要索引）

---

## 对后续阶段的输出

本阶段结束后，§A 的"骨架必须支持的维度清单"和 §C 的"压力测试问题"将成为后续所有阶段的**强制检查项**。

- 阶段 1（Runtime 调研）必须对齐 §A.A1
- 阶段 2（应用总线）必须回答 §C.C3 的所有问题
- 阶段 3（Chat 协议）必须通过 §C.C1 / C.C2 的检查
- 阶段 4（架构压测）按 §B 逐个功能走一遍并验 §C.C4
- 阶段 5（迁移）以 §B.B1 的现有实现为起点
