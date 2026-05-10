import type { RuntimeEvent } from '@shared/chat-protocol';

interface ThinkingBlockProps {
  event: RuntimeEvent<'runtime.thinking'>;
}

export function ThinkingBlock({ event }: ThinkingBlockProps): JSX.Element {
  const summary = summarizeThinking(event.payload.text);
  return (
    <details className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50/80 px-3 py-2 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-400">
      <summary className="cursor-pointer select-none">
        <span className="inline-flex max-w-[calc(100%-1rem)] items-center gap-2 align-middle">
          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
            Thinking
          </span>
          <span className="min-w-0 flex-1 truncate text-left text-[12px] text-neutral-700 dark:text-neutral-200">
            {summary}
          </span>
        </span>
      </summary>
      <div className="mt-2 border-t border-neutral-200/70 pt-2 whitespace-pre-wrap break-words dark:border-neutral-800">
        {event.payload.text}
      </div>
    </details>
  );
}

function summarizeThinking(text: string): string {
  const normalized = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*#>\d.\s]+/, '').trim())
    .filter(Boolean)
    .join(' ');
  if (!normalized) return 'Reviewing the next step';
  const firstSentence = normalized.match(/^(.{1,96}?)(?:[.?!。！？]|$)/)?.[1] ?? normalized;
  return truncate(firstSentence.trim(), 72);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
