import type { RuntimeEvent } from '@shared/chat-protocol';

interface ThinkingBlockProps {
  event: RuntimeEvent<'runtime.thinking'>;
}

export function ThinkingBlock({ event }: ThinkingBlockProps): JSX.Element {
  return (
    <details className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50/80 px-3 py-2 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-400">
      <summary className="cursor-pointer select-none font-medium">Thinking</summary>
      <div className="mt-2 whitespace-pre-wrap break-words">{event.payload.text}</div>
    </details>
  );
}
