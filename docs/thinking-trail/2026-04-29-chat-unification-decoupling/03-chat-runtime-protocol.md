# 阶段 3：Chat ↔ Runtime 协议定稿

> **目标**：定义一份业务无关的 chat ↔ runtime 协议，使得 Chat 组件完全不感知 task/inbox/proposal/channel
> **产出**：协议规范文档，可直接指导实现
> **时间**：2026-04-29
> **依赖**：阶段 1（三层协议结构） + 阶段 2（事件 schema）

---

## 0. 设计原则

基于决策锚点 D-1 ~ D-7，协议设计遵循以下原则：

1. **Chat 组件是纯渲染器**：只接收 `RuntimeEvent`，只抛出 `ChatAction`；不关心 host 是谁
2. **Runtime 层是业务无关的执行器**：不知道 task/inbox/proposal 是什么
3. **业务语义在 Orchestration 层**：Orchestration 把业务实体映射到 runtime run
4. **协议从 runtime 反推**：Claude/Codex 协议的交集是 core，差集是 capability-gated

---

## 1. 协议分层架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Renderer (React)                            │
│  ┌─────────────┐   ChatAction    ┌──────────────────────────────┐  │
│  │  ChatView   │ ──────────────> │  host-specific handler       │  │
│  │ (纯渲染器)   │ <────────────── │  (e.g. TaskChatHost)         │  │
│  └─────────────┘   RuntimeEvent  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │ IPC
┌─────────────────────────────────────────────────────────────────────┐
│                          Main Process                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     Orchestration Layer                       │  │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────────────┐     │  │
│  │  │ TaskOrc   │  │ InboxOrc  │  │ AskAnywhereOrchestrator│     │  │
│  │  └───────────┘  └───────────┘  └───────────────────────┘     │  │
│  │         ↓ ConversationId + RuntimeRequest                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      Runtime Layer                            │  │
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐         │  │
│  │  │ Claude Adpt │   │ Codex Adpt  │   │ BuiltinAdpt │         │  │
│  │  └─────────────┘   └─────────────┘   └─────────────┘         │  │
│  │         ↓ RuntimeEvent (normalized)                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      AppBus (Event Store)                     │  │
│  │  ← publishTraceableEvent() ← RuntimeEvent                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. RuntimeEvent（Chat → Main 订阅的事件流）

### 2.1 Core Events（所有 runtime 必须支持）

| kind | payload | 描述 |
|------|---------|------|
| `runtime.message` | `{ text, role?, isStreaming?, isFinal? }` | 消息文本；runtime 直接产出的默认是 assistant，host 回放用户 turn 时可标记 `role='user'` |
| `runtime.thinking` | `{ text }` | 推理过程 |
| `runtime.tool_use` | `{ toolName, toolInput?, spanId }` | 工具调用开始 |
| `runtime.tool_result` | `{ toolName, result, parentSpanId }` | 工具返回 |
| `runtime.cost` | `{ inputTokens, outputTokens, cacheReadTokens?, totalUsd? }` | 费用汇报 |
| `runtime.done` | `{ exitCode?, reason? }` | 运行完成 |
| `runtime.error` | `{ code, message }` | 错误 |

### 2.2 Capability-Gated Events（能力声明启用）

| kind | payload | capability flag | 描述 |
|------|---------|-----------------|------|
| `runtime.heartbeat` | `{}` | `supportsHeartbeat` | 心跳 |
| `runtime.file_change` | `{ path, operation, diff? }` | `supportsFileChangeEvents` | 文件变更 |
| `runtime.plan_update` | `{ plan }` | `supportsPlanUpdates` | 计划更新 |
| `runtime.partial_structured_output` | `{ partial }` | `supportsStructuredOutput` | 结构化输出预览 |

### 2.3 Orbit Extensions（Orbit 自定义）

| kind | payload | 描述 |
|------|---------|------|
| `runtime.awaiting_user` | `{ hint? }` | 等待用户输入 |
| `runtime.interrupt` | `{ reason }` | 被打断 |
| `runtime.compact` | `{ removedTurns, newContextTokens }` | 上下文压缩 |
| `runtime.session_resume` | `{ vendorSessionId }` | 恢复会话 |
| `runtime.budget_warn` | `{ code, remaining }` | 费用警告 |
| `runtime.budget_halt` | `{ code, limit }` | 费用停止 |

### 2.4 TypeScript 定义

