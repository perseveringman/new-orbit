import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TaskRecord, TaskStatus } from '@shared/schemas';
import type { ProjectSummaryDTO } from '@shared/ipc';
import type { GitHubProjectState } from '@shared/github';
import { useWorkspace } from '../store/workspace';
import { useFiles } from '../store/files';
import { usePara } from '../store/para';
import { useSidebar } from '../store/sidebar';
import { useTaskDetails } from '../store/taskDetails';
import { NewTaskModal } from '../components/Modals/NewTaskModal';
import { MigrationDialog } from '../components/Modals/MigrationDialog';
import { TerminalManager } from '../components/Terminal/TerminalManager';
import type { TerminalManagerHandle } from '../components/Terminal/TerminalManager';
import {
  consumePendingTerminalNavigation,
  queueTerminalNavigation,
  type TerminalNavigationIntent
} from '../components/Terminal/terminalNavigationIntent';
import { disposeTerminalsByPrefix } from '../components/Terminal/terminalResources';
import {
  deriveProjectRoomKanbanModel,
  type ProjectRoomOuterTab,
  resolveProjectRoomPaneHint,
  resolveProjectRoomSidebarPanel,
  resolveProjectRoomSidebarSurface
} from './projectRoomModel';
import { ProjectGitHubView } from './ProjectGitHubView';
import { ProjectSessionsView } from './ProjectSessionsView';
import { ProjectPlannerView } from './ProjectPlannerView';
import { ProjectRolesView } from './ProjectRolesView';

/**
 * ProjectRoomView — the "inside a project" mode.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ header: project name · desc · tags · action buttons      │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ [Kanban]  [Terminal]   ← outer tab bar                   │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ Kanban tab: full-width kanban + modal task details        │
 *   │ Terminal tab: TerminalManager (multi-tab + split panes)  │
 *   └──────────────────────────────────────────────────────────┘
 */

const STATUS_ORDER: TaskStatus[] = ['backlog', 'waiting', 'todo', 'doing', 'blocked', 'done'];

