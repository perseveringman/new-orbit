import { useEffect, useMemo, useState } from 'react';
import type { EntitySummary, TaskRecord } from '@shared/schemas';
import { TASK_STATUSES } from '@shared/schemas';
import { useFiles } from '../store/files';
import { usePara } from '../store/para';

/**
 * Area overview: shows projects linked to the selected area plus rolled-up
 * task counts by status. Useful for weekly reviews.
 */
export function AreaOverview({ areaUid }: { areaUid: string | null }): JSX.Element {
  const entities = usePara((s) => s.entities);
  const setView = usePara((s) => s.setView);
  const openPath = useFiles((s) => s.openPath);

  const areas = useMemo(() => entities.filter((e) => e.type === 'area'), [entities]);
  const area: EntitySummary | undefined = areas.find((a) => a.uid === areaUid);
  const projects = useMemo(
    () =>
      entities.filter(
        (e) => e.type === 'project' && (!areaUid || e.area_uid === areaUid)
      ),
    [entities, areaUid]
  );

  const [tasks, setTasks] = useState<TaskRecord[]>([]);

  useEffect(() => {
    if (!areaUid) return setTasks([]);
    void window.orbit.para.listTasks({ area_uid: areaUid }).then(setTasks);
  }, [areaUid, entities]);

  const rollup = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of TASK_STATUSES) counts[s] = 0;
    for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
    return counts;
  }, [tasks]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-baseline gap-3 border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <h1 className="text-lg font-semibold">Area Overview</h1>
        <select
          value={areaUid ?? ''}
          onChange={(e) => setView({ kind: 'area', areaUid: e.target.value || null })}
          className="rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
        >
          <option value="">Select an area…</option>
          {areas.map((a) => (
            <option key={a.uid} value={a.uid}>
              {a.title}
            </option>
          ))}
        </select>
        {area && <span className="text-xs text-neutral-500">{area.relPath}</span>}
      </header>
      <div className="flex-1 overflow-auto p-6">
        {!areaUid ? (
          <p className="text-sm text-neutral-500">Pick an area.</p>
        ) : (
          <div className="space-y-6">
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Task rollup
              </h2>
              <div className="flex gap-2">
                {TASK_STATUSES.map((s) => (
                  <div
                    key={s}
                    className="flex-1 rounded border border-neutral-200 p-2 text-center dark:border-neutral-800"
                  >
                    <div className="text-[11px] uppercase tracking-wider text-neutral-500">{s}</div>
                    <div className="text-lg font-semibold">{rollup[s] ?? 0}</div>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Projects ({projects.length})
              </h2>
              {projects.length === 0 ? (
                <p className="text-sm text-neutral-500">No projects linked to this area.</p>
              ) : (
                <ul className="space-y-1">
                  {projects.map((p) => (
                    <li key={p.uid} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
                      <button
                        onClick={() => void openPath(p.path).then(() => setView({ kind: 'editor' }))}
                        className="truncate text-left"
                      >
                        {p.title}
                      </button>
                      <button
                        onClick={() => setView({ kind: 'kanban', projectUid: p.uid })}
                        className="ml-2 rounded border border-neutral-300 px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      >
                        Kanban
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
