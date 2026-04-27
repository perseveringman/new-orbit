# 阶段 5：迁移路径

> **目标**：从现有代码迁移到新协议的具体步骤、顺序、风险点
> **原则**：增量迁移，每步可独立合并，保持主干可部署
> **时间**：2026-04-29

---

## 0. 迁移范围概览

### 现有代码结构

```
src/main/
  agent/
    adapter/          # Claude/Codex adapter（保留，升级）
    runner.ts         # AgentRunner（保留，升级）
    ipc.ts            # agent IPC（重构）
  events/
    bus.ts            # TraceableEvent bus（升级）
    store.ts          # TraceableEventStore（升级）
  orchestration/
    task.ts           # TaskOrchestrator（保留，接入新协议）
    inbox.ts          # InboxOrchestrator（保留）

src/shared/
  agent.ts            # AgentEvent 旧类型（废弃）
  agent-event.ts      # UnifiedAgentEvent（升级为 RuntimeEvent）
  events.ts           # TraceableEvent（升级）

src/renderer/
  views/
    TaskDetailView.tsx    # 含内嵌 chat（重构）
  components/
    (暂无独立 Chat 组件)   # 新建
```

### 迁移目标结构

```
src/main/
  agent/
    adapter/          # 保留，normalizeVendorEvent → RuntimeEvent
    runner.ts         # 保留，事件输出改为 RuntimeEvent
    ipc.ts            # 简化，只做 RuntimeEvent push
  conversation/       # 新建
    store.ts          # Conversation 持久化
    orchestrator.ts   # Conversation 生命周期
  events/
    bus.ts            # 升级：支持 kind 订阅
    store.ts          # 升级：支持 replayFrom
    kinds.ts          # 新建：TraceableEventKind 枚举
    payloads.ts       # 新建：payload 类型定义

src/shared/
  chat-protocol/      # 新建
    events.ts         # RuntimeEvent
    actions.ts        # ChatAction
    host.ts           # ChatHost 接口
  conversation/       # 新建
    types.ts          # Conversation 数据模型

src/renderer/
  components/
    Chat/             # 新建
      ChatView.tsx    # 纯渲染器
      hooks/
        useRuntimeEvents.ts
        useChatActions.ts
  hosts/              # 新建
    TaskChatHost.tsx
    InboxChatHost.tsx
    AskAnywhereChatHost.tsx
  views/
    TaskDetailView.tsx    # 重构，使用 TaskChatHost + ChatView
    AskAnywhereView.tsx   # 新建
```

---

## 1. 迁移阶段划分

### Phase M1：基础设施升级（无功能变化）

**目标**：升级 TraceableEvent schema，不改变现有行为

**步骤**：

1. **新建 `src/shared/events/kinds.ts`**
   - 定义 `TRACEABLE_EVENT_KINDS` 枚举
   - 定义 `TraceableEventKind` 类型

2. **新建 `src/shared/events/payloads.ts`**
   - 定义各 kind 的 payload 接口
   - 定义 `TraceableEventPayloadMap`

3. **升级 `src/shared/events.ts`**
   - 添加 `kind` 字段（与 `type` 并存）
   - `payload` 类型从 `unknown` 改为 `TraceableEventPayloadMap[K]`
   - 保留 `type` 字段的向后兼容

4. **升级 `src/main/events/bus.ts`**
   - `publishTraceableEvent` 接受 `kind` 参数
   - 内部映射 `kind` → `type`（兼容旧 consumer）

5. **验证**：
   - 现有功能不变
   - TypeScript 编译通过
   - 现有 DeveloperConsoleView 仍能显示事件

**预计工作量**：0.5 天

---

### Phase M2：RuntimeEvent 协议实现

**目标**：定义并实现 `RuntimeEvent`，adapter 输出改为 RuntimeEvent

**步骤**：

1. **新建 `src/shared/chat-protocol/events.ts`**
   - 定义 `RUNTIME_EVENT_KINDS`
   - 定义 `RuntimeEventPayloadMap`
   - 定义 `RuntimeEvent<K>` 接口

2. **新建 `src/shared/chat-protocol/actions.ts`**
   - 定义 `CHAT_ACTION_KINDS`
   - 定义 `ChatActionPayloadMap`
   - 定义 `ChatAction<K>` 接口

