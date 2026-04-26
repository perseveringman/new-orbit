---
title: "全链路事件回放基础设施"
status: draft
date: 2026-04-27
adr: ADR-013
phase: "3.4"
depends_on: "2026-04-27-runtime-adapter-layer.md (Phase 3.1)"
---

# 全链路事件回放基础设施

> **定位**：Orbit 的 X-Ray——任何链路的 bug 都可以通过 trace_id 一路追到底。
>
> **前置**：Runtime Adapter Layer 已就绪（UnifiedAgentEvent 带 traceId/spanId）
>
> **产出**：统一事件总线 + 三层录像 + Developer Console 页面 + Golden Files 框架

---

## 1. 现状问题

### 三套独立事件系统

| 系统 | 存储 | 格式 | 关联 ID |
|------|------|------|---------|
| Activity Log | `.orbit/activity/YYYY-MM-DD.ndjson` | ActivityEvent | 有 entityId 但无 traceId |
| Agent Events | runner ring buffer (内存) | AgentEvent | 有 runId 但无 traceId |
| Inbox Events | `.orbit/inbox/events.ndjson` | InboxEvent | 有 proposalId 但无 traceId |

**问题**：无法跨系统关联。用户批准 proposal → agent 启动 run → 文件变更 → Activity Log，这条因果链的三个节点分别在三个系统里，没法串起来。

---

## 2. 统一事件 Schema

### 2.1 TraceableEvent 基础类型

```typescript
// src/shared/traceable-event.ts（新文件）

export interface TraceableEvent {
  /** 全局唯一事件 ID */
  eventId: string;

  /** 跨系统关联 ID（一次用户操作的所有事件共享） */
  traceId: string;

  /** 当前事件 span（事件内唯一） */
  spanId: string;

  /** 父 span（因果链） */
  parentSpanId?: string;

  /** 事件来源系统 */
  source: 'agent' | 'activity' | 'inbox' | 'ipc' | 'ui';

  /** 事件种类（各系统自己的 kind） */
  kind: string;

  /** 时间戳 (epoch ms) */
  timestamp: number;

  /** 关联实体 */
  taskUid?: string;
  projectUid?: string;
  runId?: string;
  runtimeId?: string;

  /** 事件载荷（各系统各异） */
  payload: Record<string, unknown>;
}
```

### 2.2 各系统接入

**Activity Log 接入**：

```diff
// src/main/activity/emitter.ts
class ActivityEmitter {
  emit(input: ActivityEventInput): ActivityEvent {
    const event = this.toEvent(input);
+   // 注入 traceId
+   const traceableEvent = toTraceableEvent(event, 'activity');
+   eventBus.publish(traceableEvent);
    return event;
  }
}
```

**Agent Events 接入**：

```diff
// src/main/agent/runner.ts (改造后)
private async consumeAdapterEvents(session: AdapterSession): Promise<void> {
  for await (const event of session.events) {
    this.events.push(event);
    this.emit('event', event);
+   // event 已经有 traceId（adapter 注入），直接发到总线
+   eventBus.publish(toTraceableEvent(event, 'agent'));
  }
}
```

**Inbox Events 接入**：

```diff
// src/main/inbox/service.ts
async processEvent(event: InboxEvent): Promise<void> {
  // ... 现有逻辑 ...
+ eventBus.publish(toTraceableEvent(event, 'inbox'));
}
```

**IPC Events 接入**（新增）：

```typescript
// src/main/ipc/middleware.ts（新文件）
// IPC handler wrapper，自动记录每次 IPC 调用
function withTracing<T>(channel: string, handler: (...args: any[]) => Promise<T>) {
  return async (...args: any[]): Promise<T> => {
    const traceId = extractOrGenerateTraceId(args);
    const spanId = generateSpanId();
    eventBus.publish({
      eventId: generateId(),
      traceId,
      spanId,
      source: 'ipc',
      kind: channel,
      timestamp: Date.now(),
      payload: { args: sanitize(args) },
    });
    const result = await handler(...args);
    return result;
  };
}
```

---

## 3. 事件总线

