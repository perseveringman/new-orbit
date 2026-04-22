import { useEffect } from 'react';
import { useWorktrees } from '../../store/worktrees';
import { useFiles } from '../../store/files';

export function WorktreesPanel(): JSX.Element {
  const list = useWorktrees((s) => s.list);
  const checks = useWorktrees((s) => s.checks);
  const busyId = useWorktrees((s) => s.busyId);
  const env = useWorktrees((s) => s.env);
  const init = useWorktrees((s) => s.init);
  const teardown = useWorktrees((s) => s.teardown);
  const refresh = useWorktrees((s) => s.refresh);
  const preMergeCheck = useWorktrees((s) => s.preMergeCheck);
  const merge = useWorktrees((s) => s.merge);
  const remove = useWorktrees((s) => s.remove);
  const resetAll = useWorktrees((s) => s.resetAll);
  const toast = useFiles((s) => s.toast);

  useEffect(() => {
    void init();
    return () => teardown();
  }, [init, teardown]);

  async function onReset(): Promise<void> {
    if (!window.confirm('Remove every unmerged ghost worktree? Commits on those branches will be lost.'))
      return;
    const r = await resetAll();
    if (r) toast(`Reset: ${r.removed} removed${r.errors ? `, ${r.errors} errors` : ''}`);
  }

  async function onCheck(id: string): Promise<void> {
    const r = await preMergeCheck(id);
    if (!r) {
      toast('Check failed to run');
      return;
    }
    if (r.build.ok && r.secrets.ok) toast('Pre-merge check: OK');
    else
      toast(
        `Check failed: ${!r.build.ok ? 'build' : ''}${!r.build.ok && !r.secrets.ok ? ' + ' : ''}${!r.secrets.ok ? `secrets (${r.secrets.findings.length})` : ''}`
      );
  }

  async function onMerge(id: string): Promise<void> {
    const sha = await merge(id, 'fast-forward');
    if (sha) toast(`Merged → ${sha.slice(0, 8)}`);
    else toast('Merge failed (re-run pre-merge check?)');
  }

  async function onOpen(p: string): Promise<void> {
    try {
      await window.orbit.fs.readFile(p);
    } catch {
      // ignore — readFile may reject on a directory; we just want to surface the path.
    }
    toast(p);
  }

  const active = list.filter((w) => w.status === 'active');

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          Worktrees ({active.length} active)
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => void refresh()}
            className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Refresh
          </button>
          <button
            onClick={() => void onReset()}
            className="rounded border border-red-400/50 px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-500/10 dark:text-red-300"
          >
            Reset all
          </button>
        </div>
      </div>
      {env.active && (
        <p className="mb-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
          install running: {env.active} (queue {env.queued})
        </p>
      )}
      {list.length === 0 ? (
        <p className="px-1 text-xs text-neutral-500">No worktrees yet.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((w) => {
            const r = checks[w.id];
            const canMerge = Boolean(r && r.build.ok && r.secrets.ok);
            const age = ageOf(w.createdAt);
            return (
              <li
                key={w.id}
                className="rounded border border-neutral-200 p-2 text-xs dark:border-neutral-800"
              >
                <div className="flex items-center gap-2">
                  <StatusDot status={w.status} />
                  <span className="flex-1 truncate font-mono">{w.id}</span>
                  <span className="text-[10px] text-neutral-500">{age}</span>
                </div>
                <p className="truncate text-[10px] text-neutral-500">{w.branch}</p>
                {w.taskId && (
                  <p className="truncate text-[10px] text-neutral-500">
                    task: {w.taskId}
                  </p>
                )}
                {r && (
                  <p
                    className={
                      'mt-1 text-[10px] ' +
                      (r.build.ok && r.secrets.ok
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400')
                    }
                  >
                    check: build={r.build.ok ? '✓' : '✗'} secrets={r.secrets.ok ? '✓' : '✗'}
                    {r.secrets.findings.length > 0
                      ? ` (${r.secrets.findings.length} findings)`
                      : ''}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    onClick={() => void onOpen(w.path)}
                    className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    Path
                  </button>
                  <button
                    onClick={() => void onCheck(w.id)}
                    disabled={busyId === w.id}
                    className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    Check
                  </button>
                  <button
                    onClick={() => void onMerge(w.id)}
                    disabled={!canMerge || busyId === w.id}
                    className="rounded border border-emerald-400/50 px-1.5 py-0.5 text-[10px] text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-40 dark:text-emerald-300"
                  >
                    Merge ff
                  </button>
                  <button
                    onClick={() => void remove(w.id, true)}
                    disabled={busyId === w.id}
                    className="rounded border border-red-400/50 px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-500/10 disabled:opacity-40 dark:text-red-300"
                  >
                    Abort
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }): JSX.Element {
  const color =
    status === 'active'
      ? 'bg-emerald-500'
      : status === 'merged'
        ? 'bg-neutral-400'
        : 'bg-red-500';
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

function ageOf(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}
