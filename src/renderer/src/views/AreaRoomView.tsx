import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TaskRecord, TaskStatus } from '@shared/schemas';
import { groupByStatus, moveTask } from '@shared/kanban';
import type { AreaSummaryDTO, TerminalAgentLaunchDTO } from '@shared/ipc';
import type { TimelineEntry } from '@shared/timeline';
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
import { AreaOverview } from './AreaOverview';
import { SpaceMaterialsView } from './ProjectMaterialsView';
import { SpaceOutputsView } from './SpaceOutputsView';

const KanbanBoard = lazy(() => import('../components/KanbanBoard'));

export type AreaRoomOuterTab =
  | 'dashboard'
  | 'kanban'
  | 'materials'
  | 'outputs'
  | 'chat'
  | 'timeline'
  | 'terminal'
  | 'sessions';

export const AREA_ROOM_TABS: Array<{ id: AreaRoomOuterTab; label: string }> = [
  { id: 'dashboard', label: '仪表盘' },
  { id: 'kanban', label: '看板' },
  { id: 'materials', label: '素材' },
  { id: 'outputs', label: '产出' },
  { id: 'chat', label: '对话' },
  { id: 'timeline', label: '时间线' },
  { id: 'terminal', label: '终端' },
  { id: 'sessions', label: '会话' }
];

