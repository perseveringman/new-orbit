---
title: "Runtime Adapter Layer — 通用 Agent Event 协议与 Adapter 实现"
status: completed
date: 2026-04-27
adr: ADR-011
phase: "3.1"
depends_on: "2026-04-27-agent-playground.md (Phase 3.0)"
---

# Runtime Adapter Layer

> **定位**：Phase 3 的地基。定义通用 Agent Event 协议，实现 RuntimeAdapter 接口，让所有下游模块（runner / dispatch / conversation / UI）面向通用接口编程。
>
> **前置**：Phase 3.0（调试基础设施）已就绪
>
> **产出**：`src/main/agent/adapter/` 目录 + 修改 runner.ts / dispatch.ts / conversation.ts

---

## 1. 现状盘点

### 已有的好东西

```typescript
// src/main/orchestration/runtime.ts
interface RuntimeDescriptor {
  runtimeId: string;
  provider: 'claude' | 'codex' | 'gemini' | 'opencode';
  capabilities: {
    supportsResume: boolean;
    supportsHooks: boolean;
    supportsWorktree: boolean;
    supportsBackgroundRuns: boolean;
    supportsLongContext: boolean;
  };
  limits: { maxConcurrentRuns: number };
}
```

`LocalRuntimeManager` 已有完整的发现-注册-元数据模型。**这是我们的基座，不改它，只在它之上叠加 adapter 层。**

### 硬编码的问题

- `runner.ts` 的 `SpawnOpts` 只有 `claudePath`，没有 provider 抽象
- `mapStreamJson()` 和 `toKind()` 硬编码了 Claude 的 stream-json event type
- `dispatch.ts` 的 `summarizeEvents()` 只取 `.text`，丢掉 tool_use/tool_result/thinking
- `conversation.ts` 的 `ConversationTurn` 只有 `role` + `content`，没有事件粒度

---

## 2. 通用 Agent Event 协议

### 2.1 AgentEvent 类型定义

```typescript
// src/shared/agent-event.ts（新文件，shared 层，前后端共用）

export type AgentEventKind =
  | 'thinking'      // agent 内部推理过程
  | 'tool_use'      // 调用工具（名称 + 参数）
  | 'tool_result'   // 工具返回结果
  | 'message'       // agent 文本输出（流式 delta）
  | 'cost'          // 费用更新
  | 'error'         // 错误
  | 'done'          // 执行完成
  | 'heartbeat'     // 心跳（adapter 层注入）

export interface UnifiedAgentEvent {
  /** 全局唯一事件 ID */
  id: string;

  /** 事件类型 */
  kind: AgentEventKind;

  /** 时间戳（epoch ms） */
  timestamp: number;

  /** 跨层关联 ID（一次用户操作产生的所有事件共享） */
  traceId: string;

  /** 当前事件 span */
  spanId: string;

  /** 父事件 span（如 tool_result 的 parent 是 tool_use） */
  parentSpanId?: string;

  /** 产生事件的 runtime ID（对应 RuntimeDescriptor.runtimeId） */
  runtimeId: string;

  /** 关联 task UID */
  taskUid: string;

  /** 关联 run ID */
  runId: string;

  // --- 按 kind 不同填充 ---

  /** message / thinking 的文本内容 */
  text?: string;

  /** tool_use 的工具名 */
  toolName?: string;

  /** tool_use 的参数摘要（单行，<200 chars） */
  toolInputSummary?: string;

  /** tool_result 的成功/失败 */
  toolSuccess?: boolean;

  /** tool_result 的结果摘要（单行，<200 chars） */
  toolOutputSummary?: string;

  /** cost 事件的累积费用（USD） */
  costUsd?: number;

  /** cost 事件的 token 计数 */
  costTokens?: { input: number; output: number; cacheRead?: number };

  /** error 事件的错误码 */
  errorCode?: string;

  /** error 事件的消息 */
  errorMessage?: string;

  /** error 是否可重试（由 adapter 判定） */
  isRetryable?: boolean;

  /** 事件持续时间（ms），如 tool_use 的耗时 */
  durationMs?: number;

  /** 原始 vendor 事件（调试用，不给前端） */
  _raw?: unknown;
}
```

