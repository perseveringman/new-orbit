import type { RuntimeProvider } from './orchestration';

export const UNIFIED_AGENT_EVENT_KINDS = [
  'thinking',
  'tool_use',
  'tool_result',
  'message',
  'cost',
  'done',
  'error',
  'heartbeat'
] as const;

export type UnifiedAgentEventKind = (typeof UNIFIED_AGENT_EVENT_KINDS)[number];

export interface UnifiedAgentRuntimeRef {
  provider: RuntimeProvider;
  runtimeId?: string;
  name?: string;
}

export interface UnifiedAgentCost {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  totalCostUsd?: number;
}

export interface UnifiedAgentEvent {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  at: string;
  kind: UnifiedAgentEventKind;
  runtime: UnifiedAgentRuntimeRef;
  runId: string;
  taskId?: string;
  vendorSessionId?: string;
  text?: string;
  toolName?: string;
  cost?: UnifiedAgentCost;
  vendorEvent?: unknown;
  metadata?: Record<string, string>;
}

export interface UnifiedAgentEventContext {
  runId: string;
  taskId?: string | null;
  runtime: UnifiedAgentRuntimeRef;
  traceId?: string;
  parentSpanId?: string;
  vendorSessionId?: string;
}

export function createUnifiedAgentEvent(
  kind: UnifiedAgentEventKind,
  context: UnifiedAgentEventContext,
  partial: Omit<
    Partial<UnifiedAgentEvent>,
    'kind' | 'runtime' | 'runId' | 'taskId' | 'traceId' | 'parentSpanId'
  > = {}
): UnifiedAgentEvent {
  const traceId = context.traceId ?? `trace-${context.runId}`;
  const spanId = partial.spanId ?? `span-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    ...partial,
    id: partial.id ?? `${traceId}:${spanId}`,
    traceId,
    spanId,
    ...(context.parentSpanId ? { parentSpanId: context.parentSpanId } : {}),
    at: partial.at ?? new Date().toISOString(),
    kind,
    runtime: context.runtime,
    runId: context.runId,
    ...(context.taskId ? { taskId: context.taskId } : {}),
    ...(context.vendorSessionId || partial.vendorSessionId
      ? { vendorSessionId: partial.vendorSessionId ?? context.vendorSessionId }
      : {})
  };
}
