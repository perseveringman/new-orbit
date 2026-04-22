import { useEffect } from 'react';
import { useReviewQueue } from '../store/reviewQueue';
import { useFiles } from '../store/files';

export function ReviewInboxView(): JSX.Element {
  const items = useReviewQueue((s) => s.items);
  const seedFromNightShift = useReviewQueue((s) => s.seedFromNightShift);
  const ingestAgentEvent = useReviewQueue((s) => s.ingestAgentEvent);
  const dismiss = useReviewQueue((s) => s.dismiss);
  const toast = useFiles((s) => s.toast);

  useEffect(() => {
    let cancelled = false;
    void window.orbit.nightShift.list().then((runs) => {
      if (!cancelled) seedFromNightShift(runs);
    });
    const off = window.orbit.agent.onEvent(({ runId, event }) => {
      ingestAgentEvent(runId, event);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [ingestAgentEvent, seedFromNightShift]);

  async function onApprove(worktreeId?: string): Promise<void> {
    if (!worktreeId) {
      toast('No worktree linked to this review item.');
      return;
    }
    try {
      const result = await window.orbit.git.mergeGhost(worktreeId, {
        strategy: 'fast-forward'
      });
      toast(result.ok ? 'Merged ghost branch.' : 'Merge failed.');
    } catch (error) {
      toast(`Merge failed: ${(error as Error).message}`);
    }
  }

  async function onReject(worktreeId?: string): Promise<void> {
    if (!worktreeId) {
      toast('No worktree linked to this review item.');
      return;
    }
    try {
      await window.orbit.git.removeWorktree(worktreeId, { force: true });
      toast('Discarded worktree.');
    } catch (error) {
      toast(`Discard failed: ${(error as Error).message}`);
    }
  }

  function openDiff(worktreeId?: string): void {
    if (!worktreeId) {
      toast('No worktree linked to this review item.');
      return;
    }
    window.dispatchEvent(
      new CustomEvent('orbit:open-right-tab', {
        detail: { tab: 'diff', worktreeId }
      })
    );
  }

  function openLog(runId?: string): void {
    if (!runId) {
      toast('No run log linked to this review item.');
      return;
    }
    window.dispatchEvent(
      new CustomEvent('orbit:open-right-tab', {
        detail: { tab: 'runlog', runId }
      })
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Morning Review</h2>
          <p className="text-xs text-neutral-500">
            Review completed Night Shift tasks and permission requests.
          </p>
        </div>
        <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-[11px] dark:border-neutral-700">
          {items.length}
        </span>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded border border-dashed border-neutral-300 text-sm text-neutral-500 dark:border-neutral-700">
          Inbox clear.
        </div>
      ) : (
        <ul className="space-y-2 overflow-auto">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded border border-neutral-200 bg-white/50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.title}</p>
                  {item.detail && (
                    <p className="mt-1 text-xs text-neutral-500">{item.detail}</p>
                  )}
                  <p className="mt-1 text-[11px] text-neutral-400">
                    {item.source} · {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openDiff(item.worktreeId)}
                    className="rounded border border-sky-400/50 px-2 py-1 text-[11px] text-sky-600 hover:bg-sky-500/10 dark:text-sky-300"
                  >
                    Diff
                  </button>
                  <button
                    onClick={() => openLog(item.runId)}
                    className="rounded border border-neutral-300 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    Log
                  </button>
                  <button
                    onClick={() => void onApprove(item.worktreeId)}
                    className="rounded border border-emerald-400/50 px-2 py-1 text-[11px] text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-300"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => void onReject(item.worktreeId)}
                    className="rounded border border-red-400/50 px-2 py-1 text-[11px] text-red-600 hover:bg-red-500/10 dark:text-red-300"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => dismiss(item.id)}
                    className="rounded border border-neutral-300 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
