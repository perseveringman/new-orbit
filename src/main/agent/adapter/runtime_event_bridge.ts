/**
 * UnifiedAgentEvent ↔ RuntimeEvent 翻译层。
 *
 * 设计原则：
 *   - adapter 层继续以 `UnifiedAgentEvent` 为内部表示（向后兼容）。
 *   - 在向 chat 组件 / AppBus / IPC 发布时，使用 `unifiedAgentEventToRuntimeEvent`
 *     将其翻译为业务无关的 `RuntimeEvent`。
 *
 * 参考：docs/thinking-trail/2026-04-29-chat-unification-decoupling/03-chat-runtime-protocol.md §2
 */

import type { UnifiedAgentEvent } from '@shared/agent-event';
import type {
  RuntimeEvent,
  RuntimeEventKind,
  RuntimeEventPayloadMap
} from '@shared/chat-protocol';

const UNIFIED_TO_RUNTIME_KIND: Record<UnifiedAgentEvent['kind'], RuntimeEventKind> = {
  thinking: 'runtime.thinking',
  tool_use: 'runtime.tool_use',
  tool_result: 'runtime.tool_result',
  message: 'runtime.message',
  cost: 'runtime.cost',
  done: 'runtime.done',
  error: 'runtime.error',
  heartbeat: 'runtime.heartbeat'
};

export interface RuntimeEventBridgeContext {
  /** 当前对话 id；缺失时使用 runId 兜底（M3 起会真实绑定）。 */
  conversationId?: string;
}

export function unifiedAgentEventToRuntimeEvent(
  event: UnifiedAgentEvent,
  ctx: RuntimeEventBridgeContext = {}
): RuntimeEvent {
  const kind = UNIFIED_TO_RUNTIME_KIND[event.kind];
  const conversationId = ctx.conversationId ?? event.runId;
  const payload = mapPayload(event, kind);
  return {
    id: event.id,
    at: event.at,
    kind,
    conversationId,
    runId: event.runId,
    spanId: event.spanId,
    ...(event.parentSpanId ? { parentSpanId: event.parentSpanId } : {}),
    payload,
    ...(event.vendorEvent !== undefined ? { vendorEvent: event.vendorEvent } : {})
  } as RuntimeEvent;
}

function mapPayload(
  event: UnifiedAgentEvent,
  kind: RuntimeEventKind
): RuntimeEventPayloadMap[RuntimeEventKind] {
  switch (kind) {
    case 'runtime.message':
      return { text: event.text ?? '' } satisfies RuntimeEventPayloadMap['runtime.message'];
    case 'runtime.thinking':
      return { text: event.text ?? '' } satisfies RuntimeEventPayloadMap['runtime.thinking'];
    case 'runtime.tool_use':
      return {
        toolName: event.toolName ?? 'unknown',
        toolInput: event.vendorEvent,
        spanId: event.spanId
      } satisfies RuntimeEventPayloadMap['runtime.tool_use'];
    case 'runtime.tool_result':
      return {
        toolName: event.toolName ?? 'unknown',
        result: event.text ?? '',
        parentSpanId: event.parentSpanId ?? event.spanId
      } satisfies RuntimeEventPayloadMap['runtime.tool_result'];
    case 'runtime.cost':
      return {
        inputTokens: event.cost?.inputTokens,
        outputTokens: event.cost?.outputTokens,
        cacheReadTokens: event.cost?.cacheReadInputTokens,
        cacheCreationTokens: event.cost?.cacheCreationInputTokens,
        totalUsd: event.cost?.totalCostUsd
      } satisfies RuntimeEventPayloadMap['runtime.cost'];
    case 'runtime.done':
      return {} satisfies RuntimeEventPayloadMap['runtime.done'];
    case 'runtime.error':
      return {
        code: 'runtime_error',
        message: event.text ?? 'unknown error'
      } satisfies RuntimeEventPayloadMap['runtime.error'];
    case 'runtime.heartbeat':
      return { at: event.at } satisfies RuntimeEventPayloadMap['runtime.heartbeat'];
    default:
      // unreachable per UNIFIED_TO_RUNTIME_KIND mapping
      return { text: event.text ?? '' } satisfies RuntimeEventPayloadMap['runtime.message'];
  }
}