```typescript
// src/shared/chat-protocol/events.ts

export const RUNTIME_EVENT_KINDS = [
  // Core
  'runtime.message',
  'runtime.thinking',
  'runtime.tool_use',
  'runtime.tool_result',
  'runtime.cost',
  'runtime.done',
  'runtime.error',
  // Capability-gated
  'runtime.heartbeat',
  'runtime.file_change',
  'runtime.plan_update',
  'runtime.partial_structured_output',
  // Orbit Extensions
  'runtime.awaiting_user',
  'runtime.interrupt',
  'runtime.compact',
  'runtime.session_resume',
  'runtime.budget_warn',
  'runtime.budget_halt',
] as const;

export type RuntimeEventKind = (typeof RUNTIME_EVENT_KINDS)[number];

export interface RuntimeEventPayloadMap {
  'runtime.message': {
    text: string;
    role?: 'assistant' | 'user';
    isStreaming?: boolean;
    isFinal?: boolean;
  };
  'runtime.thinking': {
    text: string;
  };
  'runtime.tool_use': {
    toolName: string;
    toolInput?: unknown;
    spanId: string;
  };
  'runtime.tool_result': {
    toolName: string;
    result: string;
    parentSpanId: string;
    isError?: boolean;
  };
  'runtime.cost': {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    totalUsd?: number;
  };
  'runtime.done': {
    exitCode?: number | null;
    reason?: string;
  };
  'runtime.error': {
    code: string;
    message: string;
  };
  // ... 其他 payload
}

export interface RuntimeEvent<K extends RuntimeEventKind = RuntimeEventKind> {
  id: string;
  at: string;
  kind: K;
  conversationId: string;
  runId: string;
  spanId: string;
  parentSpanId?: string;
  payload: RuntimeEventPayloadMap[K];
  // 可选的 vendor 原始事件（调试用）
  vendorEvent?: unknown;
}
```

---

## 3. ChatAction（Chat → Host 抛出的用户动作）

### 3.1 Action 清单

| action | payload | 描述 |
|--------|---------|------|
| `chat.send_message` | `{ text }` | 用户发送消息 |
| `chat.stop` | `{}` | 用户点击停止 |
| `chat.retry` | `{ turnId? }` | 用户重试 |
| `chat.copy` | `{ turnId, text }` | 复制内容 |
| `chat.expand_thinking` | `{ spanId }` | 展开思考过程 |
| `chat.collapse_thinking` | `{ spanId }` | 折叠思考过程 |
| `chat.approve_tool` | `{ spanId }` | 批准工具执行 |
| `chat.reject_tool` | `{ spanId, reason? }` | 拒绝工具执行 |
| `chat.compact` | `{}` | 请求压缩上下文 |

### 3.2 TypeScript 定义

```typescript
// src/shared/chat-protocol/actions.ts

export const CHAT_ACTION_KINDS = [
  'chat.send_message',
  'chat.stop',
  'chat.retry',
  'chat.copy',
  'chat.expand_thinking',
  'chat.collapse_thinking',
  'chat.approve_tool',
  'chat.reject_tool',
  'chat.compact',
] as const;

export type ChatActionKind = (typeof CHAT_ACTION_KINDS)[number];

export interface ChatActionPayloadMap {
  'chat.send_message': { text: string };
  'chat.stop': {};
  'chat.retry': { turnId?: string };
  'chat.copy': { turnId: string; text: string };
  'chat.expand_thinking': { spanId: string };
  'chat.collapse_thinking': { spanId: string };
  'chat.approve_tool': { spanId: string };
  'chat.reject_tool': { spanId: string; reason?: string };
  'chat.compact': {};
}

export interface ChatAction<K extends ChatActionKind = ChatActionKind> {
  kind: K;
  conversationId: string;
  payload: ChatActionPayloadMap[K];
}
```

---

## 4. ChatHost 接口（Host 必须实现）

每个 host（TaskChatHost / InboxChatHost / AskAnywhereChatHost / ...）必须实现以下接口：

