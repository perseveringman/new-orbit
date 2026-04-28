import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  AreaAssignmentSuggestion,
  AreaDashboardData,
  AreaEntityRef
} from '@shared/area';
import { useFiles } from '../store/files';
import { usePara } from '../store/para';
import { useWorkspace } from '../store/workspace';

interface Props {
  areaUid: string | null;
}

export function AreaOverview({ areaUid }: Props): JSX.Element {
  const areas = useWorkspace((s) => s.areas);
  const refreshAreas = useWorkspace((s) => s.refreshAreas);
  const setView = usePara((s) => s.setView);
  const toast = useFiles((s) => s.toast);
  const [dashboard, setDashboard] = useState<AreaDashboardData | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, AreaAssignmentSuggestion[]>>({});
  const [busyEntity, setBusyEntity] = useState<string | null>(null);
  const [scopedChatMessage, setScopedChatMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const area = useMemo(
    () => (areaUid ? areas.find((item) => item.uid === areaUid) ?? null : null),
    [areaUid, areas]
  );

  const loadDashboard = useCallback(async () => {
    if (!area) {
      setDashboard(null);
      return;
    }
    try {
      setDashboard(await window.orbit.area.dashboard(area.slug));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [area]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const off = window.orbit.area.onEvent(() => void loadDashboard());
    return off;
  }, [loadDashboard]);

  async function suggest(entity: AreaEntityRef): Promise<void> {
    setBusyEntity(entityKey(entity));
    setError(null);
    try {
      const next = await window.orbit.area.suggestAssignments(entity);
      setSuggestions((current) => ({ ...current, [entityKey(entity)]: next }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyEntity(null);
    }
  }

  async function assign(entity: AreaEntityRef, areaSlug: string, assignedBy: 'user' | 'synthesis' = 'user'): Promise<void> {
    setBusyEntity(entityKey(entity));
    setError(null);
    try {
      await window.orbit.area.assign({
        entity,
        area: {
          area_slug: areaSlug,
          primary: true,
          assigned_at: new Date().toISOString(),
          assigned_by: assignedBy
        }
      });
      await Promise.all([loadDashboard(), refreshAreas()]);
      setSuggestions((current) => {
        const next = { ...current };
        delete next[entityKey(entity)];
        return next;
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyEntity(null);
    }
  }

  async function openScopedChat(): Promise<void> {
    if (!dashboard) return;
    const conversation = await window.orbit.chat.createConversation({
      anchor: {
        kind: 'ask_anywhere_session',
        refId: `area:${dashboard.area.slug}`,
        addedAt: new Date().toISOString()
      },
      scope: { kind: 'area', area_slug: dashboard.area.slug },
      title: `Area: ${dashboard.area.name}`
    });
    await window.orbit.chat.setLastActiveConversation(
      { kind: 'area', area_slug: dashboard.area.slug },
      conversation.id
    );
    setScopedChatMessage(`Area-scoped chat ready: ${conversation.title ?? conversation.id}`);
    setView({ kind: 'askAnywhere', activeId: conversation.id });
  }

  if (!areaUid) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Pick an Area to inspect its dashboard.
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        {error ? `Area dashboard failed: ${error}` : 'Loading Area dashboard…'}
      </div>
    );
  }

  return (
    <AreaDashboardContent
      dashboard={dashboard}
      suggestions={suggestions}
      busyEntity={busyEntity}
      scopedChatMessage={scopedChatMessage}
      error={error}
      onSuggest={suggest}
      onAssign={assign}
      onOpenScopedChat={openScopedChat}
      onCreateProject={() => window.dispatchEvent(new CustomEvent('orbit:open-new-project'))}
      onOpenRoom={() => setView({ kind: 'areaRoom', areaUid })}
    />
  );
}

export function AreaDashboardContent({
  dashboard,
  suggestions,
  busyEntity,
  scopedChatMessage,
  error,
  onSuggest,
  onAssign,
  onOpenScopedChat,
  onCreateProject,
  onOpenRoom
}: {
  dashboard: AreaDashboardData;
  suggestions: Record<string, AreaAssignmentSuggestion[]>;
  busyEntity: string | null;
  scopedChatMessage?: string | null;
  error?: string | null;
  onSuggest(entity: AreaEntityRef): void | Promise<void>;
  onAssign(entity: AreaEntityRef, areaSlug: string, assignedBy?: 'user' | 'synthesis'): void | Promise<void>;
  onOpenScopedChat(): void | Promise<void>;
  onCreateProject(): void;
  onOpenRoom?(): void;
}): JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">Area Dashboard</div>
          <h1 className="mt-1 text-xl font-semibold">{dashboard.area.name}</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            {dashboard.area.description || 'A long-term coordinate assembled from projects, notes, resources, feeds, and reviews.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-neutral-500">
            <span className="rounded border border-neutral-300 px-2 py-0.5 dark:border-neutral-700">{dashboard.area.slug}</span>
            <span className="rounded border border-neutral-300 px-2 py-0.5 dark:border-neutral-700">{dashboard.area.status}</span>
            {dashboard.area.tags.map((tag) => (
              <span key={tag} className="rounded bg-neutral-200 px-2 py-0.5 dark:bg-neutral-800">#{tag}</span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={onOpenScopedChat} className="rounded bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500">
            Area chat
          </button>
          <button onClick={onCreateProject} className="rounded border border-neutral-300 px-3 py-2 text-xs dark:border-neutral-700">
            Create project
          </button>
          {onOpenRoom ? (
            <button onClick={onOpenRoom} className="rounded border border-neutral-300 px-3 py-2 text-xs dark:border-neutral-700">
              Room
            </button>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {error ? <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}
        {scopedChatMessage ? <div className="mb-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-700 dark:bg-sky-950/30 dark:text-sky-200">{scopedChatMessage}</div> : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <MetricCard label="Health" value={`${dashboard.health.score}`} detail={dashboard.health.state} />
              <MetricCard label="Projects" value={dashboard.stats.active_projects} detail={`${dashboard.stats.open_tasks} open tasks`} />
              <MetricCard label="Resources" value={dashboard.stats.resources} detail={`${dashboard.stats.recent_notes} notes`} />
              <MetricCard label="Radar" value={dashboard.stats.feed_sources} detail={`${dashboard.stats.scheduled_reviews} reviews`} />
            </div>

            <Panel title="Health signals">
              <ul className="space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
                {dashboard.health.reasons.map((reason) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>
            </Panel>

            <Panel title={`Active projects (${dashboard.active_projects.length})`}>
              {dashboard.active_projects.length === 0 ? (
                <Empty label="No active projects assigned to this area." />
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {dashboard.active_projects.map((project) => (
                    <div key={project.uid} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                      <div className="text-sm font-medium">{project.name}</div>
                      <div className="mt-1 text-xs text-neutral-500">{project.status} · {project.task_count ?? 0} open task(s)</div>
                      <div className="mt-1 truncate font-mono text-[11px] text-neutral-400">{project.relPath}</div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title={`Resources (${dashboard.resources.length})`}>
              {dashboard.resources.length === 0 ? (
                <Empty label="No resources assigned yet." />
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {dashboard.resources.map((resource) => (
                    <div key={resource.frontmatter.id} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                      <div className="text-sm font-medium">{resource.frontmatter.title}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {resource.frontmatter.depth} · {resource.frontmatter.engagement_count} engagement(s)
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title={`Recent notes (${dashboard.recent_notes.length})`}>
              {dashboard.recent_notes.length === 0 ? (
                <Empty label="No notes assigned yet." />
              ) : (
                <ul className="space-y-2">
                  {dashboard.recent_notes.map((note) => (
                    <li key={note.frontmatter.id} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                      <div className="text-sm font-medium">{note.frontmatter.title ?? note.frontmatter.id}</div>
                      <div className="mt-1 text-xs text-neutral-500">{note.frontmatter.type} · {note.frontmatter.updated.slice(0, 10)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <aside className="space-y-4">
            <Panel title="Feed radar">
              {dashboard.feed_sources.length === 0 ? (
                <Empty label="No feed sources assigned." />
              ) : (
                <ul className="space-y-2 text-sm">
                  {dashboard.feed_sources.map((source) => (
                    <li key={source.id} className="rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
                      <div className="font-medium">{source.title}</div>
                      <div className="truncate text-xs text-neutral-500">{source.url}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Scheduled reviews">
              {dashboard.scheduled_reviews.length === 0 ? (
                <Empty label="No area review schedule found." />
              ) : (
                <ul className="space-y-2 text-sm">
                  {dashboard.scheduled_reviews.map((task) => (
                    <li key={task.id} className="rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
                      <div className="font-medium">{task.name}</div>
                      <div className="text-xs text-neutral-500">{task.status} · next {task.next_run_at?.slice(0, 16) ?? 'unscheduled'}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title={`Unassigned queue (${dashboard.unassigned_queue.length})`}>
              {dashboard.unassigned_queue.length === 0 ? (
                <Empty label="Everything visible has an area assignment." />
              ) : (
                <ul className="space-y-3">
                  {dashboard.unassigned_queue.map((entity) => {
                    const key = entityKey(entity);
                    const items = suggestions[key] ?? [];
                    return (
                      <li key={key} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{entity.title ?? entity.id}</div>
                            <div className="text-[11px] uppercase tracking-wide text-neutral-500">{entity.kind}</div>
                          </div>
                          <button
                            onClick={() => void onSuggest(entity)}
                            disabled={busyEntity === key}
                            className="rounded border border-neutral-300 px-2 py-1 text-[11px] dark:border-neutral-700"
                          >
                            {busyEntity === key ? '…' : 'Suggest'}
                          </button>
                        </div>
                        {items.length > 0 ? (
                          <div className="mt-2 space-y-2">
                            {items.map((suggestion) => (
                              <button
                                key={`${key}:${suggestion.area_slug}`}
                                onClick={() => void onAssign(entity, suggestion.area_slug, 'synthesis')}
                                className="w-full rounded bg-emerald-50 px-2 py-1.5 text-left text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                              >
                                Assign to {suggestion.area_slug} · {Math.round(suggestion.confidence * 100)}%
                                <div className="text-[11px] opacity-80">{suggestion.reason}</div>
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <button
                          onClick={() => void onAssign(entity, dashboard.area.slug)}
                          className="mt-2 w-full rounded border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700"
                        >
                          Assign here
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </aside>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/70">
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-neutral-500">{detail}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/60">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ label }: { label: string }): JSX.Element {
  return <p className="text-sm text-neutral-500">{label}</p>;
}

function entityKey(entity: AreaEntityRef): string {
  return `${entity.kind}:${entity.id}`;
}
