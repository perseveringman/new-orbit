/**
 * RuntimeEvent — Chat ↔ Runtime 协议核心事件流
 *
 * 设计参考：docs/thinking-trail/2026-04-29-chat-unification-decoupling/03-chat-runtime-protocol.md §2
 *
 * 三层结构：
 *   - Core：所有 runtime 必须支持
 *   - Capability-gated：runtime 通过 capabilities 声明启用
 *   - Orbit Extensions：Orbit 自定义
 *
 * RuntimeEvent 是业务无关的执行事件流，Chat 组件直接消费。
 * RuntimeEvent 同时通过 AppBus 以 `agent.run.event` 的 payload 发布。
 */

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
  'runtime.budget_halt'
] as const;

export type RuntimeEventKind = (typeof RUNTIME_EVENT_KINDS)[number];

export type RuntimeMessageRole = 'assistant' | 'user';

export interface RuntimeMessagePayload {
  text: string;
  role?: RuntimeMessageRole;
  isStreaming?: boolean;
  isFinal?: boolean;
}

export interface RuntimeThinkingPayload {
  text: string;
}

export interface RuntimeToolUsePayload {
  toolName: string;
  toolInput?: unknown;
  spanId: string;
}

export interface RuntimeToolResultPayload {
  toolName: string;
  result: string;
  parentSpanId: string;
  isError?: boolean;
}

export interface RuntimeCostPayload {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  totalUsd?: number;
}

export interface RuntimeDonePayload {
  exitCode?: number | null;
  reason?: string;
}

export interface RuntimeErrorPayload {
  code: string;
  message: string;
}

export interface RuntimeHeartbeatPayload {
  /** 占位以避免空对象。 */
  at?: string;
}

export interface RuntimeFileChangePayload {
  path: string;
  operation: 'create' | 'modify' | 'delete' | 'rename';
  diff?: string;
  newPath?: string;
}

export interface RuntimePlanUpdatePayload {
  plan: unknown;
}

export interface RuntimePartialStructuredOutputPayload {
  partial: unknown;
}

export interface RuntimeAwaitingUserPayload {
  hint?: string;
}

export interface RuntimeInterruptPayload {
  reason: string;
}

export interface RuntimeCompactPayload {
  removedTurns: number;
  newContextTokens?: number;
}

export interface RuntimeSessionResumePayload {
  vendorSessionId: string;
}

export interface RuntimeBudgetWarnPayload {
  code: string;
  remaining: number;
}

export interface RuntimeBudgetHaltPayload {
  code: string;
  limit: number;
}

export interface RuntimeEventPayloadMap {
  'runtime.message': RuntimeMessagePayload;
  'runtime.thinking': RuntimeThinkingPayload;
  'runtime.tool_use': RuntimeToolUsePayload;
  'runtime.tool_result': RuntimeToolResultPayload;
  'runtime.cost': RuntimeCostPayload;
  'runtime.done': RuntimeDonePayload;
  'runtime.error': RuntimeErrorPayload;
  'runtime.heartbeat': RuntimeHeartbeatPayload;
  'runtime.file_change': RuntimeFileChangePayload;
  'runtime.plan_update': RuntimePlanUpdatePayload;
  'runtime.partial_structured_output': RuntimePartialStructuredOutputPayload;
  'runtime.awaiting_user': RuntimeAwaitingUserPayload;
  'runtime.interrupt': RuntimeInterruptPayload;
  'runtime.compact': RuntimeCompactPayload;
  'runtime.session_resume': RuntimeSessionResumePayload;
  'runtime.budget_warn': RuntimeBudgetWarnPayload;
  'runtime.budget_halt': RuntimeBudgetHaltPayload;
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
  /** 调试用的原始 vendor 事件。 */
  vendorEvent?: unknown;
}

export function isRuntimeEventKind(value: string): value is RuntimeEventKind {
  return (RUNTIME_EVENT_KINDS as readonly string[]).includes(value);
}
