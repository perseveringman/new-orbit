import { useEffect, useState } from 'react';
import type { NightShiftRunDTO } from '@shared/ipc';
import { useFiles } from '../store/files';

interface Props {
  open: boolean;
  onClose(): void;
}

const overlay =
  'fixed inset-0 z-40 flex justify-end bg-black/30 backdrop-blur-sm';
const panel =
  'h-full w-[min(560px,95vw)] overflow-hidden border-l border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900';

/**
 * NightShiftHistoryDrawer — browse past Night Shift runs and their
 * per-task phase / branch / PR metadata. Data source is IPC `nightShift.list`;
 * clicking a run expands the task roster.
 */
export function NightShiftHistoryDrawer({ open, onClose }: Props): JSX.Element | null {
  const [runs, setRuns] = useState<NightShiftRunDTO[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useFiles((s) => s.toast);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const r = await window.orbit.nightShift.list();
        if (!cancelled) setRuns(r);
      } catch (e) {
        if (!cancelled) toast(`Failed to load history: ${(e as Error).message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, toast]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={panel} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <h2 className="text-sm font-semibold">Night Shift history</h2>
          <button
            onClick={onClose}
            className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            ✕
          </button>
        </header>
        <div className="h-[calc(100vh-48px)] overflow-auto p-3 text-xs">
          {loading && <p className="text-neutral-500">Loading…</p>}
          {!loading && runs.length === 0 && (
            <p className="text-neutral-500">No Night Shift runs yet.</p>
          )}
          <ul className="space-y-2">
            {runs.map((r) => {
              const done = r.tasks.filter((t) => t.phase === 'done').length;
              const isOpen = expanded === r.runId;
              return (
                <li
                  key={r.runId}
                  className="rounded border border-neutral-200 dark:border-neutral-700"
                >
                  <button
                    aria-expanded={isOpen}
                    aria-controls={`ns-run-${r.runId}`}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left"
                    onClick={() => setExpanded(isOpen ? null : r.runId)}
                  >
                    <span>{isOpen ? '▾' : '▸'}</span>
                    <span className="font-mono">{r.runId.slice(0, 8)}</span>
                    <span className="text-neutral-500">
                      {new Date(r.startedAt).toLocaleString()}
                    </span>
                    <span
                      className={
                        'ml-auto rounded px-2 py-0.5 text-[10px] ' +
                        (r.status === 'done'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : r.status === 'running'
                            ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
                            : r.status === 'cancelled'
                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                              : 'bg-red-500/10 text-red-700 dark:text-red-300')
                      }
                    >
                      {r.status}
                    </span>
                    <span className="text-neutral-500">
                      {done}/{r.tasks.length}
                    </span>
                  </button>
                  {isOpen && (
                    <ul
                      id={`ns-run-${r.runId}`}
                      className="divide-y divide-neutral-200 border-t border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800"
                    >
                      {r.tasks.map((t) => (
                        <li
                          key={t.taskUid}
                          className="flex flex-wrap items-center gap-2 px-3 py-1.5"
                        >
                          <span className="truncate font-medium">{t.title}</span>
                          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                            {t.phase}
                          </span>
                          {t.branch && (
                            <span className="font-mono text-[10px] text-neutral-500">
                              {t.branch}
                            </span>
                          )}
                          {t.prUrl && (
                            <a
                              href={t.prUrl}
                              onClick={(e) => {
                                e.preventDefault();
                                // electron renderer: open via shell through terminal
                                window.open(t.prUrl, '_blank', 'noopener');
                              }}
                              className="text-sky-600 hover:underline dark:text-sky-400"
                            >
                              PR ↗
                            </a>
                          )}
                          {t.detail && (
                            <span className="w-full text-[11px] text-neutral-500">
                              {t.detail}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