3. **新建 `src/shared/chat-protocol/host.ts`**
   - 定义 `ChatHostCapabilities`
   - 定义 `ChatHost` 接口

4. **升级 `src/main/agent/adapter/types.ts`**
   - `normalizeVendorEvent` 返回 `RuntimeEvent` 而非 `UnifiedAgentEvent`

5. **升级 `src/main/agent/adapter/claude.ts`**
   - 实现新的 `normalizeVendorEvent`

6. **升级 `src/main/agent/adapter/codex.ts`**
   - 实现新的 `normalizeVendorEvent`

7. **升级 `src/main/agent/runner.ts`**
   - `push` 方法输出 `RuntimeEvent`
   - 保留 `AgentEvent` 向后兼容层（临时）

8. **验证**：
   - 现有 task 执行功能不变
   - 新的 RuntimeEvent 正确产生

**预计工作量**：1 天

---

### Phase M3：Conversation 数据模型实现

**目标**：实现 Conversation 一等公民数据模型

**步骤**：

1. **新建 `src/shared/conversation/types.ts`**
   - 定义 `ConversationAnchorKind`
   - 定义 `ConversationAnchor`
   - 定义 `ConversationTurn`
   - 定义 `Conversation`

2. **新建 `src/main/conversation/store.ts`**
   - 实现 `ConversationStore`
   - NDJSON 存储格式
   - 支持 append turn / add anchor / update status

3. **新建 `src/main/conversation/orchestrator.ts`**
   - 实现 `ConversationOrchestrator`
   - 管理 Conversation 生命周期
   - 与 runtime 交互

4. **新建 `src/main/conversation/ipc.ts`**
   - 定义 conversation IPC channels
   - `conversation.get`, `conversation.list`, `conversation.subscribe`

5. **验证**：
   - 能创建 Conversation
   - 能 append turn
   - 能持久化和读取

**预计工作量**：1 天

---

### Phase M4：Chat 组件实现（纯渲染器）

**目标**：实现业务无关的 Chat 组件

**步骤**：

1. **新建 `src/renderer/components/Chat/types.ts`**
   - 定义 `ChatProps`
   - 定义 UI 相关类型

2. **新建 `src/renderer/components/Chat/ChatView.tsx`**
   - 纯渲染器实现
   - 接收 `RuntimeEvent[]`
   - 输出 `ChatAction`

3. **新建 `src/renderer/components/Chat/hooks/useRuntimeEvents.ts`**
   - IPC 订阅 hook
   - 管理事件流状态

4. **新建 `src/renderer/components/Chat/hooks/useChatActions.ts`**
   - 动作分发 hook

5. **新建子组件**：
   - `MessageBubble.tsx`
   - `ToolCard.tsx`
   - `ThinkingBlock.tsx`
   - `InputArea.tsx`
   - `ActionBar.tsx`

6. **验证**（grep 测试）：
   ```bash
   grep -rE 'task|inbox|proposal|planner|vault|project' src/renderer/components/Chat/
   # 预期结果：无匹配
   ```

**预计工作量**：2 天

---

### Phase M5：Host 适配层实现

**目标**：为每种业务场景实现 ChatHost

**步骤**：

1. **新建 `src/renderer/hosts/TaskChatHost.tsx`**
   - 实现 `ChatHost` 接口
   - 连接 TaskOrchestrator

2. **新建 `src/renderer/hosts/InboxChatHost.tsx`**
   - 实现 `ChatHost` 接口
   - 连接 InboxOrchestrator

3. **新建 `src/renderer/hosts/AskAnywhereChatHost.tsx`**
   - 实现 `ChatHost` 接口
   - 连接 AskAnywhereOrchestrator

4. **重构 `src/renderer/views/TaskDetailView.tsx`**
   - 移除内嵌 chat 代码
   - 使用 `TaskChatHost` + `ChatView`

5. **验证**：
   - Task chat 功能不变
   - UI 表现一致

**预计工作量**：1.5 天

---

### Phase M6：Ask-Anywhere 实现

**目标**：实现 Ask-Anywhere 功能

**步骤**：

1. **新建 `src/main/ask-anywhere/orchestrator.ts`**
   - 实现 `AskAnywhereOrchestrator`
   - 管理 Ask-Anywhere session
   - 通过 orbit CLI 工具集操作 vault

2. **新建 `src/main/ask-anywhere/ipc.ts`**
   - 定义 IPC channels

