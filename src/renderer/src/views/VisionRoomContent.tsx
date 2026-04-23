import type { TerminalAgentLaunchDTO } from '@shared/ipc';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import YAML from 'yaml';
import { NotesConnectPanel } from './NotesConnectPanel';

interface Props {
  areaPath: string;
  startCommand: string;
  reviewCommand: string;
}

interface VisionDocumentState {
  raw: string;
  placeholder: boolean;
  data: Record<string, unknown>;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function isPlaceholderVision(raw: string): boolean {
  return raw.includes('VISION.md 尚未生成');
}

function parseVision(raw: string): VisionDocumentState {
  const match = raw.match(FRONTMATTER_RE);
  let data: Record<string, unknown> = {};
  let body = raw;

  if (match) {
    body = raw.slice((match[0] ?? '').length);
    try {
      const parsed = YAML.parse(match[1] ?? '');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      data = {};
    }
  }

  return {
    raw,
    placeholder: isPlaceholderVision(raw),
    data,
    body: body.trim()
  };
}

function emitOpenTerminal(agentLaunch: TerminalAgentLaunchDTO): void {
  window.dispatchEvent(
    new CustomEvent('orbit:area-open-terminal', {
      detail: { agentLaunch }
    })
  );
}

export function VisionRoomContent({
  areaPath,
  startCommand,
  reviewCommand
}: Props): JSX.Element {
  const [doc, setDoc] = useState<VisionDocumentState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [notesDismissed, setNotesDismissed] = useState(false);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const text = await window.orbit.fs.readFile(`${areaPath}/VISION.md`);
      setDoc(parseVision(text));
    } catch (error) {
      setDoc(null);
      setLoadErr((error as Error).message);
    }
  }, [areaPath]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const off = window.orbit.fs.onEvent((event) => {
      if (event.path === `${areaPath}/VISION.md`) void load();
    });
    return off;
  }, [areaPath, load]);

  const summaryItems = useMemo(() => {
    if (!doc) return [];
    const orderedKeys = ['confidence', 'next_review', 'version', 'last_review'];
    const entries = orderedKeys
      .map((key) => [key, doc.data[key]] as const)
      .filter(([, value]) => typeof value === 'string' || typeof value === 'number');
    return entries.map(([key, value]) => ({ key, value: String(value) }));
  }, [doc]);

  if (loadErr) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {loadErr}
        </div>
      </div>
    );
  }

  if (!doc || doc.placeholder) {
    return (
      <div className="flex flex-1 justify-center overflow-auto p-8">
        <div className="flex w-full max-w-4xl flex-col gap-6">
          {!notesDismissed && <NotesConnectPanel onSkip={() => setNotesDismissed(true)} />}

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Step 2: 启动愿景访谈
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Orbit 会在 terminal 里为你预填冷启动指令。确认后按 Enter，Agent 会先检查外部笔记与
              notes-digest，然后从第 1 题开始。
            </p>
            <div className="mt-4">
              <button
                onClick={() =>
                  emitOpenTerminal({
                    launcherCommand: 'claude',
                    prompt: startCommand
                  })
                }
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
              >
                ✨ 启动愿景访谈
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 justify-center overflow-auto p-8">
      <div className="w-full max-w-4xl space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">VISION.md</h2>
            {summaryItems.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {summaryItems.map((item) => (
                  <span
                    key={item.key}
                    className="rounded-full border border-neutral-300 px-2.5 py-1 text-[11px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                  >
                    {item.key}: {item.value}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() =>
              emitOpenTerminal({
                launcherCommand: 'claude',
                prompt: reviewCommand
              })
            }
            className="rounded-md bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500"
          >
            🔄 回顾愿景
          </button>
        </div>

        <article className="rounded-2xl border border-neutral-200 bg-white px-6 py-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <SimpleMarkdownContent body={doc.body} />
        </article>
      </div>
    </div>
  );
}

function SimpleMarkdownContent({ body }: { body: string }): JSX.Element {
  const lines = body.split(/\r?\n/);
  const blocks: JSX.Element[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const fence = line.slice(3).trim();
      const chunk: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        chunk.push(lines[i] ?? '');
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre
          key={`code-${blocks.length}`}
          className="mb-4 overflow-auto rounded-xl bg-neutral-950 px-4 py-3 text-xs text-neutral-100"
        >
          <code>{fence ? `// ${fence}\n${chunk.join('\n')}` : chunk.join('\n')}</code>
        </pre>
      );
      continue;
    }

    if (/^#{1,3}\s+/.test(line)) {
      const level = line.match(/^#+/)?.[0].length ?? 1;
      const text = line.replace(/^#{1,3}\s+/, '');
      const className =
        level === 1
          ? 'mb-3 text-2xl font-semibold text-neutral-900 dark:text-neutral-100'
          : level === 2
            ? 'mb-3 mt-6 text-xl font-semibold text-neutral-900 dark:text-neutral-100'
            : 'mb-2 mt-5 text-lg font-semibold text-neutral-900 dark:text-neutral-100';
      blocks.push(
        <div key={`heading-${blocks.length}`} className={className}>
          {text}
        </div>
      );
      i += 1;
      continue;
    }

    if (line.startsWith('> ')) {
      const quote: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('> ')) {
        quote.push((lines[i] ?? '').slice(2));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`quote-${blocks.length}`}
          className="mb-4 border-l-4 border-sky-400/70 bg-sky-50/70 px-4 py-3 text-sm text-neutral-700 dark:bg-sky-950/20 dark:text-neutral-200"
        >
          {quote.map((item, index) => (
            <Fragment key={`${item}-${index}`}>
              {index > 0 && <br />}
              {item}
            </Fragment>
          ))}
        </blockquote>
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="mb-4 list-disc space-y-1 pl-5 text-sm text-neutral-800 dark:text-neutral-100">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${blocks.length}`} className="mb-4 list-decimal space-y-1 pl-5 text-sm text-neutral-800 dark:text-neutral-100">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && (lines[i] ?? '').trim()) {
      paragraph.push(lines[i] ?? '');
      i += 1;
    }
    blocks.push(
      <p key={`p-${blocks.length}`} className="mb-4 whitespace-pre-wrap text-sm leading-7 text-neutral-800 dark:text-neutral-100">
        {paragraph.join('\n')}
      </p>
    );
  }

  return <div>{blocks}</div>;
}
