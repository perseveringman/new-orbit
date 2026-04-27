# 阶段 2：AppBus 设计（日志式 vs 消息式 + 事件 Schema 强类型化）

> **背景**：用户在第一轮对话中提出 "日志式 vs 消息式总线需要讨论优缺点再定"。本阶段回答这个问题。
> **产出**：AppBus 架构选型 + 事件 Schema 升级方案
> **时间**：2026-04-29

---

## 1. 现有 TraceableEvent 基础设施回顾

### 1.1 数据模型

```typescript
// src/shared/events.ts
export const TRACEABLE_EVENT_SOURCES = ['activity', 'agent', 'inbox', 'ipc'] as const;

export interface TraceableEvent {
  id: string;
  at: string;                    // ISO timestamp
  source: TraceableEventSource;  // 'activity' | 'agent' | 'inbox' | 'ipc'
  type: string;                  // ← 任意字符串，无 schema
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId?: string;
  taskId?: string;
  taskUid?: string;
  summary?: string;
  payload?: unknown;             // ← 任意对象，无 schema
}
```

### 1.2 运行时机制

```
publishTraceableEvent(input)
    ↓
eventReplayBus.emit('event', event)   ← 内存 EventEmitter，单一 'event' 通道
    ↓
store.append(event)                   ← 持久化到 NDJSON 文件（按日期分片）
```

### 1.3 现有问题

| 问题 | 影响 |
|------|------|
| `type` 是任意 string | 无法做静态类型检查；consumer 必须硬编码字符串匹配 |
| `payload` 是 `unknown` | 无法在编译期知道 payload 结构 |
| 只有单一 `'event'` 通道 | 无法按事件类型订阅；所有 subscriber 收到所有事件 |
| 无 replay 能力 | store 只支持 query（全量扫描 + filter），不支持"从某个 eventId 开始 replay" |
| 无 GC 策略 | 只有 `gc(maxFiles=14)` 按文件数 GC，不按事件数或时间 |

---

## 2. 日志式 vs 消息式总线的取舍

### 2.1 定义

| 架构 | 核心思想 | 代表 |
|------|---------|------|
| **日志式（Log-based）** | 事件是不可变日志，append-only 存储；consumer 按 offset/eventId 拉取 | Kafka, Event Sourcing, TraceableEventStore |
| **消息式（Message-based）** | 事件是瞬时消息，发布后只活在 subscriber；不保证持久化 | Node EventEmitter, Redis Pub/Sub |

Orbit 现有方案是**混合**：
- 内存：消息式（EventEmitter `emit`）
- 持久化：日志式（NDJSON append-only）

### 2.2 对比

| 维度 | 日志式 | 消息式 |
|------|--------|--------|
| **持久化** | ✅ 原生支持 | ❌ 需要额外持久化层 |
| **Replay** | ✅ 从任意 offset 重放 | ❌ 错过就没了 |
| **顺序保证** | ✅ 严格全局序 | 🟡 同一 emitter 内有序，跨 emitter 不保证 |
| **性能** | 🟡 写入是 I/O 瓶颈 | ✅ 纯内存快 |
| **内存占用** | ✅ 可以只保留 tail | ❌ 如果想 replay 必须缓存 |
| **实现复杂度** | 🟡 需要 offset 管理 | ✅ 简单 |
| **解耦** | ✅ 生产者不知道消费者 | ✅ 同样解耦 |

### 2.3 Orbit 场景分析

**需要日志式的场景**：
1. **Thinking Trail 自动化**：需要从 runId 开始 replay 所有 agent 事件，生成摘要
2. **Conversation 持久化**：每个 conversation 就是一系列事件的 replay
3. **调试 / Observability**：查看历史事件流
4. **Session Resume**：重新打开 Orbit 后，从 vendorSessionId 恢复上下文

**需要消息式的场景**：
1. **实时 UI 更新**：renderer 收到事件立即渲染
2. **低延迟 IPC**：agent 事件需要毫秒级推到 UI

### 2.4 结论：**保持混合，但升级日志层**

- **内存层**：保持 EventEmitter，但按 `source:type` 细分通道（可选）
- **持久化层**：升级 TraceableEventStore，支持 offset-based replay
- **不引入外部依赖**（Kafka/Redis 对 Electron 桌面应用过重）

---

## 3. 事件 Schema 强类型化方案

### 3.1 目标

从 `type: string, payload: unknown` 升级到：
```typescript
type TraceableEventKind = 'agent.run.started' | 'agent.event' | 'inbox.item.created' | ...;
interface TraceableEvent<K extends TraceableEventKind = TraceableEventKind> {
  kind: K;                      // 替代 type，有限枚举
  payload: PayloadMap[K];       // 按 kind 强类型
  // ... 其他字段不变
}
```

### 3.2 事件 Kind 清单（初步）

基于阶段 0 的功能盘点，以下是需要定义的事件 kind：

