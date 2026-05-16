import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TaskRecord } from '@shared/schemas';
import { useFiles } from '../../store/files';
import { usePara } from '../../store/para';
import { TaskEditor } from '../TaskEditor/TaskEditor';

export function shouldHydrateTask(
  currentTask: TaskRecord | null,
  hydratedTask: TaskRecord | null
): boolean {
  if (!currentTask || !hydratedTask) return false;
  if (currentTask.id !== hydratedTask.id) return false;

  return (
    currentTask.title !== hydratedTask.title ||
    currentTask.status !== hydratedTask.status ||
    currentTask.relPath !== hydratedTask.relPath ||
    currentTask.filePath !== hydratedTask.filePath ||
    currentTask.active_run_id !== hydratedTask.active_run_id
  );
}

interface TaskDetailSurfaceProps {
  task: TaskRecord;
  projectUid?: string | null;
  onTaskHydrated?(task: TaskRecord): void;
}

export function TaskDetailSurface({
  task,
  projectUid,
  onTaskHydrated
}: TaskDetailSurfaceProps): JSX.Element {
  const toast = useFiles((s) => s.toast);
  const openPath = useFiles((s) => s.openPath);
  const setView = usePara((s) => s.setView);
  const [siblings, setSiblings] = useState<TaskRecord[]>([]);

  const refreshSiblings = useCallback(async () => {
    if (!projectUid) {
      setSiblings([task]);
      return;
    }

    try {
      const next = await window.orbit.project.getTasks(projectUid);
      setSiblings(next);
      const hydrated = next.find((entry) => entry.id === task.id) ?? null;
      if (hydrated && shouldHydrateTask(task, hydrated)) {
        onTaskHydrated?.(hydrated);
      }
    } catch (error) {
       toast(`加载任务详情失败：${(error as Error).message}`);
    }
  }, [onTaskHydrated, projectUid, task, toast]);

  useEffect(() => {
    void refreshSiblings();
  }, [refreshSiblings]);

  const activeTask = useMemo(
    () => siblings.find((entry) => entry.id === task.id) ?? task,
    [siblings, task]
  );

  if (activeTask.source !== 'file') {
    return (
      <div className="space-y-3 rounded border border-neutral-200 bg-white/50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900/40">
        <div>
           <p className="text-[11px] uppercase tracking-wide text-neutral-500">行内任务</p>
          <h3 className="mt-1 font-semibold text-neutral-900 dark:text-neutral-100">
            {activeTask.title}
          </h3>
          <p className="mt-1 text-xs text-neutral-500">{activeTask.relPath}</p>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs text-neutral-600 dark:text-neutral-300">
          <div>
             <dt className="uppercase tracking-wide text-neutral-400">状态</dt>
             <dd>{taskStatusLabel(activeTask.status)}</dd>
          </div>
          <div>
             <dt className="uppercase tracking-wide text-neutral-400">来源</dt>
            <dd>{activeTask.source}</dd>
          </div>
        </dl>
        <button
          onClick={() => void openPath(activeTask.filePath).then(() => setView({ kind: 'editor' }))}
          className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
           打开源笔记
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

function taskStatusLabel(status: TaskRecord['status']): string {
  if (status === 'backlog') return '待整理';
  if (status === 'waiting') return '等待中';
  if (status === 'todo') return '待办';
  if (status === 'doing') return '进行中';
  if (status === 'blocked') return '受阻';
  if (status === 'done') return '已完成';
  return status;
}
