import { TaskDetailsModal } from '../Modals/TaskDetailsModal';
import { useTaskDetails } from '../../store/taskDetails';
import { TaskDetailSurface } from './TaskDetailSurface';
import { TaskConversationTab } from './TaskConversationTab';

export function TaskDetailsHost(): JSX.Element | null {
  const open = useTaskDetails((s) => s.open);
  const task = useTaskDetails((s) => s.task);
  const projectUid = useTaskDetails((s) => s.projectUid);
  const tab = useTaskDetails((s) => s.tab);
  const setTab = useTaskDetails((s) => s.setTab);
  const close = useTaskDetails((s) => s.close);
  const openTask = useTaskDetails((s) => s.openTask);

  if (!open || !task) return null;

  return (
    <TaskDetailsModal
      open={open}
      title={task.title}
      detail={task.relPath}
      onClose={close}
      tabs={[
         { id: 'detail', label: '详情' },
         { id: 'chat', label: '活动' }
      ]}
      activeTab={tab}
      onTabChange={(nextTab) => setTab(nextTab as 'detail' | 'chat')}
    >
      {tab === 'detail' ? (
        <TaskDetailSurface
          task={task}
          projectUid={projectUid}
          onTaskHydrated={(nextTask) => openTask(nextTask, projectUid, tab)}
        />
      ) : (
        <TaskConversationTab task={task} />
      )}
    </TaskDetailsModal>
  );
}
