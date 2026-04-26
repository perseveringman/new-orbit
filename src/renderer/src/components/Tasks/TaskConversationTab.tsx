import { useEffect, useMemo, useState } from 'react';
import type { AgentEvent, RunSummary } from '@shared/agent';
import type { RunSegment, RuntimeDescriptor, TaskConversation } from '@shared/orchestration';
import type { TaskRecord } from '@shared/schemas';
import { buildAgentEventKey } from '../../lib/agentEventKeys';
import { useAgent } from '../../store/agent';
import { useTaskConversation } from '../../store/taskConversation';
import { AgentEventCard, describeAgentEvent, SegmentDivider, TurnCard } from '../Timeline';

interface TaskConversationTabProps {
  task: TaskRecord;
}

interface TimelineEntry {
  kind: 'segment' | 'turn' | 'event' | 'placeholder';
  key: string;
  segment?: RunSegment;
  turn?: TaskConversation['turns'][number];
  event?: AgentEvent;
  live?: boolean;
}

type ConversationInputState = 'idle' | 'running' | 'waiting';

export function getConversationInputState(
  conversation: TaskConversation | null
): ConversationInputState {
  if (!conversation || conversation.segments.length === 0) return 'idle';
  if (conversation.segments.some((segment) => segment.status === 'running')) return 'running';
  return 'waiting';
}

export function getConversationInputPlaceholder(
  taskTitle: string,
  state: ConversationInputState
): string {
  if (state === 'running') return '追加消息给正在运行的 agent';
  if (state === 'waiting') return '继续对话';
  return `发送消息启动 "${taskTitle}"`;
}

export function dedupeAgentDisplayEvents(events: AgentEvent[]): AgentEvent[] {
  const next: AgentEvent[] = [];
  let previousText = '';
  for (const event of events) {
    if ((event.kind === 'message' || event.kind === 'text') && event.text?.trim()) {
      const text = event.text.trim();
      if (text === previousText) continue;
      previousText = text;
    } else {
      previousText = '';
    }
    next.push(event);
  }
  return next;
}

export function TaskConversationTab({ task }: TaskConversationTabProps): JSX.Element {
  const init = useTaskConversation((s) => s.init);
  const load = useTaskConversation((s) => s.load);
  const send = useTaskConversation((s) => s.send);
  const conversation = useTaskConversation((s) => s.conversations[task.id]);
  const loading = useTaskConversation((s) => s.loading[task.id] ?? false);
  const sending = useTaskConversation((s) => s.sending[task.id] ?? false);
  const runs = useAgent((s) => s.runs);

  useEffect(() => {
    init();
    void load(task.id);
  }, [init, load, task.id]);

  if (task.source !== 'file') {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-neutral-500">
        Inline tasks do not have a persistent task conversation.
      </div>
    );
  }

  return (
    <TaskConversationTimeline
      task={task}
      conversation={conversation ?? null}
      runs={runs}
      loading={loading}
      sending={sending}
      onSend={(message) => send(task.id, message)}
    />
  );
}

interface TaskConversationTimelineProps {
  task: TaskRecord;
  conversation: TaskConversation | null;
  runs?: Record<string, { events: AgentEvent[]; summary: RunSummary }>;
  loading?: boolean;
  sending?: boolean;
  onSend?(message: string): Promise<void>;
}

