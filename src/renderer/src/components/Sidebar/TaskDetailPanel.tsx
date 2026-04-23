import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TaskRecord } from '@shared/schemas';
import { useFiles } from '../../store/files';
import { usePara } from '../../store/para';
import { useSidebar } from '../../store/sidebar';
import { TaskEditor } from '../TaskEditor/TaskEditor';

export function shouldHydrateFocusedTask(
  currentTask: TaskRecord | null,
  hydratedTask: TaskRecord | null
): boolean {
  if (!currentTask || !hydratedTask) return false;
  if (currentTask.id !== hydratedTask.id) return false;

  return (
    currentTask.title !== hydratedTask.title ||
    currentTask.status !== hydratedTask.status ||
    currentTask.relPath !== hydratedTask.relPath ||
    currentTask.filePath !== hydratedTask.filePath
  );
}

export function TaskDetailPanel(): JSX.Element {
  const task = useSidebar((s) => s.focus.task);
  const focusProjectUid = useSidebar((s) => s.focus.projectUid);
  const setSidebarFocus = useSidebar((s) => s.setFocus);
  const toast = useFiles((s) => s.toast);
  const openPath = useFiles((s) => s.openPath);
  const setView = usePara((s) => s.setView);
  const [siblings, setSiblings] = useState<TaskRecord[]>([]);

  const refreshSiblings = useCallback(async () => {
    if (!focusProjectUid) {
      setSiblings(task ? [task] : []);
      return;
    }

    try {
      const next = await window.orbit.project.getTasks(focusProjectUid);
      setSiblings(next);
      if (!task) return;
      const hydrated = next.find((entry) => entry.id === task.id);
      if (shouldHydrateFocusedTask(task, hydrated ?? null)) {
        setSidebarFocus({ task: hydrated ?? null });
      }
    } catch (error) {
      toast(`Load task detail failed: ${(error as Error).message}`);
    }
  }, [focusProjectUid, setSidebarFocus, task, toast]);

  useEffect(() => {
    void refreshSiblings();
  }, [refreshSiblings]);

  const activeTask = useMemo(
    () => siblings.find((entry) => entry.id === task?.id) ?? task,
    [siblings, task]
  );

  if (!activeTask) {
    return (
      <div className="flex h-full items-center justify-center rounded border border-dashed border-neutral-300 px-4 text-center text-sm text-neutral-500 dark:border-neutral-700">
        Select a task to inspect it here.
      </div>
    );
  }

  if (activeTask.source !== 'file') {
    return (
      <div className="space-y-3 rounded border border-neutral-200 bg-white/50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900/40">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">Inline task</p>
          <h3 className="mt-1 font-semibold text-neutral-900 dark:text-neutral-100">
            {activeTask.title}
          </h3>
          <p className="mt-1 text-xs text-neutral-500">{activeTask.relPath}</p>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs text-neutral-600 dark:text-neutral-300">
          <div>
            <dt className="uppercase tracking-wide text-neutral-400">Status</dt>
            <dd>{activeTask.status}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-neutral-400">Source</dt>
            <dd>{activeTask.source}</dd>
          </div>
        </dl>
        <button
          onClick={() => void openPath(activeTask.filePath).then(() => setView({ kind: 'editor' }))}
          className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Open source note
        </button>
      </div>
    );
  }

  return (
    <TaskEditor
      key={activeTask.filePath}
      task={activeTask}
      siblings={siblings}
      onFrontmatterChanged={() => void refreshSiblings()}
      onSectionsChanged={() => void refreshSiblings()}
    />
  );
}
