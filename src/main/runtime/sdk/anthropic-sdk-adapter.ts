import Anthropic from '@anthropic-ai/sdk';
import type { RuntimeEvent, RuntimeEventKind, RuntimeEventPayloadMap } from '@shared/chat-protocol';
import type {
  SDKInvocationInput,
  SDKInvocationMessage,
  SDKInvocationMessageContent,
  SDKInvocationMessageContentBlock,
  SDKResolvedInvocation,
  SDKToolDef
} from '@shared/runtime';
import type {
  AgentTurnAssistantBlock,
  AgentTurnStopReason,
  AgentTurnToolUse
} from '@shared/agent-tools';
import type {
  AgentLLMClient,
  AgentRuntimeEventSink,
  AgentTurnResult,
  AgentTurnUsage
} from '../../agent-tools/llm-client';
import { estimateSdkCost } from './cost';

export type SDKRuntimeEventSink = AgentRuntimeEventSink;

export interface SDKInvocationResult {
  text: string;
  eventIds: string[];
  replayMessages?: SDKInvocationMessage[];
  inputTokens: number;
  outputTokens: number;
  totalUsd?: number;
}

interface StreamUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

const SDK_STREAM_FIRST_EVENT_TIMEOUT_MS = 30_000;
const SDK_STREAM_IDLE_TIMEOUT_MS = 60_000;
const SDK_STREAM_TOTAL_TIMEOUT_MS = 180_000;

/**
 * Anthropic SDK adapter（Phase A：单实现承担两件事）。
 *
 *  - 旧 API：`stream(invocation, input, emit)` 返回 SDKInvocationResult，
 *    用于 RuntimeRouter / 老 ask-anywhere completer 路径，**不传 tools**。
 *  - 新 API：`streamAgentTurn(invocation, input, emit)` 实现 AgentLLMClient，
 *    用于 agent 主循环：传 tools，处理 tool_use_block_start / input_json_delta / content_block_stop，
 *    返回结构化 AgentTurnResult。
 *
 * 两条路径共享同一个底层 Anthropic client 与流处理骨架。
 */
export class AnthropicSDKAdapter implements AgentLLMClient {
  /** 旧 completer 路径（保留以兼容 router.ts 与 sdk_runtime.test.ts）。 */
  async stream(
    invocation: SDKResolvedInvocation,
    input: SDKInvocationInput,
    emit: SDKRuntimeEventSink,
    signal?: AbortSignal
  ): Promise<SDKInvocationResult> {
    const turn = await this.streamAgentTurn(invocation, { ...input, tools: undefined }, emit, signal);
    return {
      text: turn.text,
      eventIds: turn.eventIds,
      ...(turn.assistantBlocks.length > 0
        ? { replayMessages: [{ role: 'assistant', content: turn.assistantBlocks.map(toSdkContentBlock) }] }
        : {}),
      inputTokens: turn.usage.inputTokens,
      outputTokens: turn.usage.outputTokens,
      ...(turn.totalUsd !== undefined ? { totalUsd: turn.totalUsd } : {})
    };
  }

