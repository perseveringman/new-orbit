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

export function AssistantMessageCard({
  text,
  animate = false
}: {
  text: string;
  animate?: boolean;
}): JSX.Element {
  return (
    <div className="flex justify-start">
      <div className="max-w-[82%] rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
        <div className="mb-1 text-[11px] font-medium text-sky-500">Agent</div>
        <StreamingMarkdown content={text} animate={animate} />
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

export function AgentEventCard({
  event,
  live = false
}: {
  event: AgentEvent;
  live?: boolean;
}): JSX.Element | null {
  if (event.kind === 'thinking') return <ThinkingCard text={event.text || 'Thinking…'} animate={live} />;
  if (event.kind === 'tool_use') return <ToolUseCard event={event} />;
  if (event.kind === 'tool_result') return <ToolResultCard event={event} />;
  if (event.kind === 'cost') return <CostCard event={event} />;
  if (event.kind === 'hydrate') return <HydrateCard event={event} />;
  if (event.kind === 'error') return <ErrorCard text={event.text || 'Agent error'} />;
  if (event.kind === 'done') return <SystemEventCard text={event.text || 'Run finished'} />;
  if ((event.kind === 'message' || event.kind === 'text') && event.text?.trim()) {
    return <AssistantMessageCard text={event.text} animate={live} />;
  }
  return null;
}

export function describeAgentEvent(event: AgentEvent): string {
  if (event.kind === 'thinking') return `Thinking · ${truncate(event.text || 'Thinking…')}`;
  if (event.kind === 'tool_use') return `Working · ${summarizeToolEvent(event, false)}`;
  if (event.kind === 'tool_result') return `Finished · ${summarizeToolEvent(event, true)}`;
  if (event.kind === 'hydrate') return event.text?.trim() || 'Recovered prior session context';
  if (event.kind === 'error') return `Error · ${truncate(event.text || 'Agent error')}`;
  if (event.kind === 'message' || event.kind === 'text') return truncate(event.text || 'Agent is working…');
  if (event.kind === 'cost') return 'Usage updated';
  if (event.kind === 'done') return event.text?.trim() || 'Run finished';
  return 'Agent is working…';
}

export function ThinkingCard({
  text,
  animate = false
}: {
  text: string;
  animate?: boolean;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">
        Thinking
      </div>
      <StreamingMarkdown content={text} animate={animate} />
    </div>
  );
}

function ToolUseCard({ event }: { event: AgentEvent }): JSX.Element {
  const summary = summarizeToolEvent(event, false);
  const details = formatEventDetails(event);
  return (
    <DisclosureEventCard
      accent="violet"
      label="Tool call"
      summary={summary}
      details={details}
    />
  );
}

function ToolResultCard({ event }: { event: AgentEvent }): JSX.Element {
  const summary = summarizeToolEvent(event, true);
  const details = formatEventDetails(event);
  return (
    <DisclosureEventCard
      accent="neutral"
      label="Tool result"
      summary={summary}
      details={details}
    />
  );
}

function CostCard({ event }: { event: AgentEvent }): JSX.Element {
  const parts = [
    typeof event.input_tokens === 'number' ? `in ${event.input_tokens}` : null,
    typeof event.output_tokens === 'number' ? `out ${event.output_tokens}` : null,
    typeof event.total_cost_usd === 'number' ? `$${event.total_cost_usd.toFixed(4)}` : null
  ].filter(Boolean);
  return (
    <MetaEventCard accent="emerald" label="Usage">
      {parts.join(' · ') || 'cost update'}
    </MetaEventCard>
  );
}

function HydrateCard({ event }: { event: AgentEvent }): JSX.Element {
  return (
    <MetaEventCard accent="sky" label="Resume">
      {event.text?.trim() || 'Recovered prior session context'}
    </MetaEventCard>
  );
}

function ErrorCard({ text }: { text: string }): JSX.Element {
  return (
    <MetaEventCard accent="red" label="Error">
      {text}
    </MetaEventCard>
  );
}

function DisclosureEventCard({
  accent,
  label,
  summary,
  details
}: {
  accent: 'violet' | 'neutral';
  label: string;
  summary: string;
  details: string;
}): JSX.Element {
  const styles =
    accent === 'violet'
      ? {
          shell: 'border-violet-300/50 bg-violet-50 text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100',
          badge: 'bg-violet-500/10 text-violet-700 dark:text-violet-200'
        }
      : {
          shell: 'border-neutral-300 bg-white text-neutral-800 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100',
          badge: 'bg-neutral-500/10 text-neutral-600 dark:text-neutral-300'
        };
  return (
    <details className={`rounded-xl border px-3 py-2 text-sm ${styles.shell}`}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-start gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles.badge}`}>
            {label}
          </span>
          <span className="min-w-0 flex-1 text-left leading-6">{summary}</span>
          <span className="text-[11px] text-neutral-500">View</span>
        </div>
      </summary>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-neutral-950 p-3 text-[11px] leading-relaxed text-neutral-100">
        {details}
      </pre>
    </details>
  );
}

function MetaEventCard({
  accent,
  label,
  children
}: {
  accent: 'emerald' | 'red' | 'sky';
  label: string;
  children: string;
}): JSX.Element {
  const styles =
    accent === 'emerald'
      ? 'border-emerald-300/50 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100'
      : accent === 'red'
        ? 'border-red-300/60 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
        : 'border-sky-300/60 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100';
  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${styles}`}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function summarizeToolEvent(event: AgentEvent, isResult: boolean): string {
  const tool = event.toolName?.trim() || extractToolName(event.data) || 'Tool';
  const input = extractToolInput(event.data);
  const pathValue = extractPathHint(input);
  const rangeValue = extractRangeHint(input);
  const basename = pathValue ? baseName(pathValue) : null;
  const action = prettifyToolName(tool);
  const subject = basename ? `${action} ${basename}` : action;
  const suffix = rangeValue ? ` · ${rangeValue}` : pathValue ? ` · ${pathValue}` : '';
  return isResult ? `${subject} completed${suffix}` : `${subject}${suffix}`;
}

function prettifyToolName(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatEventDetails(event: AgentEvent): string {
  if (event.data == null) return event.text?.trim() || '(no details)';
  try {
    return JSON.stringify(event.data, null, 2);
  } catch {
    return event.text?.trim() || '(no details)';
  }
}

function extractToolName(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const name = (data as { name?: unknown }).name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

function extractToolInput(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null;
  const candidate = (data as { input?: unknown; arguments?: unknown; payload?: unknown }).input ??
    (data as { arguments?: unknown }).arguments ??
    (data as { payload?: unknown }).payload;
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : null;
}

function extractPathHint(input: Record<string, unknown> | null): string | null {
  if (!input) return null;
  const candidate = input['file_path'] ?? input['path'] ?? input['target_file'] ?? input['cwd'];
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

function extractRangeHint(input: Record<string, unknown> | null): string | null {
  if (!input) return null;
  const start = integerish(input['start_line'] ?? input['startLine'] ?? input['from']);
  const end = integerish(input['end_line'] ?? input['endLine'] ?? input['to']);
  if (start == null && end == null) return null;
  if (start != null && end != null) return `L${start}:${end}`;
  return start != null ? `L${start}` : `L${end}`;
}

function integerish(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number.parseInt(value, 10);
  return null;
}

function truncate(value: string, max = 96): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function baseName(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() ?? value;
}
