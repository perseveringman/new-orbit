import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TaskRecord, TaskStatus } from '@shared/schemas';
import { groupByStatus, moveTask } from '@shared/kanban';
import type { AreaSummaryDTO } from '@shared/ipc';
import { usePara } from '../store/para';
import { useWorkspace } from '../store/workspace';
import { useFiles } from '../store/files';
import { useSidebar } from '../store/sidebar';
import { TerminalManager } from '../components/Terminal/TerminalManager';
import type { TerminalManagerHandle } from '../components/Terminal/TerminalManager';
import { NewTaskModal } from '../components/Modals/NewTaskModal';
import {
  consumePendingTerminalNavigation,
  queueTerminalNavigation,
  type TerminalNavigationIntent
} from '../components/Terminal/terminalNavigationIntent';
import { VisionRoomContent } from './VisionRoomContent';
import { AreaSessionsView } from './AreaSessionsView';

const KanbanBoard = lazy(() => import('../components/KanbanBoard'));

type AreaRoomOuterTab = 'kanban' | 'terminal' | 'sessions';

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
      className={`border-b-2 px-4 py-2 text-sm transition-colors ${
        active
          ? 'border-sky-500 text-sky-600 dark:text-sky-400'
          : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
      }`}
    >
      {children}
    </button>
  );
}

const START_VISION_COMMAND =
  '请读取 .orbit/agent/AGENTS.md、questions.yaml、rubrics.md、vision.template.md，按协议启动愿景访谈。先检查 $ORBIT_EXTERNAL_NOTES_PATHS 是否有可用笔记，有则先生成 notes-digest.md。然后从第 1 题开始。访谈结束后将结果写入 VISION.md，变化写入 CHANGELOG.md。';

const REVIEW_VISION_COMMAND =
  '请读取 .orbit/agent/AGENTS.md 和当前 VISION.md，进入 review 模式。检查价值观、工作观/人生观、动机真实性和上次 milestones 完成度。有明显变化则更新 VISION.md，记录至 CHANGELOG.md，刷新 next_review。';

