# 阶段 4：架构压测（End-to-End 场景验证）

> **目标**：用具体场景验证阶段 3 协议的完整性，识别遗漏的事件、action 或数据流
> **方法**：选取 5 个典型场景，画出完整的事件流 + 数据流 + 状态变化
> **时间**：2026-04-29

---

## 压测场景清单

| # | 场景 | 验证的决策 |
|---|------|-----------|
| 1 | Task 执行 end-to-end | D-1（规划者/执行者分离）、D-5（Conversation） |
| 2 | Ask-Anywhere 规划项目 | D-1、D-2（Planner 退役）、D-5 |
| 3 | Telegram 入站消息 | D-3（Channel 只对接 Ask-Anywhere）、D-4（Gateway Daemon） |
| 4 | Conversation 迁移 | D-5（多 anchor） |
| 5 | 定时任务执行 + Inbox | D-6（各地方自己配置 auto agent） |

---

## 场景 1：Task 执行 End-to-End

### 前置条件
- 用户已在 Project P 下创建 Task T（状态 = proposed）
- Task T 有 instructions，有 role binding（使用 Claude runtime）
- Project P 有 worktree 配置

### 事件流

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Step 1: 用户审批 Task                                                       │
├────────────────────────────────────────────────────────────────────────────┤
│ UI: User clicks "Approve" in InboxView                                     │
│ ↓                                                                          │
│ IPC: inbox.approve({ itemId: inbox-T })                                    │
│ ↓                                                                          │
│ InboxOrchestrator:                                                         │
│   - Updates Inbox item status → approved                                   │
│   - Calls TaskOrchestrator.approve(taskId: T)                              │
│ ↓                                                                          │
│ TaskOrchestrator:                                                          │
│   - Updates Task T status → approved                                       │
│   - Emits TraceableEvent: { kind: 'task.approved', payload: { taskId: T }} │
│ ↓                                                                          │
│ AutoRunner (listening to task.approved):                                   │
│   - Checks Project P's auto_run config                                     │
│   - Decides to start Task T                                                │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ Step 2: Task 开始执行                                                       │
├────────────────────────────────────────────────────────────────────────────┤
│ AutoRunner calls TaskOrchestrator.start(taskId: T)                         │
│ ↓                                                                          │
│ TaskOrchestrator:                                                          │
│   - Creates Conversation C with anchor { kind: 'task', refId: T }          │
│   - Creates worktree W for Task T                                          │
│   - Resolves runtime: Claude adapter                                       │
│   - Calls RuntimeDispatcher.dispatch({ conversationId: C, runId: R, ... }) │
│ ↓                                                                          │
│ RuntimeDispatcher:                                                         │
│   - Spawns Claude process with prompt                                      │
│   - Emits TraceableEvent: { kind: 'agent.run.started', ... }               │
│ ↓                                                                          │
│ ClaudeAdapter (streaming):                                                 │
│   - Normalizes vendor events → RuntimeEvent                                │
│   - Emits RuntimeEvent: { kind: 'runtime.message', conversationId: C, ... }│
│   - Emits RuntimeEvent: { kind: 'runtime.tool_use', ... }                  │
│   - Emits RuntimeEvent: { kind: 'runtime.tool_result', ... }               │
│   - ...                                                                    │
│ ↓                                                                          │
│ IPC pushes RuntimeEvent to renderer                                        │
│ ↓                                                                          │
│ TaskChatHost receives events, passes to ChatView                           │
│ ↓                                                                          │
│ ChatView renders (streaming)                                               │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ Step 3: Task 完成                                                          │
├────────────────────────────────────────────────────────────────────────────┤
│ Claude process exits with code 0                                           │
│ ↓                                                                          │
│ ClaudeAdapter emits RuntimeEvent: { kind: 'runtime.done', ... }            │
│ ↓                                                                          │
│ RuntimeDispatcher:                                                         │
│   - Emits TraceableEvent: { kind: 'agent.run.completed', ... }             │
│   - Notifies TaskOrchestrator                                              │
│ ↓                                                                          │
│ TaskOrchestrator:                                                          │
│   - Updates Task T status → completed                                      │
│   - Appends assistant turn to Conversation C                               │
│   - Persists Conversation C                                                │
│   - (Optional) Creates PR from worktree W                                  │
│ ↓                                                                          │
│ ChatView shows "完成" badge                                                 │
└────────────────────────────────────────────────────────────────────────────┘
```

### 验证点

| 检查项 | 预期 | 是否覆盖 |
|--------|------|---------|
| Conversation 创建 | Task 开始时自动创建 | ✅ |
| RuntimeEvent 流向 Chat | 通过 IPC push | ✅ |
| Chat 不知道 Task 是什么 | ChatView 只收 RuntimeEvent | ✅ |
| Task 状态和 Conversation 状态分离 | Task = completed，Conversation = ended | ✅ |
| Worktree 创建/清理 | TaskOrchestrator 管理 | ✅ |

### 识别的遗漏

**无**——协议完整覆盖此场景。

---

## 场景 2：Ask-Anywhere 规划项目

### 前置条件
- 用户在 Ask-Anywhere 浮球里说："帮我规划 Project X 的下一步"
- Project X 已存在

### 事件流

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Step 1: 用户发送消息                                                        │
├────────────────────────────────────────────────────────────────────────────┤
│ UI: User types in Ask-Anywhere floating panel                              │
│ ↓                                                                          │
│ ChatView dispatches ChatAction:                                            │
│   { kind: 'chat.send_message', conversationId: C-ask, payload: { text } }  │
│ ↓                                                                          │
│ AskAnywhereChatHost receives action                                        │
│ ↓                                                                          │
│ AskAnywhereOrchestrator.send(conversationId: C-ask, text):                 │
│   - Appends user turn to Conversation C-ask                                │
│   - Starts runtime run R                                                   │
│   - Prompt includes vault context + orbit CLI tools                        │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ Step 2: Ask-Anywhere Agent 思考并调用工具                                   │
├────────────────────────────────────────────────────────────────────────────┤
│ ClaudeAdapter (streaming):                                                 │
│   - RuntimeEvent: { kind: 'runtime.thinking', text: "分析 Project X..." }  │
│   - RuntimeEvent: { kind: 'runtime.tool_use', toolName: 'orbit', ... }     │
│     (调用 orbit project list / orbit task list --project X)                │
│   - RuntimeEvent: { kind: 'runtime.tool_result', ... }                     │
│   - RuntimeEvent: { kind: 'runtime.message', text: "我建议..." }           │
│   - RuntimeEvent: { kind: 'runtime.tool_use', toolName: 'orbit', ... }     │
│     (调用 orbit task propose --project X --title "...")                    │
│   - RuntimeEvent: { kind: 'runtime.tool_result', result: "Created T1" }    │
│   - ...                                                                    │
│ ↓                                                                          │
│ ChatView renders streaming output                                          │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ Step 3: Proposal 创建，进 Inbox                                             │
├────────────────────────────────────────────────────────────────────────────┤
│ orbit CLI (tool execution):                                                │
│   - Creates Task T1, T2, T3 as proposals                                   │
│   - Emits TraceableEvent: { kind: 'task.proposed', ... } × 3               │
│ ↓                                                                          │
│ InboxOrchestrator (listening to task.proposed):                            │
│   - Creates Inbox items for T1, T2, T3                                     │
│   - Emits TraceableEvent: { kind: 'inbox.item.created', ... } × 3          │
│ ↓                                                                          │
│ UI: Inbox badge updates (unread +3)                                        │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ Step 4: Ask-Anywhere 完成                                                   │
├────────────────────────────────────────────────────────────────────────────┤
│ ClaudeAdapter emits RuntimeEvent: { kind: 'runtime.done' }                 │
│ ↓                                                                          │
│ AskAnywhereOrchestrator:                                                   │
│   - Appends assistant turn to Conversation C-ask                           │
│   - Persists Conversation C-ask                                            │
│ ↓                                                                          │
│ ChatView shows "完成" badge                                                 │
│ User can continue chatting in C-ask                                        │
└────────────────────────────────────────────────────────────────────────────┘
```

