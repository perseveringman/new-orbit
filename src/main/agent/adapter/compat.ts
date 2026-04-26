import type { AgentEvent, AgentEventKind } from '@shared/agent';
import {
  createUnifiedAgentEvent,
  type UnifiedAgentEvent,
  type UnifiedAgentEventContext,
  type UnifiedAgentEventKind
} from '@shared/agent-event';

export function agentEventKindToUnified(kind: AgentEventKind): UnifiedAgentEventKind {
  if (kind === 'text') return 'message';
  if (kind === 'hydrate') return 'tool_use';
  if (kind === 'budget_warn') return 'cost';
  if (kind === 'budget_halt') return 'error';
  return kind;
}

export function agentEventToUnifiedAgentEvent(
  event: AgentEvent,
  context: UnifiedAgentEventContext
): UnifiedAgentEvent {
  const vendorSessionId = context.vendorSessionId ?? extractVendorSessionId(event.data);
  return createUnifiedAgentEvent(agentEventKindToUnified(event.kind), {
    ...context,
    ...(vendorSessionId ? { vendorSessionId } : {})
  }, {
    id: `${context.traceId ?? `trace-${context.runId}`}:agent-event-${event.idx}`,
    spanId: `agent-event-${event.idx}`,
    at: event.at,
    text: event.text,
    toolName: event.toolName,
    vendorEvent: event.data ?? event,
    ...(event.kind === 'cost' || event.kind === 'budget_warn' || event.kind === 'budget_halt'
      ? {
          cost: {
            inputTokens: event.input_tokens,
            outputTokens: event.output_tokens,
            cacheReadInputTokens: event.cache_read_input_tokens,
            cacheCreationInputTokens: event.cache_creation_input_tokens,
            totalCostUsd: event.total_cost_usd
          }
        }
      : {})
  });
}

export function extractVendorSessionIdFromAgentEvents(events: AgentEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const vendorSessionId = extractVendorSessionId(events[i]?.data);
    if (vendorSessionId) return vendorSessionId;
  }
  return undefined;
}

function extractVendorSessionId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const direct = record['session_id'] ?? record['sessionId'] ?? record['conversation_id'];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const message = record['message'];
  if (message && typeof message === 'object') {
    const nested = message as Record<string, unknown>;
    const nestedValue = nested['session_id'] ?? nested['sessionId'] ?? nested['conversation_id'];
    if (typeof nestedValue === 'string' && nestedValue.trim()) return nestedValue.trim();
  }
  return undefined;
}
