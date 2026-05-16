import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, GitBranch, RefreshCw } from 'lucide-react';
import { classifyPatch, formatShortSha } from './Inspector/changes/diffFormatting';

// TODO(integration): replace with @shared/git DiffResult
interface LocalDiffFile {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  patch: string;
  binary?: boolean;
}

// TODO(integration): replace with @shared/git DiffResult
interface LocalDiffResult {
  base: string;
  head: string;
  mergeBase: string;
  files: LocalDiffFile[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface DiffPaneProps {
  worktreeId: string;
  base?: string;
  branchLabel?: string;
  branchControl?: ReactNode;
  className?: string;
}

const STATUS_META: Record<
  LocalDiffFile['status'],
  { glyph: string; className: string; label: string }
> = {
  added: { glyph: 'A', className: 'text-emerald-600 dark:text-emerald-400', label: 'Added' },
  modified: { glyph: 'M', className: 'text-amber-600 dark:text-amber-400', label: 'Modified' },
  deleted: { glyph: 'D', className: 'text-red-600 dark:text-red-400', label: 'Deleted' },
  renamed: { glyph: 'R', className: 'text-sky-600 dark:text-sky-400', label: 'Renamed' }
};

export { classifyPatch, formatShortSha };

export type UnifiedDiffRow =
  | {
      type: 'skip';
      key: string;
      count: number;
    }
  | {
      type: 'line';
      key: string;
      kind: 'add' | 'del' | 'ctx' | 'meta';
      marker: '+' | '-' | ' ';
      oldLine: number | null;
      newLine: number | null;
      text: string;
    };

function isPatchMetadata(line: string): boolean {
  return (
    line.startsWith('diff --git') ||
    line.startsWith('index ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ') ||
    line.startsWith('new file mode') ||
    line.startsWith('deleted file mode') ||
    line.startsWith('similarity index') ||
    line.startsWith('rename ')
  );
}

export function parseUnifiedPatch(patch: string): UnifiedDiffRow[] {
  const rawLines = patch.split('\n');
  const lines = rawLines[rawLines.length - 1] === '' ? rawLines.slice(0, -1) : rawLines;
  const rows: UnifiedDiffRow[] = [];
  let oldLine = 1;
  let newLine = 1;
  let nextUnchangedOldLine = 1;
  let hunkIndex = 0;

  lines.forEach((line, index) => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      const oldStart = Number(hunk[1]);
      const newStart = Number(hunk[2]);
      const skipped = oldStart - nextUnchangedOldLine;
      if (skipped > 0) {
        rows.push({
          type: 'skip',
          key: `skip:${hunkIndex}:${oldStart}`,
          count: skipped
        });
      }
      oldLine = oldStart;
      newLine = newStart;
      nextUnchangedOldLine = oldStart;
      hunkIndex += 1;
      return;
    }

    if (isPatchMetadata(line)) return;

    if (line.startsWith('\\')) {
      rows.push({
        type: 'line',
        key: `meta:${index}`,
        kind: 'meta',
        marker: ' ',
        oldLine: null,
        newLine: null,
        text: line
      });
      return;
    }

    const marker = line.startsWith('+') ? '+' : line.startsWith('-') ? '-' : ' ';
    const text = marker === ' ' ? (line.startsWith(' ') ? line.slice(1) : line) : line.slice(1);

    if (marker === '+') {
      rows.push({
        type: 'line',
        key: `add:${index}:${newLine}`,
        kind: 'add',
        marker,
        oldLine: null,
        newLine,
        text
      });
      newLine += 1;
      return;
    }

    if (marker === '-') {
      rows.push({
        type: 'line',
        key: `del:${index}:${oldLine}`,
        kind: 'del',
        marker,
        oldLine,
        newLine: null,
        text
      });
      oldLine += 1;
      nextUnchangedOldLine = oldLine;
      return;
    }

    rows.push({
      type: 'line',
      key: `ctx:${index}:${oldLine}:${newLine}`,
      kind: 'ctx',
      marker,
      oldLine,
      newLine,
      text
    });
    oldLine += 1;
    newLine += 1;
    nextUnchangedOldLine = oldLine;
  });

