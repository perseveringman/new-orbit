export const TRACEABLE_EVENT_SOURCES = ['activity', 'agent', 'inbox', 'ipc'] as const;
export type TraceableEventSource = (typeof TRACEABLE_EVENT_SOURCES)[number];

export interface TraceableEvent {
  id: string;
  at: string;
  source: TraceableEventSource;
  type: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId?: string;
  taskId?: string;
  taskUid?: string;
  summary?: string;
  payload?: unknown;
}

export interface TraceableEventFilter {
  source?: TraceableEventSource;
  type?: string;
  traceId?: string;
  runId?: string;
  taskId?: string;
  taskUid?: string;
  limit?: number;
}

export interface TraceableEventQueryResult {
  events: TraceableEvent[];
  count: number;
}
