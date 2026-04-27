# ADR-014: Chat 解耦与 Conversation 一等公民

| 状态 | 日期 | 作者 |
|------|------|------|
| **Proposed** | 2026-04-29 | Ryan / AI |

## Context

Phase 4.0 的 dog-food 暴露出架构耦合问题：
- Chat 组件散落在多个 view 中（TaskDetailView、ProjectPlannerView、InboxStageView）
- 每个 chat 实现与业务实体强绑定，无法复用
- TaskConversation 只服务于 Task，Planner 有自己的对话状态
- 没有统一的"对话中心"来聚合所有 chat

同时，产品方向明确要求：
- **Ask-Anywhere** 作为全应用 AI 助手，需要统一的对话能力
- **外部 Channel**（Telegram 等）入站消息也需要对话载体
- **定时任务**执行结果需要以对话形式展示

## Decision

### D-1: Chat 组件是纯渲染器

Chat 组件（`ChatView`）只做两件事：
1. 接收 `RuntimeEvent[]`，渲染为 UI
2. 收集用户动作，包装为 `ChatAction` 抛出

**验证标准**：
```bash
grep -rE 'task|inbox|proposal|planner|vault|project' src/renderer/components/Chat/
# 结果必须为空
```

Chat 不知道也不关心自己被谁使用。

### D-2: Host 适配层连接业务与 Chat

每种业务场景提供一个 `ChatHost` 实现：
- `TaskChatHost`：连接 TaskOrchestrator
- `InboxChatHost`：连接 InboxOrchestrator
- `AskAnywhereChatHost`：连接 AskAnywhereOrchestrator

Host 负责：
- 实现 `ChatHost` 接口（handleAction、capabilities、placeholder 等）
- 桥接 IPC 获取 RuntimeEvent
- 处理 ChatAction 分发到业务层

### D-3: Conversation 升格为一等公民

新增 `Conversation` 实体，与 Task/Project/InboxItem 同级：

```typescript
interface Conversation {
  id: string;
  anchors: ConversationAnchor[];  // 多 anchor 支持
  turns: ConversationTurn[];
  status: 'active' | 'paused' | 'ended';
  currentRunId?: string;
  vendorSessionId?: string;
  // ...
}

type ConversationAnchorKind = 
  | 'task'
  | 'inbox_item'
  | 'ask_anywhere_session'
  | 'channel_thread'
  | 'scheduled_execution'
  | 'capture_item';
```

**关键特性**：
- 一个 Conversation 可以有多个 anchor（如 Ask-Anywhere 聊着聊着开了个 Task）
- 所有 chat 场景共享同一个数据模型
- 存储路径：`<vault>/.orbit/conversations/<id>.ndjson`

### D-4: RuntimeEvent 协议三层结构

| 层 | 内容 |
|----|------|
| **Core** | `message` / `thinking` / `tool_use` / `tool_result` / `cost` / `done` / `error` |
| **Capability-Gated** | `heartbeat` / `file_change` / `plan_update` / `partial_structured_output` |
| **Orbit Extensions** | `awaiting_user` / `interrupt` / `compact` / `session_resume` / `budget_warn` / `budget_halt` |

所有 runtime adapter 必须把 vendor 事件映射到这套协议。

## Consequences

### 正面

1. **Chat 代码复用**：一套 Chat 组件服务所有场景
2. **统一对话中心**：可以在一个页面看到所有对话
3. **跨场景对话迁移**：Ask-Anywhere → Task 的 Conversation 上下文无缝传递
4. **Thinking Trail 自动化**：基于 Conversation 数据可以自动生成对话摘要

### 负面

1. **迁移成本**：现有 TaskConversation、Planner chat 需要迁移
2. **数据模型复杂度增加**：anchor 关系需要维护

### 中性

- Chat 组件需要通过 capabilities flag 适配不同场景的 UI 差异

## Supersedes

- **ADR-005**（Plan Chat = Stage View 实例）的部分内容：Planner 作为独立实体退役，规划能力迁入 Ask-Anywhere

## Related

- ADR-008（AI-Native + CLI-first）：Chat ↔ Runtime 协议支撑此原则
- ADR-011（Runtime 抽象贯通）：RuntimeEvent 是 UnifiedAgentEvent 的演进
- ADR-015（Ask-Anywhere 作为规划者代理）：依赖本 ADR 的 Conversation 模型