  /**
   * 新 agent turn 入口。
   * - 接受 SDKInvocationInput.tools / toolChoice
   * - 流式累积 text 与 tool_use（按 content block index 分桶）
   * - 在 turn 结束聚合 cost & done 事件
   * - 可选 AbortSignal：中止时 fetch 会抛，我们在外层转成 runtime.error + 向上抛
   */
  async streamAgentTurn(
    invocation: SDKResolvedInvocation,
    input: SDKInvocationInput,
    emit: AgentRuntimeEventSink,
    signal?: AbortSignal
  ): Promise<AgentTurnResult> {
    const runId = input.traceId ?? `sdk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const conversationId = input.conversationId ?? runId;
    const turnSpanSeed = `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const usage: StreamUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const eventIds: string[] = [];

    /** 按 content_block.index 累积块状态。 */
    interface BlockSlot {
      type: 'text' | 'tool_use' | 'thinking' | 'redacted_thinking' | 'unknown';
      text: string;
      signature?: string;
      redactedData?: string;
      tool?: { id: string; name: string; jsonAcc: string };
    }
    const slots = new Map<number, BlockSlot>();
    /** 最终顺序保留的 assistant blocks（按 index 升序）。 */
    let assistantText = '';

    const client = new Anthropic({
      apiKey: invocation.apiKey,
      baseURL: invocation.endpoint.baseURL
    });

    let stopReason: AgentTurnStopReason = 'end_turn';
    const streamAbort = createLinkedAbortController(signal);
    let streamTimeoutError: Error | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let totalTimer: ReturnType<typeof setTimeout> | undefined;
    const abortStream = (code: string, ms: number): void => {
      if (streamAbort.controller.signal.aborted) return;
      streamTimeoutError = new Error(`${code}:${ms}`);
      streamAbort.controller.abort(streamTimeoutError);
    };
    const armIdleTimer = (code: string, ms: number): void => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => abortStream(code, ms), ms);
    };

    try {
      const requestBody: Anthropic.Messages.MessageCreateParamsStreaming = {
        model: invocation.model,
        max_tokens: input.maxTokens ?? 4096,
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        ...(input.system ? { system: input.system } : {}),
        messages: input.messages.map(toAnthropicMessage),
        ...(input.tools && input.tools.length > 0 ? { tools: toAnthropicTools(input.tools) } : {}),
        ...(input.toolChoice ? { tool_choice: toAnthropicToolChoice(input.toolChoice) } : {}),
        stream: true
      };
      totalTimer = setTimeout(
        () => abortStream('sdk_stream_turn_timeout', SDK_STREAM_TOTAL_TIMEOUT_MS),
        SDK_STREAM_TOTAL_TIMEOUT_MS
      );
      armIdleTimer('sdk_stream_first_event_timeout', SDK_STREAM_FIRST_EVENT_TIMEOUT_MS);
      const stream = await client.messages.create(requestBody, { signal: streamAbort.controller.signal });

      for await (const vendorEvent of stream as AsyncIterable<unknown>) {
        armIdleTimer('sdk_stream_idle_timeout', SDK_STREAM_IDLE_TIMEOUT_MS);
        // 1) text delta + tool_use input_json_delta：按 index 路由
        const blockUpdate = mapAgentStreamEvent(vendorEvent);
        if (blockUpdate) {
          let slot = slots.get(blockUpdate.index);
          if (!slot) {
            slot = { type: 'unknown', text: '' };
            slots.set(blockUpdate.index, slot);
          }
          if (blockUpdate.kind === 'block_start') {
            slot.type = blockUpdate.blockType;
            if (blockUpdate.blockType === 'tool_use' && blockUpdate.toolUse) {
              slot.tool = { id: blockUpdate.toolUse.id, name: blockUpdate.toolUse.name, jsonAcc: '' };
            }
            if (blockUpdate.blockType === 'thinking') {
              slot.text = blockUpdate.thinking ?? slot.text;
              slot.signature = blockUpdate.signature ?? slot.signature;
            }
            if (blockUpdate.blockType === 'redacted_thinking') {
              slot.redactedData = blockUpdate.redactedData ?? slot.redactedData;
            }
          } else if (blockUpdate.kind === 'text_delta' && typeof blockUpdate.text === 'string') {
            slot.text += blockUpdate.text;
            assistantText += blockUpdate.text;
            const event = runtimeEvent('runtime.message', conversationId, runId, {
              text: blockUpdate.text,
              role: 'assistant',
              isStreaming: true
            }, vendorEvent);
            eventIds.push(event.id);
            await emit(event);
          } else if (blockUpdate.kind === 'input_json_delta' && typeof blockUpdate.partialJson === 'string') {
            if (slot.tool) slot.tool.jsonAcc += blockUpdate.partialJson;
          } else if (blockUpdate.kind === 'block_stop') {
            // tool_use 块在 stop 时尝试解析 JSON 并发 runtime.tool_use
            if (slot.type === 'tool_use' && slot.tool) {
              const toolUse = finalizeToolUse(slot.tool);
              const ev = runtimeEvent(
                'runtime.tool_use',
                conversationId,
                runId,
                {
                  toolName: toolUse.name,
                  toolInput: toolUse.parseError ? slot.tool.jsonAcc : toolUse.input,
                  spanId: toolUse.id
                },
                vendorEvent,
                { spanId: toolUse.id }
              );
              eventIds.push(ev.id);
              await emit(ev);
            }
          } else if (blockUpdate.kind === 'thinking_delta' && typeof blockUpdate.thinking === 'string') {
            slot.text += blockUpdate.thinking;
            const event = runtimeEvent('runtime.thinking', conversationId, runId, {
              text: blockUpdate.thinking
            }, vendorEvent, {
              spanId: `${turnSpanSeed}:thinking:${blockUpdate.index}`
            });
            eventIds.push(event.id);
            await emit(event);
          } else if (blockUpdate.kind === 'signature_delta' && typeof blockUpdate.signature === 'string') {
            slot.signature = blockUpdate.signature;
          } else if (blockUpdate.kind === 'message_delta_stop' && blockUpdate.stopReason) {
            stopReason = normalizeStopReason(blockUpdate.stopReason);
          }
        }

        // 2) usage（可能出现在多种事件里）
        const u = extractUsage((vendorEvent as Record<string, unknown>)?.['message']) ??
                  extractUsage((vendorEvent as Record<string, unknown>)?.['usage']) ??
                  extractUsage((vendorEvent as Record<string, unknown>)?.['delta']);
        if (u) {
          usage.inputTokens = Math.max(usage.inputTokens, u.inputTokens);
          usage.outputTokens = Math.max(usage.outputTokens, u.outputTokens);
          usage.cacheReadTokens = Math.max(usage.cacheReadTokens, u.cacheReadTokens);
          usage.cacheWriteTokens = Math.max(usage.cacheWriteTokens, u.cacheWriteTokens);
        }
      }

      // 整理 assistantBlocks（按 index 顺序）
      const orderedIdx = [...slots.keys()].sort((a, b) => a - b);
      const assistantBlocks: AgentTurnAssistantBlock[] = [];
      const toolUses: AgentTurnToolUse[] = [];
      for (const idx of orderedIdx) {
        const slot = slots.get(idx);
        if (!slot) continue;
        if (slot.type === 'text') {
          if (slot.text) assistantBlocks.push({ type: 'text', text: slot.text });
        } else if (slot.type === 'tool_use' && slot.tool) {
          const finalized = finalizeToolUse(slot.tool);
          assistantBlocks.push({
            type: 'tool_use',
            id: finalized.id,
            name: finalized.name,
            // 解析失败时回退到原始 partial json string，下游会用 parseError 标记
            input: finalized.parseError ? {} : finalized.input
          });
          toolUses.push(finalized);
        } else if (slot.type === 'thinking' && (slot.text || slot.signature)) {
          assistantBlocks.push({
            type: 'thinking',
            thinking: slot.text,
            signature: slot.signature ?? ''
          });
        } else if (slot.type === 'redacted_thinking' && slot.redactedData) {
          assistantBlocks.push({
            type: 'redacted_thinking',
            data: slot.redactedData
          });
        }
      }

      const estimate = estimateSdkCost({
        profile: invocation.endpoint.costProfile,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens
      });
      const costEvent = runtimeEvent('runtime.cost', conversationId, runId, {
        inputTokens: estimate.inputTokens,
        outputTokens: estimate.outputTokens,
        cacheReadTokens: estimate.cacheReadTokens,
        cacheCreationTokens: estimate.cacheWriteTokens,
        ...(estimate.totalUsd !== undefined ? { totalUsd: estimate.totalUsd } : {})
      });
      eventIds.push(costEvent.id);
      await emit(costEvent);

      const done = runtimeEvent('runtime.done', conversationId, runId, {
        exitCode: 0,
        reason: stopReason === 'tool_use' ? 'sdk_turn_pending_tools' : 'sdk_stream_complete'
      });
      eventIds.push(done.id);
      await emit(done);

      const turnUsage: AgentTurnUsage = {
        inputTokens: estimate.inputTokens,
        outputTokens: estimate.outputTokens,
        cacheReadTokens: estimate.cacheReadTokens,
        cacheWriteTokens: estimate.cacheWriteTokens
      };
      return {
        assistantBlocks,
        text: assistantText,
        toolUses,
        stopReason,
        usage: turnUsage,
        eventIds,
        ...(estimate.totalUsd !== undefined ? { totalUsd: estimate.totalUsd } : {})
      };
    } catch (error) {
      const actualError = streamTimeoutError ?? error;
      const message = actualError instanceof Error ? actualError.message : String(actualError);
      const event = runtimeEvent('runtime.error', conversationId, runId, {
        code: streamTimeoutError ? message.split(':')[0] || 'sdk_stream_timeout' : 'sdk_stream_failed',
        message
      });
      eventIds.push(event.id);
      await emit(event);
      throw actualError;
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      if (totalTimer) clearTimeout(totalTimer);
      streamAbort.cleanup();
    }
  }

  async test(invocation: SDKResolvedInvocation, prompt?: string): Promise<string> {
    const client = new Anthropic({
      apiKey: invocation.apiKey,
      baseURL: invocation.endpoint.baseURL
    });
    const userPrompt = prompt?.trim() ? prompt.trim() : 'Reply with OK.';
    const response = await client.messages.create({
      model: invocation.model,
      max_tokens: prompt?.trim() ? 1024 : 16,
      messages: [{ role: 'user', content: userPrompt }]
    });
    return extractMessageText(response);
  }
}

