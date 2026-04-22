import { useEffect, useState } from 'react';
import type { WorktreeRecord } from '@shared/git';
import { DiffPane } from './DiffPane';

export function DiffWorkspacePane(): JSX.Element {
  const [worktrees, setWorktrees] = useState<WorktreeRecord[]>([]);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    void window.orbit.git.listWorktrees().then((list) => {
      if (cancelled) return;
      const active = list.filter((item) => item.status === 'active');
      setWorktrees(active);
      setSelected((prev) => prev || active[0]?.id || '');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onOpen(e: Event): void {
      const detail = (e as CustomEvent<{ tab: string; worktreeId?: string }>).detail;
      if (detail?.tab !== 'diff' || !detail.worktreeId) return;
      setSelected(detail.worktreeId);
    }
    window.addEventListener('orbit:open-right-tab', onOpen as EventListener);
    return () => window.removeEventListener('orbit:open-right-tab', onOpen as EventListener);
  }, []);

  if (worktrees.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded border border-dashed border-neutral-300 text-sm text-neutral-500 dark:border-neutral-700">
        No active worktree to diff.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
      >
        {worktrees.map((worktree) => (
          <option key={worktree.id} value={worktree.id}>
            {worktree.id} · {worktree.branch}
          </option>
        ))}
      </select>
      <div className="min-h-0 flex-1">
        <DiffPane worktreeId={selected} className="h-full" />
      </div>
    </div>
  );
}