### 验证点

| 检查项 | 预期 | 是否覆盖 |
|--------|------|---------|
| Ask-Anywhere 通过 orbit CLI 操作 | tool_use 调 orbit 命令 | ✅ |
| 规划结果落 Task proposal | orbit task propose 创建 | ✅ |
| Proposal 进 Inbox | InboxOrchestrator 监听 task.proposed | ✅ |
| Planner 独立实体不存在 | 全程只有 Ask-Anywhere | ✅（D-2 验证） |
| Chat 不知道 Project 是什么 | ChatView 只收 RuntimeEvent | ✅ |

### 识别的遗漏

**⚠️ 潜在遗漏**：Ask-Anywhere 如何知道当前 vault 上下文？

**解决**：Ask-Anywhere 的 system prompt 需要包含：
- 当前 vault 路径
- orbit CLI 工具列表
- 可能需要的 context retrieval（vault summary / recent activity）

→ 这不是协议问题，是 **Ask-Anywhere 实现细节**，不影响 chat ↔ runtime 协议。

---

## 场景 3：Telegram 入站消息

### 前置条件
- Gateway Daemon 已运行
- Telegram channel 已配置并连接
- Orbit 主进程运行中

### 事件流

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Step 1: Gateway 收到 Telegram 消息                                          │
├────────────────────────────────────────────────────────────────────────────┤
│ Telegram API → Gateway Daemon                                              │
│ ↓                                                                          │
│ Gateway:                                                                   │
│   - Parses message: { chat_id, user_id, text }                             │
│   - Publishes TraceableEvent via WebSocket to Orbit main:                  │
│     { kind: 'channel.inbound.message',                                     │
│       payload: { channel: 'telegram', threadId: chat_id, text, raw } }     │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ Step 2: Orbit 处理入站消息                                                  │
├────────────────────────────────────────────────────────────────────────────┤
│ ChannelEventHandler (main process, subscribes to 'channel.inbound.*'):     │
│   - Receives channel.inbound.message event                                 │
│   - Calls AskAnywhereOrchestrator.handleChannelMessage(event)              │
│ ↓                                                                          │
│ AskAnywhereOrchestrator:                                                   │
│   - Finds or creates Conversation C-tg with anchor:                        │
│     { kind: 'channel_thread', refId: 'telegram/<chat_id>' }                │
│   - Appends user turn (from Telegram user)                                 │
│   - Starts runtime run R                                                   │
│   - (Same as Scene 2 Step 2-4)                                             │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ Step 3: 响应返回 Telegram                                                   │
├────────────────────────────────────────────────────────────────────────────┤
│ AskAnywhereOrchestrator on runtime.done:                                   │
│   - Extracts assistant response text                                       │
│   - Publishes TraceableEvent:                                              │
│     { kind: 'channel.outbound.message',                                    │
│       payload: { channel: 'telegram', threadId: chat_id, text: response }} │
│ ↓                                                                          │
│ Gateway (subscribes to 'channel.outbound.*' via WebSocket):                │
│   - Receives channel.outbound.message                                      │
│   - Sends message to Telegram API                                          │
└────────────────────────────────────────────────────────────────────────────┘
```

### 验证点

| 检查项 | 预期 | 是否覆盖 |
|--------|------|---------|
| Gateway 独立于主进程 | 通过 WebSocket 通信 | ✅（D-4 验证） |
| Channel 只对接 Ask-Anywhere | ChannelEventHandler 调 AskAnywhereOrchestrator | ✅（D-3 验证） |
| Conversation 有 channel_thread anchor | 自动创建 | ✅（D-5 验证） |
| 业务模块不感知 Channel | TaskOrchestrator 完全不参与 | ✅ |

### 识别的遗漏

**⚠️ 遗漏 1**：Orbit 没开时 Gateway 怎么办？

**解决选项**：
- A. 消息排队，等 Orbit 开了再处理
- B. Gateway 内嵌精简版 Ask-Anywhere（降级回复）
- C. Gateway 直接告知用户"Orbit 未运行"

→ 建议 **A**（最简单），可作为 v1 实现。Gateway 维护一个 pending 队列，Orbit 连接后 replay。

**⚠️ 遗漏 2**：Gateway ↔ Orbit 的 WebSocket 断连重连逻辑

→ 标准工程问题，不影响协议设计，但需要在实现时考虑。

---

## 场景 4：Conversation 迁移（Ask-Anywhere → Task）

### 前置条件
- 用户在 Ask-Anywhere 聊天中讨论某个功能
- 聊着聊着用户说："这个可以开个 task 来做"

### 事件流

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Step 1: 用户在 Ask-Anywhere 里说"开个 task"                                 │
├────────────────────────────────────────────────────────────────────────────┤
│ ChatView dispatches ChatAction:                                            │
│   { kind: 'chat.send_message', conversationId: C-ask,                      │
│     payload: { text: "这个功能可以开个 task 来做" } }                        │
│ ↓                                                                          │
│ AskAnywhereOrchestrator handles message                                    │
│ ↓                                                                          │
│ Ask-Anywhere Agent (Claude) understands intent:                            │
│   - tool_use: orbit task propose --title "实现 XXX 功能"                    │
│   - Returns: "已创建 task proposal T，你可以在 Inbox 审批"                   │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ Step 2: Task 创建，Conversation 添加 anchor                                 │
├────────────────────────────────────────────────────────────────────────────┤
│ orbit CLI creates Task T                                                   │
│ ↓                                                                          │
│ TaskOrchestrator receives task.proposed event:                             │
│   - (Optional) Link Conversation C-ask to Task T:                          │
│     Adds anchor { kind: 'task', refId: T } to Conversation C-ask           │
│   - Emits TraceableEvent: { kind: 'conversation.anchor.added', ... }       │
│ ↓                                                                          │
│ Conversation C-ask now has TWO anchors:                                    │
│   1. { kind: 'ask_anywhere_session', refId: 'session-xxx' }                │
│   2. { kind: 'task', refId: T }                                            │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ Step 3: 用户审批 Task，执行时复用 Conversation 上下文                        │
├────────────────────────────────────────────────────────────────────────────┤
│ User approves Task T in Inbox                                              │
│ ↓                                                                          │
│ TaskOrchestrator.start(taskId: T):                                         │
│   - Finds Conversation C-ask via anchor                                    │
│   - Reuses C-ask instead of creating new Conversation                      │
│   - Starts runtime run R with C-ask context (previous turns as history)    │
│ ↓                                                                          │
│ Task execution benefits from Ask-Anywhere conversation context!            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 验证点

| 检查项 | 预期 | 是否覆盖 |
|--------|------|---------|
| Conversation 支持多 anchor | 通过 anchor 数组 | ✅（D-5 验证） |
| Task 可复用 Ask-Anywhere 上下文 | 通过 anchor 关联查找 | ✅ |
| conversation.anchor.added 事件 | 已在协议定义 | ✅ |

### 识别的遗漏

**⚠️ 遗漏**：如何决定是否复用 Conversation？

**问题**：
- Ask-Anywhere 创建 Task T 时，TaskOrchestrator 怎么知道要把 C-ask 链接过去？
- 不是所有 task.proposed 都应该复用当前对话

**解决**：
- `orbit task propose` 增加可选参数 `--link-conversation <conversationId>`
- Ask-Anywhere Agent 在调用时传入当前 conversationId

→ 需要**更新 orbit CLI 协议**，但不影响 chat ↔ runtime 协议。

---

## 场景 5：定时任务执行 + Inbox 通知

### 前置条件
- 用户通过 Ask-Anywhere 创建了一个定时任务 S："每天早上 9 点检查 GitHub notifications"
- 定时任务 S 配置了 runtime = Claude

### 事件流

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Step 1: Cron 触发                                                          │
├────────────────────────────────────────────────────────────────────────────┤
│ ScheduledTaskRunner (main process cron):                                   │
│   - Triggers at 09:00                                                      │
│   - Calls ScheduledTaskOrchestrator.execute(scheduledTaskId: S)            │
│ ↓                                                                          │
│ ScheduledTaskOrchestrator:                                                 │
│   - Creates Conversation C-cron with anchor:                               │
│     { kind: 'scheduled_execution', refId: 'S/exec-20260429-0900' }         │
│   - Resolves runtime (Claude)                                              │
│   - Starts runtime run R                                                   │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ Step 2: Agent 执行                                                         │
├────────────────────────────────────────────────────────────────────────────┤
│ ClaudeAdapter (streaming):                                                 │
│   - RuntimeEvent: { kind: 'runtime.tool_use', toolName: 'github', ... }    │
│   - RuntimeEvent: { kind: 'runtime.tool_result', result: "5 notifications" }│
│   - RuntimeEvent: { kind: 'runtime.message', text: "你有 5 条通知..." }     │
│   - RuntimeEvent: { kind: 'runtime.done' }                                 │
│ ↓                                                                          │
│ (Note: No ChatView rendering — this is background execution)               │
│ Events are persisted to Conversation C-cron                                │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ Step 3: 结果进 Inbox                                                        │
├────────────────────────────────────────────────────────────────────────────┤
│ ScheduledTaskOrchestrator on runtime.done:                                 │
│   - Extracts execution result                                              │
│   - Creates Inbox item:                                                    │
│     { type: 'scheduled_task_result',                                       │
│       title: "定时任务完成: 检查 GitHub notifications",                     │
│       linkedConversationId: C-cron }                                       │
│   - Emits TraceableEvent: { kind: 'inbox.item.created', ... }              │
│ ↓                                                                          │
│ InboxView updates (unread +1)                                              │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ Step 4: 用户点击 Inbox 查看详情                                             │
├────────────────────────────────────────────────────────────────────────────┤
│ User clicks Inbox item                                                     │
│ ↓                                                                          │
│ UI navigates to ScheduledTaskDetailView                                    │
│ ↓                                                                          │
│ ScheduledTaskDetailView:                                                   │
│   - Loads Conversation C-cron                                              │
│   - Renders ChatView with C-cron events (read-only replay)                 │
│   - Shows execution metadata (time, duration, status)                      │
└────────────────────────────────────────────────────────────────────────────┘
```