/** 兼容旧 sdk_runtime.test.ts 的导出（保留原行为）。 */
export function mapAnthropicStreamEvent(event: unknown): { text?: string; usage?: StreamUsage } {
  if (!event || typeof event !== 'object') return {};
  const record = event as Record<string, unknown>;
  const type = record['type'];
  if (type === 'content_block_delta') {
    const delta = record['delta'];
    if (delta && typeof delta === 'object') {
      const d = delta as Record<string, unknown>;
      if (d['type'] === 'text_delta' && typeof d['text'] === 'string') return { text: d['text'] };
    }
  }
  const usage = extractUsage(record['message']) ?? extractUsage(record['usage']) ?? extractUsage(record['delta']);
  return usage ? { usage } : {};
}

// =================================================================================
// Internal helpers
// =================================================================================

interface AgentBlockUpdate {
  index: number;
  kind:
    | 'block_start'
    | 'text_delta'
    | 'thinking_delta'
    | 'signature_delta'
    | 'input_json_delta'
    | 'block_stop'
    | 'message_delta_stop';
  blockType: 'text' | 'tool_use' | 'thinking' | 'redacted_thinking' | 'unknown';
  text?: string;
  thinking?: string;
  signature?: string;
  redactedData?: string;
  partialJson?: string;
  toolUse?: { id: string; name: string };
  stopReason?: string;
}

