import { useEffect, useState } from 'react';
import type { TaskRecord } from '@shared/schemas';
import { usePara } from '../store/para';
import { useWorkspace } from '../store/workspace';
import { useReviewQueue } from '../store/reviewQueue';
import { TaskRow } from '../components/TaskRow';
import { queueTerminalNavigation } from '../components/Terminal/terminalNavigationIntent';
import { getReviewQueueContextSummary } from './reviewQueuePresentation';

/**
 * The Inbox view: all tasks with status `backlog`. "Un-triaged" inline tasks
 * from files outside the four PARA roots also surface here, because the
 * indexer defaults unchecked `- [ ]` checkboxes to `backlog`.
 */
export function InboxView(): JSX.Element {
  const refreshFiltered = usePara((s) => s.refreshFiltered);
  const updateStatus = usePara((s) => s.updateStatus);
  const setView = usePara((s) => s.setView);
  const tasks = usePara((s) => s.tasks);
  const projects = useWorkspace((s) => s.projects);
  const permissionItems = useReviewQueue((s) =>
    s.items.filter((item) => item.source === 'permission' && item.projectUid && item.paneId)
  );
  const setActiveProjectUid = useWorkspace((s) => s.setActiveProjectUid);
  const [rows, setRows] = useState<TaskRecord[]>([]);

  useEffect(() => {
    void refreshFiltered({ status: 'backlog' }).then(setRows);
  }, [refreshFiltered, tasks]);

  function openTerminal(projectUid: string, paneId: string): void {
    queueTerminalNavigation({ projectUid, paneId, roomKind: 'project' });
    setActiveProjectUid(projectUid);
    setView({ kind: 'project', projectUid });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <h1 className="text-lg font-semibold">Inbox</h1>
        <p className="text-xs text-neutral-500">
          {rows.length} task{rows.length === 1 ? '' : 's'} awaiting triage
        </p>
      </header>
      <div className="flex-1 overflow-auto p-4">
        {permissionItems.length > 0 && (
          <section className="mb-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Approvals
            </div>
            <ul className="space-y-2">
              {permissionItems.map((item) => (
                <li key={item.id}>
                  {(() => {
                    const context = getReviewQueueContextSummary(item, projects);
                    return (
                  <button
                    onClick={() => openTerminal(item.projectUid!, item.paneId!)}
                    className="block w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left hover:border-amber-400 dark:border-amber-900/60 dark:bg-amber-950/20"
                  >
                    <div className="text-sm font-medium text-amber-900 dark:text-amber-100">
                      {item.title}
                    </div>
                    {item.detail && (
                      <div className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/80">
                        {item.detail}
                      </div>
                    )}
                    {context && (
                      <div className="mt-1 text-[11px] font-medium text-amber-900/80 dark:text-amber-100/80">
                        {context}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-300/70">
                      Open related terminal
                    </div>
                  </button>
                    );
                  })()}
                </li>
              ))}
            </ul>
          </section>
        )}
        {rows.length === 0 && permissionItems.length === 0 ? (
          <p className="text-sm text-neutral-500">Inbox clear. ✨</p>
        ) : rows.length > 0 ? (
          <ul className="space-y-1">
            {rows.map((t) => (
              <li key={t.id}>
                <TaskRow task={t} onStatus={updateStatus} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
