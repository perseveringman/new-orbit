import { useEffect, useState } from 'react';
import { useWorkspace } from '../store/workspace';
import { useFiles } from '../store/files';
import { usePara } from '../store/para';
import { useAgent } from '../store/agent';
import { FileTree } from '../components/Sidebar/FileTree';
import { BacklinksPanel } from '../components/Sidebar/BacklinksPanel';
import { AgentPanel } from '../components/Sidebar/AgentPanel';
import { WorktreesPanel } from '../components/Sidebar/WorktreesPanel';
import { MarkdownEditor } from '../components/Editor/MarkdownEditor';
import { CommandPalette } from '../components/CommandPalette';
import { ProjectsNav } from '../components/Sidebar/ProjectsNav';
import { CloseProjectDialog } from '../components/CloseProjectDialog';
import { InboxView } from './InboxView';
import { TodayView } from './TodayView';
import { KanbanView } from './KanbanView';
import { AreaOverview } from './AreaOverview';
import { DashboardView } from './DashboardView';
import { ProjectRoomView } from './ProjectRoomView';
import { JournalHistoryView } from './JournalHistoryView';
import { NightShiftHistoryDrawer } from '../components/NightShiftHistoryDrawer';
import { NewProjectModal } from '../components/Modals/NewProjectModal';
import { NewTaskModal } from '../components/Modals/NewTaskModal';

export function VaultView(): JSX.Element {
  const { vault, settings } = useWorkspace();
  const { tree, active, init, teardown, openPath, toast } = useFiles();
  const view = usePara((s) => s.view);
  const setView = usePara((s) => s.setView);
  const refresh = usePara((s) => s.refresh);
  const initAgent = useAgent((s) => s.init);
  const teardownAgent = useAgent((s) => s.teardown);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [nsHistoryOpen, setNsHistoryOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightTab, setRightTab] = useState<'files' | 'backlinks' | 'agent' | 'worktrees'>('backlinks');
  const [closeOpen, setCloseOpen] = useState(false);

  const vaultPath = vault?.path;
  useEffect(() => {
    if (!vaultPath) return;
    void init(vaultPath);
    void refresh();
    void initAgent();
    // R2: default to Dashboard when a vault has 0 folder-projects (typical for
    // a freshly-bootstrapped one). Idempotent: only nudges the view once.
    void (async () => {
      try {
        const projs = await window.orbit.project.list();
        if (projs.length === 0) {
          setView({ kind: 'dashboard' });
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
    function onKey(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (mod && e.shiftKey && key === 'n') {
        // ⌘⇧N — new task (only meaningful inside a project room)
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
        // ⌘` — focus terminal; ProjectRoomView listens for this event
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
    function onOpenDrawer(e: Event): void {
      const detail = (e as CustomEvent<string>).detail;
      if (detail === 'night-shift-history') setNsHistoryOpen(true);
    }
    window.addEventListener('orbit:open-drawer', onOpenDrawer as EventListener);
    return () =>
      window.removeEventListener(
        'orbit:open-drawer',
        onOpenDrawer as EventListener
      );
  }, []);

  useEffect(() => {
    function onOpenNewProject(): void {
      setNewProjectOpen(true);
    }
    window.addEventListener('orbit:open-new-project', onOpenNewProject);
    return () => window.removeEventListener('orbit:open-new-project', onOpenNewProject);
  }, []);

  useEffect(() => {
    if (rightTab === 'backlinks' && (!active || view.kind !== 'editor')) setRightTab('files');
  }, [active, rightTab, view.kind]);

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
    } else toast(`No file matches [[${target}]]`);
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
        setRightTab('agent');
        try {
          const out = await window.orbit.distill.project(res.uid);
          toast(`Distilled → ${out.resourceRelPath}`);
          await openPath(out.resourcePath);
        } catch (e) {
          toast(`Distillation failed: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      toast((e as Error).message);
    }
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
        ) : view.kind === 'today' ? (
          <TodayView />
        ) : view.kind === 'dashboard' ? (
          <DashboardView />
        ) : view.kind === 'journals' ? (
          <JournalHistoryView />
        ) : view.kind === 'project' ? (
          <ProjectRoomView />
        ) : view.kind === 'kanban' ? (
          <KanbanView projectUid={view.projectUid} />
        ) : (
          <AreaOverview areaUid={view.areaUid} />
        )}
      </section>

      <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-neutral-200 bg-white/40 dark:border-neutral-800 dark:bg-neutral-900/40">
        <div className="flex shrink-0 border-b border-neutral-200 text-xs dark:border-neutral-800">
          {(['files', 'backlinks', 'agent', 'worktrees'] as const).filter((tab) => tab !== 'backlinks' || view.kind === 'editor').map((tab) => (
            <button
              key={tab}
              onClick={() => setRightTab(tab)}
              className={
                'flex-1 px-3 py-2 capitalize ' +
                (rightTab === tab
                  ? 'bg-neutral-200/60 dark:bg-neutral-800/60'
                  : 'hover:bg-neutral-200/30 dark:hover:bg-neutral-800/30')
              }
            >
              {tab === 'files' ? 'Files' : tab === 'backlinks' ? 'Backlinks' : tab === 'agent' ? 'Agent' : 'Worktrees'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {rightTab === 'files' ? (
            tree ? (
              <FileTree root={tree} />
            ) : (
              <p className="text-xs text-neutral-500">Scanning…</p>
            )
          ) : rightTab === 'backlinks' ? (
            <BacklinksPanel />
          ) : rightTab === 'agent' ? (
            <AgentPanel />
          ) : (
            <WorktreesPanel />
          )}
        </div>
      </aside>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <NightShiftHistoryDrawer
        open={nsHistoryOpen}
        onClose={() => setNsHistoryOpen(false)}
      />
      <NewProjectModal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
      />
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
    </div>
  );
}