  return rows;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function lineNumber(row: Extract<UnifiedDiffRow, { type: 'line' }>): number | null {
  if (row.kind === 'add') return row.newLine;
  return row.oldLine ?? row.newLine;
}

export function DiffPane(props: DiffPaneProps): JSX.Element {
  const { worktreeId, base, branchLabel, branchControl, className } = props;
  const [result, setResult] = useState<LocalDiffResult | null>(null);
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const effectiveBase = base ?? 'main';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = (window as unknown as {
        orbit?: { git?: { getDiff?: (args: { worktreeId: string; base?: string }) => Promise<unknown> } };
      }).orbit;
      const fn = api?.git?.getDiff;
      if (!fn) throw new Error('git.getDiff IPC not registered');
      const raw = await fn({ worktreeId, base });
      const r = raw as unknown as LocalDiffResult;
      setResult(r);
      setCollapsedFiles((current) => {
        const next: Record<string, boolean> = {};
        for (const file of r.files) next[file.path] = current[file.path] ?? false;
        return next;
      });
    } catch (e) {
      setError((e as Error).message || '加载 diff 失败');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [worktreeId, base]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load, nonce]);

  const totals = useMemo(() => {
    if (!result) return { add: 0, del: 0 };
    return { add: result.totalAdditions, del: result.totalDeletions };
  }, [result]);

  const rowsByFile = useMemo(
    () =>
      new Map(
        (result?.files ?? []).map((file) => [
          file.path,
          file.binary ? [] : parseUnifiedPatch(file.patch)
        ])
      ),
    [result?.files]
  );

  const rootClass = [
    'flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-[#111111] dark:text-neutral-200',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass}>
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-3 text-xs dark:border-neutral-800">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch size={14} className="shrink-0 text-neutral-500" />
          {branchControl ?? (
            <span className="shrink-0 text-neutral-500 dark:text-neutral-400">分支</span>
          )}
          <span className="font-mono text-emerald-600 dark:text-emerald-400">+{formatNumber(totals.add)}</span>
          <span className="font-mono text-rose-600 dark:text-rose-400">-{formatNumber(totals.del)}</span>
          <span className="min-w-0 truncate font-mono text-neutral-500 dark:text-neutral-500">
            {effectiveBase}
            <span className="px-1.5 text-neutral-300 dark:text-neutral-700">→</span>
            {branchLabel || (result ? formatShortSha(result.head) : '…')}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {result && (
            <span className="hidden font-mono text-[11px] text-neutral-400 dark:text-neutral-600 xl:inline">
              合并基线 {formatShortSha(result.mergeBase)}
            </span>
          )}
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            disabled={loading}
            className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            title="刷新 diff"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            className="rounded border border-red-300 px-2 py-0.5 hover:bg-red-100 dark:border-red-700 dark:hover:bg-red-900/50"
          >
            重试
          </button>
        </div>
      )}

      {!error && result && result.files.length === 0 && !loading && (
        <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
          相比 <span className="mx-1 font-mono text-neutral-700 dark:text-neutral-300">{effectiveBase}</span> 没有变更
        </div>
      )}

      {!error && result && result.files.length > 0 && (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="min-w-[720px] pb-8">
            {result.files.map((file) => {
              const meta = STATUS_META[file.status];
              const collapsed = collapsedFiles[file.path] === true;
              const rows = rowsByFile.get(file.path) ?? [];

              return (
                <section key={file.path} className="border-b border-neutral-200 dark:border-neutral-900/80">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedFiles((current) => ({
                        ...current,
                        [file.path]: !collapsed
                      }))
                    }
                    className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-neutral-200 bg-white/95 px-3 py-2 text-left backdrop-blur dark:border-neutral-900 dark:bg-[#111111]/95"
                  >
                    <span className="rounded bg-neutral-100 p-1 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                      {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </span>
                    <span className={`w-4 shrink-0 text-center text-[11px] font-semibold ${meta.className}`} title={meta.label}>
                      {meta.glyph}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-sm text-neutral-900 dark:text-neutral-100">
                      {file.path}
                    </span>
                    <span className="shrink-0 font-mono text-xs">
                      <span className="text-emerald-600 dark:text-emerald-400">+{formatNumber(file.additions)}</span>
                      <span className="px-1 text-neutral-300 dark:text-neutral-700"> </span>
                      <span className="text-rose-600 dark:text-rose-400">-{formatNumber(file.deletions)}</span>
                    </span>
                  </button>

                  {!collapsed && (
                    <div className="font-mono text-xs leading-5">
                      {file.binary ? (
                        <div className="flex h-24 items-center justify-center text-neutral-500">
                          二进制文件 — 不显示
                        </div>
                      ) : rows.length === 0 ? (
                        <div className="flex h-24 items-center justify-center text-neutral-500">
                          没有可用的文本补丁
                        </div>
                      ) : (
                        rows.map((row) => {
                          if (row.type === 'skip') {
                            return (
                              <div key={row.key} className="flex items-center py-1">
                                <span className="w-11 shrink-0" />
                                <div className="mx-2 flex-1 rounded-md bg-neutral-100 px-3 py-1 text-[11px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500">
                                  {formatNumber(row.count)} 行未修改
                                </div>
                              </div>
                            );
                          }

                          const number = lineNumber(row);
                          const isAdd = row.kind === 'add';
                          const isDel = row.kind === 'del';
                          const rowClass = isAdd
                            ? 'border-l-2 border-emerald-500 bg-emerald-50 text-emerald-950 dark:border-emerald-400 dark:bg-emerald-950/45 dark:text-emerald-50'
                            : isDel
                              ? 'border-l-2 border-rose-500 bg-rose-50 text-rose-950 dark:border-rose-400 dark:bg-rose-950/35 dark:text-rose-50'
                              : 'border-l-2 border-transparent text-neutral-700 dark:text-neutral-300';
                          const markerClass = isAdd
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : isDel
                              ? 'text-rose-700 dark:text-rose-300'
                              : 'text-neutral-400 dark:text-neutral-600';

                          return (
                            <div key={row.key} className={`flex min-w-max ${rowClass}`}>
                              <span className="w-11 shrink-0 select-none px-2 text-right text-neutral-400 dark:text-neutral-500">
                                {number ?? ''}
                              </span>
                              <span className={`w-5 shrink-0 select-none text-center ${markerClass}`}>
                                {row.marker}
                              </span>
                              <span className="whitespace-pre pr-4">{row.text || ' '}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
