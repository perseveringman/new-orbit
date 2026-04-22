import { useEffect, useState } from 'react';
import type { TaskRecord } from '@shared/schemas';
import { usePara } from '../store/para';
import { TaskRow } from '../components/TaskRow';

/**
 * The Inbox view: all tasks with status `inbox`. "Un-triaged" inline tasks
 * from files outside the four PARA roots also surface here, because the
 * indexer defaults uncommented `- [ ]` checkboxes to `inbox`.
 */
export function InboxView(): JSX.Element {
  const refreshFiltered = usePara((s) => s.refreshFiltered);
  const updateStatus = usePara((s) => s.updateStatus);
  const tasks = usePara((s) => s.tasks);
  const [rows, setRows] = useState<TaskRecord[]>([]);

  useEffect(() => {
    void refreshFiltered({ status: 'inbox' }).then(setRows);
  }, [refreshFiltered, tasks]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <h1 className="text-lg font-semibold">Inbox</h1>
        <p className="text-xs text-neutral-500">
          {rows.length} task{rows.length === 1 ? '' : 's'} awaiting triage
        </p>
      </header>
      <div className="flex-1 overflow-auto p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-neutral-500">Inbox clear. ✨</p>
        ) : (
          <ul className="space-y-1">
            {rows.map((t) => (
              <li key={t.id}>
                <TaskRow task={t} onStatus={updateStatus} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
