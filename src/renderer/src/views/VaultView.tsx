import { useEffect, useState } from 'react';
import { useWorkspace } from '../store/workspace';
import { useFiles } from '../store/files';
import { usePara } from '../store/para';
import { useAgent } from '../store/agent';
import { useSidebar } from '../store/sidebar';
import { FileTree } from '../components/Sidebar/FileTree';
import { AreaConfigPanel } from '../components/Sidebar/AreaConfigPanel';
import { BacklinksPanel } from '../components/Sidebar/BacklinksPanel';
import { AgentPanel } from '../components/Sidebar/AgentPanel';
import { WorktreesPanel } from '../components/Sidebar/WorktreesPanel';
import { TaskDetailPanel } from '../components/Sidebar/TaskDetailPanel';
import { ProjectTaskTreePanel } from '../components/Sidebar/ProjectTaskTreePanel';
import { MarkdownEditor } from '../components/Editor/MarkdownEditor';
import { CommandPalette } from '../components/CommandPalette';
import { ProjectsNav } from '../components/Sidebar/ProjectsNav';
import { TerminalSessionsPanel } from '../components/Sidebar/TerminalSessionsPanel';
import { CloseProjectDialog } from '../components/CloseProjectDialog';
import { InboxView } from './InboxView';
import { AskAnywhereView } from './AskAnywhereView';
import { NotesView } from './NotesView';
import { LibraryView } from './LibraryView';
import { FeedView } from './FeedView';
import { SearchView } from './SearchView';
import { MemoryView } from './MemoryView';
import { ReviewView } from './ReviewView';
import { ResourceView } from './ResourceView';
import { KnowledgeBaseView } from './KnowledgeBaseView';
import { ScheduledTasksView } from './ScheduledTasksView';
import { TimelineView } from './TimelineView';
import { GatewayView } from './GatewayView';
import { ConversationsView } from './ConversationsView';
import { TodayView } from './TodayView';
import { KanbanView } from './KanbanView';
import { AreaRoomView } from './AreaRoomView';
import { AreaOverview } from './AreaOverview';
import { VisionView } from './VisionView';
import { DashboardView } from './DashboardView';
import { GitHubWorkspaceView } from './GitHubWorkspaceView';
import { ProjectRoomView } from './ProjectRoomView';
import { JournalHistoryView } from './JournalHistoryView';
import { RuntimesWorkspaceView } from './RuntimesWorkspaceView';
import { DeveloperConsoleView } from './DeveloperConsoleView';
import { NewProjectModal } from '../components/Modals/NewProjectModal';
import { NewAreaModal } from '../components/Modals/NewAreaModal';
import { NewTaskModal } from '../components/Modals/NewTaskModal';
import { ReviewInboxView } from './ReviewInboxView';
import { AgentsLibraryView } from './AgentsLibraryView';
import { RunLogPane } from '../components/RunLogPane';
import { DiffWorkspacePane } from '../components/DiffWorkspacePane';
import { WorkspaceInspectorPane } from '../components/Inspector/WorkspaceInspectorPane';
import { TaskDetailsHost } from '../components/Tasks/TaskDetailsHost';
import { applyTerminalPaneEvent } from '../components/Terminal/terminalAgentStatus';
import { terminalPaneStatusRegistry } from '../components/Terminal/terminalPaneStatusRegistry';
import { useReviewQueue } from '../store/reviewQueue';
import { deriveProjectRoomInstanceKey } from './projectRoomModel';
import {
  getSidebarIntentTabs,
  getSidebarPanelTabs,
  resolveSidebarSurface,
  type SidebarPanelId
} from './vaultRightSidebarModel';

function isSidebarPanelId(value: string): value is SidebarPanelId {
  return (
    value === 'inspector' ||
    value === 'files' ||
    value === 'area-config' ||
    value === 'backlinks' ||
    value === 'task-detail' ||
    value === 'task-tree' ||
    value === 'agent' ||
    value === 'worktrees' ||
    value === 'review' ||
    value === 'runlog' ||
    value === 'diff' ||
    value === 'sessions'
  );
}

