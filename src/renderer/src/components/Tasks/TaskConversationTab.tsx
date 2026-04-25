import { useEffect, useMemo, useState } from 'react';
import type { AgentEvent } from '@shared/agent';
import type { RunSegment, TaskConversation } from '@shared/orchestration';
import type { TaskRecord } from '@shared/schemas';
import { buildAgentEventKey } from '../../lib/agentEventKeys';
import { useAgent } from '../../store/agent';
import { useTaskConversation } from '../../store/taskConversation';

interface TaskConversationTabProps {
  task: TaskRecord;
}

interface TimelineEntry {
  kind: 'segment' | 'turn';
  key: string;
  segment?: RunSegment;
  turn?: TaskConversation['turns'][number];
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
              <ChatBubble key={entry.key} turn={entry.turn} />
            ) : null
          )
        )}
        {runningSegments.map((segment) => (
          <LiveEventStream key={segment.id} segment={segment} />
        ))}
      </div>
      <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">Task Chat</div>
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
            placeholder={`Ask the agent to work on "${task.title}"`}
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

function SegmentDivider({ segment }: { segment: RunSegment }): JSX.Element {
  const triggerLabel = segment.trigger === 'dispatch' ? 'Auto' : 'Manual';
  const statusLabel =
    segment.status === 'running'
      ? 'Running'
      : segment.status === 'completed'
        ? 'Completed'
        : segment.status === 'needs_attention'
          ? 'Needs input'
        : segment.status === 'cancelled'
          ? 'Cancelled'
          : 'Failed';

  return (
    <div className="flex items-center gap-3 pt-2 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
      <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
      <span>
        {triggerLabel}
        {segment.bindingId ? ` · ${segment.bindingId}` : ''}
        {` · ${statusLabel}`}
      </span>
      <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
    </div>
  );
}

function ChatBubble({
  turn
}: {
  turn: TaskConversation['turns'][number];
}): JSX.Element {
  if (turn.role === 'system') {
    return (
      <div className="text-center text-xs text-neutral-500">
        <span>{turn.content}</span>
      </div>
    );
  }

  const isUser = turn.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={
          'max-w-[78%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ' +
          (isUser
            ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
            : 'border border-neutral-200 bg-neutral-50 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100')
        }
      >
        {!isUser && <div className="mb-1 text-[11px] font-medium text-sky-500">Agent</div>}
        {turn.content}
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
    (event): event is AgentEvent =>
      (event.kind === 'message' || event.kind === 'text') && Boolean(event.text?.trim())
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
            <p
              key={buildAgentEventKey(segment.id, event, order)}
              className="whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-400"
            >
              {event.text}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