### 2.2 与现有 AgentEvent 的关系

现有 `AgentEvent`（runner.ts 里的 `mapStreamJson` 产物）是 Claude 特定的。策略：

- **不改现有 AgentEvent 类型**（避免影响 v2 已有逻辑）
- 新建 `UnifiedAgentEvent` 作为通用协议
- Adapter 负责 `AgentEvent → UnifiedAgentEvent` 的翻译
- 下游模块逐步从读 `AgentEvent` 迁移到读 `UnifiedAgentEvent`

---

## 3. RuntimeAdapter 接口

```typescript
// src/main/agent/adapter/types.ts（新文件）

export interface RuntimeAdapter {
  /** adapter 对应的 provider */
  readonly provider: string;

  /** 启动新 session，返回通用事件流 */
  startSession(opts: AdapterStartOpts): AdapterSession;

  /** 恢复已有 session */
  resumeSession(opts: AdapterResumeOpts): AdapterSession;

  /** 声明不可重试错误类型列表 */
  getNonRetryableErrors(): string[];

  /** 声明 adapter 支持的能力（对应 RuntimeDescriptor.capabilities 的子集） */
  getCapabilities(): AdapterCapabilities;
}

export interface AdapterStartOpts {
  runtimeDescriptor: RuntimeDescriptor;
  prompt: string;
  cwd: string;
  taskUid: string;
  runId: string;
  traceId: string;
  env?: Record<string, string>;
  hookConfig?: HookConfig;
  budgetLimitUsd?: number;
}

export interface AdapterResumeOpts extends AdapterStartOpts {
  vendorSessionId: string;
  message?: string;  // 追加消息（双向 stream）
}

export interface AdapterSession {
  /** 通用事件流（async iterator） */
  events: AsyncIterable<UnifiedAgentEvent>;

  /** 向正在运行的 session 发送消息（双向 stream） */
  sendMessage(message: string): Promise<void>;

  /** 停止 session */
  stop(reason?: string): Promise<void>;

  /** 获取 vendor session ID 用于持久化 */
  getVendorSessionId(): string | null;

  /** session 是否还在运行 */
  isAlive(): boolean;

  /** 最后一次收到事件的时间 */
  lastEventAt(): number;
}

export interface AdapterCapabilities {
  supportsResume: boolean;
  supportsBidirectionalStream: boolean;
  supportsThinking: boolean;
  supportsToolUse: boolean;
}
```

---

## 4. Claude Adapter 实现

```typescript
// src/main/agent/adapter/claude-adapter.ts（新文件）

export class ClaudeAdapter implements RuntimeAdapter {
  readonly provider = 'claude';

  startSession(opts: AdapterStartOpts): AdapterSession {
    // 1. 构建 claude CLI 参数
    //    - --output-format stream-json
    //    - --input-format stream-json（双向 stream 阶段开启）
    //    - --verbose
    //    - --max-tokens-per-tool N
    //    - -p <prompt>
    // 2. 用 child_process.spawn 启动
    // 3. 返回 ClaudeAdapterSession
  }

  resumeSession(opts: AdapterResumeOpts): AdapterSession {
    // 1. 用 --resume <vendorSessionId> 替代 -p <prompt>
    // 2. 如果有 message，通过 stdin 发送
    // 3. 其余同 startSession
  }

  getNonRetryableErrors(): string[] {
    return [
      'rate_limit_exceeded',
      'quota_exceeded',
      'authentication_failure',
      'invalid_api_key',
      'model_not_available',
      'billing_error',
    ];
  }

  getCapabilities(): AdapterCapabilities {
    return {
      supportsResume: true,
      supportsBidirectionalStream: true,
      supportsThinking: true,
      supportsToolUse: true,
    };
  }
}

class ClaudeAdapterSession implements AdapterSession {
  // 核心逻辑：
  // 1. 监听 child stdout line by line
  // 2. 每行 JSON → 调用 translateClaudeEvent() → yield UnifiedAgentEvent
  // 3. 注入 heartbeat 事件（每 60 秒如果没有其他事件）
  // 4. 记录 lastEventTimestamp
  // 5. 退出时 yield done 或 error 事件

  private translateClaudeEvent(raw: RawEventShape, idx: number): UnifiedAgentEvent {
    // 复用现有 mapStreamJson + toKind 逻辑
    // 额外填充 traceId / spanId / runtimeId / taskUid / runId
    // tool_use: 生成 toolInputSummary（截取前 200 字符）
    // tool_result: 生成 toolOutputSummary + toolSuccess
    // thinking: 保留完整 text
    // cost: 转换为 costUsd + costTokens
  }
}
```

