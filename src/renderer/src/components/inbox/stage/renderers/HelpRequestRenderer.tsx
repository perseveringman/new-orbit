import { useEffect, useState } from 'react';
import type { InboxItem } from '@shared/inbox';
import type { TaskRecord } from '@shared/schemas';
import { TaskConversationTab } from '../../../Tasks/TaskConversationTab';
import { InboxChatHost } from '../../InboxChatHost';
import { usePara } from '../../../../store/para';
import { useWorkspace } from '../../../../store/workspace';

export function HelpRequestRenderer({ item }: { item: InboxItem }): JSX.Element {
  const tasks = usePara((state) => state.tasks);
  const refresh = usePara((state) => state.refresh);
  const setView = usePara((state) => state.setView);
  const setActiveProjectUid = useWorkspace((state) => state.setActiveProjectUid);
  const task = findLinkedTask(tasks, item.context.task_uid);
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (!item.context.task_uid) return;
    if (task) return;
    void refresh();
  }, [item.context.task_uid, refresh, task]);

  useEffect(() => {
    if (item.context.task_uid) {
      setConversationId(null);
      return;
    }
    let cancelled = false;
    async function findOrCreate(): Promise<void> {
      try {
        const existing = await window.orbit.chat.findConversationsByAnchor('inbox_item', item.id);
        if (cancelled) return;
        if (existing.length > 0) {
          setConversationId(existing[0]!.id);
          return;
        }
        const created = await window.orbit.chat.createConversation({
          anchor: { kind: 'inbox_item', refId: item.id, addedAt: new Date().toISOString() },
          title: item.title
        } as Parameters<typeof window.orbit.chat.createConversation>[0]);
        if (!cancelled) setConversationId(created.id);
      } catch {
        // 找不到/创建失败时，回退到旧 TaskConversationTab。
      }
    }
    void findOrCreate();
    return () => {
      cancelled = true;
    };
  }, [item.id, item.title]);

  return (
    <HelpRequestStageContent
      item={item}
      task={task}
      conversationId={conversationId}
      onOpenTask={() => {
        if (!task) return;
        setActiveProjectUid(task.project_uid ?? null);
        if (task.project_uid) setView({ kind: 'project', projectUid: task.project_uid });
      }}
    />
  );
}

export function HelpRequestStageContent({
  item,
  task,
  conversationId,
  onOpenTask
}: {
  item: InboxItem;
  task: TaskRecord | null;
  conversationId?: string | null;
  onOpenTask?(): void;
}): JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-500">
            B1 · Agent help
          </p>
          <h2 className="mt-2 text-xl font-semibold">{item.title}</h2>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{item.summary}</p>
        </div>
        {task && (
          <button
            type="button"
            onClick={onOpenTask}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Open task
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs text-neutral-500">
        <span>Task: {item.context.task_uid ?? 'Not linked'}</span>
        <span>Run: {item.context.run_id ?? 'Not linked'}</span>
      </div>
      {task ? (
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <TaskConversationTab task={task} />
        </div>
      ) : conversationId ? (
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <InboxChatHost conversationId={conversationId} />
        </div>
      ) : (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
          {item.context.task_uid
            ? 'Linked task metadata is still loading or no longer exists. Refresh the workspace task index and reopen this Inbox item.'
            : 'This help request is not linked to a task, so there is no task conversation to embed.'}
        </div>
      )}
    </div>
  );
}

function findLinkedTask(tasks: TaskRecord[], taskUid: string | undefined): TaskRecord | null {
  if (!taskUid) return null;
  return tasks.find((task) => task.uid === taskUid) ?? null;
}