export function VaultView(): JSX.Element {
  const { vault, settings } = useWorkspace();
  const activeProjectUid = useWorkspace((s) => s.activeProjectUid);
  const { tree, active, init, teardown, openPath, toast } = useFiles();
  const view = usePara((s) => s.view);
  const setView = usePara((s) => s.setView);
  const refresh = usePara((s) => s.refresh);
  const initAgent = useAgent((s) => s.init);
  const teardownAgent = useAgent((s) => s.teardown);
  const ingestReviewAgentEvent = useReviewQueue((s) => s.ingestAgentEvent);
  const ingestTerminalReviewEvent = useReviewQueue((s) => s.ingestTerminalEvent);
  const sidebarSurface = useSidebar((s) => s.surface);
  const sidebarIntent = useSidebar((s) => s.intent);
  const sidebarPanel = useSidebar((s) => s.panel);
  const setSidebarSurface = useSidebar((s) => s.setSurface);
  const selectSidebarIntent = useSidebar((s) => s.selectIntent);
  const selectSidebarPanel = useSidebar((s) => s.selectPanel);
  const setSidebarFocus = useSidebar((s) => s.setFocus);
  const openSidebarPanel = useSidebar((s) => s.openPanel);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const sidebarProjectUid =
    view.kind === 'project' ? activeProjectUid : view.kind === 'kanban' ? view.projectUid : null;
  const sidebarIntentTabs = getSidebarIntentTabs(sidebarSurface);
  const sidebarPanelTabs = getSidebarPanelTabs(sidebarSurface, sidebarIntent);

  const vaultPath = vault?.path;
  useEffect(() => {
    if (!vaultPath) return;
    void init(vaultPath);
    void refresh();
    void initAgent();
    void (async () => {
      try {
        const projs = await window.orbit.project.list();
        if (projs.length === 0) {
          const areas = await window.orbit.area.list();
          const vision = areas.find((area) => area.slug === 'vision');
          if (vision) setView({ kind: 'areaRoom', areaUid: vision.uid });
          else setView({ kind: 'dashboard' });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      teardown();
      teardownAgent();
    };
  }, [vaultPath, init, teardown, refresh, initAgent, teardownAgent, setView]);

  useEffect(() => {
    const off = window.orbit.fs.onEvent(() => {
      void refresh();
    });
    return off;
  }, [refresh]);

  useEffect(() => {
    if (view.kind === 'project') return;
    setSidebarSurface(resolveSidebarSurface(view));
    setSidebarFocus({
      task: null,
      filePath: view.kind === 'editor' ? (active?.path ?? null) : null,
      projectUid: view.kind === 'kanban' ? view.projectUid : null,
      runId: null,
      worktreeId: null
    });
  }, [active?.path, setSidebarFocus, setSidebarSurface, view]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (mod && e.shiftKey && key === 'n') {
        if (view.kind === 'project') {
          e.preventDefault();
          setNewTaskOpen(true);
        }
      } else if (mod && key === 'n') {
        e.preventDefault();
        setNewProjectOpen(true);
      } else if (mod && key === 'b') {
        e.preventDefault();
        setSidebarCollapsed((v) => !v);
      } else if (mod && e.key === '`') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('orbit:focus-terminal'));
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view.kind]);

  useEffect(() => {
    function onOpenRightTab(e: Event): void {
      const raw = (
        e as CustomEvent<
          | string
          | {
              tab: string;
              runId?: string;
              worktreeId?: string;
            }
        >
      ).detail;
      const detail = (typeof raw === 'string' ? { tab: raw } : raw) ?? { tab: '' };
      if (!isSidebarPanelId(detail.tab)) return;
      openSidebarPanel({
        panel: detail.tab,
        focus: {
          runId: detail.runId ?? null,
          worktreeId: detail.worktreeId ?? null
        }
      });
    }
    window.addEventListener('orbit:open-right-tab', onOpenRightTab as EventListener);
    return () =>
      window.removeEventListener('orbit:open-right-tab', onOpenRightTab as EventListener);
  }, [openSidebarPanel]);

  useEffect(() => {
    function onOpenNewProject(): void {
      setNewProjectOpen(true);
    }
    window.addEventListener('orbit:open-new-project', onOpenNewProject);
    return () => window.removeEventListener('orbit:open-new-project', onOpenNewProject);
  }, []);

  useEffect(() => {
    const offAgent = window.orbit.agent.onEvent(({ runId, event }) => {
      ingestReviewAgentEvent(runId, event);
    });

    function isProjectTerminalVisible(projectUid?: string): boolean {
      if (!projectUid) return false;
      const workspace = useWorkspace.getState();
      const para = usePara.getState();
      if (workspace.activeProjectUid !== projectUid) return false;
      if (para.view.kind !== 'project') return false;
      try {
        return localStorage.getItem(`orbit.projectRoom.outerTab.${projectUid}`) === 'terminal';
      } catch {
        return false;
      }
    }

    const off = window.orbit.terminalAgent.onEvent((ev) => {
      ingestTerminalReviewEvent(ev);
      if (!ev.projectUid || !ev.paneId) return;
      const sessionKey = `${ev.projectUid}::${ev.paneId}`;
      const next = applyTerminalPaneEvent(
        terminalPaneStatusRegistry.get(sessionKey),
        ev.eventType,
        isProjectTerminalVisible(ev.projectUid)
      );
      if (next === 'idle') {
        terminalPaneStatusRegistry.clear(sessionKey);
        return;
      }
      terminalPaneStatusRegistry.set(sessionKey, next);
    });
    return () => {
      offAgent();
      off();
    };
  }, [ingestReviewAgentEvent, ingestTerminalReviewEvent]);
  async function onOpenWikilink(target: string): Promise<void> {
    const hits = await window.orbit.fs.search(target, { limit: 10 });
    const lower = target.replace(/\.md$/i, '').toLowerCase();
    const exact = hits.find(
      (h) => h.title.toLowerCase() === lower || h.relPath.toLowerCase().endsWith(`/${lower}.md`)
    );
    const chosen = exact ?? hits[0];
    if (chosen) {
      await openPath(chosen.path);
      setView({ kind: 'editor' });
    } else {
      toast(`No file matches [[${target}]]`);
    }
  }

  async function onCloseProject(): Promise<void> {
    if (!active) return;
    setCloseOpen(true);
  }

  async function confirmClose(opts: { distill: boolean }): Promise<void> {
    setCloseOpen(false);
    if (!active) return;
    try {
      const res = await window.orbit.para.closeProject(active.path);
      toast(`Archived → ${res.newRelPath}`);
      await openPath(res.newPath);
      if (opts.distill) {
        toast('Distilling project…');
        openSidebarPanel({ panel: 'agent' });
        try {
          const out = await window.orbit.distill.project(res.uid);
          toast(`Distilled → ${out.resourceRelPath}`);
          await openPath(out.resourcePath);
        } catch (error) {
          toast(`Distillation failed: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      toast((error as Error).message);
    }
  }

  function renderSidebarPanel(): JSX.Element {
    if (sidebarPanel === 'inspector') return <WorkspaceInspectorPane />;
    if (sidebarPanel === 'files') {
      return tree ? (
        <FileTree root={tree} />
      ) : (
        <p className="text-xs text-neutral-500">Scanning…</p>
      );
    }
    if (sidebarPanel === 'area-config') return <AreaConfigPanel />;
    if (sidebarPanel === 'backlinks') return <BacklinksPanel />;
    if (sidebarPanel === 'task-detail') return <TaskDetailPanel />;
    if (sidebarPanel === 'task-tree')
      return <ProjectTaskTreePanel projectUid={sidebarProjectUid} />;
    if (sidebarPanel === 'agent') return <AgentPanel />;
    if (sidebarPanel === 'review') return <ReviewInboxView />;
    if (sidebarPanel === 'runlog') return <RunLogPane />;
    if (sidebarPanel === 'diff') return <DiffWorkspacePane />;
    if (sidebarPanel === 'sessions') return <TerminalSessionsPanel />;
    return <WorktreesPanel />;
  }

  if (!vault) return <></>;

  const isProject =
    active?.relPath.startsWith('01_Projects/') === true && active?.path.endsWith('.md');

  return (
    <div className="flex flex-1 min-h-0">
      {!sidebarCollapsed && (
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white/40 p-2 dark:border-neutral-800 dark:bg-neutral-900/40">
          <ProjectsNav />
        </aside>
      )}

      <section className="flex flex-1 flex-col min-h-0">
        {view.kind === 'editor' ? (
          <>
            <div className="flex h-8 shrink-0 items-center gap-3 border-b border-neutral-200 px-4 text-xs text-neutral-500 dark:border-neutral-800">
              {active ? (
                <>
                  <span className="truncate">{active.relPath}</span>
                  {active.dirty && <span className="text-amber-500">●</span>}
                </>
              ) : (
                <span>No file open</span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {isProject && (
                  <button
                    onClick={() => void onCloseProject()}
                    className="rounded border border-neutral-300 px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    title="Archive this project (keeps uid, moves to 04_Archives/)"
                  >
                    结项 / Close project
                  </button>
                )}
                <span>⌘K to search</span>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <MarkdownEditor onOpenWikilink={onOpenWikilink} dark={settings.theme === 'dark'} />
            </div>
          </>
        ) : view.kind === 'inbox' ? (
          <InboxView />
        ) : view.kind === 'notes' ? (
          <NotesView />
        ) : view.kind === 'library' ? (
          <LibraryView />
        ) : view.kind === 'feeds' ? (
          <FeedView />
        ) : view.kind === 'search' ? (
          <SearchView />
        ) : view.kind === 'memory' ? (
          <MemoryView />
        ) : view.kind === 'review' ? (
          <ReviewView />
        ) : view.kind === 'resources' ? (
          <ResourceView />
        ) : view.kind === 'knowledgeBase' ? (
          <KnowledgeBaseView />
        ) : view.kind === 'scheduled' ? (
          <ScheduledTasksView />
        ) : view.kind === 'timeline' ? (
          <TimelineView />
        ) : view.kind === 'gateway' ? (
          <GatewayView />
        ) : view.kind === 'askAnywhere' ? (
          <AskAnywhereView initialActiveId={view.activeId ?? null} />
        ) : view.kind === 'conversations' ? (
          <ConversationsView />
        ) : view.kind === 'today' ? (
          <TodayView />
        ) : view.kind === 'github' ? (
          <GitHubWorkspaceView />
        ) : view.kind === 'vision' ? (
          <VisionView />
        ) : view.kind === 'dashboard' ? (
          <DashboardView />
        ) : view.kind === 'runtimes' ? (
          <RuntimesWorkspaceView />
        ) : view.kind === 'developerConsole' ? (
          <DeveloperConsoleView />
        ) : view.kind === 'agents' ? (
          <AgentsLibraryView />
        ) : view.kind === 'journals' ? (
          <JournalHistoryView />
        ) : view.kind === 'project' ? (
          <ProjectRoomView key={deriveProjectRoomInstanceKey(activeProjectUid)} />
        ) : view.kind === 'kanban' ? (
          <KanbanView projectUid={view.projectUid} />
        ) : view.kind === 'areaRoom' ? (
          <AreaRoomView key={view.areaUid} />
        ) : (
          <AreaOverview areaUid={view.areaUid} />
        )}
      </section>

      <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-neutral-200 bg-[color:color-mix(in_oklab,white_88%,transparent)] dark:border-neutral-800 dark:bg-[color:color-mix(in_oklab,#111827_86%,transparent)]">
        <div className="flex shrink-0 overflow-x-auto border-b border-neutral-200 px-2 pt-2 text-[11px] uppercase tracking-[0.18em] text-neutral-500 dark:border-neutral-800">
          {sidebarIntentTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => selectSidebarIntent(tab.id)}
              className={
                'shrink-0 border-b px-3 py-2 transition-colors ' +
                (sidebarIntent === tab.id
                  ? 'border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100'
                  : 'border-transparent hover:text-neutral-700 dark:hover:text-neutral-300')
              }
            >
              {tab.title}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-neutral-200 px-3 py-2 text-xs dark:border-neutral-800">
          {sidebarPanelTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => selectSidebarPanel(tab.id)}
              className={
                'rounded-full border px-2.5 py-1 transition-colors ' +
                (sidebarPanel === tab.id
                  ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                  : 'border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800')
              }
            >
              {tab.title}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{renderSidebarPanel()}</div>
      </aside>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <NewProjectModal open={newProjectOpen} onClose={() => setNewProjectOpen(false)} />
      <NewAreaModal />
      {view.kind === 'project' && (
        <NewTaskModal
          open={newTaskOpen}
          projectUid={view.projectUid}
          onClose={() => setNewTaskOpen(false)}
        />
      )}
      <CloseProjectDialog
        open={closeOpen}
        projectRelPath={active?.relPath ?? ''}
        onCancel={() => setCloseOpen(false)}
        onConfirm={(opts) => void confirmClose(opts)}
      />
      <TaskDetailsHost />
    </div>
  );
}
