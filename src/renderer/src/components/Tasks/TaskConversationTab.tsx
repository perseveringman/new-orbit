import { useEffect, useMemo, useState } from 'react';
import type { AgentEvent } from '@shared/agent';
import type { RunSegment, TaskConversation } from '@shared/orchestration';
import type { TaskRecord } from '@shared/schemas';
import { buildAgentEventKey } from '../../lib/agentEventKeys';
import { useAgent } from '../../store/agent';
import { useTaskConversation } from '../../store/taskConversation';
import { AgentEventCard, SegmentDivider, TurnCard } from '../Timeline';

interface TaskConversationTabProps {
  task: TaskRecord;
}

interface TimelineEntry {
  kind: 'segment' | 'turn';
  key: string;
  segment?: RunSegment;
  turn?: TaskConversation['turns'][number];
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

export function TaskConversationTab({ task }: TaskConversationTabProps): JSX.Element {
  const init = useTaskConversation((s) => s.init);
  const load = useTaskConversation((s) => s.load);
  const send = useTaskConversation((s) => s.send);
  const conversation = useTaskConversation((s) => s.conversations[task.id]);
  const loading = useTaskConversation((s) => s.loading[task.id] ?? false);
  const sending = useTaskConversation((s) => s.sending[task.id] ?? false);

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
      loading={loading}
      sending={sending}
      onSend={(message) => send(task.id, message)}
    />
  );
}

interface TaskConversationTimelineProps {
  task: TaskRecord;
  conversation: TaskConversation | null;
  loading?: boolean;
  sending?: boolean;
  onSend?(message: string): Promise<void>;
}

export function TaskConversationTimeline({
  task,
  conversation,
  loading = false,
  sending = false,
  onSend
}: TaskConversationTimelineProps): JSX.Element {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setDraft('');
  }, [task.id]);
  const segmentById = useMemo(
    () => new Map((conversation?.segments ?? []).map((segment) => [segment.id, segment])),
    [conversation?.segments]
  );
  const timeline = useMemo<TimelineEntry[]>(() => {
    if (!conversation) return [];
    const entries: TimelineEntry[] = [];
    let activeSegmentId: string | null = null;
    for (const turn of conversation.turns) {
      const segment = turn.segmentId ? segmentById.get(turn.segmentId) : undefined;
      if (segment && segment.id !== activeSegmentId) {
        entries.push({
          kind: 'segment',
          key: `segment:${segment.id}`,
          segment
        });
        activeSegmentId = segment.id;
      }
      if (!segment) activeSegmentId = null;
      entries.push({
        kind: 'turn',
        key: `turn:${turn.id}`,
        turn
      });
    }
    return entries;
  }, [conversation, segmentById]);
  const runningSegments = useMemo(
    () =>
      (conversation?.segments ?? []).filter((segment) => segment.status === 'running' && segment.runId),
    [conversation?.segments]
  );
  const inputState = getConversationInputState(conversation);

  async function handleSend(): Promise<void> {
    if (!onSend) return;
    const message = draft.trim();
    if (!message || sending) return;
    await onSend(message);
    setDraft('');
  }

  return (
    <div className="flex h-full flex-col">
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
            ) : entry.turn ? (
              <TurnCard key={entry.key} turn={entry.turn} />
            ) : null
          )
        )}
        {runningSegments.map((segment) => (
          <LiveEventStream key={segment.id} segment={segment} />
        ))}
      </div>
      <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
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

function LiveEventStream({ segment }: { segment: RunSegment }): JSX.Element | null {
  const run = useAgent((s) => (segment.runId ? s.runs[segment.runId] : undefined));
  if (!segment.runId) return null;
  if (!run) {
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
  if (run.summary.status !== 'running') return null;
  const events = run.events.filter(
    (event): event is AgentEvent => event.kind !== 'budget_warn' && event.kind !== 'budget_halt'
  );

  return (
    <div className="rounded border border-sky-400/40 bg-sky-500/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-sky-600 dark:text-sky-300">
        <span className="animate-pulse">●</span> Agent is working…
      </div>
      <div className="space-y-1 border-l-2 border-sky-400/60 pl-3">
        {events.length === 0 ? (
          <p className="text-xs text-neutral-500">Waiting for live output…</p>
        ) : (
          events.map((event, order) => (
            <div key={buildAgentEventKey(segment.id, event, order)}>
              <AgentEventCard event={event} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
