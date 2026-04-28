import Anthropic from '@anthropic-ai/sdk';
import type { RuntimeEvent, RuntimeEventKind, RuntimeEventPayloadMap } from '@shared/chat-protocol';
import type { SDKInvocationInput, SDKResolvedInvocation } from '@shared/runtime';
import { estimateSdkCost } from './cost';

export type SDKRuntimeEventSink = (event: RuntimeEvent) => void | Promise<void>;

export interface SDKInvocationResult {
  text: string;
  eventIds: string[];
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

export class AnthropicSDKAdapter {
  async stream(
    invocation: SDKResolvedInvocation,
    input: SDKInvocationInput,
    emit: SDKRuntimeEventSink
  ): Promise<SDKInvocationResult> {
    const runId = input.traceId ?? `sdk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const conversationId = input.conversationId ?? runId;
    const usage: StreamUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const eventIds: string[] = [];
    let text = '';

    const client = new Anthropic({
      apiKey: invocation.apiKey,
      baseURL: invocation.endpoint.baseURL
    });

    try {
      const stream = await client.messages.create({
        model: invocation.model,
        max_tokens: input.maxTokens ?? 4096,
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        ...(input.system ? { system: input.system } : {}),
        messages: input.messages.map((message) => ({ role: message.role, content: message.content })),
        stream: true
      });

      for await (const vendorEvent of stream as AsyncIterable<unknown>) {
        const mapped = mapAnthropicStreamEvent(vendorEvent);
        if (mapped.text) {
          text += mapped.text;
          const event = runtimeEvent('runtime.message', conversationId, runId, {
            text: mapped.text,
            role: 'assistant',
            isStreaming: true
          }, vendorEvent);
          eventIds.push(event.id);
          await emit(event);
        }
        if (mapped.usage) {
          usage.inputTokens = Math.max(usage.inputTokens, mapped.usage.inputTokens);
          usage.outputTokens = Math.max(usage.outputTokens, mapped.usage.outputTokens);
          usage.cacheReadTokens = Math.max(usage.cacheReadTokens, mapped.usage.cacheReadTokens);
          usage.cacheWriteTokens = Math.max(usage.cacheWriteTokens, mapped.usage.cacheWriteTokens);
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

      const done = runtimeEvent('runtime.done', conversationId, runId, { exitCode: 0, reason: 'sdk_stream_complete' });
      eventIds.push(done.id);
      await emit(done);
      return {
        text,
        eventIds,
        inputTokens: estimate.inputTokens,
        outputTokens: estimate.outputTokens,
        ...(estimate.totalUsd !== undefined ? { totalUsd: estimate.totalUsd } : {})
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const event = runtimeEvent('runtime.error', conversationId, runId, {
        code: 'sdk_stream_failed',
        message
      });
      eventIds.push(event.id);
      await emit(event);
      throw error;
    }
  }

  async test(invocation: SDKResolvedInvocation): Promise<string> {
    const client = new Anthropic({
      apiKey: invocation.apiKey,
      baseURL: invocation.endpoint.baseURL
    });
    const response = await client.messages.create({
      model: invocation.model,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with OK.' }]
    });
    return extractMessageText(response);
  }
}

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
  vendorEvent?: unknown
): RuntimeEvent<K> {
  const spanId = `span-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: `${runId}:${spanId}`,
    at: new Date().toISOString(),
    kind,
    conversationId,
    runId,
    spanId,
    payload,
    ...(vendorEvent ? { vendorEvent } : {})
  };
}