#### 3.2.1 Agent 相关

| kind | payload schema | 触发时机 |
|------|----------------|---------|
| `agent.run.started` | `{ runId, taskId?, prompt, cwd, runtime }` | runner 启动时 |
| `agent.run.event` | `UnifiedAgentEvent` | runtime 产生事件时 |
| `agent.run.completed` | `{ runId, exitCode, reason?, cost? }` | runner 结束时 |
| `agent.run.interrupted` | `{ runId, reason }` | 用户/系统打断时 |

#### 3.2.2 Inbox 相关

| kind | payload schema | 触发时机 |
|------|----------------|---------|
| `inbox.item.created` | `{ itemId, itemType, title, source }` | 新 inbox item 产生 |
| `inbox.item.snoozed` | `{ itemId, until }` | snooze 操作 |
| `inbox.item.archived` | `{ itemId }` | archive 操作 |
| `inbox.item.resolved` | `{ itemId, resolution }` | 标记完成 |

#### 3.2.3 Task 相关

| kind | payload schema | 触发时机 |
|------|----------------|---------|
| `task.proposed` | `{ taskId, projectId, title, source }` | proposal 创建 |
| `task.approved` | `{ taskId }` | 用户审批 |
| `task.started` | `{ taskId, runId }` | 开始执行 |
| `task.completed` | `{ taskId, outcome }` | 完成 |
| `task.failed` | `{ taskId, error }` | 失败 |

#### 3.2.4 Conversation 相关（新增，对应 D-5）

| kind | payload schema | 触发时机 |
|------|----------------|---------|
| `conversation.started` | `{ conversationId, anchors[], runtime? }` | 新对话开始 |
| `conversation.turn.added` | `{ conversationId, turn }` | 添加对话轮次 |
| `conversation.anchor.added` | `{ conversationId, anchor }` | 添加新 anchor |
| `conversation.compacted` | `{ conversationId, removedTurnCount }` | 上下文压缩 |
| `conversation.ended` | `{ conversationId, reason }` | 对话结束 |

#### 3.2.5 Channel 相关（新增，对应 D-3/D-4）

| kind | payload schema | 触发时机 |
|------|----------------|---------|
| `channel.inbound.message` | `{ channel, threadId, userId, text, raw }` | Gateway 收到外部消息 |
| `channel.outbound.message` | `{ channel, threadId, text }` | 向外部发送消息 |
| `channel.connected` | `{ channel }` | channel 连接成功 |
| `channel.disconnected` | `{ channel, reason }` | channel 断开 |

#### 3.2.6 Activity 相关

| kind | payload schema | 触发时机 |
|------|----------------|---------|
| `activity.user` | `{ action, context, payload, summary }` | 用户操作 |
| `activity.system` | `{ action, context, payload, summary }` | 系统事件 |

### 3.3 TypeScript 实现方案

```typescript
// src/shared/events/kinds.ts
export const TRACEABLE_EVENT_KINDS = [
  'agent.run.started',
  'agent.run.event',
  'agent.run.completed',
  'agent.run.interrupted',
  'inbox.item.created',
  // ... 完整列表
] as const;

export type TraceableEventKind = (typeof TRACEABLE_EVENT_KINDS)[number];

// src/shared/events/payloads.ts
export interface AgentRunStartedPayload {
  runId: string;
  taskId?: string;
  prompt: string;
  cwd: string;
  runtime: UnifiedAgentRuntimeRef;
}

export interface AgentRunEventPayload extends UnifiedAgentEvent {}

// ... 其他 payload 定义

// 映射表
export interface TraceableEventPayloadMap {
  'agent.run.started': AgentRunStartedPayload;
  'agent.run.event': AgentRunEventPayload;
  // ...
}

// src/shared/events/types.ts
export interface TraceableEvent<K extends TraceableEventKind = TraceableEventKind> {
  id: string;
  at: string;
  kind: K;                                // 替代 source + type
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  payload: TraceableEventPayloadMap[K];   // 强类型
  // 保留可选的 context 字段供向后兼容
  runId?: string;
  taskId?: string;
  conversationId?: string;
}
```

### 3.4 迁移策略

1. **Phase 1：新增 `kind` 字段**
   - `kind` 和 `type` 并存
   - 新代码用 `kind`，旧代码仍用 `type`
   - 读取时优先用 `kind`，fallback 到 `type`

2. **Phase 2：迁移所有 publisher**
   - 全部改用 `publishTraceableEvent` 的新签名
   - 编译期强制 payload 类型匹配

3. **Phase 3：删除 `type` 字段**
   - 确认所有 consumer 都用 `kind`
   - 删除 `type` 兼容代码

---

## 4. Replay 能力升级

### 4.1 现状

`TraceableEventStore.query(filter)` 是**全量扫描 + 内存 filter**，不支持：
- 从某个 eventId 之后开始
- 流式读取（一次加载全部到内存）
- 按 conversationId 过滤