/**
 * 统一处理 Anthropic 流事件（注意：Phase A 不处理 thinking 事件流，留 Phase B+）。
 * 返回 null 表示该 vendor event 与 agent block 无关（例如 message_start 仅带 usage）。
 *
 * 导出仅供测试：tests/agent_adapter_stream.test.ts
 */
export function mapAgentStreamEvent(event: unknown): AgentBlockUpdate | null {
  if (!event || typeof event !== 'object') return null;
  const record = event as Record<string, unknown>;
  const type = record['type'];
  if (type === 'content_block_start') {
    const indexRaw = record['index'];
    const index = typeof indexRaw === 'number' ? indexRaw : 0;
    const block = (record['content_block'] ?? {}) as Record<string, unknown>;
    const bt = block['type'];
    if (bt === 'tool_use') {
      const id = typeof block['id'] === 'string' ? (block['id'] as string) : '';
      const name = typeof block['name'] === 'string' ? (block['name'] as string) : '';
      return {
        index,
        kind: 'block_start',
        blockType: 'tool_use',
        toolUse: { id, name }
      };
    }
    if (bt === 'text') return { index, kind: 'block_start', blockType: 'text' };
    if (bt === 'thinking') {
      return {
        index,
        kind: 'block_start',
        blockType: 'thinking',
        ...(typeof block['thinking'] === 'string' ? { thinking: block['thinking'] as string } : {}),
        ...(typeof block['signature'] === 'string' ? { signature: block['signature'] as string } : {})
      };
    }
    if (bt === 'redacted_thinking') {
      return {
        index,
        kind: 'block_start',
        blockType: 'redacted_thinking',
        ...(typeof block['data'] === 'string' ? { redactedData: block['data'] as string } : {})
      };
    }
    return { index, kind: 'block_start', blockType: 'unknown' };
  }
  if (type === 'content_block_delta') {
    const indexRaw = record['index'];
    const index = typeof indexRaw === 'number' ? indexRaw : 0;
    const delta = (record['delta'] ?? {}) as Record<string, unknown>;
    if (delta['type'] === 'text_delta' && typeof delta['text'] === 'string') {
      return { index, kind: 'text_delta', blockType: 'text', text: delta['text'] };
    }
    if (delta['type'] === 'thinking_delta' && typeof delta['thinking'] === 'string') {
      return { index, kind: 'thinking_delta', blockType: 'thinking', thinking: delta['thinking'] };
    }
    if (delta['type'] === 'signature_delta' && typeof delta['signature'] === 'string') {
      return { index, kind: 'signature_delta', blockType: 'thinking', signature: delta['signature'] };
    }
    if (delta['type'] === 'input_json_delta' && typeof delta['partial_json'] === 'string') {
      return {
        index,
        kind: 'input_json_delta',
        blockType: 'tool_use',
        partialJson: delta['partial_json']
      };
    }
    return null;
  }
  if (type === 'content_block_stop') {
    const indexRaw = record['index'];
    const index = typeof indexRaw === 'number' ? indexRaw : 0;
    return { index, kind: 'block_stop', blockType: 'unknown' };
  }
  if (type === 'message_delta') {
    const delta = (record['delta'] ?? {}) as Record<string, unknown>;
    if (typeof delta['stop_reason'] === 'string') {
      return {
        index: -1,
        kind: 'message_delta_stop',
        blockType: 'unknown',
        stopReason: delta['stop_reason'] as string
      };
    }
  }
  return null;
}