### 翻译映射表

| Claude stream-json `type` | → `UnifiedAgentEvent.kind` | 特殊处理 |
|---------------------------|---------------------------|---------|
| `content_block_start` (type=thinking) | `thinking` | text 为 thinking 内容 |
| `content_block_start` (type=tool_use) | `tool_use` | 提取 tool name + input |
| `content_block_start` (type=text) | `message` | text 为 delta |
| `content_block_delta` | 对应父 block 的 kind | 追加 text |
| `tool_result` | `tool_result` | 提取 success + summary |
| `result` | `done` | 提取 exit code |
| cost fields | `cost` | 转换 token 计数 + USD |
| parse error / process exit ≠ 0 | `error` | 判定 isRetryable |
| (每 60 秒无事件) | `heartbeat` | adapter 层注入 |

---

## 5. Codex / Copilot Adapter (Stub)

```typescript
// src/main/agent/adapter/codex-adapter.ts（新文件，stub）
export class CodexAdapter implements RuntimeAdapter {
  readonly provider = 'codex';
  // startSession: 构建 codex CLI 参数 + 返回 stub session
  // resumeSession: 如果 codex 支持 resume
  // getNonRetryableErrors: codex 特有的错误列表
  // getCapabilities: { supportsResume: true, supportsThinking: false, ... }
}

// src/main/agent/adapter/copilot-adapter.ts（新文件，stub）
export class CopilotAdapter implements RuntimeAdapter {
  readonly provider = 'copilot';
  // 同上，stub 实现
}
```

Stub 的含义：
- 接口完整实现
- startSession 能启动进程
- 事件翻译只做基础的 message + done + error
- tool_use / thinking 等高级事件暂时空（capabilities 声明不支持）

---

## 6. Adapter Registry

```typescript
// src/main/agent/adapter/registry.ts（新文件）

const adapters: Map<string, RuntimeAdapter> = new Map();

export function registerAdapter(adapter: RuntimeAdapter): void {
  adapters.set(adapter.provider, adapter);
}

export function getAdapter(provider: string): RuntimeAdapter | null {
  return adapters.get(provider) ?? null;
}

export function getAdapterForRuntime(descriptor: RuntimeDescriptor): RuntimeAdapter | null {
  return getAdapter(descriptor.provider);
}

// 应用启动时注册
export function initializeAdapters(): void {
  registerAdapter(new ClaudeAdapter());
  registerAdapter(new CodexAdapter());
  registerAdapter(new CopilotAdapter());
}
```

---

## 7. 改造现有代码

### 7.1 runner.ts 改造

**策略**：AgentRunner 内部改为通过 adapter 启动 session，事件流从 adapter 获取。

```diff
- private handleLine(line: string): void {
-   const raw = JSON.parse(line);
-   const event = mapStreamJson(raw, this.eventIdx++);
-   this.events.push(event);
-   this.emit('event', event);
- }

+ private async consumeAdapterEvents(session: AdapterSession): Promise<void> {
+   for await (const event of session.events) {
+     this.events.push(event);  // events 类型从 AgentEvent[] 改为 UnifiedAgentEvent[]
+     this.emit('event', event);
+     this.resetIdle();
+   }
+ }
```

