import { useCallback, useEffect, useMemo, useState } from 'react';

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
  className?: string;
}

/** Returns the first 7 characters of a SHA; returns the input unchanged if shorter. */
export function formatShortSha(sha: string): string {
  if (!sha) return '';
  return sha.length >= 7 ? sha.slice(0, 7) : sha;
}

const STATUS_META: Record<
  LocalDiffFile['status'],
  { glyph: string; className: string; label: string }
> = {
  added: { glyph: '●+', className: 'text-emerald-400', label: 'Added' },
  modified: { glyph: '●~', className: 'text-amber-400', label: 'Modified' },
  deleted: { glyph: '●-', className: 'text-red-400', label: 'Deleted' },
  renamed: { glyph: '●→', className: 'text-sky-400', label: 'Renamed' }
};

interface PatchLine {
  n: number;
  text: string;
  kind: 'add' | 'del' | 'hunk' | 'meta' | 'ctx';
}

function classifyPatch(patch: string): PatchLine[] {
  const lines = patch.split('\n');
  return lines.map((text, i) => {
    let kind: PatchLine['kind'] = 'ctx';
    if (text.startsWith('@@')) kind = 'hunk';
    else if (
      text.startsWith('diff --git') ||
      text.startsWith('index ') ||
      text.startsWith('--- ') ||
      text.startsWith('+++ ') ||
      text.startsWith('new file mode') ||
      text.startsWith('deleted file mode') ||
      text.startsWith('similarity index') ||
      text.startsWith('rename ')
    ) {
      kind = 'meta';
    } else if (text.startsWith('+')) kind = 'add';
    else if (text.startsWith('-')) kind = 'del';
    return { n: i + 1, text, kind };
  });
}

export function DiffPane(props: DiffPaneProps): JSX.Element {
  const { worktreeId, base, className } = props;
  const [result, setResult] = useState<LocalDiffResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
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
      setSelected((prev) => {
        if (prev && r.files.some((f) => f.path === prev)) return prev;
        return r.files[0]?.path ?? null;
      });
    } catch (e) {
      setError((e as Error).message || 'Failed to load diff');
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

  const selectedFile = useMemo(
    () => (result && selected ? result.files.find((f) => f.path === selected) ?? null : null),
    [result, selected]
  );

  const patchLines = useMemo(
    () => (selectedFile && !selectedFile.binary ? classifyPatch(selectedFile.patch) : []),
    [selectedFile]
  );

  const rootClass = [
    'flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-neutral-800 bg-neutral-950 text-neutral-200',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass}>
      <header className="flex items-center justify-between gap-3 border-b border-neutral-800 px-3 py-2 text-xs">
        <div className="flex items-center gap-2 font-mono">
          <span className="text-neutral-400">{effectiveBase}</span>
          <span className="text-neutral-600">→</span>
          <span className="text-neutral-200">
            {result ? formatShortSha(result.head) : '…'}
          </span>
          {result && (
            <span className="ml-2 text-neutral-500">
              (merge-base {formatShortSha(result.mergeBase)})
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono">
            <span className="text-emerald-400">+{totals.add}</span>
            <span className="text-neutral-600">/</span>
            <span className="text-rose-400">-{totals.del}</span>
          </span>
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            disabled={loading}
            className="rounded border border-neutral-700 px-2 py-0.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between border-b border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            className="rounded border border-red-700 px-2 py-0.5 hover:bg-red-900/50"
          >
            Retry
          </button>
        </div>
      )}

      {!error && result && result.files.length === 0 && !loading && (
        <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
          No changes vs <span className="mx-1 font-mono text-neutral-300">{effectiveBase}</span>
        </div>
      )}

      {!error && result && result.files.length > 0 && (
        <div className="flex min-h-0 flex-1">
          <aside className="w-64 shrink-0 overflow-y-auto border-r border-neutral-800">
            <ul className="sticky top-0 divide-y divide-neutral-900">
              {result.files.map((f) => {
                const meta = STATUS_META[f.status];
                const active = f.path === selected;
                return (
                  <li key={f.path}>
                    <button
                      type="button"
                      onClick={() => setSelected(f.path)}
                      className={[
                        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs',
                        active ? 'bg-neutral-800/80' : 'hover:bg-neutral-900'
                      ].join(' ')}
                      title={meta.label}
                    >
                      <span className={`font-mono ${meta.className}`}>{meta.glyph}</span>
                      <span className="flex-1 truncate font-mono text-neutral-200">
                        {f.path}
                      </span>
                      <span className="font-mono text-[10px] text-neutral-500">
                        <span className="text-emerald-400">+{f.additions}</span>
                        /
                        <span className="text-rose-400">-{f.deletions}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {selectedFile?.binary ? (
              <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
                Binary file — not shown
              </div>
            ) : selectedFile ? (
              <pre className="m-0 flex-1 overflow-auto font-mono text-xs leading-5">
                {patchLines.map((l) => {
                  const bg =
                    l.kind === 'add'
                      ? 'bg-emerald-500/20'
                      : l.kind === 'del'
                        ? 'bg-rose-500/20'
                        : '';
                  const fg =
                    l.kind === 'hunk'
                      ? 'italic text-neutral-500'
                      : l.kind === 'meta'
                        ? 'text-neutral-500'
                        : 'text-neutral-200';
                  return (
                    <div key={l.n} className={`flex ${bg}`}>
                      <span className="w-10 shrink-0 select-none border-r border-neutral-800 px-2 text-right text-neutral-600">
                        {l.n}
                      </span>
                      <span className={`whitespace-pre px-2 ${fg}`}>{l.text || ' '}</span>
                    </div>
                  );
                })}
              </pre>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
                Select a file
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
