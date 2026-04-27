import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import type {
  TraceableEvent,
  TraceableEventKind,
  TraceableEventSource
} from '@shared/events';
import { isTraceableEventKind } from '@shared/events';
import type { TraceableEventPayloadMap } from '@shared/events/payloads';
import { TraceableEventStore } from './store';
import { RunRecorder } from './run-recorder';

export const eventReplayBus = new EventEmitter();

let store: TraceableEventStore | null = null;
let recorder: RunRecorder | null = null;

export function configureEventReplay(vaultPath: string | null): void {
  store = vaultPath ? new TraceableEventStore(vaultPath) : null;
  recorder = vaultPath ? new RunRecorder(path.join(vaultPath, ORBIT_DIR, 'events', 'runs')) : null;
}

export function currentEventReplayStore(): TraceableEventStore | null {
  return store;
}

export function currentRunRecorder(): RunRecorder | null {
  return recorder;
}

/**
 * Phase 1 迁移期：`type` 与 `kind` 并存。
 *
 * 调用方至少需提供 `source` 与 (`type` | `kind`) 之一：
 * - 提供 `kind`：bus 会把 `type` 自动镜像为 `kind` 字符串（向后兼容旧 consumer）。
 * - 提供 `type` 而不提供 `kind`：若 `type` 恰好是合法 kind，自动回填 `kind`；否则保留原样。
 */
export type PublishTraceableEventInput =
  & Omit<Partial<TraceableEvent>, 'source' | 'type' | 'kind' | 'payload'>
  & { source: TraceableEventSource }
  & (
    | {
        kind: TraceableEventKind;
        type?: string;
        payload?: TraceableEventPayloadMap[TraceableEventKind] | unknown;
      }
    | {
        kind?: undefined;
        type: string;
        payload?: unknown;
      }
  );

export function publishTraceableEvent(input: PublishTraceableEventInput): TraceableEvent {
  const at = input.at ?? new Date().toISOString();
  const traceId =
    input.traceId ?? input.runId ?? input.taskUid ?? input.taskId ?? `trace-${randomUUID()}`;
  const spanId = input.spanId ?? randomUUID();

  // 镜像 kind <-> type
  let kind: TraceableEventKind | undefined = input.kind;
  let type: string;
  if (kind) {
    type = input.type ?? kind;
  } else {
    // 当 kind 缺失时，input.type 由 PublishTraceableEventInput 联合的另一支保证存在。
    type = input.type as string;
    if (isTraceableEventKind(type)) kind = type;
  }

  const event: TraceableEvent = {
    id: input.id ?? randomUUID(),
    at,
    source: input.source,
    type,
    traceId,
    spanId,
    ...(kind ? { kind } : {}),
    ...(input.parentSpanId ? { parentSpanId: input.parentSpanId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.taskUid ? { taskUid: input.taskUid } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.summary ? { summary: input.summary } : {}),
    ...(input.payload !== undefined ? { payload: input.payload } : {})
  };
  eventReplayBus.emit('event', event);
  if (kind) eventReplayBus.emit(kind, event);
  void store?.append(event).catch((error: unknown) => {
    console.error('[events] failed to persist traceable event', {
      error,
      eventId: event.id,
      source: event.source,
      type: event.type
    });
  });
  return event;
}