3. **新建 `src/renderer/views/AskAnywhereView.tsx`**
   - 左栏全功能页面
   - 对话列表 + ChatView

4. **新建悬浮球组件**
   - 右下角极简对话框

5. **更新导航**
   - 左侧栏添加 Ask-Anywhere 入口

6. **验证**：
   - Ask-Anywhere 基本对话功能
   - 可以调用 orbit CLI

**预计工作量**：3 天

---

### Phase M7：Planner 退役

**目标**：退役独立 Planner，规划能力迁入 Ask-Anywhere

**步骤**：

1. **提取 Planner prompt 为 skill**
   - 将 Planner Agent 的 system prompt 打包为 Ask-Anywhere skill

2. **冻结 `src/renderer/views/ProjectPlannerView.tsx`**
   - 添加 deprecation notice
   - 不再新增功能

3. **更新导航**
   - Planner 入口指向 Ask-Anywhere（带 project 上下文）

4. **迁移测试**
   - 验证通过 Ask-Anywhere 规划项目的体验

5. **（可选）删除 Planner 代码**
   - 在 Ask-Anywhere 稳定后

**预计工作量**：1 天

---

### Phase M8：Gateway Daemon（可选，后期）

**目标**：实现独立 Gateway Daemon + Channel 支持

**步骤**：

1. 设计 Gateway 架构
2. 实现 Gateway Daemon
3. 实现 Telegram channel
4. 连接 AskAnywhereOrchestrator

**预计工作量**：5 天（单独 milestone）

---

## 2. 迁移依赖图

```
M1 (基础设施)
  ↓
M2 (RuntimeEvent)
  ↓
M3 (Conversation) ←─────┐
  ↓                      │
M4 (Chat 组件)           │
  ↓                      │
M5 (Host 适配)           │
  ↓                      │
M6 (Ask-Anywhere) ───────┘
  ↓
M7 (Planner 退役)
  ↓
M8 (Gateway Daemon) [独立]
```

---

## 3. 风险点与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| Chat 组件拆分导致 UI 回归 | 中 | 高 | M4/M5 后做完整 UI 回归测试 |
| Conversation 存储迁移数据丢失 | 低 | 高 | 保留旧存储格式兼容读取 |
| Ask-Anywhere 规划质量不如 Planner | 中 | 中 | M7 前做对比测试，保留 Planner skill 精调 |
| Gateway 与主进程同步问题 | 中 | 中 | M8 专门设计同步协议 |

---

## 4. 验收标准

### 功能验收

| 检查项 | 标准 |
|--------|------|
| Task chat | 功能、UI 与迁移前一致 |
| Ask-Anywhere | 能完成项目规划、任务创建、对话查看 |
| Conversation 持久化 | 重启后对话历史保留 |
| Chat 业务无关 | grep 验证通过 |

### 代码验收

| 检查项 | 标准 |
|--------|------|
| TypeScript | 无 any 逃逸，payload 强类型 |
| 测试覆盖 | Chat 组件 + Conversation store 有单测 |
| 文档 | 新 ADR 更新完成 |

---

## 5. 时间估算

| Phase | 工作量 | 依赖 |
|-------|--------|------|
| M1 | 0.5 天 | - |
| M2 | 1 天 | M1 |
| M3 | 1 天 | M1 |
| M4 | 2 天 | M2 |
| M5 | 1.5 天 | M3, M4 |
| M6 | 3 天 | M5 |
| M7 | 1 天 | M6 |
| **总计** | **10 天** | |
| M8 | 5 天 | M6 (独立 milestone) |

---

## 6. 与现有工作的协调

### 与 Phase 4.0 dog-food 的关系

- M1-M3 可以在 dog-food 期间并行开发（基础设施升级）
- M4-M5 需要短期 feature freeze（Chat 组件替换）
- M6-M7 是新功能，不影响现有 dog-food

### 与 open questions 的关系

| OQ | 本迁移影响 |
|----|-----------|
| OQ-13 Stage View 完整化 | D-2 回答了此问题（Planner 退役），M7 实施 |
| OQ-4 Quick Capture 扩展 | M6 Ask-Anywhere 可以成为 Quick Capture 入口 |

---

## 下一步

- [x] 本文档完成 ✅
- [ ] 阶段 6：ADR 定稿
