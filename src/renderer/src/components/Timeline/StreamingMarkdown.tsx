import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface MarkdownReferenceToken {
  raw: string;
  handle: string;
}

export interface MarkdownLinkToken {
  href: string;
  label: string;
}

export type MarkdownReferenceTokenRenderer = (
  token: MarkdownReferenceToken,
  key: string
) => ReactNode | null;

export type MarkdownLinkRenderer = (
  token: MarkdownLinkToken,
  key: string
) => ReactNode | null;

interface StreamingMarkdownProps {
  content: string;
  animate?: boolean;
  chunkSize?: number;
  intervalMs?: number;
  renderReferenceToken?: MarkdownReferenceTokenRenderer;
  renderLink?: MarkdownLinkRenderer;
}

export function StreamingMarkdown({
  content,
  animate = false,
  chunkSize = 3,
  intervalMs = 16,
  renderReferenceToken,
  renderLink
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
        <Fragment key={`${block.kind}:${index}`}>
          {renderMarkdownBlock(block, { renderReferenceToken, renderLink })}
        </Fragment>
      ))}
    </div>
  );
}

interface MarkdownRenderOptions {
  renderReferenceToken?: MarkdownReferenceTokenRenderer;
  renderLink?: MarkdownLinkRenderer;
}

type MarkdownBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'table'; headers: string[]; alignments: TableAlignment[]; rows: string[][] }
  | { kind: 'unordered-list'; items: string[] }
  | { kind: 'ordered-list'; items: string[] }
  | { kind: 'blockquote'; lines: string[] }
  | { kind: 'code'; language?: string; code: string };

type TableAlignment = 'left' | 'center' | 'right' | null;

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

    const table = parseTableAt(lines, index);
    if (table) {
      blocks.push(table.block);
      index = table.nextIndex;
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
    while (index < lines.length && !isBlockBoundary(lines, index)) {
      paragraph.push(lines[index] ?? '');
      index += 1;
    }
    blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
  }

  return blocks;
}

function isBlockBoundary(lines: string[], index: number): boolean {
  const line = lines[index] ?? '';
  return (
    !line.trim() ||
    line.startsWith('```') ||
    Boolean(parseTableAt(lines, index)) ||
    /^#{1,6}\s+/.test(line) ||
    line.startsWith('> ') ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line)
  );
}

function parseTableAt(
  lines: string[],
  index: number
): { block: Extract<MarkdownBlock, { kind: 'table' }>; nextIndex: number } | null {
  const headerLine = lines[index] ?? '';
  const separatorLine = lines[index + 1] ?? '';
  if (!headerLine.includes('|') || !isTableSeparatorLine(separatorLine)) return null;

  const headers = splitTableRow(headerLine);
  const separators = splitTableRow(separatorLine);
  if (headers.length < 2 || separators.length < 2) return null;
  if (!separators.every(isTableSeparatorCell)) return null;

  const alignments = separators.map(parseTableAlignment);
  const rows: string[][] = [];
  let nextIndex = index + 2;
  while (nextIndex < lines.length) {
    const rowLine = lines[nextIndex] ?? '';
    if (!rowLine.trim() || !rowLine.includes('|')) break;
    if (isBlockBoundaryExceptTable(lines, nextIndex)) break;
    rows.push(normalizeTableRow(splitTableRow(rowLine), headers.length));
    nextIndex += 1;
  }

  return {
    block: {
      kind: 'table',
      headers: normalizeTableRow(headers, headers.length),
      alignments: normalizeTableRow(alignments, headers.length, null),
      rows
    },
    nextIndex
  };
}

function isBlockBoundaryExceptTable(lines: string[], index: number): boolean {
  const line = lines[index] ?? '';
  return (
    line.startsWith('```') ||
    /^#{1,6}\s+/.test(line) ||
    line.startsWith('> ') ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line)
  );
}

function isTableSeparatorLine(line: string): boolean {
  if (!line.includes('|')) return false;
  const cells = splitTableRow(line);
  return cells.length >= 2 && cells.every(isTableSeparatorCell);
}

function isTableSeparatorCell(cell: string): boolean {
  return /^:?-{3,}:?$/.test(cell.trim());
}