export function ProjectRoomView(): JSX.Element {
  const projects = useWorkspace((s) => s.projects);
  const activeProjectUid = useWorkspace((s) => s.activeProjectUid);
  const setActiveProjectUid = useWorkspace((s) => s.setActiveProjectUid);
  const refreshProjects = useWorkspace((s) => s.refreshProjects);
  const dark = useWorkspace((s) => s.resolvedTheme === 'dark');
  const vault = useWorkspace((s) => s.vault);
  const view = usePara((s) => s.view);
  const setView = usePara((s) => s.setView);
  const toast = useFiles((s) => s.toast);
  const setSidebarSurface = useSidebar((s) => s.setSurface);
  const setSidebarFocus = useSidebar((s) => s.setFocus);
  const openSidebarPanel = useSidebar((s) => s.openPanel);
  const openTaskDetails = useTaskDetails((s) => s.openTask);

  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [githubState, setGitHubState] = useState<GitHubProjectState | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [migrateOpen, setMigrateOpen] = useState(false);

  // Outer tab: 'kanban' / 'terminal' / 'sessions' / 'github', persisted per project
  const outerTabKey = `orbit.projectRoom.outerTab.${activeProjectUid ?? '__none__'}`;
  const [outerTab, setOuterTabRaw] = useState<ProjectRoomOuterTab>(() => {
    try {
      const v = localStorage.getItem(outerTabKey);
      return v === 'terminal' ||
        v === 'sessions' ||
        v === 'github' ||
        v === 'planner' ||
        v === 'roles'
        ? v
        : 'kanban';
    } catch {
      return 'kanban';
    }
  });

  const setOuterTab = useCallback(
    (tab: ProjectRoomOuterTab): void => {
      setOuterTabRaw(tab);
      try {
        localStorage.setItem(outerTabKey, tab);
      } catch {
        /* ignore */
      }
    },
    [outerTabKey]
  );

  // Reload persisted outer tab when project changes
  useEffect(() => {
    try {
      const key = `orbit.projectRoom.outerTab.${activeProjectUid ?? '__none__'}`;
      const v = localStorage.getItem(key);
      setOuterTabRaw(
        v === 'terminal' || v === 'sessions' || v === 'github' || v === 'planner' || v === 'roles'
          ? v
          : 'kanban'
      );
    } catch {
      setOuterTabRaw('kanban');
    }
  }, [activeProjectUid, setOuterTab]);

  // Ref to TerminalManager for imperative focus
  const managerRef = useRef<TerminalManagerHandle | null>(null);

  const project: ProjectSummaryDTO | undefined = useMemo(
    () => projects.find((p) => p.uid === activeProjectUid) ?? undefined,
    [projects, activeProjectUid]
  );

  const refreshTasks = useCallback(async () => {
    if (!activeProjectUid) {
      setTasks([]);
      return;
    }
    try {
      const list = await window.orbit.project.getTasks(activeProjectUid);
      setTasks(list);
    } catch (e) {
      toast(`Load tasks failed: ${(e as Error).message}`);
    }
  }, [activeProjectUid, toast]);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  const refreshGitHubState = useCallback(async () => {
    if (!activeProjectUid) {
      setGitHubState(null);
      return;
    }
    try {
      const next = await window.orbit.github.getProjectState(activeProjectUid);
      setGitHubState(next);
    } catch (e) {
      setGitHubState(null);
      toast(`Load GitHub state failed: ${(e as Error).message}`);
    }
  }, [activeProjectUid, toast]);

  useEffect(() => {
    void refreshGitHubState();
  }, [refreshGitHubState]);

  // Respond to fs events so drag-drops/external writes reflect promptly.
  useEffect(() => {
    const off = window.orbit.fs.onEvent(() => {
      void refreshTasks();
    });
    return off;
  }, [refreshTasks]);

  // If the view carries a pane hint (e.g. from Dashboard matrix deep-links),
  // honor it once and ensure Kanban tab is active.
  useEffect(() => {
    if (view.kind !== 'project') return;
    const hint = resolveProjectRoomPaneHint(
      view.pane as
        | 'task'
        | 'sessions'
        | 'github'
        | 'planner'
        | 'roles'
        | 'readme'
        | 'agent'
        | undefined
    );
    if (hint === 'task') {
      setOuterTab('kanban');
    } else if (hint === 'sessions') {
      setOuterTab('sessions');
    } else if (hint === 'github') {
      setOuterTab('github');
    } else if (hint === 'planner') {
      setOuterTab('planner');
    } else if (hint === 'roles') {
      setOuterTab('roles');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId]
  );
  const kanbanModel = useMemo(
    () =>
      deriveProjectRoomKanbanModel({
        taskCount: tasks.length,
        selectedTaskId: selectedTask?.id ?? null
      }),
    [selectedTask, tasks.length]
  );

  const columns = useMemo(() => {
    const map: Record<TaskStatus, TaskRecord[]> = {
      backlog: [],
      waiting: [],
      todo: [],
      doing: [],
      blocked: [],
      done: []
    };
    for (const t of tasks) map[t.status]?.push(t);
    return map;
  }, [tasks]);

  useEffect(() => {
    if (!project) return;
    const surface = resolveProjectRoomSidebarSurface(outerTab);
    const panel = resolveProjectRoomSidebarPanel(outerTab);
    if (panel) {
      openSidebarPanel({
        surface,
        panel,
        focus: { projectUid: project.uid }
      });
      return;
    }

    setSidebarSurface(surface);
    setSidebarFocus({ projectUid: project.uid });
  }, [openSidebarPanel, outerTab, project, setSidebarFocus, setSidebarSurface]);

  useEffect(() => {
    if (!project || outerTab !== 'kanban') return;
    if (selectedTask) {
      openSidebarPanel({
        surface: 'project.kanban',
        panel: 'task-detail',
        focus: {
          task: selectedTask,
          projectUid: project.uid
        }
      });
      return;
    }

    openSidebarPanel({
      surface: 'project.kanban',
      panel: 'task-tree',
      focus: {
        task: null,
        projectUid: project.uid
      }
    });
  }, [openSidebarPanel, outerTab, project, selectedTask]);

  async function onDropTask(taskId: string, target: TaskStatus): Promise<void> {
    const t = tasks.find((x) => x.id === taskId);
    if (!t || t.status === target) return;
    // Optimistic update.
    setTasks((cur) => cur.map((x) => (x.id === taskId ? { ...x, status: target } : x)));
    try {
      if (t.source === 'file') {
        await window.orbit.task.updateFrontmatter(t.filePath, { status: target });
      } else {
        await window.orbit.para.updateTaskStatus(t.id, target);
      }
    } catch (e) {
      toast(`Status update failed: ${(e as Error).message}`);
      await refreshTasks();
    }
  }

  async function archive(): Promise<void> {
    if (!project) return;
    if (!window.confirm(`Archive project "${project.name}"?`)) return;
    try {
      await disposeTerminalsByPrefix(`${project.uid}::`);
      const res = await window.orbit.project.archive(project.uid);
      toast(`Archived → ${res.newPath}`);
      await refreshProjects();
      setActiveProjectUid(null);
      setView({ kind: 'dashboard' });
    } catch (e) {
      toast(`Archive failed: ${(e as Error).message}`);
    }
  }

  async function publishToGitHub(): Promise<void> {
    setOuterTab('github');
  }

  async function createPullRequest(): Promise<void> {
    setOuterTab('github');
  }

  function openResumeSession(initialCommand?: string): void {
    if (!initialCommand) return;
    setOuterTab('terminal');
    managerRef.current?.openTab({ initialCommand });
    setTimeout(() => {
      managerRef.current?.focusActive();
    }, 0);
  }

  const consumePendingNavigation = useCallback(() => {
    if (!activeProjectUid) return;
    const pending = consumePendingTerminalNavigation(activeProjectUid);
    if (!pending || (pending.roomKind ?? 'project') !== 'project') return;
    setOuterTab('terminal');
    requestAnimationFrame(() => {
      if (pending.paneId && managerRef.current?.focusPane(pending.paneId)) return;
      if (pending.initialCommand) {
        managerRef.current?.openTab({ initialCommand: pending.initialCommand });
      }
      requestAnimationFrame(() => {
        managerRef.current?.focusActive();
      });
    });
  }, [activeProjectUid, setOuterTab]);

  const openSessionNavigation = useCallback(
    (intent: TerminalNavigationIntent) => {
      queueTerminalNavigation(intent);
      setOuterTab('terminal');
    },
    [setOuterTab]
  );

  useEffect(() => {
    consumePendingNavigation();
  }, [consumePendingNavigation]);

  // Listen for orbit:focus-terminal custom event (fired by ⌘` in VaultView)
  useEffect(() => {
    function onFocusTerminal(): void {
      setOuterTab('terminal');
      setTimeout(() => {
        managerRef.current?.focusActive();
      }, 0);
    }
    function onResumeTerminalSession(e: Event): void {
      const detail = (e as CustomEvent<{ projectUid?: string; initialCommand?: string }>).detail;
      if (detail.projectUid && detail.projectUid !== activeProjectUid) return;
      openResumeSession(detail.initialCommand);
    }
    function onQueuedTerminalNavigation(e: Event): void {
      const detail = (e as CustomEvent<string>).detail;
      if (detail && detail !== activeProjectUid) return;
      consumePendingNavigation();
    }
    window.addEventListener('orbit:focus-terminal', onFocusTerminal);
    window.addEventListener(
      'orbit:resume-terminal-session',
      onResumeTerminalSession as EventListener
    );
    window.addEventListener(
      'orbit:terminal-navigation-queued',
      onQueuedTerminalNavigation as EventListener
    );
    return () => {
      window.removeEventListener('orbit:focus-terminal', onFocusTerminal);
      window.removeEventListener(
        'orbit:resume-terminal-session',
        onResumeTerminalSession as EventListener
      );
      window.removeEventListener(
        'orbit:terminal-navigation-queued',
        onQueuedTerminalNavigation as EventListener
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectUid, consumePendingNavigation]);

  useEffect(() => {
    if (outerTab !== 'terminal') return;
    const id = requestAnimationFrame(() => {
      managerRef.current?.refitActive();
    });
    return () => cancelAnimationFrame(id);
  }, [outerTab]);

  // ⌘1 / ⌘2 switches outer tabs (only when focus is NOT inside TerminalManager)
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.shiftKey || e.altKey) return;
      if (e.key === '1') {
        e.preventDefault();
        setOuterTab('kanban');
      } else if (e.key === '2') {
        e.preventDefault();
        setOuterTab('terminal');
      } else if (e.key === '3') {
        e.preventDefault();
        setOuterTab('github');
      } else if (e.key === '4') {
        e.preventDefault();
        setOuterTab('sessions');
      } else if (e.key === '5') {
        e.preventDefault();
        setOuterTab('planner');
      } else if (e.key === '6') {
        e.preventDefault();
        setOuterTab('roles');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Select a project to open its room.
      </div>
    );
  }

  const isLegacy = project.legacy;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-start gap-3 border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold">{project.name}</h1>
            {isLegacy && (
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
                Legacy
              </span>
            )}
          </div>
          {project.description && (
            <p className="mt-0.5 truncate text-xs text-neutral-500">{project.description}</p>
          )}
          {project.tags && project.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {project.tags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] dark:bg-neutral-800"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
            {githubState?.binding ? (
              <>
                <span className="rounded border border-neutral-300 px-2 py-0.5 dark:border-neutral-700">
                  GitHub · {githubState.binding.fullName}
                </span>
                {githubState.sync && (
                  <span className="rounded border border-neutral-300 px-2 py-0.5 dark:border-neutral-700">
                    {githubState.sync.branch} · ↑{githubState.sync.ahead} ↓{githubState.sync.behind}
                  </span>
                )}
                {githubState.pullRequest && (
                  <button
                    className="rounded border border-sky-300 px-2 py-0.5 text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-950/30"
                    onClick={() => window.open(githubState.pullRequest?.url, '_blank', 'noopener')}
                  >
                    PR #{githubState.pullRequest.number} · {githubState.pullRequest.state}
                  </button>
                )}
              </>
            ) : (
              <span className="rounded border border-neutral-300 px-2 py-0.5 dark:border-neutral-700">
                GitHub · not linked
              </span>
            )}
            {githubState?.connection?.authenticated === false && (
              <button
                className="rounded border border-amber-300 px-2 py-0.5 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/30"
                onClick={() => openResumeSession('gh auth login --web')}
              >
                Authenticate gh
              </button>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            onClick={() => void refreshGitHubState()}
          >
            Refresh GitHub
          </button>
          {githubState?.binding && !githubState.pullRequest && (
            <button
              className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              onClick={() => void createPullRequest()}
            >
              Create PR
            </button>
          )}
          {!githubState?.binding && !isLegacy && (
            <button
              className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              onClick={() => void publishToGitHub()}
            >
              Publish to GitHub
            </button>
          )}
          {kanbanModel.headerActions.includes('archive-project') && (
            <button
              className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/30"
              onClick={() => void archive()}
            >
              Archive Project
            </button>
          )}
        </div>
      </header>

      {/* Outer tab bar */}
      <div className="flex shrink-0 border-b border-neutral-200 dark:border-neutral-800 px-4 text-sm">
        <OuterTabButton active={outerTab === 'kanban'} onClick={() => setOuterTab('kanban')}>
          Kanban
        </OuterTabButton>
        <OuterTabButton active={outerTab === 'terminal'} onClick={() => setOuterTab('terminal')}>
          Terminal
        </OuterTabButton>
        <OuterTabButton active={outerTab === 'github'} onClick={() => setOuterTab('github')}>
          GitHub
        </OuterTabButton>
        <OuterTabButton active={outerTab === 'sessions'} onClick={() => setOuterTab('sessions')}>
          Sessions
        </OuterTabButton>
        <OuterTabButton active={outerTab === 'planner'} onClick={() => setOuterTab('planner')}>
          Planner
        </OuterTabButton>
        <OuterTabButton active={outerTab === 'roles'} onClick={() => setOuterTab('roles')}>
          Roles
        </OuterTabButton>
      </div>

      {/* Kanban tab content */}
      <div className={`flex min-h-0 flex-1 ${outerTab === 'kanban' ? 'flex' : 'hidden'}`}>
        <section className={`flex min-w-0 flex-col ${kanbanModel.kanbanPaneClassName}`}>
          <div className="flex shrink-0 items-center justify-between px-4 py-2 text-xs text-neutral-500">
            <span>Kanban · {tasks.length} tasks</span>
            <button
              onClick={() => setNewTaskOpen(true)}
              disabled={isLegacy}
              className="rounded bg-sky-600 px-2 py-0.5 text-white hover:bg-sky-500 disabled:opacity-40"
              title={isLegacy ? 'Migrate this project to create tasks' : 'Create new task'}
            >
              + New Task
            </button>
          </div>
          {isLegacy ? (
            <LegacyEmptyState onMigrate={() => setMigrateOpen(true)} />
          ) : tasks.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-xs text-neutral-500">
              <p>No tasks yet.</p>
              <button
                onClick={() => setNewTaskOpen(true)}
                className="rounded bg-sky-600 px-3 py-1.5 text-white hover:bg-sky-500"
              >
                + Create first task
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-auto p-2">
              <div className="grid grid-cols-5 gap-2">
                {STATUS_ORDER.map((s) => (
                  <KanbanColumn
                    key={s}
                    status={s}
                    tasks={columns[s]}
                    selectedId={selectedTaskId}
                    onSelect={(id) => {
                      setSelectedTaskId(id);
                      const nextTask = tasks.find((entry) => entry.id === id);
                      if (nextTask) openTaskDetails(nextTask, project.uid);
                    }}
                    onDrop={(taskId) => void onDropTask(taskId, s)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Terminal tab content */}
      <div className={`min-h-0 flex-1 ${outerTab === 'terminal' ? 'flex' : 'hidden'}`}>
        <TerminalManager
          ref={managerRef}
          projectUid={project.uid}
          cwd={project.path}
          dark={dark}
          env={
            vault
              ? {
                  ORBIT_VAULT_PATH: vault.path,
                  ORBIT_PROJECT_UID: project.uid,
                  ORBIT_PROJECT_SLUG: project.slug
                }
              : undefined
          }
        />
      </div>

      <div className={`min-h-0 flex-1 ${outerTab === 'sessions' ? 'flex' : 'hidden'}`}>
        <ProjectSessionsView projectUid={project.uid} onOpenSession={openSessionNavigation} />
      </div>

      <div className={`min-h-0 flex-1 ${outerTab === 'github' ? 'flex' : 'hidden'}`}>
        <ProjectGitHubView
          project={project}
          tasks={tasks}
          onProjectsChanged={refreshProjects}
          onTasksChanged={refreshTasks}
          onOpenTerminal={() => setOuterTab('terminal')}
        />
      </div>

      <div className={`min-h-0 flex-1 ${outerTab === 'planner' ? 'flex' : 'hidden'}`}>
        <ProjectPlannerView projectUid={project.uid} />
      </div>

      <div className={`min-h-0 flex-1 ${outerTab === 'roles' ? 'flex' : 'hidden'}`}>
        <ProjectRolesView projectUid={project.uid} />
      </div>

      <NewTaskModal
        open={newTaskOpen}
        projectUid={project.uid}
        siblings={tasks}
        onClose={() => setNewTaskOpen(false)}
        onCreated={(res) => {
          void (async () => {
            await refreshTasks();
            // Wait a tick for tasks to update, then select the new task by uid.
            setTimeout(() => {
              setTasks((cur) => {
                const next = cur.find((t) => t.uid === res.uid);
                if (next) {
                  setSelectedTaskId(next.id);
                }
                return cur;
              });
            }, 50);
          })();
        }}
      />
      <MigrationDialog
        open={migrateOpen}
        onClose={() => {
          setMigrateOpen(false);
          void refreshProjects();
          void refreshTasks();
        }}
      />
    </div>
  );
}

function OuterTabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm border-b-2 transition-colors ${
        active
          ? 'border-sky-500 text-sky-600 dark:text-sky-400'
          : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
      }`}
    >
      {children}
    </button>
  );
}

function KanbanColumn({
  status,
  tasks,
  selectedId,
  onSelect,
  onDrop
}: {
  status: TaskStatus;
  tasks: TaskRecord[];
  selectedId: string | null;
  onSelect(id: string): void;
  onDrop(taskId: string): void;
}): JSX.Element {
  const [over, setOver] = useState(false);
  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData('text/orbit-task-id');
        if (id) onDrop(id);
      }}
      className={`flex min-h-[140px] flex-col rounded border p-2 ${over ? 'border-sky-500 bg-sky-500/5' : 'border-neutral-200 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-900/40'}`}
    >
      <header className="mb-1 flex items-center justify-between px-1 text-[10px] uppercase tracking-wide text-neutral-500">
        <span>{status}</span>
        <span>{tasks.length}</span>
      </header>
      <ul className="space-y-1">
        {tasks.map((t) => (
          <li key={t.id}>
            <TaskCard task={t} selected={t.id === selectedId} onSelect={() => onSelect(t.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TaskCard({
  task,
  selected,
  onSelect
}: {
  task: TaskRecord;
  selected: boolean;
  onSelect(): void;
}): JSX.Element {
  const priority =
    task.source === 'file' ? ((task as TaskRecord & { priority?: string }).priority ?? null) : null;
  const priorityColor =
    priority === 'high'
      ? 'bg-red-500'
      : priority === 'med'
        ? 'bg-amber-500'
        : priority === 'low'
          ? 'bg-sky-500'
          : null;
  return (
    <button
      draggable={task.source === 'file'}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/orbit-task-id', task.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onSelect}
      className={`block w-full rounded border px-2 py-1 text-left text-[11px] ${selected ? 'border-sky-500 bg-sky-500/10' : 'border-neutral-200 bg-white hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-600'}`}
    >
      <div className="flex items-start gap-1.5">
        {priorityColor && (
          <span
            className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${priorityColor}`}
          />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-500">
        {task.origin && task.origin !== 'human' && (
          <span className="rounded bg-purple-500/15 px-1 text-purple-600 dark:text-purple-300">
            {task.origin}
          </span>
        )}
        {task.owner_type && (
          <span className="rounded bg-sky-500/15 px-1 text-sky-600 dark:text-sky-300">
            {task.owner_type}
          </span>
        )}
        {task.blocked_reason && (
          <span className="rounded bg-red-500/15 px-1 text-red-600 dark:text-red-300">blocked</span>
        )}
        {task.ready && task.status === 'waiting' && (
          <span className="rounded bg-emerald-500/15 px-1 text-emerald-600 dark:text-emerald-300">
            ready
          </span>
        )}
        {task.due && <span>📅 {task.due}</span>}
        {task.effort !== undefined && <span>⚡ {String(task.effort)}</span>}
        {task.tags &&
          task.tags.slice(0, 2).map((tg) => (
            <span key={tg} className="rounded bg-neutral-200 px-1 text-[9px] dark:bg-neutral-800">
              {tg}
            </span>
          ))}
        {task.lost && (
          <span className="rounded bg-amber-500/20 px-1 text-[9px] text-amber-700 dark:text-amber-300">
            lost
          </span>
        )}
      </div>
    </button>
  );
}

function LegacyEmptyState({ onMigrate }: { onMigrate(): void }): JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-xs text-neutral-500">
      <p>
        This is a <span className="font-medium">legacy single-file project</span>.
      </p>
      <p>Migrate it to a folder-backed project to unlock Kanban and tasks.</p>
      <button
        onClick={onMigrate}
        className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
      >
        Migrate this project
      </button>
    </div>
  );
}
