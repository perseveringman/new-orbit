import type { InboxItem } from '@shared/inbox';

export function HelpRequestRenderer({ item }: { item: InboxItem }): JSX.Element {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-500">B1 · Agent help</p>
        <h2 className="mt-2 text-xl font-semibold">{item.title}</h2>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{item.summary}</p>
      </div>
      <div className="rounded-xl border border-violet-300 bg-violet-50 p-4 text-sm text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/20 dark:text-violet-100">
        Task chat embedding is intentionally a placeholder in this foundation. Use the linked task
        conversation to answer the agent; this Inbox item can then be resolved.
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs text-neutral-500">
        <span>Task: {item.context.task_uid ?? 'Not linked'}</span>
        <span>Run: {item.context.run_id ?? 'Not linked'}</span>
      </div>
    </div>
  );
}