```typescript
// src/shared/chat-protocol/host.ts

export interface ChatHostCapabilities {
  canSendMessage: boolean;
  canStop: boolean;
  canRetry: boolean;
  canCompact: boolean;
  canApproveTool: boolean;
  supportsStreaming: boolean;
  supportsThinking: boolean;
  supportsFileChanges: boolean;
}

export interface ChatHost {
  readonly conversationId: string;
  readonly capabilities: ChatHostCapabilities;
  
  // Host 必须实现的方法
  handleAction(action: ChatAction): void;
  
  // Host 可选覆盖的渲染 hints
  getPlaceholderText?(): string;
  getWelcomeMessage?(): string;
  getActionBarItems?(): ActionBarItem[];
}
```

---

## 5. Chat 组件接口（纯渲染器）

```typescript
// src/renderer/components/Chat/types.ts

export interface ChatProps {
  conversationId: string;
  capabilities: ChatHostCapabilities;
  
  // 事件流输入
  events: RuntimeEvent[];
  isLoading: boolean;
  
  // 动作输出
  onAction: (action: ChatAction) => void;
  
  // 可选的 UI 定制
  placeholder?: string;
  welcomeMessage?: string;
  actionBarItems?: ActionBarItem[];
  
  // 主题
  theme?: 'light' | 'dark' | 'system';
}
```

### 5.1 Chat 组件的职责边界

**Chat 组件做的事**：
- 渲染 `RuntimeEvent` 序列为 UI（消息气泡、工具卡片、思考折叠块）
- 收集用户输入，包装成 `ChatAction` 抛出
- 根据 `capabilities` 启用/禁用 UI 元素
- 处理流式渲染（`isStreaming` 标记）

**Chat 组件不做的事**：
- ❌ 不知道 task 是什么
- ❌ 不知道 inbox 是什么
- ❌ 不调用任何 IPC
- ❌ 不直接访问 runtime
- ❌ 不做业务逻辑判断

### 5.2 验证标准

在 Chat 组件代码中执行以下 grep，结果应该为 0：

```bash
grep -E 'task|inbox|proposal|planner|vault|project' src/renderer/components/Chat/*.tsx
# 预期结果：无匹配
```

---

## 6. Conversation 数据模型

对应决策 D-5（Conversation 一等公民）：

```typescript
// src/shared/conversation/types.ts

export type ConversationAnchorKind = 
  | 'task'
  | 'inbox_item'
  | 'ask_anywhere_session'
  | 'channel_thread'
  | 'capture_item'
  | 'planner_session';  // 保留，但 planner 退役后可能只是 ask_anywhere_session 的别名

export interface ConversationAnchor {
  kind: ConversationAnchorKind;
  refId: string;
  addedAt: string;
}

export interface ConversationTurn {
  id: string;
  at: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  // 可选：关联的 runtime events
  runtimeEventIds?: string[];
}

export interface Conversation {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'paused' | 'ended';
  
  // 多 anchor 支持
  anchors: ConversationAnchor[];
  
  // 对话内容
  turns: ConversationTurn[];
  
  // 运行时上下文
  currentRunId?: string;
  runtimeHint?: string;  // 'claude' | 'codex' | 'builtin'
  vendorSessionId?: string;
  
  // 元数据
  title?: string;
  summary?: string;
  tags?: string[];
}
```

### 6.1 存储路径

```
<vault>/.orbit/conversations/
  <conversation-id>.ndjson       # turns + events 追加日志
  <conversation-id>.meta.json    # anchors + metadata
```

### 6.2 与 TraceableEvent 的关系

每个 `RuntimeEvent` 同时作为 `TraceableEvent` 发布到 AppBus，kind 映射：

| RuntimeEvent.kind | TraceableEvent.kind |
|-------------------|---------------------|
| `runtime.message` | `agent.run.event` (payload 包含原始 RuntimeEvent) |
| `runtime.thinking` | `agent.run.event` |
| `runtime.tool_use` | `agent.run.event` |
| ... | ... |

Conversation 存储的是**结构化的 turns**，TraceableEvent 存储的是**原子事件流**。两者互补：
- Conversation：面向 UI 渲染、历史查看
- TraceableEvent：面向调试、Thinking Trail、replay

---

## 7. 协议流程示例

### 7.1 用户发送消息 → agent 响应

