import { useEffect, useMemo, useState } from 'react';
import type { TaskRecord } from '@shared/schemas';
import { usePara } from '../../store/para';
import { useNightShift } from '../../store/nightShift';

interface NightShiftModalProps {
  open: boolean;
  onClose: () => void;
}

export function NightShiftModal({ open, onClose }: NightShiftModalProps): JSX.Element | null {
  const tasks = usePara((s) => s.tasks);
  const start = useNightShift((s) => s.start);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [concurrency, setConcurrency] = useState(2);
  const [createPR, setCreatePR] = useState(false);
  const [ghAvailable, setGhAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setSubmitting(false);
    void window.orbit.envExt.hasGhCli().then((ok) => setGhAvailable(ok));
  }, [open]);

  const candidates = useMemo<TaskRecord[]>(
    () =>
      tasks.filter(
        (t) =>
          (t.status === 'today' || t.status === 'inbox' || t.status === 'blocked') &&
          t.uid
      ),
    [tasks]
  );

  if (!open) return null;

  const toggle = (uid: string): void => {
    const next = new Set(selected);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setSelected(next);
  };

  const submit = async (): Promise<void> => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      await start([...selected], concurrency, createPR && ghAvailable === true);
      onClose();
    } catch (e) {
      alert(`Night Shift failed: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-[720px] max-w-full rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">🌙 Start Night Shift</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200">
            ✕
          </button>
        </div>
        <p className="mb-3 text-xs text-neutral-500">
          Select tasks to run autonomously in parallel ghost worktrees. Orbit will
          run M5 safety checks before marking tasks done.
        </p>

        <div className="mb-3 max-h-64 overflow-y-auto rounded border border-neutral-200 dark:border-neutral-800">
          {candidates.length === 0 ? (
            <p className="p-3 text-xs text-neutral-500">No eligible tasks.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {candidates.map((t) => (
                <li key={t.id} className="flex items-center gap-2 p-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selected.has(t.uid ?? '')}
                    onChange={() => toggle(t.uid ?? '')}
                  />
                  <span className="flex-1 truncate">{t.title}</span>
                  <span className="text-neutral-400">{t.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mb-3 flex items-center gap-4 text-xs">
          <label className="flex items-center gap-2">
            Concurrency:
            <input
              type="range"
              min={1}
              max={4}
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
            />
            <span className="tabular-nums">{concurrency}</span>
          </label>
        </div>

        <div className="mb-4 flex items-center gap-2 text-xs">
          <input
            id="ns-pr"
            type="checkbox"
            checked={createPR}
            onChange={(e) => setCreatePR(e.target.checked)}
            disabled={ghAvailable !== true}
          />
          <label htmlFor="ns-pr" className={ghAvailable === true ? '' : 'opacity-50'}>
            Create PRs on success{' '}
            {ghAvailable === false && (
              <span className="text-amber-500">(gh CLI not found)</span>
            )}
          </label>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            disabled={selected.size === 0 || submitting}
            onClick={() => void submit()}
            className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? 'Starting…' : `Start (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
