import { useEffect, useRef, useState } from 'react';
import { usePara, type WorkspaceView } from '../../store/para';
import { useWorkspace } from '../../store/workspace';
import type { ProjectSummaryDTO } from '@shared/ipc';
import type { TaskRecord } from '@shared/schemas';
import type { InboxEvent, InboxItem } from '@shared/inbox';
import { WORKSPACE_DESTINATIONS, type WorkspaceDestination } from '../topbarModel';
import { AreasNav } from './AreasNav';
import { useInbox } from '../../store/inbox';
import { ResourcesNav } from './ResourcesNav';

export const PRIMARY_WORKSPACE_KINDS: WorkspaceView['kind'][] = [
  'dashboard',
  'askAnywhere',
  'inbox',
  'today',
  'timeline',
  'review'
];

const SECTION_WORKSPACE_KINDS: WorkspaceView['kind'][] = ['resources'];

export function isPrimaryWorkspaceDestination(destination: WorkspaceDestination): boolean {
  return PRIMARY_WORKSPACE_KINDS.includes(destination.view.kind);
}

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
  const initInbox = useInbox((state) => state.init);
  const inboxPendingCount = useInbox((state) => state.counts.sidebarMessagesPending);
  const [countsByUid, setCountsByUid] = useState<Record<string, number>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primaryDestinations = PRIMARY_WORKSPACE_KINDS.map((kind) =>
    WORKSPACE_DESTINATIONS.find((destination) => destination.view.kind === kind)
  ).filter((destination): destination is WorkspaceDestination => Boolean(destination));
  const overflowDestinations = WORKSPACE_DESTINATIONS.filter(
    (destination) => !isPrimaryWorkspaceDestination(destination) && !SECTION_WORKSPACE_KINDS.includes(destination.view.kind)
  );
  const overflowActive = overflowDestinations.some((destination) => isQuickItemActive(view, destination));

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
    initInbox();
  }, [initInbox]);

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
        {primaryDestinations.map((it) => {
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
      <WorkspaceOverflowMenu
        destinations={overflowDestinations}
        view={view}
        inboxPendingCount={inboxPendingCount}
        defaultOpen={overflowActive}
        onSelect={(destination) => setView(destination.view)}
      />

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

      <hr className="my-2 border-neutral-200 dark:border-neutral-800" />

      <ResourcesNav />
    </div>
  );
}

export function WorkspaceOverflowMenu({
  destinations,
  view,
  inboxPendingCount,
  defaultOpen,
  onSelect
}: {
  destinations: WorkspaceDestination[];
  view: WorkspaceView;
  inboxPendingCount: number;
  defaultOpen: boolean;
  onSelect(destination: WorkspaceDestination): void;
}): JSX.Element | null {
  if (destinations.length === 0) return null;
  const active = destinations.some((destination) => isQuickItemActive(view, destination));

  return (
    <details className="mt-1 text-sm" open={defaultOpen}>
      <summary
        className={
          'flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1 text-neutral-700 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800/60 ' +
          (active ? 'bg-neutral-200/80 dark:bg-neutral-800/80' : '')
        }
      >
        <span className="w-4 shrink-0 text-neutral-500">⋯</span>
        <span className="min-w-0 flex-1 truncate">More</span>
      </summary>
      <ul className="mt-1 space-y-0.5 pl-3">
        {destinations.map((destination) => (
          <li key={destination.label}>
            <WorkspaceQuickItem
              destination={destination}
              active={isQuickItemActive(view, destination)}
              badgeCount={workspaceBadgeCount(destination, inboxPendingCount)}
              onClick={() => onSelect(destination)}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}

export function workspaceBadgeCount(
  destination: WorkspaceDestination,
  inboxPendingCount: number
): number {
  return destination.view.kind === 'inbox' ? inboxPendingCount : 0;
}

export function pendingMessageIdsFromItems(items: InboxItem[]): Set<string> {
  return new Set(
    items
      .filter((item) => item.category === 'message' && item.status === 'pending')
      .map((item) => item.id)
  );
}

export function applyInboxBadgeEvent(current: Set<string>, event: InboxEvent): Set<string> {
  if (event.item.category !== 'message') return current;
  const next = new Set(current);
  if (event.item.status === 'pending' && event.type !== 'archived') next.add(event.item.id);
  else next.delete(event.item.id);
  return next;
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
        <span
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium leading-none text-white"
          title={`${badgeCount} pending inbox messages`}
        >
          {badgeCount}
        </span>
      ) : null}
    </button>
  );
}