export function isAreaRoomOuterTab(value: string | null): value is AreaRoomOuterTab {
  return AREA_ROOM_TABS.some((tab) => tab.id === value);
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
  const setView = usePara((s) => s.setView);
  const areas = useWorkspace((s) => s.areas);
  const dark = useWorkspace((s) => s.resolvedTheme === 'dark');
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
      return isAreaRoomOuterTab(value) ? value : 'dashboard';
    } catch {
      return 'dashboard';
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
      toast(`加载 Area 任务失败：${(error as Error).message}`);
    }
  }, [areaUid, toast]);

  const refreshVaultConfig = useCallback(async () => {
    try {
      const next = await window.orbit.vaultConfig.get();
      setExternalNotesPaths(next.external_notes_paths);
    } catch (error) {
      toast(`加载笔记配置失败：${(error as Error).message}`);
    }
  }, [toast]);

  useEffect(() => {
    try {
      const key = `orbit.areaRoom.outerTab.${areaUid}`;
      const value = localStorage.getItem(key);
      setOuterTabRaw(isAreaRoomOuterTab(value) ? value : 'dashboard');
    } catch {
      setOuterTabRaw('dashboard');
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
        origin: 'auto',
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
      const detail = (event as CustomEvent<{ agentLaunch?: TerminalAgentLaunchDTO } | undefined>)
        .detail;
      setOuterTab('terminal');
      if (detail?.agentLaunch) {
        queueTerminalNavigation({
          projectUid: currentAreaUid,
          roomKind: 'area',
          agentLaunch: detail.agentLaunch
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
    if (pending.agentLaunch) {
      managerRef.current?.openTab({ agentLaunch: pending.agentLaunch });
      return;
    }
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
      toast(`状态更新失败：${(error as Error).message}`);
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
        未找到 Area。
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
                外部笔记：{externalNotesPaths.length}
              </span>
            )}
          </div>
        </div>
        {!isVisionArea && (
          <button
            onClick={() => setNewTaskOpen(true)}
            className="rounded-md bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500"
          >
            新建任务
          </button>
        )}
      </header>

      <div className="flex shrink-0 border-b border-neutral-200 px-4 text-sm dark:border-neutral-800">
        {AREA_ROOM_TABS.map((tab) => (
          <OuterTabButton
            key={tab.id}
            active={outerTab === tab.id}
            onClick={() => setOuterTab(tab.id)}
          >
            {tab.label}
          </OuterTabButton>
        ))}
      </div>

      <div className={`min-h-0 flex-1 ${outerTab === 'dashboard' ? 'flex' : 'hidden'}`}>
        <AreaOverview areaUid={area.uid} />
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
              <div className="text-sm text-neutral-500">{tasks.length} 个长期任务</div>
              <button
                onClick={() => setNewTaskOpen(true)}
                className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                创建任务
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <Suspense fallback={<p className="text-sm text-neutral-500">正在加载看板…</p>}>
                <KanbanBoard columns={columns} onDrop={onDropTask} onStatus={onDropTask} />
              </Suspense>
            </div>
          </div>
        )}
      </div>

      <div className={`min-h-0 flex-1 ${outerTab === 'materials' ? 'flex' : 'hidden'}`}>
        <SpaceMaterialsView spaceId={area.uid} spaceName={area.name} spaceLabel="area" />
      </div>

      <div className={`min-h-0 flex-1 ${outerTab === 'outputs' ? 'flex' : 'hidden'}`}>
        <SpaceOutputsView spaceId={area.uid} spaceLabel="Area" />
      </div>

      <div className={`min-h-0 flex-1 ${outerTab === 'chat' ? 'flex' : 'hidden'}`}>
        <AreaChatTab
          area={area}
          onOpenConversation={(conversationId) => setView({ kind: 'askAnywhere', activeId: conversationId })}
        />
      </div>

      <div className={`min-h-0 flex-1 ${outerTab === 'timeline' ? 'flex' : 'hidden'}`}>
        <AreaTimelineTab area={area} />
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

function AreaChatTab({
  area,
  onOpenConversation
}: {
  area: AreaSummaryDTO;
  onOpenConversation(conversationId: string): void;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openChat(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const scope = { kind: 'area' as const, area_slug: area.slug };
      // Phase E.3：先复用该 area 的最近活跃会话；没有才新建，避免"点 Area Room 按钮 / 点 Overview 按钮"开出两个不同会话。
      const existing = await window.orbit.chat
        .getLastActiveConversation(scope)
        .catch(() => null);
      if (existing) {
        onOpenConversation(existing.id);
        return;
      }
      const conversation = await window.orbit.chat.createConversation({
        anchor: {
          kind: 'ask_anywhere_session',
          refId: `area:${area.slug}`,
          addedAt: new Date().toISOString()
        },
        scope,
        title: `Area: ${area.name}`
      });
      await window.orbit.chat.setLastActiveConversation(scope, conversation.id);
      onOpenConversation(conversation.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-6 text-center dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="text-base font-semibold">Area 限定对话</h2>
        <p className="mt-2 text-sm text-neutral-500">
          启动限定到 {area.name} 的对话；Orbit 会将这个 Area 作为工作上下文。
        </p>
        {error ? <p className="mt-3 text-xs text-red-500">{error}</p> : null}
        <button
          onClick={() => void openChat()}
          disabled={busy}
          className="mt-4 rounded bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {busy ? '打开中…' : '打开 Area 对话'}
        </button>
      </div>
    </section>
  );
}

function AreaTimelineTab({ area }: { area: AreaSummaryDTO }): JSX.Element {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const date = new Date().toISOString().slice(0, 10);
    void window.orbit.timeline
      .getDay(date)
      .then((timeline) => {
        if (cancelled) return;
        setEntries(
          timeline.entries.filter((entry) =>
            (entry.refs ?? []).some(
              (ref) => ref.kind === 'area' && (ref.ref === area.uid || ref.ref === area.slug)
            )
          )
        );
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [area.slug, area.uid]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">时间线</h2>
        <p className="text-xs text-neutral-500">今天关联到此 Area 的可见事件。</p>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div> : null}
        {!entries ? (
          <div className="text-sm text-neutral-500">正在加载时间线...</div>
        ) : entries.length === 0 ? (
          <EmptyAreaTab title="今天没有 Area 事件" description="带有 Area 引用的时间线事件会出现在这里。" />
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <article key={entry.event_id} className="rounded border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{entry.icon} {entry.title}</h3>
                    {entry.summary ? <p className="mt-1 text-xs text-neutral-500">{entry.summary}</p> : null}
                  </div>
                  <span className="shrink-0 text-xs text-neutral-500">{entry.occurred_at.slice(11, 16)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyAreaTab({ title, description }: { title: string; description: string }): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="rounded border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-800">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mt-2 max-w-sm text-xs text-neutral-500">{description}</p>
      </div>
    </div>
  );
}
