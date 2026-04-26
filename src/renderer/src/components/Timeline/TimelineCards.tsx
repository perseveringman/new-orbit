import type { AgentEvent } from '@shared/agent';
import type { ConversationTurn, RunSegment } from '@shared/orchestration';
import { StreamingMarkdown } from './StreamingMarkdown';

export function SegmentDivider({ segment }: { segment: RunSegment }): JSX.Element {
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
        {segment.vendorSessionId ? ` · session ${segment.vendorSessionId.slice(0, 8)}` : ''}
        {` · ${statusLabel}`}
      </span>
      <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
    </div>
  );
}

export function TurnCard({ turn }: { turn: ConversationTurn }): JSX.Element {
  if (turn.role === 'system') return <SystemEventCard text={turn.content} />;
  if (turn.role === 'user') return <UserMessageCard text={turn.content} />;
  return <AssistantMessageCard text={turn.content} />;
}

export function UserMessageCard({ text }: { text: string }): JSX.Element {
  return (
    <div className="flex justify-end">
      <div className="max-w-[78%] rounded-2xl bg-neutral-900 px-3 py-2 text-sm text-white whitespace-pre-wrap dark:bg-neutral-100 dark:text-neutral-900">
        {text}
      </div>
    </div>
  );
}

export function AssistantMessageCard({ text }: { text: string }): JSX.Element {
  return (
    <div className="flex justify-start">
      <div className="max-w-[82%] rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
        <div className="mb-1 text-[11px] font-medium text-sky-500">Agent</div>
        <StreamingMarkdown content={text} />
      </div>
    </div>
  );
}

export function SystemEventCard({ text }: { text: string }): JSX.Element {
  return (
    <div className="text-center text-xs text-neutral-500">
      <span>{text}</span>
    </div>
  );
}

export function AgentEventCard({ event }: { event: AgentEvent }): JSX.Element | null {
  if (event.kind === 'thinking') return <ThinkingCard text={event.text || 'Thinking…'} />;
  if (event.kind === 'tool_use') return <ToolUseCard event={event} />;
  if (event.kind === 'tool_result') return <ToolResultCard event={event} />;
  if (event.kind === 'cost') return <CostCard event={event} />;
  if (event.kind === 'error') return <ErrorCard text={event.text || 'Agent error'} />;
  if (event.kind === 'done') return <SystemEventCard text={event.text || 'Run finished'} />;
  if ((event.kind === 'message' || event.kind === 'text') && event.text?.trim()) {
    return <AssistantMessageCard text={event.text} />;
  }
  return null;
}

export function ThinkingCard({ text }: { text: string }): JSX.Element {
  return (
    <div className="rounded border border-amber-300/50 bg-amber-100/40 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      Thinking · {text}
    </div>
  );
}

function ToolUseCard({ event }: { event: AgentEvent }): JSX.Element {
  return (
    <div className="rounded border border-violet-300/50 bg-violet-100/40 px-3 py-2 text-xs text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
      Tool use · {event.toolName ?? event.text ?? 'unknown tool'}
    </div>
  );
}

function ToolResultCard({ event }: { event: AgentEvent }): JSX.Element {
  return (
    <div className="rounded border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
      Tool result · {event.toolName ?? event.text ?? 'completed'}
    </div>
  );
}

function CostCard({ event }: { event: AgentEvent }): JSX.Element {
  const cost = typeof event.total_cost_usd === 'number' ? `$${event.total_cost_usd.toFixed(4)}` : 'cost update';
  return (
    <div className="rounded border border-emerald-300/50 bg-emerald-100/40 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
      {cost}
    </div>
  );
}

function ErrorCard({ text }: { text: string }): JSX.Element {
  return (
    <div className="rounded border border-red-300/60 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
      {text}
    </div>
  );
}
