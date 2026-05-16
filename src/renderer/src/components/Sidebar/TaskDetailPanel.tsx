import { useSidebar } from '../../store/sidebar';
import { TaskDetailSurface, shouldHydrateTask } from '../Tasks/TaskDetailSurface';

export const shouldHydrateFocusedTask = shouldHydrateTask;

export function TaskDetailPanel(): JSX.Element {
  const task = useSidebar((s) => s.focus.task);
  const focusProjectUid = useSidebar((s) => s.focus.projectUid);
  const setSidebarFocus = useSidebar((s) => s.setFocus);

  if (!task) {
    return (
      <div className="flex h-full items-center justify-center rounded border border-dashed border-neutral-300 px-4 text-center text-sm text-neutral-500 dark:border-neutral-700">
        请选择一个任务以在这里查看详情。
      </div>
    );
  }

  return (
    <TaskDetailSurface
      task={task}
      projectUid={focusProjectUid}
      onTaskHydrated={(nextTask) =>
        setSidebarFocus({
          task: nextTask
        })
      }
    />
  );
}
