import { useEffect, useMemo, useState } from 'react';
import type { ProjectSummaryDTO } from '@shared/ipc';
import type { TaskRecord, TaskStatus } from '@shared/schemas';
import { useWorkspace } from '../store/workspace';
import { useFiles } from '../store/files';
import { usePara } from '../store/para';
import { VisionEditorModal } from '../components/Modals/VisionEditorModal';
import { NightShiftModal } from '../components/Modals/NightShiftModal';

const STATUSES: TaskStatus[] = ['backlog', 'waiting', 'todo', 'doing', 'blocked', 'done'];

const cardCls =
  'rounded-lg border border-neutral-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60';

export function DashboardView(): JSX.Element {
  const vault = useWorkspace((s) => s.vault);
  const vision = useWorkspace((s) => s.visionExcerpt);
  const refreshVision = useWorkspace((s) => s.refreshVision);
  const projects = useWorkspace((s) => s.projects);
  const areas = useWorkspace((s) => s.areas);
  const refreshProjects = useWorkspace((s) => s.refreshProjects);
  const entities = usePara((s) => s.entities);
  const tasks = usePara((s) => s.tasks);
  const setView = usePara((s) => s.setView);
  const setActiveProjectUid = useWorkspace((s) => s.setActiveProjectUid);
  const toast = useFiles((s) => s.toast);
  const openPath = useFiles((s) => s.openPath);
  const [editVision, setEditVision] = useState(false);
  const [journalExists, setJournalExists] = useState<string | null>(null);
  const [generatingReview, setGeneratingReview] = useState(false);
  const [nightShiftOpen, setNightShiftOpen] = useState(false);
  const [drilldown, setDrilldown] = useState<
    { project: ProjectSummaryDTO; status: TaskStatus; rows: TaskRecord[] } | null
  >(null);

  useEffect(() => {
    void refreshVision();
    void refreshProjects();
  }, [refreshVision, refreshProjects]);

  // today's journal link
  useEffect(() => {
    if (!vault) return;
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const rel = `02_Areas/Journal/${iso}.md`;
    void (async () => {
      const filePath = `${vault.path}/${rel}`;
      const exists = await window.orbit.fs.exists(filePath);
      setJournalExists(exists ? filePath : null);
    })();
  }, [vault]);

  const paraCounts = useMemo(() => {
    const active = projects.filter((p) => p.status !== 'archived').length;
    const archived =
      entities.filter((e) => e.type === 'archive').length +
      projects.filter((p) => p.status === 'archived').length;
    const resources = entities.filter((e) => e.type === 'resource').length;
    return { active, areas: areas.length, resources, archived };
  }, [projects, areas, entities]);

  const matrix = useMemo(() => {
    const active = projects.filter((p) => p.status !== 'archived' && !p.legacy);
    const byUid = new Map<string, Record<TaskStatus, TaskRecord[]>>();
    for (const p of active) {
      byUid.set(p.uid, { backlog: [], waiting: [], todo: [], doing: [], blocked: [], done: [] });
    }
    for (const t of tasks) {
      if (!t.project_uid) continue;
      const bucket = byUid.get(t.project_uid);
      if (!bucket) continue;
      bucket[t.status].push(t);
    }
    return active.map((p) => ({
      project: p,
        buckets: byUid.get(p.uid) ?? {
          backlog: [],
          waiting: [],
          todo: [],
          doing: [],
          blocked: [],
          done: []
      }
    }));
  }, [projects, tasks]);

  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="text-xs text-neutral-500">
          Vision, PARA health, and project activity at a glance.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-3">
        {/* Vision card */}
        <section className={cardCls + ' lg:col-span-2'}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">North Star</h2>
            <button
              className="rounded border border-neutral-300 px-2 py-0.5 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              onClick={() => setEditVision(true)}
            >
              Edit Vision
            </button>
          </div>
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-neutral-700 dark:text-neutral-300">
            {vision && vision.trim()
              ? vision
              : 'Your Vision.md is empty — click Edit Vision to set your North Star.'}
          </pre>
        </section>

        {/* Today Journal */}
        <section className={cardCls}>
          <h2 className="mb-2 text-sm font-semibold">Today&apos;s Journal</h2>
          {journalExists ? (
            <button
              className="text-xs text-sky-600 underline hover:text-sky-500"
              onClick={() => void openPath(journalExists)}
            >
              Open journal entry
            </button>
          ) : (
            <button
              disabled={generatingReview}
              className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
              onClick={async () => {
                setGeneratingReview(true);
                try {
                  const r = await window.orbit.review.generate();
                  setJournalExists(r.path);
                  await openPath(r.path);
                  toast(
                    `Daily Review generated: ${r.recommendedTaskUids.length} recommended task(s)`
                  );
                } catch (e) {
                  toast(`Daily Review failed: ${(e as Error).message}`);
                } finally {
                  setGeneratingReview(false);
                }
              }}
            >
              {generatingReview ? 'Generating…' : 'Generate Daily Review'}
            </button>
          )}
        </section>

        {/* PARA four cards */}
        <section className="lg:col-span-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ParaCard
              label="Active Projects"
              n={paraCounts.active}
              onClick={() => setView({ kind: 'editor' })}
            />
            <ParaCard
              label="Areas"
              n={paraCounts.areas}
              onClick={() => setView({ kind: 'area', areaUid: null })}
            />
            <ParaCard
              label="Resources"
              n={paraCounts.resources}
              onClick={() => setView({ kind: 'editor' })}
            />
            <ParaCard
              label="Archived"
              n={paraCounts.archived}
              onClick={() => setView({ kind: 'editor' })}
            />
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => setNightShiftOpen(true)}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              title="Queue tasks for autonomous night-time execution"
            >
              🌙 Start Night Shift
            </button>
          </div>
        </section>

        {/* Matrix kanban */}
        <section className={cardCls + ' lg:col-span-3'}>
          <h2 className="mb-3 text-sm font-semibold">Project Matrix</h2>
          {matrix.length === 0 ? (
            <p className="text-xs text-neutral-500">
              No active folder-based projects yet. Click + New Project in the top bar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left text-neutral-500">
                    <th className="py-1 pr-3">Project</th>
                    {STATUSES.map((s) => (
                      <th key={s} className="px-2 py-1 text-center uppercase tracking-wider">
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map(({ project, buckets }) => (
                    <tr
                      key={project.uid}
                      className="border-t border-neutral-200 dark:border-neutral-800"
                    >
                      <td className="py-1 pr-3 font-medium">
                        <button
                          className="hover:underline"
                          onClick={() => {
                            setActiveProjectUid(project.uid);
                            setView({ kind: 'project', projectUid: project.uid });
                          }}
                          title={project.relPath}
                        >
                          {project.name}
                        </button>
                      </td>
                      {STATUSES.map((s) => {
                        const rows = buckets[s];
                        return (
                          <td key={s} className="px-2 py-1 text-center">
                            <button
                              className={
                                'min-w-[28px] rounded px-1.5 py-0.5 tabular-nums ' +
                                (rows.length > 0
                                  ? 'bg-neutral-200 text-neutral-800 hover:bg-sky-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-sky-900'
                                  : 'text-neutral-400')
                              }
                              disabled={rows.length === 0}
                              onClick={() => setDrilldown({ project, status: s, rows })}
                            >
                              {rows.length}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {drilldown && (
        <DrilldownPopover
          title={`${drilldown.project.name} · ${drilldown.status} (${drilldown.rows.length})`}
          rows={drilldown.rows}
          onClose={() => setDrilldown(null)}
          onPick={async (t) => {
            setDrilldown(null);
            try {
              // Jump directly into the Project Room.
              setActiveProjectUid(t.project_uid ?? null);
              if (t.project_uid) {
                setView({ kind: 'project', projectUid: t.project_uid });
              } else {
                await openPath(t.filePath);
                setView({ kind: 'editor' });
              }
            } catch (e) {
              toast((e as Error).message);
            }
          }}
        />
      )}

      <VisionEditorModal open={editVision} onClose={() => setEditVision(false)} />
      <NightShiftModal open={nightShiftOpen} onClose={() => setNightShiftOpen(false)} />
    </div>
  );
}

function ParaCard({
  label,
  n,
  onClick
}: {
  label: string;
  n: number;
  onClick(): void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cardCls + ' text-left transition hover:border-sky-500'}
    >
      <div className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{n}</div>
    </button>
  );
}

function DrilldownPopover({
  title,
  rows,
  onClose,
  onPick
}: {
  title: string;
  rows: TaskRecord[];
  onClose(): void;
  onPick(t: TaskRecord): void;
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 pt-20"
      onClick={onClose}
    >
      <div
        className="w-[min(560px,92vw)] rounded-lg border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            className="rounded border border-neutral-300 px-2 py-0.5 text-xs dark:border-neutral-700"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <ul className="max-h-96 space-y-1 overflow-auto text-xs">
          {rows.map((t) => (
            <li key={t.id}>
              <button
                className="w-full truncate rounded px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => onPick(t)}
                title={t.relPath}
              >
                {t.title || t.relPath}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
