import { useEffect, useState } from 'react';
import type { WorktreeRecord } from '@shared/git';
import { GitBranch } from 'lucide-react';
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
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-[#111111] dark:text-neutral-200">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-neutral-200 px-3 text-xs dark:border-neutral-800">
          <GitBranch size={14} className="text-neutral-500" />
          <span className="text-neutral-500 dark:text-neutral-400">Branch</span>
          <span className="font-mono text-emerald-600 dark:text-emerald-400">+0</span>
          <span className="font-mono text-rose-600 dark:text-rose-400">-0</span>
          <span className="font-mono text-neutral-500">main → worktree</span>
        </header>
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-neutral-500">
          No active worktree to diff.
        </div>
      </div>
    );
  }

  const selectedWorktree = worktrees.find((worktree) => worktree.id === selected) ?? worktrees[0];
  const branchControl =
    worktrees.length > 1 ? (
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="max-w-40 rounded border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800 outline-none dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200"
      >
        {worktrees.map((worktree) => (
          <option key={worktree.id} value={worktree.id}>
            {worktree.branch}
          </option>
        ))}
      </select>
    ) : (
      <span className="max-w-40 truncate text-neutral-700 dark:text-neutral-300">{selectedWorktree?.branch ?? 'Branch'}</span>
    );

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <DiffPane
          worktreeId={selected}
          branchLabel={selectedWorktree?.branch}
          branchControl={branchControl}
          className="h-full"
        />
      </div>
    </div>
  );
}
