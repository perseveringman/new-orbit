import { DndContext, type DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import type { TaskRecord, TaskStatus } from '@shared/schemas';
import { TASK_STATUSES } from '@shared/schemas';
import type { KanbanColumns } from '@shared/kanban';
import { TaskRow } from './TaskRow';

interface Props {
  columns: KanbanColumns;
  onDrop(id: string, target: TaskStatus): void;
  onStatus(id: string, status: TaskStatus): void;
}

export default function KanbanBoard({ columns, onDrop, onStatus }: Props): JSX.Element {
  function onDragEnd(ev: DragEndEvent): void {
    const id = String(ev.active.id);
    const target = ev.over?.id ? String(ev.over.id) : null;
    if (!target) return;
    if (!(TASK_STATUSES as readonly string[]).includes(target)) return;
    onDrop(id, target as TaskStatus);
  }

  return (
    <DndContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-5 gap-3">
        {TASK_STATUSES.map((s) => (
          <Column key={s} status={s} tasks={columns[s]} onStatus={onStatus} />
        ))}
      </div>
    </DndContext>
  );
}

function Column({
  status,
  tasks,
  onStatus
}: {
  status: TaskStatus;
  tasks: TaskRecord[];
  onStatus: (id: string, status: TaskStatus) => void;
}): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      className={
        'flex min-h-[200px] flex-col rounded border p-2 transition-colors ' +
        (isOver
          ? 'border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-900/30'
          : 'border-neutral-200 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-900/40')
      }
    >
      <header className="mb-2 flex items-center justify-between px-1 text-xs uppercase tracking-wide text-neutral-500">
        <span>{taskStatusLabel(status)}</span>
        <span>{tasks.length}</span>
      </header>
      <ul className="flex-1 space-y-1">
        {tasks.map((t) => (
          <li key={t.id}>
            <DraggableTask task={t} onStatus={onStatus} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function DraggableTask({
  task,
  onStatus
}: {
  task: TaskRecord;
  onStatus: (id: string, status: TaskStatus) => void;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      className={isDragging ? 'opacity-50' : ''}
    >
      <TaskRow task={task} onStatus={onStatus} />
    </div>
  );
}

function taskStatusLabel(status: TaskStatus): string {
  if (status === 'backlog') return '待整理';
  if (status === 'waiting') return '等待中';
  if (status === 'todo') return '待办';
  if (status === 'doing') return '进行中';
  if (status === 'blocked') return '受阻';
  if (status === 'done') return '已完成';
  return status;
}