```typescript
// src/main/events/bus.ts（新文件）

type EventHandler = (event: TraceableEvent) => void;

class EventBus {
  private handlers: EventHandler[] = [];
  private writers: EventWriter[] = [];

  /** 注册处理器 */
  subscribe(handler: EventHandler): () => void {
    this.handlers.push(handler);
    return () => { this.handlers = this.handlers.filter(h => h !== handler); };
  }

  /** 注册持久化写入器 */
  addWriter(writer: EventWriter): void {
    this.writers.push(writer);
  }

  /** 发布事件 */
  publish(event: TraceableEvent): void {
    for (const handler of this.handlers) {
      try { handler(event); } catch (e) { /* log but don't block */ }
    }
    for (const writer of this.writers) {
      writer.write(event).catch(e => { /* log */ });
    }
  }
}

export const eventBus = new EventBus();
```

### 3.1 事件写入器

```typescript
// src/main/events/ndjson-writer.ts（新文件）

class NdjsonEventWriter implements EventWriter {
  private basePath: string;

  constructor(vaultPath: string) {
    // 写入 .orbit/events/YYYY-MM-DD.ndjson
    this.basePath = path.join(vaultPath, '.orbit', 'events');
  }

  async write(event: TraceableEvent): Promise<void> {
    const date = new Date(event.timestamp).toISOString().slice(0, 10);
    const filePath = path.join(this.basePath, `${date}.ndjson`);
    await fs.appendFile(filePath, JSON.stringify(event) + '\n');
  }
}
```

### 3.2 存储管理

- 按天轮转，每天一个 NDJSON 文件
- 默认保留 30 天（可配置 `settings.events.retentionDays`）
- GC 在 Orbit 启动时执行（删除过期文件）

---

## 4. 三层事件录像（Agent 链路专用）

Agent 执行链路额外录制三层 NDJSON，精确定位问题层：

```
.orbit/events/runs/<runId>/
├── raw-vendor.ndjson         # runtime 原生事件（ClaudeAdapter 写入）
├── abstract.ndjson           # adapter 翻译后的 UnifiedAgentEvent
└── ui-render.ndjson          # 推送到 renderer 的事件
```

**写入时机**：

| 层 | 写入者 | 时机 |
|----|--------|------|
| raw-vendor | ClaudeAdapter 内部 | 收到 vendor stdout 每一行 |
| abstract | AgentRunner (改造后) | adapter yield 每一个 UnifiedAgentEvent |
| ui-render | IPC push handler | 每次向 renderer 推送事件 |

**大小控制**：
- 每层单独 NDJSON
- 单个 run 的录像跟随 run 生命周期，run 完成后压缩归档
- 超过 30 天的 run 录像删除（跟随统一事件 GC）

---

## 5. Developer Console 页面

### 5.1 页面结构

