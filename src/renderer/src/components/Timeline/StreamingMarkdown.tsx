import { useEffect, useMemo, useState, type ReactNode } from 'react';

interface StreamingMarkdownProps {
  content: string;
  animate?: boolean;
  chunkSize?: number;
  intervalMs?: number;
}

export function StreamingMarkdown({
  content,
  animate = false,
  chunkSize = 3,
  intervalMs = 16
}: StreamingMarkdownProps): JSX.Element {
  const shouldAnimate = animate && typeof window !== 'undefined';
  const [visibleLength, setVisibleLength] = useState(shouldAnimate ? 0 : content.length);

  useEffect(() => {
    if (!shouldAnimate) {
      setVisibleLength(content.length);
      return;
    }
    setVisibleLength(0);
    const timer = window.setInterval(() => {
      setVisibleLength((current) => {
        if (current >= content.length) {
          window.clearInterval(timer);
          return content.length;
        }
        return Math.min(content.length, current + chunkSize);
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [chunkSize, content, intervalMs, shouldAnimate]);

  const rendered = shouldAnimate ? content.slice(0, visibleLength) : content;
  const lines = useMemo(() => rendered.split('\n'), [rendered]);
  return (
    <div className="space-y-2 text-sm leading-6">
      {lines.map((line, index) => (
        <MarkdownLine key={`${index}:${line.slice(0, 24)}`} line={line} />
      ))}
    </div>
  );
}

function MarkdownLine({ line }: { line: string }): JSX.Element {
  if (line.startsWith('### ')) return <h3 className="text-base font-semibold">{inline(line.slice(4))}</h3>;
  if (line.startsWith('## ')) return <h2 className="text-lg font-semibold">{inline(line.slice(3))}</h2>;
  if (line.startsWith('# ')) return <h1 className="text-xl font-semibold">{inline(line.slice(2))}</h1>;
  if (line.startsWith('- ')) return <p className="pl-3">• {inline(line.slice(2))}</p>;
  if (!line.trim()) return <div className="h-2" />;
  return <p>{inline(line)}</p>;
}

function inline(value: string): ReactNode[] {
  const parts = value.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={`${index}:${part}`}
          className="rounded bg-neutral-200 px-1 py-0.5 text-[0.9em] dark:bg-neutral-800"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${index}:${part}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${index}:${part}`}>{part}</span>;
  });
}