**兼容策略**：
- `AgentRunner` 的 `events` 属性类型逐步从 `AgentEvent[]` 变为 `UnifiedAgentEvent[]`
- 现有读 `AgentEvent` 的代码通过 compatibility shim 过渡
- v2 的 `mapStreamJson` 保留但不再被 runner 直接调用（移入 ClaudeAdapter）

### 7.2 dispatch.ts 改造

```diff
- const timeline = summarizeEvents(snapshot?.events ?? [event.event]);
+ const timeline = summarizeUnifiedEvents(snapshot?.events ?? [event.event]);

// 新的 summarizeUnifiedEvents 保留 tool_use 和 thinking 信息：
+ function summarizeUnifiedEvents(events: UnifiedAgentEvent[]): {
+   summary: string;
+   details: string[];
+   toolCalls: number;
+   thinkingDurationMs: number;
+   totalCostUsd: number;
+ }
```

### 7.3 conversation.ts 改造

扩展 `ConversationTurn` 或新增 `ConversationEvent` 来存储事件粒度信息：

```typescript
// 新增，和 ConversationTurn 并列
interface ConversationEvent {
  id: string;
  segmentId: string;
  kind: AgentEventKind;
  timestamp: number;
  text?: string;
  toolName?: string;
  toolInputSummary?: string;
  toolSuccess?: boolean;
  toolOutputSummary?: string;
  durationMs?: number;
  costUsd?: number;
}

// TaskConversation 扩展
interface TaskConversation {
  // ... 现有字段 ...
  events: ConversationEvent[];  // 新增：事件粒度记录
}
```

### 7.4 SpawnOpts 改造

```diff
interface SpawnOpts {
-  claudePath: string;
+  runtimeDescriptor: RuntimeDescriptor;
   prompt: string;
   cwd: string;
+  vendorSessionId?: string;  // 用于 resume
+  traceId: string;
   // ... 其余不变 ...
}
```

---

## 8. 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/shared/agent-event.ts` | 新建 | UnifiedAgentEvent 类型定义 |
| `src/main/agent/adapter/types.ts` | 新建 | RuntimeAdapter 接口 |
| `src/main/agent/adapter/registry.ts` | 新建 | Adapter 注册表 |
| `src/main/agent/adapter/claude-adapter.ts` | 新建 | Claude adapter 完整实现 |
| `src/main/agent/adapter/codex-adapter.ts` | 新建 | Codex adapter stub |
| `src/main/agent/adapter/copilot-adapter.ts` | 新建 | Copilot adapter stub |
| `src/main/agent/adapter/index.ts` | 新建 | barrel export + initializeAdapters |
| `src/main/agent/runner.ts` | 修改 | 通过 adapter 启动 session，事件类型迁移 |
| `src/main/orchestration/dispatch.ts` | 修改 | summarizeEvents → summarizeUnifiedEvents |
| `src/main/orchestration/conversation.ts` | 修改 | 扩展 ConversationEvent 存储 |
| `src/shared/ipc.ts` | 修改 | agent:event 推送 UnifiedAgentEvent |

---

## 9. 验收标准

- [ ] `UnifiedAgentEvent` 类型通过 typecheck
- [ ] ClaudeAdapter 能启动 Claude 进程并产出 UnifiedAgentEvent 流
- [ ] 所有 Claude stream-json event type 都有正确的翻译映射
- [ ] heartbeat 事件每 60 秒注入一次（无其他事件时）
- [ ] CodexAdapter / CopilotAdapter stub 能通过 typecheck
- [ ] runner.ts 通过 adapter 启动，现有测试不回归
- [ ] dispatch.ts 的 summarizeUnifiedEvents 包含 tool_use 信息
- [ ] conversation.ts 能存储和读取 ConversationEvent
- [ ] Playground scenario-01/02/03 通过 Claude adapter 跑通
- [ ] `npm run typecheck` 0 error
- [ ] `npm test` 相关测试绿