### 验证点

| 检查项 | 预期 | 是否覆盖 |
|--------|------|---------|
| 定时任务有自己的 Conversation | anchor = scheduled_execution | ✅ |
| 后台执行不需要 ChatView | 事件仍然流转，只是没有实时渲染 | ✅ |
| 结果进 Inbox | ScheduledTaskOrchestrator 创建 Inbox item | ✅（D-6 验证） |
| 用户可查看执行历史 | 通过 Conversation replay | ✅ |

### 识别的遗漏

**⚠️ 遗漏**：`ConversationAnchorKind` 缺少 `scheduled_execution`

**解决**：在阶段 3 的 Conversation 数据模型中补充：

```typescript
export type ConversationAnchorKind = 
  | 'task'
  | 'inbox_item'
  | 'ask_anywhere_session'
  | 'channel_thread'
  | 'capture_item'
  | 'planner_session'
  | 'scheduled_execution';  // ← 新增
```

---

## 压测总结

### 识别的协议更新

| 项 | 内容 | 影响 |
|----|------|------|
| **新增 anchor kind** | `scheduled_execution` | 阶段 3 文档更新 |
| **CLI 扩展** | `orbit task propose --link-conversation <id>` | orbit CLI，不影响 chat 协议 |

### 架构验证结论

| 决策 | 验证场景 | 结论 |
|------|---------|------|
| D-1 规划者/执行者 | 场景 1, 2 | ✅ Ask-Anywhere 规划，Role Agents 执行 |
| D-2 Planner 退役 | 场景 2 | ✅ 全程只有 Ask-Anywhere |
| D-3 Channel 只对接 Ask-Anywhere | 场景 3 | ✅ Gateway → AskAnywhereOrchestrator |
| D-4 Gateway Daemon | 场景 3 | ✅ WebSocket 通信，独立进程 |
| D-5 Conversation 一等公民 | 场景 1, 2, 3, 4, 5 | ✅ 统一数据模型，多 anchor |
| D-6 各地方自己配置 auto agent | 场景 5 | ✅ ScheduledTaskOrchestrator 独立管理 |

### 遗留问题汇总

| 问题 | 归属 | 优先级 |
|------|------|--------|
| Orbit 没开时 Gateway 怎么办 | Gateway 实现 | P1 |
| Gateway ↔ Orbit 断连重连 | Gateway 实现 | P1 |
| orbit CLI `--link-conversation` 扩展 | CLI 实现 | P2 |

---

## 下一步

- [x] 本文档完成 ✅
- [ ] 阶段 5：迁移路径（从现有代码到新协议）
- [ ] 阶段 6：ADR 定稿