function finalizeToolUse(slot: { id: string; name: string; jsonAcc: string }): AgentTurnToolUse {
  const json = slot.jsonAcc.trim();
  if (json.length === 0) {
    return { id: slot.id, name: slot.name, input: {} };
  }
  try {
    return { id: slot.id, name: slot.name, input: JSON.parse(json) };
  } catch (err) {
    return {
      id: slot.id,
      name: slot.name,
      input: undefined,
      parseError: err instanceof Error ? err.message : 'invalid_json'
    };
  }
}

function normalizeStopReason(value: string): AgentTurnStopReason {
  if (value === 'tool_use') return 'tool_use';
  if (value === 'max_tokens') return 'max_tokens';
  if (value === 'stop_sequence') return 'stop_sequence';
  return 'end_turn';
}

function toAnthropicMessage(message: SDKInvocationMessage): Anthropic.Messages.MessageParam {
  return { role: message.role, content: toAnthropicContent(message.content) };
}

function toAnthropicContent(content: SDKInvocationMessageContent): Anthropic.Messages.MessageParam['content'] {
  if (typeof content === 'string') return content;
  return content.map(toAnthropicContentBlock);
}

function toAnthropicContentBlock(block: SDKInvocationMessageContentBlock): Anthropic.Messages.ContentBlockParam {
  if (block.type === 'text') return { type: 'text', text: block.text };
  if (block.type === 'thinking') {
    return { type: 'thinking', thinking: block.thinking, signature: block.signature };
  }
  if (block.type === 'redacted_thinking') {
    return { type: 'redacted_thinking', data: block.data };
  }
  if (block.type === 'tool_use') {
    return {
      type: 'tool_use',
      id: block.id,
      name: block.name,
      input: (block.input ?? {}) as Record<string, unknown>
    };
  }
  // tool_result
  return {
    type: 'tool_result',
    tool_use_id: block.tool_use_id,
    content: block.content,
    ...(block.is_error ? { is_error: true } : {})
  };
}

