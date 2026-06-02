import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import type { RuntimeEvent, RuntimeEventKind, RuntimeEventPayloadMap } from '@shared/chat-protocol';

export type RuntimeEventWindowProvider = () => BrowserWindow[];

export function createAskRuntimeEvent<K extends RuntimeEventKind>(input: {
  kind: K;
  conversationId: string;
  runId: string;
  payload: RuntimeEventPayloadMap[K];
  spanId?: string;
  parentSpanId?: string;
}): RuntimeEvent<K> {
  const spanId = input.spanId ?? `${input.kind.replace(/^runtime\./, 'ask')}-${randomUUID()}`;
  return {
    id: `${input.runId}:${spanId}:${randomUUID()}`,
    at: new Date().toISOString(),
    kind: input.kind,
    conversationId: input.conversationId,
    runId: input.runId,
    spanId,
    payload: input.payload,
    ...(input.parentSpanId ? { parentSpanId: input.parentSpanId } : {})
  };
}

export function broadcastAskRuntimeEvent(
  event: RuntimeEvent,
  windows: RuntimeEventWindowProvider = BrowserWindow.getAllWindows
): void {
  for (const window of windows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC.chat.runtimeEvent, event);
  }
}

export function emitAskRuntimeEvent<K extends RuntimeEventKind>(input: {
  kind: K;
  conversationId: string;
  runId: string;
  payload: RuntimeEventPayloadMap[K];
  spanId?: string;
  parentSpanId?: string;
  windows?: RuntimeEventWindowProvider;
}): RuntimeEvent<K> {
  const event = createAskRuntimeEvent(input);
  broadcastAskRuntimeEvent(event, input.windows);
  return event;
}
