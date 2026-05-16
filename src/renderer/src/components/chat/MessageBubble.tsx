import type { RuntimeEvent } from '@shared/chat-protocol';
import { StreamingMarkdown } from '../Timeline/StreamingMarkdown';

interface MessageBubbleProps {
  event: RuntimeEvent<'runtime.message'>;
}

export function MessageBubble({ event }: MessageBubbleProps): JSX.Element {
  const { text, isStreaming, role = 'assistant' } = event.payload;
  const parts = parseArtifactFences(text);
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={
          isUser
            ? 'max-w-[85%] rounded-2xl bg-neutral-900 px-4 py-3 text-sm leading-relaxed text-white shadow-sm dark:bg-neutral-100 dark:text-neutral-900'
            : 'max-w-[85%] rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 text-sm leading-relaxed text-neutral-800 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-100'
        }
      >
        {!isUser ? <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-sky-500">Agent</div> : null}
        <div className="space-y-2">
          {parts.map((part, index) =>
            part.kind === 'artifact' ? (
              <div
                key={index}
                className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100"
              >
                <div className="font-semibold">🎭 {part.title}</div>
                {part.summary ? <div className="mt-1 opacity-80">{part.summary}</div> : null}
                {part.refs.length > 0 ? <div className="mt-2 opacity-70">{part.refs.join(' · ')}</div> : null}
              </div>
            ) : (
              <div key={index}>
                <StreamingMarkdown content={part.text} />
              </div>
            )
          )}
          {isStreaming ? <span className="ml-0.5 animate-pulse opacity-60">▍</span> : null}
        </div>
      </div>
    </div>
  );
}

type MessagePart =
  | { kind: 'text'; text: string }
  | { kind: 'artifact'; title: string; summary?: string; refs: string[] };

function parseArtifactFences(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(/```artifact\s*([\s\S]*?)```/g)) {
    if (match.index !== undefined && match.index > lastIndex) {
      parts.push({ kind: 'text', text: text.slice(lastIndex, match.index) });
    }
    const raw = match[1]?.trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          title?: unknown;
          summary?: unknown;
          refs?: Array<{ kind?: unknown; ref?: unknown; label?: unknown }>;
        };
        parts.push({
          kind: 'artifact',
          title: String(parsed.title ?? '产物'),
          summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
          refs: Array.isArray(parsed.refs)
            ? parsed.refs.map((ref) => `${String(ref.kind ?? 'ref')}: ${String(ref.label ?? ref.ref ?? '')}`)
            : []
        });
      } catch {
        parts.push({ kind: 'text', text: match[0] });
      }
    }
    lastIndex = (match.index ?? 0) + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ kind: 'text', text: text.slice(lastIndex) });
  return parts.length > 0 ? parts : [{ kind: 'text', text }];
}
