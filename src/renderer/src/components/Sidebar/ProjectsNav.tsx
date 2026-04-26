import { useEffect, useRef, useState } from 'react';
import { usePara, type WorkspaceView } from '../../store/para';
import { useWorkspace } from '../../store/workspace';
import type { ProjectSummaryDTO } from '@shared/ipc';
import type { TaskRecord } from '@shared/schemas';
import { WORKSPACE_DESTINATIONS, type WorkspaceDestination } from '../topbarModel';
import { AreasNav } from './AreasNav';

function isQuickItemActive(view: WorkspaceView, it: WorkspaceDestination): boolean {
  if (view.kind !== it.view.kind) return false;
  if (it.view.kind === 'kanban') {
    return view.kind === 'kanban' && view.projectUid === null;
  }
  return true;
}

function statusDotClass(status: string): string {
  if (status === 'active') return 'bg-green-500';
  if (status === 'blocked' || status === 'paused') return 'bg-yellow-400';
  return 'bg-neutral-400';
}

export function ProjectsNav(): JSX.Element {
  const view = usePara((s) => s.view);
  const setView = usePara((s) => s.setView);
  const { projects } = useWorkspace();
  const setActiveProjectUid = useWorkspace((s) => s.setActiveProjectUid);
  const [countsByUid, setCountsByUid] = useState<Record<string, number>>({});
  const [inboxPendingCount, setInboxPendingCount] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openNewProject(): void {
    window.dispatchEvent(new CustomEvent('orbit:open-new-project'));
  }

  async function refreshCounts(list: ProjectSummaryDTO[]): Promise<void> {
    if (list.length === 0) {
      setCountsByUid({});
      return;
    }
    try {
      const results: TaskRecord[][] = await Promise.all(
        list.map((p) => window.orbit.project.getTasks(p.uid))
      );
      const counts: Record<string, number> = {};
      list.forEach((p, i) => {
        counts[p.uid] = results[i].filter((t) => t.status !== 'done').length;
      });
      setCountsByUid(counts);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void refreshCounts(projects);
  }, [projects]);

  useEffect(() => {
    const off = window.orbit.fs.onEvent(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void refreshCounts(projects);
      }, 500);
    });
    return () => {
      off();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [projects]);

  useEffect(() => {
    async function refreshInboxCount(): Promise<void> {
      try {
        const result = await window.orbit.inbox.list({ includeArchived: true });
        setInboxPendingCount(result.counts.sidebarMessagesPending);
      } catch {
        setInboxPendingCount(0);
      }
    }

    void refreshInboxCount();
    const dispose = window.orbit.inbox.onEvent(() => void refreshInboxCount());
    return dispose;
  }, []);

  function onClickProject(p: ProjectSummaryDTO): void {
    setActiveProjectUid(p.uid);
    setView({ kind: 'project', projectUid: p.uid });
  }

  return (
    <div className="flex flex-col gap-1">
      <h2 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        Workspace
      </h2>
      <ul className="space-y-0.5 text-sm">
        {WORKSPACE_DESTINATIONS.map((it) => {
          const active = isQuickItemActive(view, it);
          return (
            <li key={it.label}>
              <WorkspaceQuickItem
                destination={it}
                active={active}
                badgeCount={workspaceBadgeCount(it, inboxPendingCount)}
                onClick={() => setView(it.view)}
              />
            </li>
          );
        })}
      </ul>

      <hr className="my-2 border-neutral-200 dark:border-neutral-800" />

      <AreasNav />

      <hr className="my-2 border-neutral-200 dark:border-neutral-800" />

      <div className="flex items-center justify-between px-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Projects
        </h2>
        <button
          onClick={openNewProject}
          title="New project"
          className="rounded px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-300"
        >
          Create
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 px-2 text-center">
          <span className="text-xs text-neutral-400 dark:text-neutral-500">No projects yet</span>
          <button
            onClick={openNewProject}
            className="rounded bg-neutral-200/80 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-300/60 dark:bg-neutral-800/80 dark:text-neutral-300 dark:hover:bg-neutral-700/60"
          >
            Create project
          </button>
        </div>
      ) : (
        <ul className="mt-1 space-y-0.5 text-sm">
          {projects.map((p) => {
            const active = view.kind === 'project' && view.projectUid === p.uid;
            const count = countsByUid[p.uid] ?? 0;
            return (
              <li key={p.uid}>
                <button
                  onClick={() => onClickProject(p)}
                  className={
                    'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-neutral-700 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800/60 ' +
                    (active ? 'bg-neutral-200/80 dark:bg-neutral-800/80' : '')
                  }
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(p.status)}`}
                  />
                  <span className="flex-1 truncate">{p.name}</span>
                  {count > 0 && (
                    <span className="shrink-0 rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                      {count}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function workspaceBadgeCount(
  destination: WorkspaceDestination,
  inboxPendingCount: number
): number {
  return destination.view.kind === 'inbox' ? inboxPendingCount : 0;
}

export function WorkspaceQuickItem({
  destination,
  active,
  badgeCount,
  onClick
}: {
  destination: WorkspaceDestination;
  active: boolean;
  badgeCount: number;
  onClick(): void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={
        'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-neutral-700 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800/60 ' +
        (active ? 'bg-neutral-200/80 dark:bg-neutral-800/80' : '')
      }
    >
      <span className="w-4 shrink-0 text-neutral-500">{destination.icon}</span>
      <span className="min-w-0 flex-1 truncate">{destination.label}</span>
      {badgeCount > 0 ? (
        <span className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {badgeCount}
        </span>
      ) : null}
    </button>
  );
}
