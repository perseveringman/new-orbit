import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import type { TraceableEvent, TraceableEventSource } from '@shared/events';
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

export function publishTraceableEvent(
  input: Omit<Partial<TraceableEvent>, 'source' | 'type'> & {
    source: TraceableEventSource;
    type: string;
  }
): TraceableEvent {
  const at = input.at ?? new Date().toISOString();
  const traceId = input.traceId ?? input.runId ?? input.taskUid ?? input.taskId ?? `trace-${randomUUID()}`;
  const spanId = input.spanId ?? randomUUID();
  const event: TraceableEvent = {
    id: input.id ?? randomUUID(),
    at,
    source: input.source,
    type: input.type,
    traceId,
    spanId,
    ...(input.parentSpanId ? { parentSpanId: input.parentSpanId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.taskUid ? { taskUid: input.taskUid } : {}),
    ...(input.summary ? { summary: input.summary } : {}),
    ...(input.payload !== undefined ? { payload: input.payload } : {})
  };
  eventReplayBus.emit('event', event);
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