export function TaskConversationTimeline({
  task,
  conversation,
  runs = {},
  loading = false,
  sending = false,
  onSend
}: TaskConversationTimelineProps): JSX.Element {
  const [draft, setDraft] = useState('');
  const [runtimes, setRuntimes] = useState<RuntimeDescriptor[]>([]);
  const [runtimeId, setRuntimeId] = useState('');
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    setDraft('');
  }, [task.id]);
  useEffect(() => {
    void window.orbit.runtime.list().then((items) => {
      setRuntimes(items);
      setRuntimeId((current) => current || items[0]?.runtimeId || '');
    });
  }, []);
  const timeline = useMemo<TimelineEntry[]>(() => {
    return buildConversationTimelineEntries(conversation, runs);
  }, [conversation, runs]);
  const inputState = getConversationInputState(conversation);
  const liveStatus = useMemo(() => buildLiveStatus(conversation, runs), [conversation, runs]);

  async function handleSend(): Promise<void> {
    if (!onSend) return;
    const message = draft.trim();
    if (!message || sending) return;
    await onSend(message);
    setDraft('');
  }

  async function handleSwitchRuntime(): Promise<void> {
    if (!task.uid || !runtimeId || switching) return;
    setSwitching(true);
    try {
      await window.orbit.conversation.switchRuntime(task.uid, runtimeId);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 text-xs dark:border-neutral-800">
        <span className="font-medium text-neutral-600 dark:text-neutral-300">Runtime</span>
        <div className="flex items-center gap-2">
          <select
            value={runtimeId}
            onChange={(event) => setRuntimeId(event.target.value)}
            className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {runtimes.map((runtime) => (
              <option key={runtime.runtimeId} value={runtime.runtimeId}>
                {runtime.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => void handleSwitchRuntime()}
            disabled={!task.uid || !runtimeId || switching}
            className="rounded bg-neutral-900 px-2 py-1 text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {switching ? 'Switching…' : 'Switch Runtime'}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {loading && !conversation ? (
          <p className="text-sm text-neutral-500">Loading conversation…</p>
        ) : timeline.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded border border-dashed border-neutral-300 px-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
            No task conversation yet. Send a message to start a focused task run.
          </div>
        ) : (
          timeline.map((entry) =>
            entry.kind === 'segment' && entry.segment ? (
              <SegmentDivider key={entry.key} segment={entry.segment} />
            ) : entry.kind === 'event' && entry.event ? (
              <div key={entry.key}>
                <AgentEventCard event={entry.event} live={entry.live} />
              </div>
            ) : entry.kind === 'placeholder' && entry.segment ? (
              <LivePlaceholderCard key={entry.key} />
            ) : entry.turn ? (
              <TurnCard key={entry.key} turn={entry.turn} />
            ) : null
          )
        )}
      </div>
      <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
        {liveStatus && (
          <div className="mb-3 rounded-xl border border-sky-300/50 bg-sky-50 px-3 py-2 text-sm text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
            <div className="flex items-center gap-2">
              <span className="animate-pulse">●</span>
              <span>{liveStatus}</span>
            </div>
          </div>
        )}
        <div className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">Activity</div>
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            rows={2}
            placeholder={getConversationInputPlaceholder(task.title, inputState)}
            disabled={sending}
            className="min-h-[64px] flex-1 resize-none rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            onClick={() => void handleSend()}
            disabled={sending || !draft.trim()}
            className="rounded bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LivePlaceholderCard(): JSX.Element {
  return (
    <div className="rounded border border-sky-400/40 bg-sky-500/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-sky-600 dark:text-sky-300">
        <span className="animate-pulse">●</span> Agent is starting…
      </div>
      <div className="space-y-1 border-l-2 border-sky-400/60 pl-3">
        <p className="text-xs text-neutral-500">Waiting for the first live event…</p>
      </div>
    </div>
  );
}

export function buildConversationTimelineEntries(
  conversation: TaskConversation | null,
  runs: Record<string, { events: AgentEvent[]; summary: RunSummary }>
): TimelineEntry[] {
  if (!conversation) return [];
  const entries: TimelineEntry[] = [];
  const segmentStarts = [...conversation.segments].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const pendingLooseTurns = conversation.turns
    .filter((turn) => !turn.segmentId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let looseIndex = 0;

  for (const segment of segmentStarts) {
    while (looseIndex < pendingLooseTurns.length && pendingLooseTurns[looseIndex]!.createdAt < segment.startedAt) {
      const turn = pendingLooseTurns[looseIndex]!;
      entries.push({ kind: 'turn', key: `turn:${turn.id}`, turn });
      looseIndex += 1;
    }

    entries.push({ kind: 'segment', key: `segment:${segment.id}`, segment });
    const segmentEvents = eventsForSegment(segment, runs[segment.runId]?.events);
    const hasDetailedEvents = segmentEvents.some(isDetailedSegmentEvent);
    const segmentTurns = conversation.turns.filter(
      (turn) => turn.segmentId === segment.id && !(hasDetailedEvents && turn.role === 'assistant')
    );
    const segmentItems = [
      ...segmentTurns.map((turn, index) => ({
        kind: 'turn' as const,
        key: `turn:${turn.id}`,
        at: turn.createdAt,
        index,
        turn
      })),
      ...segmentEvents.map((event, index) => ({
        kind: 'event' as const,
        key: buildAgentEventKey(segment.id, event, index),
        at: event.at,
        index,
        event,
        live: segment.status === 'running'
      }))
    ].sort((a, b) => {
      if (a.at !== b.at) return a.at.localeCompare(b.at);
      if (a.kind !== b.kind) return a.kind === 'turn' ? -1 : 1;
      return a.index - b.index;
    });

    if (segment.status === 'running' && segmentItems.length === 0) {
      entries.push({ kind: 'placeholder', key: `placeholder:${segment.id}`, segment });
      continue;
    }

    for (const item of segmentItems) {
      if (item.kind === 'turn') {
        entries.push({ kind: 'turn', key: item.key, turn: item.turn });
      } else {
        entries.push({
          kind: 'event',
          key: item.key,
          event: item.event,
          live: item.live
        });
      }
    }
  }

  while (looseIndex < pendingLooseTurns.length) {
    const turn = pendingLooseTurns[looseIndex]!;
    entries.push({ kind: 'turn', key: `turn:${turn.id}`, turn });
    looseIndex += 1;
  }

  return entries;
}

function eventsForSegment(segment: RunSegment, liveEvents: AgentEvent[] | undefined): AgentEvent[] {
  const events =
    segment.status === 'running' && liveEvents?.length ? liveEvents : (segment.events ?? []);
  return dedupeAgentDisplayEvents(events).filter(
    (event): event is AgentEvent => event.kind !== 'budget_warn' && event.kind !== 'budget_halt'
  );
}

function isDetailedSegmentEvent(event: AgentEvent): boolean {
  return ['message', 'text', 'thinking', 'tool_use', 'tool_result', 'error', 'hydrate'].includes(event.kind);
}

export function buildLiveStatus(
  conversation: TaskConversation | null,
  runs: Record<string, { events: AgentEvent[]; summary: RunSummary }>
): string | null {
  const runningSegment = [...(conversation?.segments ?? [])]
    .reverse()
    .find((segment) => segment.status === 'running' && segment.runId);
  if (!runningSegment?.runId) return null;
  const run = runs[runningSegment.runId];
  if (!run || run.summary.status !== 'running') return 'Agent is working…';
  const events = eventsForSegment(runningSegment, run.events);
  const latest = [...events].reverse().find((event) => isDetailedSegmentEvent(event));
  return latest ? describeAgentEvent(latest) : 'Agent is working…';
}