function parseTableAlignment(cell: string): TableAlignment {
  const trimmed = cell.trim();
  const left = trimmed.startsWith(':');
  const right = trimmed.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const source = trimmed.startsWith('|') && trimmed.endsWith('|')
    ? trimmed.slice(1, -1)
    : trimmed;
  const cells: string[] = [];
  let current = '';
  let inCode = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? '';
    const prev = source[index - 1];
    if (char === '`' && prev !== '\\') {
      inCode = !inCode;
      current += char;
      continue;
    }
    if (char === '|' && !inCode && prev !== '\\') {
      cells.push(cleanTableCell(current));
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(cleanTableCell(current));
  return cells;
}

function cleanTableCell(value: string): string {
  return value.trim().replace(/\\\|/g, '|');
}

function normalizeTableRow<T>(row: T[], length: number, fill: T | '' = ''): T[] {
  if (row.length === length) return row;
  if (row.length > length) return row.slice(0, length);
  return [...row, ...Array.from({ length: length - row.length }, () => fill as T)];
}

function renderMarkdownBlock(block: MarkdownBlock, options: MarkdownRenderOptions): JSX.Element {
  switch (block.kind) {
    case 'heading': {
      const className =
        block.level === 1
          ? 'text-base font-semibold'
          : block.level === 2
            ? 'text-[15px] font-semibold'
            : 'text-sm font-semibold';
      const Tag = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3';
      return <Tag className={className}>{renderInline(block.text, 'inline', options)}</Tag>;
    }
    case 'unordered-list':
      return (
        <ul className="list-disc space-y-1 pl-5">
          {block.items.map((item, index) => (
            <li key={`${item}:${index}`}>{renderInline(item, 'inline', options)}</li>
          ))}
        </ul>
      );
    case 'ordered-list':
      return (
        <ol className="list-decimal space-y-1 pl-5">
          {block.items.map((item, index) => (
            <li key={`${item}:${index}`}>{renderInline(item, 'inline', options)}</li>
          ))}
        </ol>
      );
    case 'blockquote':
      return (
        <blockquote className="border-l-2 border-sky-300/70 pl-3 text-neutral-600 dark:border-sky-700/60 dark:text-neutral-300">
          {block.lines.map((line, index) => (
            <Fragment key={`${line}:${index}`}>
              {index > 0 ? <br /> : null}
              {renderInline(line, 'inline', options)}
            </Fragment>
          ))}
        </blockquote>
      );
    case 'table':
      return <MarkdownTable block={block} options={options} />;
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
      return <p className="break-words">{renderInlineWithLineBreaks(block.text, options)}</p>;
  }
}

function MarkdownTable({
  block,
  options
}: {
  block: Extract<MarkdownBlock, { kind: 'table' }>;
  options: MarkdownRenderOptions;
}): JSX.Element {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950/40">
      <table className="min-w-full border-collapse text-left text-[12px] leading-5">
        <thead className="bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
          <tr>
            {block.headers.map((header, index) => (
              <th
                key={`${header}:${index}`}
                className={`border-b border-neutral-200 px-3 py-2 font-semibold dark:border-neutral-800 ${alignmentClass(block.alignments[index])}`}
              >
                {renderInline(header, `table-head-${index}`, options)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {block.rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`} className="align-top">
              {block.headers.map((_, cellIndex) => (
                <td
                  key={`cell-${rowIndex}-${cellIndex}`}
                  className={`max-w-[18rem] break-words px-3 py-2 text-neutral-700 dark:text-neutral-200 ${alignmentClass(block.alignments[cellIndex])}`}
                >
                  {renderInline(row[cellIndex] ?? '', `table-${rowIndex}-${cellIndex}`, options)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function alignmentClass(alignment: TableAlignment | undefined): string {
  switch (alignment) {
    case 'center':
      return 'text-center';
    case 'right':
      return 'text-right';
    default:
      return 'text-left';
  }
}

function renderInlineWithLineBreaks(value: string, options: MarkdownRenderOptions): ReactNode[] {
  return value.split('\n').flatMap((line, index, lines) => [
    ...renderInline(line, `line-${index}`, options),
    ...(index < lines.length - 1 ? [<br key={`br-${index}`} />] : [])
  ]);
}

function renderInline(
  value: string,
  keyPrefix = 'inline',
  options: MarkdownRenderOptions = {}
): ReactNode[] {
  const parts = value
    .split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\((?:[^)\s]+)(?:\s+"[^"]*")?\)|\[\[[A-Za-z]\d+\]\]|【[A-Za-z]\d+】|\[[A-Za-z]\d+\](?!\())/g)
    .filter(Boolean);
  return parts.map((part, index) => {
    const key = `${keyPrefix}:${index}:${part}`;
    const referenceToken = parseReferenceToken(part);
    if (referenceToken && options.renderReferenceToken) {
      const rendered = options.renderReferenceToken(referenceToken, key);
      if (rendered) return <Fragment key={key}>{rendered}</Fragment>;
    }
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
      return <strong key={key}>{renderInline(part.slice(2, -2), `${key}-strong`, options)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={key}>{renderInline(part.slice(1, -1), `${key}-em`, options)}</em>;
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.exec(part);
    if (link) {
      const label = link[1] ?? '';
      const href = link[2] ?? '';
      const custom = options.renderLink?.({ href, label }, key);
      if (custom) return <Fragment key={key}>{custom}</Fragment>;
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-sky-600 underline underline-offset-2 dark:text-sky-400"
        >
          {renderInline(label, `${key}-link`, options)}
        </a>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

function parseReferenceToken(value: string): MarkdownReferenceToken | null {
  const trimmed = value.trim();
  const doubleBracket = /^\[\[([A-Za-z]\d+)\]\]$/.exec(trimmed);
  if (doubleBracket?.[1]) return { raw: value, handle: doubleBracket[1].toUpperCase() };
  const cjkBracket = /^【([A-Za-z]\d+)】$/.exec(trimmed);
  if (cjkBracket?.[1]) return { raw: value, handle: cjkBracket[1].toUpperCase() };
  const squareBracket = /^\[([A-Za-z]\d+)\]$/.exec(trimmed);
  if (squareBracket?.[1]) return { raw: value, handle: squareBracket[1].toUpperCase() };
  return null;
}