```
┌──────────────────────────────────────────────────────┐
│  Developer Console                      [过滤器栏]    │
├──────────────────────────────────────────────────────┤
│                                                      │
│  过滤器：                                             │
│  [Source ▾] [Kind ▾] [Task ▾] [Trace ID ___]  [🔍]  │
│                                                      │
│  时间轴：                                             │
│                                                      │
│  10:31:42.003  ipc    agent:startTask    trace-abc   │
│  10:31:42.015  agent  thinking           trace-abc   │
│  10:31:44.217  agent  tool_use: read     trace-abc   │
│  10:31:44.520  agent  tool_result: ✓     trace-abc   │
│  10:31:45.003  activity task.status_changed           │
│  10:31:45.100  inbox  proposal.created   trace-abc   │
│  10:31:47.003  agent  message            trace-abc   │
│  10:31:48.000  agent  done               trace-abc   │
│                                                      │
│  [▶ Playback]  [⏸ Pause]  [速度 ▾]  [导出 NDJSON]   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 5.2 功能列表

| 功能 | 说明 |
|------|------|
| **实时流** | 事件总线 → IPC push → Console 实时显示 |
| **Trace 过滤** | 输入 trace_id，只显示该 trace 的事件 |
| **Source 过滤** | 按 agent / activity / inbox / ipc 过滤 |
| **Kind 过滤** | 按事件类型过滤 |
| **Task 过滤** | 按 task UID 过滤 |
| **时间范围** | 选择时间段查看历史事件 |
| **Playback** | 选择一段历史事件，按时间顺序"回放" |
| **导出** | 把当前过滤结果导出为 NDJSON 文件 |
| **事件详情** | 点击事件展开完整 payload |

### 5.3 IPC 新增

```typescript
// src/shared/ipc.ts
IPC.events = {
  subscribe: 'events:subscribe',
  unsubscribe: 'events:unsubscribe',
  query: 'events:query',      // 查询历史事件
  export: 'events:export',    // 导出 NDJSON
};
```

### 5.4 性能考虑

- 实时流通过 IPC push（不是 polling）
- 历史查询用文件扫描 + 流式读取（不加载全部到内存）
- Console 页面只在打开时订阅事件流，关闭时取消
- 时间轴虚拟滚动（只渲染可见行）

---

## 6. Golden Files 回归基线

### 6.1 概念

每个 Playground scenario 首次成功运行后，保存 abstract 层事件序列为 "Golden File"。后续每次代码变更后跑 scenario，和 Golden File 比对。

### 6.2 存储位置

```
tests/golden/
├── scenario-01-simple-chat.golden.ndjson
├── scenario-02-single-tool.golden.ndjson
└── ...
```

### 6.3 比对逻辑

```typescript
// tests/helpers/golden-compare.ts
function compareWithGolden(actual: UnifiedAgentEvent[], goldenPath: string): GoldenDiff {
  const golden = readGoldenFile(goldenPath);
  return {
    // 不比 timestamp/id（每次不同）
    // 比较事件序列的 kind 顺序
    kindSequenceMatch: compareKindSequence(actual, golden),
    // 比较事件数量差异
    countDiff: actual.length - golden.length,
    // 比较缺失/多余的事件类型
    missingKinds: findMissingKinds(actual, golden),
    extraKinds: findExtraKinds(actual, golden),
  };
}
```

### 6.4 自动化

```bash
# 更新 golden files（首次或有意的行为变更后）
orbit dev:golden update --scenario scenario-01

# 验证（CI/每次改代码后）
orbit dev:golden verify --all
# 输出: ✓ scenario-01 (events: 12, match)
#        ✗ scenario-03 (events: 15 vs golden 12, +3 extra tool_use)
```

---

## 7. 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/shared/traceable-event.ts` | 新建 | TraceableEvent 类型 |
| `src/main/events/bus.ts` | 新建 | 事件总线 |
| `src/main/events/ndjson-writer.ts` | 新建 | NDJSON 持久化 |
| `src/main/events/run-recorder.ts` | 新建 | 三层录像管理 |
| `src/main/events/gc.ts` | 新建 | 事件文件 GC |
| `src/main/events/query.ts` | 新建 | 历史事件查询 |
| `src/main/events/ipc.ts` | 新建 | events:* IPC handlers |
| `src/shared/ipc.ts` | 修改 | 新增 events namespace |
| `src/main/activity/emitter.ts` | 修改 | 接入事件总线 |
| `src/main/agent/runner.ts` | 修改 | 接入事件总线 |
| `src/main/inbox/service.ts` | 修改 | 接入事件总线 |
| `src/main/ipc/middleware.ts` | 新建 | IPC tracing wrapper |
| `src/renderer/src/views/DeveloperConsole.tsx` | 新建 | Console 页面 |
| `src/renderer/src/stores/eventStore.ts` | 新建 | 事件流 store |
| `tests/helpers/golden-compare.ts` | 新建 | Golden Files 比对 |
| `tests/golden/*.golden.ndjson` | 新建 | Golden 基线文件 |

---

## 8. 验收标准

- [ ] TraceableEvent 类型通过 typecheck
- [ ] 事件总线能接收来自 agent / activity / inbox / ipc 四个源的事件
- [ ] 统一事件 NDJSON 按天写入 `.orbit/events/`
- [ ] Agent 链路三层录像在 run 执行后三个文件都有正确内容
- [ ] Developer Console 页面：实时事件流正确显示
- [ ] Developer Console 页面：按 trace_id 过滤正确关联
- [ ] Developer Console 页面：按 source / kind / task 过滤正常
- [ ] Developer Console 页面：Playback mode 正确回放
- [ ] Golden Files：能 update 和 verify
- [ ] 事件 GC：超过 30 天的文件被清理
- [ ] 性能：1000 事件/秒的写入不影响主进程响应
- [ ] `npm run typecheck` 0 error
