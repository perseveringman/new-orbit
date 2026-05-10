import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';

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
  const blocks = useMemo(() => parseMarkdownBlocks(rendered), [rendered]);
  return (
    <div className="space-y-2 text-[13px] leading-6">
      {blocks.map((block, index) => (
        <Fragment key={`${block.kind}:${index}`}>{renderMarkdownBlock(block)}</Fragment>
      ))}
    </div>
  );
}

type MarkdownBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'unordered-list'; items: string[] }
  | { kind: 'ordered-list'; items: string[] }
  | { kind: 'blockquote'; lines: string[] }
  | { kind: 'code'; language?: string; code: string };

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const language = line.slice(3).trim() || undefined;
      const chunk: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').startsWith('```')) {
        chunk.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: 'code', language, code: chunk.join('\n') });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1]?.length ?? 1,
        text: heading[2] ?? ''
      });
      index += 1;
      continue;
    }

    if (line.startsWith('> ')) {
      const quote: string[] = [];
      while (index < lines.length && (lines[index] ?? '').startsWith('> ')) {
        quote.push((lines[index] ?? '').slice(2));
        index += 1;
      }
      blocks.push({ kind: 'blockquote', lines: quote });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^[-*]\s+/, ''));
        index += 1;
      }
      blocks.push({ kind: 'unordered-list', items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push({ kind: 'ordered-list', items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && !isBlockBoundary(lines[index] ?? '')) {
      paragraph.push(lines[index] ?? '');
      index += 1;
    }
    blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
  }

  return blocks;
}

function isBlockBoundary(line: string): boolean {
  return (
    !line.trim() ||
    line.startsWith('```') ||
    /^#{1,6}\s+/.test(line) ||
    line.startsWith('> ') ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line)
  );
}

function renderMarkdownBlock(block: MarkdownBlock): JSX.Element {
  switch (block.kind) {
    case 'heading': {
      const className =
        block.level === 1
          ? 'text-base font-semibold'
          : block.level === 2
            ? 'text-[15px] font-semibold'
            : 'text-sm font-semibold';
      const Tag = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3';
      return <Tag className={className}>{renderInline(block.text)}</Tag>;
    }
    case 'unordered-list':
      return (
        <ul className="list-disc space-y-1 pl-5">
          {block.items.map((item, index) => (
            <li key={`${item}:${index}`}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case 'ordered-list':
      return (
        <ol className="list-decimal space-y-1 pl-5">
          {block.items.map((item, index) => (
            <li key={`${item}:${index}`}>{renderInline(item)}</li>
          ))}
        </ol>
      );
    case 'blockquote':
      return (
        <blockquote className="border-l-2 border-sky-300/70 pl-3 text-neutral-600 dark:border-sky-700/60 dark:text-neutral-300">
          {block.lines.map((line, index) => (
            <Fragment key={`${line}:${index}`}>
              {index > 0 ? <br /> : null}
              {renderInline(line)}
            </Fragment>
          ))}
        </blockquote>
      );
    case 'code':
      return (
        <div className="overflow-hidden rounded-xl border border-neutral-200/80 bg-neutral-950 text-neutral-100 dark:border-neutral-800">
          {block.language ? (
            <div className="border-b border-neutral-800/80 px-3 py-1 text-[10px] uppercase tracking-wide text-neutral-400">
              {block.language}
            </div>
          ) : null}
          <pre className="overflow-x-auto px-3 py-3 text-[12px] leading-5">
            <code>{block.code}</code>
          </pre>
        </div>
      );
    case 'paragraph':
      return <p className="break-words">{renderInlineWithLineBreaks(block.text)}</p>;
  }
}

function renderInlineWithLineBreaks(value: string): ReactNode[] {
  return value.split('\n').flatMap((line, index, lines) => [
    ...renderInline(line, `line-${index}`),
    ...(index < lines.length - 1 ? [<br key={`br-${index}`} />] : [])
  ]);
}

function renderInline(value: string, keyPrefix = 'inline'): ReactNode[] {
  const parts = value.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\((?:[^)\s]+)(?:\s+"[^"]*")?\))/g).filter(Boolean);
  return parts.map((part, index) => {
    const key = `${keyPrefix}:${index}:${part}`;
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={key}
          className="rounded bg-neutral-200 px-1 py-0.5 text-[0.9em] dark:bg-neutral-800"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key}>{renderInline(part.slice(2, -2), `${key}-strong`)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={key}>{renderInline(part.slice(1, -1), `${key}-em`)}</em>;
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.exec(part);
    if (link) {
      return (
        <a
          key={key}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="text-sky-600 underline underline-offset-2 dark:text-sky-400"
        >
          {renderInline(link[1] ?? '', `${key}-link`)}
        </a>
      );
    }
    return <span key={key}>{part}</span>;
  });
}
