import { setTimeout as sleep } from 'node:timers/promises';
import type { RuntimeEvent } from '@shared/chat-protocol';
import type { ExternalGatewayOutboundEvent } from '@shared/external-gateway-protocol';
import type { ExternalGatewayRouteDecision } from '@shared/external-gateway';
import { getPool, type PoolEvent } from '../../agent/pool';
import { unifiedAgentEventToRuntimeEvent } from '../../agent/adapter/runtime_event_bridge';
import { getAskAnywhereOrchestrator } from '../../ask-anywhere/ipc';
import type { ExternalCapabilityContext } from '../capability-registry';
import { requestText, throwIfAborted, type MessageSubmitRequest } from './helpers';

export async function* handleAskAnywhere(
  request: MessageSubmitRequest,
  decision: ExternalGatewayRouteDecision,
  context: ExternalCapabilityContext,
  signal: AbortSignal
): AsyncGenerator<ExternalGatewayOutboundEvent> {
  const text = requestText(request, decision.params);
  const session = await context.sessionBridge.resolveSession({ sessionId: request.sessionId, user: request.user });
  const queue = new AsyncEventQueue<ExternalGatewayOutboundEvent>();
  const pool = getPool();
  let runId: string | null = null;
  let sawAssistantText = false;
  let terminalSent = false;

  const listener = (event: PoolEvent): void => {
    if (event.conversationId !== session.conversationId) return;
    if (runId && event.runId !== runId) return;
    const runtimeEvent = unifiedAgentEventToRuntimeEvent(event.unifiedEvent, { conversationId: session.conversationId });
    const outbound = runtimeEventToExternalEvent(request.requestId, runtimeEvent);
    if (!outbound) return;
    if (outbound.type === 'text.delta') sawAssistantText = true;
    queue.push(outbound);
  };
  pool.on('event', listener);

  void (async () => {
    try {
      queue.push({ type: 'progress', requestId: request.requestId, stage: 'ask_anywhere.starting' });
      throwIfAborted(signal);
      const result = await getAskAnywhereOrchestrator().send(session.conversationId, text);
      runId = result.runId;
      const runner = pool.get(result.runId);
      if (runner) {
        await new Promise<void>((resolve) => runner.once('exit', () => resolve()));
      } else {
        await waitForConversationRunToFinish(context, session.conversationId, signal);
      }
      if (!sawAssistantText) {
        const conversation = await context.sessionBridge.conversationOrchestrator().getConversation(session.conversationId);
        const lastAssistant = conversation?.turns.filter((turn) => turn.role === 'assistant').at(-1);
        if (lastAssistant?.content) queue.push({ type: 'text.delta', requestId: request.requestId, text: lastAssistant.content });
      }
      terminalSent = true;
      queue.push({ type: 'request.completed', requestId: request.requestId, summary: 'Ask-Anywhere response completed.' });
    } catch (error) {
      terminalSent = true;
      queue.push({
        type: 'request.failed',
        requestId: request.requestId,
        error: { code: errorCode(error), message: error instanceof Error ? error.message : String(error) }
      });
    } finally {
      pool.off('event', listener);
      if (!terminalSent && signal.aborted) {
        queue.push({
          type: 'request.failed',
          requestId: request.requestId,
          error: { code: 'request_cancelled', message: 'Request was cancelled.' }
        });
      }
      queue.close();
    }
  })();

  for await (const event of queue.drain()) {
    yield event;
  }
}

function runtimeEventToExternalEvent(requestId: string, event: RuntimeEvent): ExternalGatewayOutboundEvent | null {
  if (event.kind === 'runtime.message') {
    const payload = event.payload as { text?: string };
    return payload.text ? { type: 'text.delta', requestId, text: payload.text } : null;
  }
  if (event.kind === 'runtime.thinking') {
    const payload = event.payload as { text?: string };
    return { type: 'progress', requestId, stage: 'thinking', detail: payload.text };
  }
  if (event.kind === 'runtime.tool_use') {
    const payload = event.payload as { toolName?: string };
    return { type: 'progress', requestId, stage: 'tool_use', detail: payload.toolName };
  }
  if (event.kind === 'runtime.error') {
    const payload = event.payload as { code?: string; message?: string };
    return {
      type: 'request.failed',
      requestId,
      error: { code: payload.code ?? 'runtime_error', message: payload.message ?? 'Runtime error.' }
    };
  }
  return null;
}

async function waitForConversationRunToFinish(
  context: ExternalCapabilityContext,
  conversationId: string,
  signal: AbortSignal
): Promise<void> {
  for (let i = 0; i < 240; i += 1) {
    throwIfAborted(signal);
    const conversation = await context.sessionBridge.conversationOrchestrator().getConversation(conversationId);
    if (!conversation?.currentRunId) return;
    await sleep(500, undefined, { signal }).catch((error: unknown) => {
      if (signal.aborted) throw new Error('request_cancelled');
      throw error;
    });
  }
  throw new Error('ask_anywhere_timeout');
}

function errorCode(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown_error';
  return error.message.split(':')[0] || 'unknown_error';
}

class AsyncEventQueue<T> {
  private readonly values: T[] = [];
  private waiters: Array<(value: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value, done: false });
    else this.values.push(value);
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined as T, done: true });
  }

  async *drain(): AsyncGenerator<T> {
    while (true) {
      if (this.values.length) {
        yield this.values.shift() as T;
        continue;
      }
      if (this.closed) return;
      const next = await new Promise<IteratorResult<T>>((resolve) => this.waiters.push(resolve));
      if (next.done) return;
      yield next.value;
    }
  }
}
