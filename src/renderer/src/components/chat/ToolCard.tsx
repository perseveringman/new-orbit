import type { RuntimeEvent } from '@shared/chat-protocol';

interface ToolCardProps {
  toolUse: RuntimeEvent<'runtime.tool_use'>;
  toolResult?: RuntimeEvent<'runtime.tool_result'>;
  awaitingApproval?: boolean;
  onApprove?(spanId: string): void;
  onReject?(spanId: string): void;
}

export function ToolCard({
  toolUse,
  toolResult,
  awaitingApproval = false,
  onApprove,
  onReject
}: ToolCardProps): JSX.Element {
  const { toolName } = toolUse.payload;
  const inputJson = safeStringify(toolUse.payload.toolInput);
  const summary = buildToolSummary(toolName, toolUse.payload.toolInput);
  const status = toolResult ? (toolResult.payload.isError ? 'failed' : 'done') : awaitingApproval ? 'awaiting approval' : 'running';
  const showApprovalControls = awaitingApproval && !toolResult && (onApprove || onReject);
  const hasDetails = Boolean(inputJson || toolResult);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
      {hasDetails ? (
        <details>
          <summary className="cursor-pointer select-none">
            <ToolCardHeader summary={summary} status={status} />
          </summary>
          <div className="mt-2 border-t border-amber-200/70 pt-2 dark:border-amber-900/50">
            {inputJson ? (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide opacity-70">Input</div>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-[11px] opacity-80">
                  {inputJson}
                </pre>
              </div>
            ) : null}
            {toolResult ? (
              <div className={inputJson ? 'mt-3' : ''}>
                <div className="text-[10px] font-medium uppercase tracking-wide opacity-70">
                  {toolResult.payload.isError ? 'Error output' : 'Result'}
                </div>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-[11px]">
                  {toolResult.payload.result}
                </pre>
              </div>
            ) : null}
          </div>
        </details>
      ) : (
        <ToolCardHeader summary={summary} status={status} />
      )}
      {showApprovalControls ? (
        <div className="mt-2 flex gap-2">
          {onApprove ? (
            <button
              type="button"
              onClick={() => onApprove(toolUse.spanId)}
              className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
            >
              Approve
            </button>
          ) : null}
          {onReject ? (
            <button
              type="button"
              onClick={() => onReject(toolUse.spanId)}
              className="rounded-md border border-rose-400 px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              Reject
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ToolCardHeader({ summary, status }: { summary: string; status: string }): JSX.Element {
  return (
    <span className="inline-flex w-full items-center justify-between gap-3 align-middle">
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-amber-950 dark:text-amber-50">
        {summary}
      </span>
      <span className={statusBadgeClassName(status)}>{status}</span>
    </span>
  );
}

function safeStringify(value: unknown): string {
  if (value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildToolSummary(toolName: string, toolInput: unknown): string {
  const normalizedToolName = toolName.trim().toLowerCase();
  const displayName = humanizeToolName(toolName);
  const detail = extractPrimaryDetail(toolInput);
  if (matchesTool(normalizedToolName, ['read', 'view', 'cat', 'open'])) {
    return detail ? `Reading ${detail}` : `Reading with ${displayName}`;
  }
  if (matchesTool(normalizedToolName, ['search', 'find', 'grep', 'glob', 'query'])) {
    return detail ? `Searching ${detail}` : `Searching with ${displayName}`;
  }
  if (matchesTool(normalizedToolName, ['write', 'edit', 'patch', 'update', 'replace'])) {
    return detail ? `Editing ${detail}` : `Editing with ${displayName}`;
  }
  if (matchesTool(normalizedToolName, ['list', 'ls'])) {
    return detail ? `Listing ${detail}` : `Listing with ${displayName}`;
  }
  if (matchesTool(normalizedToolName, ['bash', 'shell', 'exec', 'command', 'run'])) {
    return detail ? `Running ${detail}` : `Running ${displayName}`;
  }
  if (matchesTool(normalizedToolName, ['create', 'new', 'add'])) {
    return detail ? `Creating ${detail}` : `Creating with ${displayName}`;
  }
  return detail ? `${displayName} · ${detail}` : displayName;
}

function matchesTool(toolName: string, words: string[]): boolean {
  return words.some((word) => toolName.includes(word));
}

function humanizeToolName(toolName: string): string {
  const normalized = toolName
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return 'Tool call';
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractPrimaryDetail(value: unknown): string {
  if (typeof value === 'string') return quoteIfNeeded(value);
  if (Array.isArray(value)) {
    const first = value.find((item) => item !== null && item !== undefined);
    return first === undefined ? '' : extractPrimaryDetail(first);
  }
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  const preferredKeys = ['path', 'file', 'query', 'pattern', 'command', 'cmd', 'url', 'title', 'prompt', 'name', 'id'];
  for (const key of preferredKeys) {
    const detail = formatDetailForKey(key, record[key]);
    if (detail) return detail;
  }

  for (const [key, candidate] of Object.entries(record)) {
    const detail = formatDetailForKey(key, candidate);
    if (detail) return detail;
  }

  return '';
}

function formatDetailForKey(key: string, value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const trimmed = truncate(value.trim(), 64);
  if (['query', 'pattern', 'command', 'cmd', 'prompt', 'title'].includes(key)) {
    return `"${trimmed}"`;
  }
  return trimmed;
}

function quoteIfNeeded(value: string): string {
  const trimmed = truncate(value.trim(), 64);
  if (!trimmed) return '';
  return /\s/.test(trimmed) ? `"${trimmed}"` : trimmed;
}

function statusBadgeClassName(status: string): string {
  switch (status) {
    case 'done':
      return 'rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200';
    case 'failed':
      return 'rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-900/50 dark:text-rose-200';
    default:
      return 'rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-200';
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}