export function AreaRoomView(): JSX.Element {
  const view = usePara((s) => s.view);
  const areas = useWorkspace((s) => s.areas);
  const dark = useWorkspace((s) => s.settings.theme === 'dark');
  const vault = useWorkspace((s) => s.vault);
  const toast = useFiles((s) => s.toast);
  const openSidebarPanel = useSidebar((s) => s.openPanel);
  const setSidebarSurface = useSidebar((s) => s.setSurface);
  const setSidebarFocus = useSidebar((s) => s.setFocus);

  const areaUid = view.kind === 'areaRoom' ? view.areaUid : '';
  const area: AreaSummaryDTO | undefined = useMemo(
    () => areas.find((item) => item.uid === areaUid),
    [areas, areaUid]
  );
  const isVisionArea = area?.template === 'vision' || area?.slug === 'vision';

  const outerTabKey = `orbit.areaRoom.outerTab.${areaUid}`;
  const [outerTab, setOuterTabRaw] = useState<AreaRoomOuterTab>(() => {
    try {
      const value = localStorage.getItem(outerTabKey);
      return value === 'terminal' || value === 'sessions' ? value : 'kanban';
    } catch {
      return 'kanban';
    }
  });
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [externalNotesPaths, setExternalNotesPaths] = useState<string[]>([]);
  const managerRef = useRef<TerminalManagerHandle | null>(null);

  const setOuterTab = useCallback(
    (tab: AreaRoomOuterTab): void => {
      setOuterTabRaw(tab);
      try {
        localStorage.setItem(outerTabKey, tab);
      } catch {
        /* ignore */
      }
    },
    [outerTabKey]
  );

  const refreshTasks = useCallback(async () => {
    if (!areaUid) {
      setTasks([]);
      return;
    }
    try {
      const next = await window.orbit.para.listTasks({ area_uid: areaUid });
      setTasks(next);
    } catch (error) {
      toast(`Load area tasks failed: ${(error as Error).message}`);
    }
  }, [areaUid, toast]);

  const refreshVaultConfig = useCallback(async () => {
    try {
      const next = await window.orbit.vaultConfig.get();
      setExternalNotesPaths(next.external_notes_paths);
    } catch (error) {
      toast(`Load notes config failed: ${(error as Error).message}`);
    }
  }, [toast]);

  useEffect(() => {
    try {
      const key = `orbit.areaRoom.outerTab.${areaUid}`;
      const value = localStorage.getItem(key);
      setOuterTabRaw(value === 'terminal' || value === 'sessions' ? value : 'kanban');
    } catch {
      setOuterTabRaw('kanban');
    }
  }, [areaUid]);

  useEffect(() => {
    void refreshTasks();
    void refreshVaultConfig();
  }, [refreshTasks, refreshVaultConfig]);

  useEffect(() => {
    const off = window.orbit.fs.onEvent(() => {
      void refreshTasks();
    });
    function onVaultConfigChanged(): void {
      void refreshVaultConfig();
    }
    window.addEventListener('orbit:vault-config-changed', onVaultConfigChanged);
    return () => {
      off();
      window.removeEventListener('orbit:vault-config-changed', onVaultConfigChanged);
    };
  }, [refreshTasks, refreshVaultConfig]);

  useEffect(() => {
    if (!area) return;
    if (outerTab === 'sessions') {
      openSidebarPanel({
        surface: 'areaRoom',
        panel: 'sessions',
        focus: {
          projectUid: area.uid
        }
      });
      return;
    }
    setSidebarSurface('areaRoom');
    setSidebarFocus({
      projectUid: area.uid,
      task: null
    });
  }, [area, openSidebarPanel, outerTab, setSidebarFocus, setSidebarSurface]);

  useEffect(() => {
    if (!area) return;
    const currentAreaUid = area.uid;
    function onOpenTerminal(event: Event): void {
      const detail = (event as CustomEvent<{ initialCommand?: string } | undefined>).detail;
      setOuterTab('terminal');
      if (detail?.initialCommand) {
        queueTerminalNavigation({
          projectUid: currentAreaUid,
          roomKind: 'area',
          initialCommand: detail.initialCommand
        });
      }
    }
    window.addEventListener('orbit:area-open-terminal', onOpenTerminal as EventListener);
    return () =>
      window.removeEventListener('orbit:area-open-terminal', onOpenTerminal as EventListener);
  }, [area, setOuterTab]);

  useEffect(() => {
    if (!area) return;
    const pending = consumePendingTerminalNavigation(area.uid);
    if (!pending || (pending.roomKind ?? 'project') !== 'area') return;
    setOuterTab('terminal');
    if (pending.initialCommand) {
      managerRef.current?.openTab({ initialCommand: pending.initialCommand });
      return;
    }
    if (pending.paneId) {
      const focused = managerRef.current?.focusPane(pending.paneId);
      if (focused) return;
    }
    managerRef.current?.focusActive();
  }, [area, outerTab, setOuterTab]);

  const columns = useMemo(() => groupByStatus(tasks), [tasks]);

  async function onDropTask(taskId: string, target: TaskStatus): Promise<void> {
    const { next, moved } = moveTask(tasks, taskId, target);
    if (!moved) return;
    setTasks(next);
    try {
      const task = tasks.find((item) => item.id === taskId);
      if (!task) return;
      if (task.source === 'file') {
        await window.orbit.task.updateFrontmatter(task.filePath, { status: target });
      } else {
        await window.orbit.para.updateTaskStatus(task.id, target);
      }
    } catch (error) {
      toast(`Status update failed: ${(error as Error).message}`);
      await refreshTasks();
    }
  }

  function openAreaSession(intent: TerminalNavigationIntent): void {
    queueTerminalNavigation(intent);
    setOuterTab('terminal');
  }

  if (!area) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Area not found.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-start gap-3 border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{area.name}</h1>
          {area.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {area.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] dark:bg-neutral-800"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
          <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
            <span className="rounded border border-neutral-300 px-2 py-0.5 dark:border-neutral-700">
              {area.slug}
            </span>
            {isVisionArea && (
              <span className="rounded border border-emerald-300 px-2 py-0.5 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400">
                Vision
              </span>
            )}
            {externalNotesPaths.length > 0 && (
              <span className="rounded border border-neutral-300 px-2 py-0.5 dark:border-neutral-700">
                External notes: {externalNotesPaths.length}
              </span>
            )}
          </div>
        </div>
        {!isVisionArea && (
          <button
            onClick={() => setNewTaskOpen(true)}
            className="rounded-md bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500"
          >
            New task
          </button>
        )}
      </header>

      <div className="flex shrink-0 border-b border-neutral-200 px-4 text-sm dark:border-neutral-800">
        <OuterTabButton active={outerTab === 'kanban'} onClick={() => setOuterTab('kanban')}>
          Kanban
        </OuterTabButton>
        <OuterTabButton active={outerTab === 'terminal'} onClick={() => setOuterTab('terminal')}>
          Terminal
        </OuterTabButton>
        <OuterTabButton active={outerTab === 'sessions'} onClick={() => setOuterTab('sessions')}>
          Sessions
        </OuterTabButton>
      </div>

      <div className={`flex min-h-0 flex-1 ${outerTab === 'kanban' ? 'flex' : 'hidden'}`}>
        {isVisionArea ? (
          <VisionRoomContent
            areaPath={area.path}
            startCommand={START_VISION_COMMAND}
            reviewCommand={REVIEW_VISION_COMMAND}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm text-neutral-500">{tasks.length} long-running tasks</div>
              <button
                onClick={() => setNewTaskOpen(true)}
                className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                Create task
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <Suspense fallback={<p className="text-sm text-neutral-500">Loading board…</p>}>
                <KanbanBoard columns={columns} onDrop={onDropTask} onStatus={onDropTask} />
              </Suspense>
            </div>
          </div>
        )}
      </div>

      <div className={`min-h-0 flex-1 ${outerTab === 'terminal' ? 'flex' : 'hidden'}`}>
        <TerminalManager
          ref={managerRef}
          projectUid={area.uid}
          cwd={area.path}
          dark={dark}
          env={{
            ORBIT_VAULT_PATH: vault?.path ?? '',
            ORBIT_AREA_UID: area.uid,
            ORBIT_AREA_SLUG: area.slug,
            ORBIT_AREA_PATH: area.path,
            ORBIT_PROJECT_UID: area.uid,
            ORBIT_PROJECT_SLUG: area.slug,
            ORBIT_EXTERNAL_NOTES_PATHS: externalNotesPaths.join(':')
          }}
        />
      </div>

      <div className={`min-h-0 flex-1 ${outerTab === 'sessions' ? 'flex' : 'hidden'}`}>
        <AreaSessionsView areaUid={area.uid} onOpenSession={openAreaSession} />
      </div>

      {!isVisionArea && (
        <NewTaskModal
          open={newTaskOpen}
          areaUid={area.uid}
          siblings={tasks.filter((task) => task.source === 'file')}
          onClose={() => setNewTaskOpen(false)}
          onCreated={() => void refreshTasks()}
        />
      )}
    </div>
  );
}
