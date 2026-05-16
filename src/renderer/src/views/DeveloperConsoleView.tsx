import { useEffect, useMemo, useState } from 'react';
import type { TraceableEvent, TraceableEventFilter, TraceableEventSource } from '@shared/events';
import { TRACEABLE_EVENT_SOURCES } from '@shared/events';
import { ArtifactDebugPanel } from '../components/synthesis';

const SOURCE_LABELS: Record<TraceableEventSource, string> = {
  activity: '活动',
  agent: 'Agent',
  inbox: '收件箱',
  runtime: 'Runtime',
  synthesis: '合成',
  ipc: 'IPC',
  conversation: '对话'
};

export function DeveloperConsoleView(): JSX.Element {
  const [events, setEvents] = useState<TraceableEvent[]>([]);
  const [source, setSource] = useState<TraceableEventSource | 'all'>('all');
  const [eventType, setEventType] = useState('');
  const [traceId, setTraceId] = useState('');
  const [runId, setRunId] = useState('');
  const [taskUid, setTaskUid] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playbackIndex, setPlaybackIndex] = useState<number | null>(null);

  const filter = useMemo<TraceableEventFilter>(
    () => ({
      ...(source !== 'all' ? { source } : {}),
      ...(eventType.trim() ? { type: eventType.trim() } : {}),
      ...(traceId.trim() ? { traceId: traceId.trim() } : {}),
      ...(runId.trim() ? { runId: runId.trim() } : {}),
      ...(taskUid.trim() ? { taskUid: taskUid.trim() } : {}),
      limit: 300
    }),
    [eventType, runId, source, taskUid, traceId]
  );

  useEffect(() => {
    let cancelled = false;
    void window.orbit.events.query(filter).then((result) => {
      if (!cancelled) setEvents(result.events);
    });
    const off = window.orbit.events.onEvent((event) => {
      if (!eventMatchesFilter(event, filter)) return;
      setEvents((current) => [event, ...current.filter((item) => item.id !== event.id)].slice(0, 300));
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [filter]);

  const playbackEvents = playbackIndex === null ? events : events.slice().reverse().slice(0, playbackIndex + 1).reverse();
  const visibleEvents = playbackIndex === null ? events : playbackEvents;
  const selected = visibleEvents.find((event) => event.id === selectedId) ?? visibleEvents[0] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-50 text-sm text-neutral-800 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="border-b border-neutral-200 bg-white/70 px-6 py-4 dark:border-neutral-800 dark:bg-neutral-900/70">
        <p className="text-xs uppercase tracking-[0.22em] text-neutral-500">开发者控制台</p>
        <h2 className="mt-1 text-xl font-semibold">事件回放</h2>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          使用 trace / run 过滤器检查可追踪的活动、Agent、收件箱与 IPC 事件。
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-end gap-3 border-b border-neutral-200 bg-white/50 px-6 py-3 dark:border-neutral-800 dark:bg-neutral-900/40">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          来源
          <select
            value={source}
            onChange={(event) => setSource(event.target.value as TraceableEventSource | 'all')}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          >
            <option value="all">全部来源</option>
            {TRACEABLE_EVENT_SOURCES.map((item) => (
              <option key={item} value={item}>
                {SOURCE_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-neutral-500">
          类型
          <input
            value={eventType}
            onChange={(event) => setEventType(event.target.value)}
            placeholder="事件类型"
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </label>
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-neutral-500">
          Trace
          <input
            value={traceId}
            onChange={(event) => setTraceId(event.target.value)}
            placeholder="traceId"
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </label>
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-neutral-500">
          Run
          <input
            value={runId}
            onChange={(event) => setRunId(event.target.value)}
            placeholder="runId"
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </label>
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-neutral-500">
          任务
          <input
            value={taskUid}
            onChange={(event) => setTaskUid(event.target.value)}
            placeholder="taskUid"
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </label>
        <button
          type="button"
          onClick={() => setPlaybackIndex(playbackIndex === null ? 0 : null)}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
        >
          {playbackIndex === null ? '开始回放' : '停止回放'}
        </button>
        {playbackIndex !== null && (
          <button
            type="button"
            onClick={() => setPlaybackIndex((index) => Math.min((index ?? 0) + 1, Math.max(events.length - 1, 0)))}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200"
          >
            下一个事件
          </button>
        )}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-h-0 overflow-y-auto p-4">
          <div className="space-y-2">
            {visibleEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => setSelectedId(event.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selected?.id === event.id
                    ? 'border-blue-400 bg-blue-50 dark:border-blue-500/60 dark:bg-blue-950/30'
                    : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
                    {SOURCE_LABELS[event.source]}
                  </span>
                  <span>{event.type}</span>
                  <span className="ml-auto">{formatTime(event.at)}</span>
                </div>
                <div className="mt-2 font-medium text-neutral-900 dark:text-neutral-50">
                  {event.summary ?? event.type}
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-neutral-500">
                  trace={event.traceId}
                  {event.runId ? ` · run=${event.runId}` : ''}
                </div>
              </button>
            ))}
            {visibleEvents.length === 0 && (
              <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900">
                没有符合当前过滤器的回放事件。
              </div>
            )}
          </div>
        </div>
        <aside className="min-h-0 overflow-y-auto border-l border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="text-sm font-semibold">载荷</h3>
          <div className="mt-3">
            <ArtifactDebugPanel filter={{ limit: 20 }} />
          </div>
          {selected ? (
            <pre className="mt-3 overflow-x-auto rounded-xl bg-neutral-950 p-3 text-xs text-neutral-100">
              {JSON.stringify(selected, null, 2)}
            </pre>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">请选择一个事件以查看载荷。</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function eventMatchesFilter(event: TraceableEvent, filter: TraceableEventFilter): boolean {
  if (filter.source && event.source !== filter.source) return false;
  if (filter.type && event.type !== filter.type) return false;
  if (filter.traceId && event.traceId !== filter.traceId) return false;
  if (filter.runId && event.runId !== filter.runId) return false;
  if (filter.taskUid && event.taskUid !== filter.taskUid) return false;
  return true;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString();
}
