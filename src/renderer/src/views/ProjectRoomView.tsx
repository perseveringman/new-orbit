import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkContextReport } from '@shared/context';
import type { EvidenceReadResult, EvidenceSelector } from '@shared/evidence';
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
import { ProjectMaterialsView } from './ProjectMaterialsView';
import { SpaceOutputsView } from './SpaceOutputsView';

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
const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: '积压',
  waiting: '等待',
  todo: '待办',
  doing: '进行中',
  blocked: '阻塞',
  done: '完成'
};

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
  const [workdirBusy, setWorkdirBusy] = useState(false);
  const [pmilContext, setPMILContext] = useState<WorkContextReport | null>(null);
  const [pmilLoading, setPMILLoading] = useState(false);
  const [pmilError, setPMILError] = useState<string | null>(null);

  // Outer tab: persisted per project
  const outerTabKey = `orbit.projectRoom.outerTab.${activeProjectUid ?? '__none__'}`;
  const [outerTab, setOuterTabRaw] = useState<ProjectRoomOuterTab>(() => {
    try {
      const v = localStorage.getItem(outerTabKey);
      return v === 'context' ||
        v === 'terminal' ||
        v === 'sessions' ||
        v === 'github' ||
        v === 'materials' ||
        v === 'outputs' ||
        v === 'planner' ||
        v === 'roles'
        ? (v as ProjectRoomOuterTab)
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
        v === 'context' ||
          v === 'terminal' ||
          v === 'sessions' ||
          v === 'github' ||
          v === 'materials' ||
          v === 'outputs' ||
          v === 'planner' ||
          v === 'roles'
          ? (v as ProjectRoomOuterTab)
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
      toast(`加载任务失败：${(e as Error).message}`);
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
      toast(`加载 GitHub 状态失败：${(e as Error).message}`);
    }
  }, [activeProjectUid, toast]);

  useEffect(() => {
    void refreshGitHubState();
  }, [refreshGitHubState]);

  const refreshPMILContext = useCallback(async () => {
    if (!project) {
      setPMILContext(null);
      return;
    }
    setPMILLoading(true);
    setPMILError(null);
    try {
      const contextApi = window.orbit.context;
      if (!contextApi?.workContext) {
        throw new Error('上下文桥接还未加载，请重启 Orbit 后再刷新。');
      }
      const now = new Date();
      const from = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);
      const report = await withPMILTimeout(
        contextApi.workContext({
          scope: { kind: 'project', ref: project.uid },
          period: { from: from.toISOString(), to: now.toISOString() },
          query: `${project.name} current focus open loops blockers decisions next steps`,
          limit: 36
        })
      );
      setPMILContext(report);
    } catch (error) {
      setPMILContext(null);
      setPMILError((error as Error).message);
    } finally {
      setPMILLoading(false);
    }
  }, [project]);

  useEffect(() => {
    if (outerTab === 'context') {
      void refreshPMILContext();
    } else if (!project) {
      setPMILContext(null);
    }
  }, [outerTab, project, refreshPMILContext]);

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
        | 'context'
        | 'sessions'
        | 'github'
        | 'materials'
        | 'outputs'
        | 'planner'
        | 'roles'
        | 'readme'
        | 'agent'
        | undefined
    );
    if (hint === 'task') {
      setOuterTab('kanban');
    } else if (hint === 'context') {
      setOuterTab('context');
    } else if (hint === 'sessions') {
      setOuterTab('sessions');
    } else if (hint === 'github') {
      setOuterTab('github');
    } else if (hint === 'materials') {
      setOuterTab('materials');
    } else if (hint === 'outputs') {
      setOuterTab('outputs');
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
        origin: 'auto',
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
        origin: 'auto',
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
      origin: 'auto',
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
      toast(`状态更新失败：${(e as Error).message}`);
      await refreshTasks();
    }
  }

  async function archive(): Promise<void> {
    if (!project) return;
    if (!window.confirm(`归档项目 "${project.name}"?`)) return;
    try {
      await disposeTerminalsByPrefix(`${project.uid}::`);
      const res = await window.orbit.project.archive(project.uid);
      toast(`已归档 → ${res.newPath}`);
      await refreshProjects();
      setActiveProjectUid(null);
      setView({ kind: 'dashboard' });
    } catch (e) {
      toast(`归档失败：${(e as Error).message}`);
    }
  }

  async function relinkWorkdir(): Promise<void> {
    if (!project || workdirBusy) return;
    const chosen = await window.orbit.project.chooseDirectory();
    if (chosen.canceled || !chosen.path) return;
    setWorkdirBusy(true);
    try {
      await disposeTerminalsByPrefix(`${project.uid}::`);
      await window.orbit.project.relinkWorkdir({
        uid: project.uid,
        workdirPath: chosen.path
      });
      toast(`Workdir 已重新关联 → ${chosen.path}`);
      await refreshProjects();
      await refreshGitHubState();
    } catch (e) {
      toast(`重新关联 Workdir 失败：${(e as Error).message}`);
    } finally {
      setWorkdirBusy(false);
    }
  }

  async function migrateWorkdirOut(): Promise<void> {
    if (!project || workdirBusy) return;
    const chosen = await window.orbit.project.chooseDirectory();
    if (chosen.canceled || !chosen.path) return;
    const targetDir = joinFsPath(chosen.path, project.slug);
    if (
      !window.confirm(
        `将复制的代码文件从 Orbit 协调文件夹移动到：\n\n${targetDir}\n\nOrbit 任务、资产、产出与元数据会保留在 vault 中。`
      )
    ) {
      return;
    }
    setWorkdirBusy(true);
    try {
      await disposeTerminalsByPrefix(`${project.uid}::`);
      const result = await window.orbit.project.migrateWorkdir({
        uid: project.uid,
        targetDir,
        removeCopiedFiles: true,
        initializeGit: true
      });
      toast(`Workdir 已移动 → ${result.workdirPath}`);
      await refreshProjects();
      await refreshGitHubState();
    } catch (e) {
      toast(`移动 Workdir 失败：${(e as Error).message}`);
    } finally {
      setWorkdirBusy(false);
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
        setOuterTab('context');
      } else if (e.key === '3') {
        e.preventDefault();
        setOuterTab('terminal');
      } else if (e.key === '4') {
        e.preventDefault();
        setOuterTab('github');
      } else if (e.key === '5') {
        e.preventDefault();
        setOuterTab('sessions');
      } else if (e.key === '6') {
        e.preventDefault();
        setOuterTab('materials');
      } else if (e.key === '7') {
        e.preventDefault();
        setOuterTab('planner');
      } else if (e.key === '8') {
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
        请选择一个项目以打开项目房间。
      </div>
    );
  }

  const isLegacy = project.legacy;
  const isLegacyInVaultWorkdir =
    !isLegacy &&
    (project.workdir?.linked_via === 'legacy-in-vault' ||
      project.workdirPath === project.coordinationPath);
  const workdirLabel = project.workdirMissing
    ? '缺失'
    : isLegacyInVaultWorkdir
      ? '在 vault 中'
      : project.workdir
        ? '外部'
        : '隐式';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-start gap-3 border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold">{project.name}</h1>
            {isLegacy && (
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
                旧版
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
                GitHub · 未关联
              </span>
            )}
            {githubState?.connection?.authenticated === false && (
              <button
                className="rounded border border-amber-300 px-2 py-0.5 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/30"
                onClick={() => openResumeSession('gh auth login --web')}
              >
                认证 gh
              </button>
            )}
            {!isLegacy && (
              <span
                className={`rounded border px-2 py-0.5 ${
                  project.workdirMissing
                    ? 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-300'
                    : 'border-neutral-300 dark:border-neutral-700'
                }`}
                title={project.workdirPath}
              >
                工作目录 · {workdirLabel}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isLegacy && isLegacyInVaultWorkdir && (
            <button
              className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/30"
              disabled={workdirBusy}
              onClick={() => void migrateWorkdirOut()}
            >
              移出 Workdir
            </button>
          )}
          {!isLegacy && (
            <button
              className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
              disabled={workdirBusy}
              onClick={() => void relinkWorkdir()}
            >
              重新关联 Workdir
            </button>
          )}
          <button
            className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            onClick={() => void refreshGitHubState()}
          >
            刷新 GitHub
          </button>
          {githubState?.binding && !githubState.pullRequest && (
            <button
              className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              onClick={() => void createPullRequest()}
            >
              创建 PR
            </button>
          )}
          {!githubState?.binding && !isLegacy && (
            <button
              className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              onClick={() => void publishToGitHub()}
            >
              发布到 GitHub
            </button>
          )}
          {kanbanModel.headerActions.includes('archive-project') && (
            <button
              className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/30"
              onClick={() => void archive()}
            >
              归档项目
            </button>
          )}
        </div>
      </header>

      {/* Outer tab bar */}
      <div className="flex shrink-0 border-b border-neutral-200 dark:border-neutral-800 px-4 text-sm">
        <OuterTabButton active={outerTab === 'kanban'} onClick={() => setOuterTab('kanban')}>
          看板
        </OuterTabButton>
        <OuterTabButton active={outerTab === 'context'} onClick={() => setOuterTab('context')}>
          上下文
        </OuterTabButton>
        <OuterTabButton active={outerTab === 'terminal'} onClick={() => setOuterTab('terminal')}>
          终端
        </OuterTabButton>
        <OuterTabButton active={outerTab === 'github'} onClick={() => setOuterTab('github')}>
          GitHub
        </OuterTabButton>
        <OuterTabButton active={outerTab === 'sessions'} onClick={() => setOuterTab('sessions')}>
          会话
        </OuterTabButton>
        <OuterTabButton active={outerTab === 'materials'} onClick={() => setOuterTab('materials')}>
          素材
        </OuterTabButton>
        <OuterTabButton active={outerTab === 'outputs'} onClick={() => setOuterTab('outputs')}>
          产出
        </OuterTabButton>
        <OuterTabButton active={outerTab === 'planner'} onClick={() => setOuterTab('planner')}>
          规划
        </OuterTabButton>
        <OuterTabButton active={outerTab === 'roles'} onClick={() => setOuterTab('roles')}>
          角色
        </OuterTabButton>
      </div>

      <div className={`min-h-0 flex-1 ${outerTab === 'context' ? 'flex' : 'hidden'}`}>
        <ProjectPMILContextPanel
          report={pmilContext}
          loading={pmilLoading}
          error={pmilError}
          projectName={project.name}
          onRefresh={() => void refreshPMILContext()}
        />
      </div>

      {/* Kanban tab content */}
      <div className={`flex min-h-0 flex-1 ${outerTab === 'kanban' ? 'flex' : 'hidden'}`}>
        <section className={`flex min-w-0 flex-col ${kanbanModel.kanbanPaneClassName}`}>
          <div className="flex shrink-0 items-center justify-between px-4 py-2 text-xs text-neutral-500">
            <span>看板 · {tasks.length} 个任务</span>
            <button
              onClick={() => setNewTaskOpen(true)}
              disabled={isLegacy}
              className="rounded bg-sky-600 px-2 py-0.5 text-white hover:bg-sky-500 disabled:opacity-40"
              title={isLegacy ? '迁移此项目后即可创建任务' : '创建新任务'}
            >
              + 新建任务
            </button>
          </div>
          {isLegacy ? (
            <LegacyEmptyState onMigrate={() => setMigrateOpen(true)} />
          ) : tasks.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-xs text-neutral-500">
              <p>暂无任务。</p>
              <button
                onClick={() => setNewTaskOpen(true)}
                className="rounded bg-sky-600 px-3 py-1.5 text-white hover:bg-sky-500"
              >
                + 创建第一个任务
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
          cwd={project.workdirPath ?? project.path}
          dark={dark}
          env={
            vault
              ? {
                  ORBIT_VAULT_PATH: vault.path,
                  ORBIT_PROJECT_UID: project.uid,
                  ORBIT_PROJECT_SLUG: project.slug,
                  ORBIT_PROJECT_COORDINATION: project.coordinationPath ?? project.path,
                  ORBIT_PROJECT_WORKDIR: project.workdirPath ?? project.path
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

      <div className={`min-h-0 flex-1 ${outerTab === 'materials' ? 'flex' : 'hidden'}`}>
        <ProjectMaterialsView project={project} />
      </div>

      <div className={`min-h-0 flex-1 ${outerTab === 'outputs' ? 'flex' : 'hidden'}`}>
        <SpaceOutputsView spaceId={project.uid} spaceLabel="项目" />
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

export function ProjectPMILContextPanel({
  report,
  loading,
  error,
  projectName,
  onRefresh
}: {
  report: WorkContextReport | null;
  loading: boolean;
  error: string | null;
  projectName: string;
  onRefresh(): void;
}): JSX.Element {
  const work = report?.work_context;
  const loops = report?.open_loops.loops ?? [];
  const threads = work?.active_threads ?? [];
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-neutral-50 p-5 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
              个人记忆智能
            </p>
            <h2 className="mt-1 text-xl font-semibold">项目上下文 · {projectName}</h2>
            <p className="mt-1 max-w-3xl text-sm text-neutral-500">
              基于证据片段、图谱邻居、个人问答和开放回路启发式组装当前项目背景。
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
          >
            {loading ? '刷新中' : '刷新上下文'}
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {!work && !loading ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900">
            还没有足够的项目上下文。刷新后 Orbit 会从项目证据中构建第一版工作上下文。
          </div>
        ) : null}

        {work ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <ProjectContextMetric label="当前焦点" value={work.current_focus} />
              <ProjectContextMetric label="活跃线索" value={String(threads.length)} />
              <ProjectContextMetric label="开放回路" value={String(loops.length)} />
              <ProjectContextMetric label="决策" value={String(work.decisions.length)} />
            </div>

            <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/30">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
                活跃线索
              </h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {threads.slice(0, 8).map((thread) => (
                  <article
                    key={`${thread.title}:${thread.confidence}`}
                    className="rounded-xl border border-violet-200 bg-white p-3 dark:border-violet-900 dark:bg-neutral-900"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold">{thread.title}</h4>
                      <span className="text-xs text-neutral-500">
                        {Math.round(thread.confidence * 100)}%
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-neutral-600 dark:text-neutral-300">
                      {thread.summary}
                    </p>
                    {thread.likely_next_steps.length ? (
                      <p className="mt-2 text-xs text-violet-700 dark:text-violet-300">
                        下一步：{thread.likely_next_steps[0]}
                      </p>
                    ) : null}
                    <ProjectEvidenceButtons selectors={thread.evidence} />
                  </article>
                ))}
              </div>
            </section>

            <section className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  开放回路
                </h3>
                <div className="mt-3 space-y-2">
                  {loops.length ? (
                    loops.slice(0, 8).map((loop) => (
                      <div
                        key={loop.id}
                        className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500 dark:border-neutral-700">
                            {loop.kind}
                          </span>
                          <span
                            className={
                              loop.severity === 'warning'
                                ? 'text-xs text-amber-700 dark:text-amber-300'
                                : 'text-xs text-neutral-500'
                            }
                          >
                            {loop.severity}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-medium">{loop.title}</p>
                        <p className="mt-1 text-xs leading-5 text-neutral-500">{loop.rationale}</p>
                        <ProjectEvidenceButtons selectors={loop.evidence} />
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-neutral-500">当前证据窗口中没有检测到开放回路。</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  决策
                </h3>
                <div className="mt-3 space-y-2">
                  {work.decisions.length ? (
                    work.decisions.slice(0, 8).map((decision) => (
                      <div
                        key={`${decision.status}:${decision.title}`}
                        className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500 dark:border-neutral-700">
                            {decision.status}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-medium">{decision.title}</p>
                        <ProjectEvidenceButtons selectors={decision.evidence} />
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-neutral-500">还没有检测到明确的项目决策。</p>
                  )}
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </section>
  );
}

function ProjectContextMetric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-2 line-clamp-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function ProjectEvidenceButtons({
  selectors
}: {
  selectors: EvidenceSelector[];
}): JSX.Element | null {
  if (!selectors.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {selectors.slice(0, 3).map((selector) => (
        <ProjectEvidenceButton key={projectEvidenceSelectorKey(selector)} selector={selector} />
      ))}
    </div>
  );
}

function ProjectEvidenceButton({ selector }: { selector: EvidenceSelector }): JSX.Element {
  const [result, setResult] = useState<EvidenceReadResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function readEvidence(): Promise<void> {
    setLoading(true);
    try {
      setResult(await window.orbit.evidence.read(selector));
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex max-w-full flex-col gap-1">
      <button
        type="button"
        onClick={() => void readEvidence()}
        disabled={loading}
        className="rounded-md border border-violet-300 px-2 py-0.5 text-[11px] text-violet-700 disabled:opacity-60 dark:border-violet-800 dark:text-violet-200"
      >
        {loading ? '读取中' : '查看证据'}
      </button>
      {result ? (
        <span className="rounded-md border border-neutral-200 bg-white p-2 text-[11px] leading-5 text-neutral-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
          <span className="block font-medium text-neutral-800 dark:text-neutral-100">
            {result.source.title}
          </span>
          {result.excerpts[0]?.text.slice(0, 520) ?? '没有可用摘录。'}
        </span>
      ) : null}
    </span>
  );
}

function projectEvidenceSelectorKey(selector: EvidenceSelector): string {
  return `${selector.source_id}:${selector.kind}:${selector.range?.from ?? ''}:${selector.range?.to ?? ''}:${selector.content_view}`;
}

function withPMILTimeout<T>(promise: Promise<T>, ms = 15000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<T>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error('项目上下文构建超时，请稍后重试或先刷新证据索引。')),
      ms
    );
  });
  return Promise.race([promise, timer]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function joinFsPath(parent: string, child: string): string {
  const sep = parent.includes('\\') && !parent.includes('/') ? '\\' : '/';
  return `${parent.replace(/[\\/]+$/, '')}${sep}${child}`;
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
        <span>{TASK_STATUS_LABELS[status]}</span>
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
  const activeRunSegment = (task as TaskRecord & { activeRunSegment?: { sessionStatus?: string } })
    .activeRunSegment;
  const awaitingUser =
    task.status === 'doing' && activeRunSegment?.sessionStatus === 'awaiting_user';
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
        {awaitingUser && <span title="等待用户回复">💬</span>}
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
          <span className="rounded bg-red-500/15 px-1 text-red-600 dark:text-red-300">阻塞</span>
        )}
        {task.ready && task.status === 'waiting' && (
          <span className="rounded bg-emerald-500/15 px-1 text-emerald-600 dark:text-emerald-300">
            就绪
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
            丢失
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
        这是一个 <span className="font-medium">旧版单文件项目</span>。
      </p>
      <p>迁移为文件夹项目后即可解锁看板和任务。</p>
      <button
        onClick={onMigrate}
        className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
      >
        迁移此项目
      </button>
    </div>
  );
}
