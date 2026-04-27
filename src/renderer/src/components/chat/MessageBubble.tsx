import type { RuntimeEvent } from '@shared/chat-protocol';

interface MessageBubbleProps {
  event: RuntimeEvent<'runtime.message'>;
}

export function MessageBubble({ event }: MessageBubbleProps): JSX.Element {
  const { text, isStreaming } = event.payload;
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 text-sm leading-relaxed text-neutral-800 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-100">
      <div className="whitespace-pre-wrap break-words">
        {text}
        {isStreaming ? <span className="ml-0.5 animate-pulse opacity-60">▍</span> : null}
      </div>
    </div>
  );
}
