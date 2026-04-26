import { randomUUID } from 'node:crypto';
import type { ActivityEvent, ActivityEventInput } from './types';
import { createActivityStore } from './store';
import { publishTraceableEvent } from '../events/bus';

export interface ActivityAppendStore {
  append(event: ActivityEvent): Promise<void>;
}

export interface ActivityEmitterOptions {
  now?: () => Date;
  id?: () => string;
  onError?: (error: unknown, event: ActivityEvent) => void;
}

export class ActivityEmitter {
  private readonly now: () => Date;
  private readonly id: () => string;
  private readonly onError: (error: unknown, event: ActivityEvent) => void;

  constructor(
    private readonly store: ActivityAppendStore,
    options: ActivityEmitterOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? randomUUID;
    this.onError = options.onError ?? defaultErrorHandler;
  }

  emit(input: ActivityEventInput): ActivityEvent {
    const event = this.toEvent(input);
    publishActivityTrace(event);
    void this.store.append(event).catch((error: unknown) => this.onError(error, event));
    return event;
  }

  async emitAndWait(input: ActivityEventInput): Promise<ActivityEvent> {
    const event = this.toEvent(input);
    publishActivityTrace(event);
    try {
      await this.store.append(event);
    } catch (error) {
      this.onError(error, event);
    }
    return event;
  }

  private toEvent(input: ActivityEventInput): ActivityEvent {
    const event: ActivityEvent = {
      id: this.id(),
      at: this.now().toISOString(),
      actor: input.actor,
      action: input.action,
      context: input.context ?? {},
      summary: input.summary
    };
    if (input.actor_id !== undefined) event.actor_id = input.actor_id;
    if (input.payload !== undefined) event.payload = input.payload;
    return event;
  }
}

function publishActivityTrace(event: ActivityEvent): void {
  publishTraceableEvent({
    source: 'activity',
    type: event.action,
    traceId: event.context.run_id ?? event.context.task_uid ?? event.id,
    spanId: event.id,
    runId: event.context.run_id,
    taskUid: event.context.task_uid,
    summary: event.summary,
    payload: event
  });
}

let defaultEmitter: ActivityEmitter | null = null;

export function createActivityEmitter(
  store: ActivityAppendStore,
  options?: ActivityEmitterOptions
): ActivityEmitter {
  return new ActivityEmitter(store, options);
}

export function configureActivityEmitter(vaultPath: string | null): void {
  defaultEmitter = vaultPath ? new ActivityEmitter(createActivityStore(vaultPath)) : null;
}

export function emitActivity(input: ActivityEventInput): ActivityEvent | null {
  if (!defaultEmitter) {
    console.error('[activity] failed to emit activity: no vault configured');
    return null;
  }
  return defaultEmitter.emit(input);
}

function defaultErrorHandler(error: unknown, event: ActivityEvent): void {
  console.error('[activity] failed to persist activity event', {
    error,
    eventId: event.id,
    action: event.action
  });
}
