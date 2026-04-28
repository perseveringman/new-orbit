/**
 * Renderer 端：把旧的 AgentEvent / TaskConversation.turns 翻译为
 * 业务无关的 RuntimeEvent[]，供新 ChatView 消费。
 *
 * 对应 main 端 src/main/agent/adapter/runtime_event_bridge.ts。
 */

import type { AgentEvent } from '@shared/agent';
import type { RuntimeEvent, RuntimeEventKind } from '@shared/chat-protocol';
import type { ConversationTurn, RunSegment, TaskConversation } from '@shared/orchestration';

const AGENT_TO_RUNTIME_KIND: Partial<Record<AgentEvent['kind'], RuntimeEventKind>> = {
  message: 'runtime.message',
  text: 'runtime.message',
  thinking: 'runtime.thinking',
  tool_use: 'runtime.tool_use',
  tool_result: 'runtime.tool_result',
  cost: 'runtime.cost',
  done: 'runtime.done',
  error: 'runtime.error'
};

export interface MapContext {
  conversationId: string;
  runId: string;
  segmentId?: string;
}

export function agentEventToRuntimeEvent(
  event: AgentEvent,
  ctx: MapContext
): RuntimeEvent | null {
  const kind = AGENT_TO_RUNTIME_KIND[event.kind];
  if (!kind) return null;
  const spanId = `${ctx.runId}:${event.idx}`;
  const base = {
    id: `${ctx.runId}:${event.idx}`,
    at: event.at,
    conversationId: ctx.conversationId,
    runId: ctx.runId,
    spanId
  };

  switch (kind) {
    case 'runtime.message':
      return {
        ...base,
        kind,
        payload: { text: event.text ?? '', role: 'assistant' }
      } as RuntimeEvent;
    case 'runtime.thinking':
      return { ...base, kind, payload: { text: event.text ?? '' } } as RuntimeEvent;
    case 'runtime.tool_use':
      return {
        ...base,
        kind,
        payload: { toolName: event.toolName ?? 'unknown', toolInput: event.data, spanId }
      } as RuntimeEvent;
    case 'runtime.tool_result':
      return {
        ...base,
        kind,
        payload: {
          toolName: event.toolName ?? 'unknown',
          result: event.text ?? '',
          parentSpanId: spanId
        }
      } as RuntimeEvent;
    case 'runtime.cost':
      return {
        ...base,
        kind,
        payload: {
          inputTokens: event.input_tokens,
          outputTokens: event.output_tokens,
          cacheReadTokens: event.cache_read_input_tokens,
          cacheCreationTokens: event.cache_creation_input_tokens,
          totalUsd: event.total_cost_usd
        }
      } as RuntimeEvent;
    case 'runtime.done':
      return { ...base, kind, payload: {} } as RuntimeEvent;
    case 'runtime.error':
      return {
        ...base,
        kind,
        payload: { code: 'runtime_error', message: event.text ?? 'unknown error' }
      } as RuntimeEvent;
    default:
      return null;
  }
}

export function turnToRuntimeEvents(
  turn: ConversationTurn,
  ctx: { conversationId: string }
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  const runId = turn.segmentId ?? turn.id;
  const text = turn.content?.trim() ?? '';
  if (!text) return events;
  events.push({
    id: turn.id,
    at: turn.createdAt,
    kind: 'runtime.message',
    conversationId: ctx.conversationId,
    runId,
    spanId: turn.id,
    payload: { text, role: turn.role === 'user' ? 'user' : 'assistant' }
  } as RuntimeEvent);
  return events;
}

export function buildRuntimeEventsFromConversation(
  conversation: TaskConversation,
  liveEvents: { runId: string; events: AgentEvent[] }[] = []
): RuntimeEvent[] {
  const conversationId = conversation.taskId;
  const events: RuntimeEvent[] = [];
  for (const turn of conversation.turns) {
    events.push(...turnToRuntimeEvents(turn, { conversationId }));
  }
  for (const live of liveEvents) {
    for (const ev of live.events) {
      const mapped = agentEventToRuntimeEvent(ev, {
        conversationId,
        runId: live.runId
      });
      if (mapped) events.push(mapped);
    }
  }
  return events;
}

export function pickRunningSegments(conversation: TaskConversation | null): RunSegment[] {
  if (!conversation) return [];
  return conversation.segments.filter(
    (segment) => segment.status === 'running' && segment.runId
  );
}
