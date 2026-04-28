import type { TraceableEventKind } from './events/kinds';
import type { TraceableEventPayloadMap } from './events/payloads';

export const TRACEABLE_EVENT_SOURCES = ['activity', 'agent', 'inbox', 'ipc', 'conversation', 'runtime', 'synthesis'] as const;
export type TraceableEventSource = (typeof TRACEABLE_EVENT_SOURCES)[number];

/**
 * Phase 1 迁移期：`kind` 与 `type` 并存。
 * - 新代码应提供 `kind`（强类型枚举），bus 会自动镜像到 `type`。
 * - 旧 publisher 仅提供 `type`（任意字符串）；读取端可用
 *   `isTraceableEventKind(event.type)` 后归一化。
 *
 * 详见 docs/thinking-trail/2026-04-29-chat-unification-decoupling/02-app-bus-design.md §3.4。
 */
export interface TraceableEvent {
  id: string;
  at: string;
  source: TraceableEventSource;
  type: string;
  /** 迁移期可选；新 publisher 应提供。`payload` 强类型仅在 kind 存在时生效。 */
  kind?: TraceableEventKind;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId?: string;
  taskId?: string;
  taskUid?: string;
  conversationId?: string;
  summary?: string;
  payload?: unknown;
}

export type { TraceableEventKind } from './events/kinds';
export { TRACEABLE_EVENT_KINDS, isTraceableEventKind } from './events/kinds';
export type { TraceableEventPayloadMap } from './events/payloads';

export interface TraceableEventFilter {
  source?: TraceableEventSource;
  type?: string;
  traceId?: string;
  runId?: string;
  taskId?: string;
  taskUid?: string;
  limit?: number;
}

export interface TraceableEventQueryResult {
  events: TraceableEvent[];
  count: number;
}