### 4.2 升级方案

#### 4.2.1 索引文件

每天的 NDJSON 旁边生成一个索引文件：

```
.orbit/events/
  2026-04-29.ndjson      # 事件日志
  2026-04-29.index.json  # 索引
```

索引结构：
```json
{
  "eventCount": 1234,
  "byKind": {
    "agent.run.started": [0, 45, 89, ...],  // byte offsets
    "agent.run.event": [12, 56, ...],
  },
  "byTraceId": {
    "trace-abc": [0, 12, 45, ...],
  },
  "byConversationId": {
    "conv-xyz": [89, 102, ...],
  }
}
```

#### 4.2.2 新增 API

```typescript
interface TraceableEventStore {
  // 现有
  append(event: TraceableEvent): Promise<void>;
  query(filter: TraceableEventFilter): Promise<TraceableEventQueryResult>;
  
  // 新增
  replayFrom(options: {
    afterEventId?: string;        // 从某个 eventId 之后开始
    traceId?: string;
    conversationId?: string;
    limit?: number;
  }): AsyncIterable<TraceableEvent>;
  
  tail(options: {
    traceId?: string;
    conversationId?: string;
    limit?: number;
  }): TraceableEvent[];           // 最近 N 条，从内存 ring buffer 取
}
```

#### 4.2.3 内存 Ring Buffer

保持最近 N 条事件（如 1000 条）在内存中，用于：
- 快速 tail 查询
- 实时 UI 渲染
- 减少磁盘 I/O

---

## 5. 按 Kind 订阅（可选升级）

### 5.1 现状

```typescript
eventReplayBus.on('event', (event: TraceableEvent) => {
  if (event.source === 'agent' && event.type === 'run.started') {
    // ...
  }
});
```

所有 subscriber 收到所有事件，自己 filter。

### 5.2 升级方案

```typescript
// 新 API
eventReplayBus.on('agent.run.started', (event: TraceableEvent<'agent.run.started'>) => {
  // payload 已经是强类型 AgentRunStartedPayload
});

eventReplayBus.on('agent.*', (event: TraceableEvent) => {
  // wildcard 订阅所有 agent 相关事件
});

eventReplayBus.on('*', (event: TraceableEvent) => {
  // 全量订阅（等同于现在的 'event'）
});
```

### 5.3 实现

用 `EventEmitter2` 或自己实现 wildcard 匹配：

```typescript
class TypedEventBus {
  private emitter = new EventEmitter();
  
  emit<K extends TraceableEventKind>(event: TraceableEvent<K>): void {
    // 精确匹配
    this.emitter.emit(event.kind, event);
    // 前缀匹配
    const parts = event.kind.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      this.emitter.emit(parts.slice(0, i).join('.') + '.*', event);
    }
    // 全量
    this.emitter.emit('*', event);
  }
  
  on<K extends TraceableEventKind>(kind: K | `${string}.*` | '*', cb: (event: TraceableEvent<K>) => void): void {
    this.emitter.on(kind, cb);
  }
}
```

---

## 6. 与决策锚点的关联

| 决策 | 本阶段支撑 |
|------|-----------|
| **D-5** Conversation 一等公民 | 新增 `conversation.*` 事件 kind；replay 支持按 conversationId 过滤 |
| **D-3** Channel 只对接 Ask-Anywhere | 新增 `channel.*` 事件 kind；Gateway 只发布 `channel.inbound.message`，Ask-Anywhere runtime 处理后发布 `agent.run.*` |
| **D-1** Ask-Anywhere 是规划者代理 | Ask-Anywhere 的对话产生 `conversation.*` + `agent.run.*` 事件，与 Task Agent 事件结构一致 |

---

## 7. 建议实施优先级

| 项 | 优先级 | 依赖 |
|----|--------|------|
| 事件 kind 强类型化 | P0 | 无 |
| 内存 Ring Buffer 升级 | P0 | 无 |
| Conversation 相关事件定义 | P0 | D-5 |
| Channel 相关事件定义 | P1 | D-4 Gateway 落地时 |
| 索引文件 + replayFrom API | P1 | Thinking Trail 自动化时 |
| 按 kind 订阅 | P2 | 可选优化 |

---

## 8. 遗留问题（待阶段 3/4 回答）

1. **事件版本演进**：payload schema 变更时如何处理旧事件？—— 建议：添加 `schemaVersion` 字段 + migration
2. **跨进程事件**：Gateway Daemon 和 Orbit 主进程之间的事件如何同步？—— 建议：WebSocket + 事件重放
3. **事件清理策略**：conversation 结束后其事件保留多久？—— 待产品决策

---

## 9. 下一步

- [x] 本文档完成 ✅
- [ ] 阶段 3：Chat ↔ Runtime 协议定稿（基于阶段 1 三层结构 + 阶段 2 事件 schema）