function toSdkContentBlock(block: AgentTurnAssistantBlock): SDKInvocationMessageContentBlock {
  if (block.type === 'text') return { type: 'text', text: block.text };
  if (block.type === 'thinking') {
    return { type: 'thinking', thinking: block.thinking, signature: block.signature };
  }
  if (block.type === 'redacted_thinking') {
    return { type: 'redacted_thinking', data: block.data };
  }
  return {
    type: 'tool_use',
    id: block.id,
    name: block.name,
    input: block.input ?? {}
  };
}

function toAnthropicTools(tools: SDKToolDef[]): Anthropic.Messages.ToolUnion[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Messages.Tool.InputSchema
  }));
}

function toAnthropicToolChoice(
  choice: NonNullable<SDKInvocationInput['toolChoice']>
): Anthropic.Messages.ToolChoice {
  if (choice === 'auto') return { type: 'auto' };
  if (choice === 'any') return { type: 'any' };
  return { type: 'tool', name: choice.name };
}

function createLinkedAbortController(upstream?: AbortSignal): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  if (!upstream) return { controller, cleanup: () => undefined };
  const forwardAbort = (): void => {
    if (!controller.signal.aborted) controller.abort(upstream.reason);
  };
  if (upstream.aborted) {
    forwardAbort();
    return { controller, cleanup: () => undefined };
  }
  upstream.addEventListener('abort', forwardAbort, { once: true });
  return {
    controller,
    cleanup: () => upstream.removeEventListener('abort', forwardAbort)
  };
}

function extractUsage(value: unknown): StreamUsage | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const usage = (record['usage'] && typeof record['usage'] === 'object')
    ? (record['usage'] as Record<string, unknown>)
    : record;
  const inputTokens = numberValue(usage['input_tokens']);
  const outputTokens = numberValue(usage['output_tokens']);
  const cacheReadTokens = numberValue(usage['cache_read_input_tokens']);
  const cacheWriteTokens = numberValue(usage['cache_creation_input_tokens']);
  if (!inputTokens && !outputTokens && !cacheReadTokens && !cacheWriteTokens) return null;
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens };
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function extractMessageText(response: unknown): string {
  if (!response || typeof response !== 'object') return '';
  const content = (response as Record<string, unknown>)['content'];
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      if (!block || typeof block !== 'object') return '';
      const record = block as Record<string, unknown>;
      return record['type'] === 'text' && typeof record['text'] === 'string' ? record['text'] : '';
    })
    .join('');
}

function runtimeEvent<K extends RuntimeEventKind>(
  kind: K,
  conversationId: string,
  runId: string,
  payload: RuntimeEventPayloadMap[K],
  vendorEvent?: unknown,
  options?: { spanId?: string; parentSpanId?: string }
): RuntimeEvent<K> {
  const spanId = options?.spanId ?? `span-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const eventId = `${runId}:${spanId}:${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: eventId,
    at: new Date().toISOString(),
    kind,
    conversationId,
    runId,
    spanId,
    payload,
    ...(options?.parentSpanId ? { parentSpanId: options.parentSpanId } : {}),
    ...(vendorEvent ? { vendorEvent } : {})
  };
}