```
1. User types in ChatView, clicks send
2. ChatView dispatches: { kind: 'chat.send_message', conversationId, payload: { text } }
3. Host (e.g. AskAnywhereChatHost) receives action
4. Host calls orchestration: askAnywhereOrchestrator.send(conversationId, text)
5. Orchestration:
   a. Appends user turn to Conversation
   b. Creates or reuses runtime run
   c. Sends prompt to runtime adapter
6. Runtime adapter:
   a. Spawns process / calls API
   b. Normalizes vendor events → RuntimeEvent
   c. Publishes to IPC channel
7. Host receives RuntimeEvent via IPC subscription
8. Host updates local state, passes events to ChatView
9. ChatView renders events (streaming)
10. On runtime.done:
    a. Orchestration appends assistant turn to Conversation
    b. Orchestration persists Conversation
    c. ChatView shows final state
```

### 7.2 用户打断执行

```
1. User clicks stop in ChatView
2. ChatView dispatches: { kind: 'chat.stop', conversationId }
3. Host calls orchestration: askAnywhereOrchestrator.stop(conversationId)
4. Orchestration:
   a. Finds active runId for conversation
   b. Calls runtime.stop(runId)
5. Runtime adapter:
   a. Sends SIGTERM to process
   b. Emits { kind: 'runtime.interrupt', reason: 'user_stop' }
6. Host receives interrupt event
7. ChatView updates UI (shows "已停止" badge)
```

### 7.3 外部 channel 消息进入

```
1. Gateway Daemon receives Telegram message
2. Gateway publishes TraceableEvent: { kind: 'channel.inbound.message', payload: { channel: 'telegram', text } }
3. AskAnywhereOrchestrator subscribes to channel events
4. Orchestrator:
   a. Creates or finds Conversation with anchor { kind: 'channel_thread', refId: 'telegram/<thread>' }
   b. Appends user turn
   c. Starts runtime run
5. (Same as 7.1 step 6-10)
6. On completion, orchestrator:
   a. Publishes TraceableEvent: { kind: 'channel.outbound.message', payload: { channel: 'telegram', text: response } }
7. Gateway Daemon receives outbound event
8. Gateway sends response to Telegram
```

---

## 8. 与现有代码的 delta

### 8.1 新增文件

```
src/shared/chat-protocol/
  events.ts           # RuntimeEvent 定义
  actions.ts          # ChatAction 定义
  host.ts             # ChatHost 接口
  
src/shared/conversation/
  types.ts            # Conversation 数据模型
  
src/main/conversation/
  store.ts            # Conversation 持久化
  orchestrator.ts     # Conversation 生命周期管理
  
src/renderer/components/Chat/
  ChatView.tsx        # 重构后的纯渲染器
  types.ts            # 组件类型
  hooks/
    useRuntimeEvents.ts
    useChatActions.ts
```

### 8.2 重构文件

```
src/renderer/views/TaskDetailView.tsx
  - 引入 TaskChatHost 包装 ChatView
  
src/main/agent/ipc.ts
  - 重构事件 publish 逻辑，使用 RuntimeEvent
  
src/main/orchestration/task.ts
  - 使用 Conversation 模型代替 TaskConversation
```

### 8.3 迁移路径

见阶段 5 迁移计划（待写）

---

## 9. 与决策锚点的验证

| 决策 | 验证点 |
|------|--------|
| **D-1** Ask-Anywhere 是规划者代理 | AskAnywhereChatHost 和 TaskChatHost 使用同一个 ChatView，只是 capabilities 不同 |
| **D-2** Planner 退役 | `ConversationAnchorKind` 保留 `planner_session` 用于迁移，新建的都是 `ask_anywhere_session` |
| **D-3** Channel 只对接 Ask-Anywhere | `channel.inbound.message` 事件只被 AskAnywhereOrchestrator 处理 |
| **D-5** Conversation 一等公民 | `Conversation` 是独立实体，有自己的存储和 orchestrator |
| **D-6** 各地方自己配置 auto agent | TaskChatHost 的 `capabilities.canApproveTool` 可能和 AskAnywhereChatHost 不同 |

---

## 10. 遗留问题（待阶段 4 压测回答）

1. **streaming delta 粒度**：每个 delta 是一个 `runtime.message` 事件吗？还是累积到一定量再发？
2. **tool approval 超时**：如果用户不点批准，runtime 等多久？
3. **conversation 上限**：一个 conversation 最多多少 turns？超过后如何 compact？
4. **跨设备同步**：Conversation 数据如何在多设备间同步？（待 sync 方案）

---

## 11. 下一步

- [x] 本文档完成 ✅
- [ ] 阶段 4：架构压测（用 end-to-end 场景验证协议完整性）
- [ ] 阶段 5：迁移路径（从现有代码到新协议的具体步骤）
