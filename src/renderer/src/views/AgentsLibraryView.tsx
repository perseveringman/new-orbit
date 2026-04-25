import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DispatchSnapshot,
  ImplementationReport,
  ProjectRoleBinding
} from '@shared/orchestration';
import { useFiles } from '../store/files';
import { usePara } from '../store/para';
import { useWorkspace } from '../store/workspace';

export interface AgentsLibrarySurfaceProps {
  snapshot: DispatchSnapshot | null;
  loading: boolean;
  projects: Array<{ uid: string; name: string }>;
  selectedTemplateId: string | null;
  onRefresh(): void;
  onSelectTemplate(templateId: string): void;
  onOpenProjectRoles(projectUid: string): void;
}

export function AgentsLibraryView(): JSX.Element {
  const toast = useFiles((s) => s.toast);
  const projects = useWorkspace((s) =>
    s.projects.map((project) => ({ uid: project.uid, name: project.name }))
  );
  const setActiveProjectUid = useWorkspace((s) => s.setActiveProjectUid);
  const setView = usePara((s) => s.setView);
  const [snapshot, setSnapshot] = useState<DispatchSnapshot | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await window.orbit.dispatch.status();
      setSnapshot(next);
      setSelectedTemplateId((current) => {
        if (current && next.templates.some((template) => template.id === current)) return current;
        return next.templates[0]?.id ?? null;
      });
    } catch (error) {
      toast(`Load agents library failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const off = window.orbit.dispatch.onEvent(() => {
      void refresh();
    });
    return off;
  }, [refresh]);

  const openProjectRoles = useCallback(
    (projectUid: string) => {
      setActiveProjectUid(projectUid);
      setView({ kind: 'project', projectUid, pane: 'roles' });
    },
    [setActiveProjectUid, setView]
  );

  return (
    <AgentsLibrarySurface
      snapshot={snapshot}
      loading={loading}
      projects={projects}
      selectedTemplateId={selectedTemplateId}
      onRefresh={() => void refresh()}
      onSelectTemplate={setSelectedTemplateId}
      onOpenProjectRoles={openProjectRoles}
    />
  );
}

export function AgentsLibrarySurface({
  snapshot,
  loading,
  projects,
  selectedTemplateId,
  onRefresh,
  onSelectTemplate,
  onOpenProjectRoles
}: AgentsLibrarySurfaceProps): JSX.Element {
  const templates = snapshot?.templates ?? [];
  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? templates[0] ?? null;
  const templateVersions = (snapshot?.templateVersions ?? [])
    .filter((version) => version.templateId === selectedTemplate?.id)
    .sort((left, right) => right.version - left.version);
  const selectedBindings = (snapshot?.bindings ?? []).filter(
    (binding) => binding.templateId === selectedTemplate?.id
  );
  const selectedBindingIds = new Set(selectedBindings.map((binding) => binding.id));
  const selectedReports = (snapshot?.reports ?? [])
    .filter((report) => report.bindingId && selectedBindingIds.has(report.bindingId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const templateStats = useMemo(() => {
    const bindings = snapshot?.bindings ?? [];
    const reports = snapshot?.reports ?? [];
    return new Map(
      templates.map((template) => {
        const templateBindings = bindings.filter((binding) => binding.templateId === template.id);
        const bindingIds = new Set(templateBindings.map((binding) => binding.id));
        const templateReports = reports.filter(
          (report) => report.bindingId && bindingIds.has(report.bindingId)
        );
        return [
          template.id,
          {
            bindings: templateBindings.length,
            projects: new Set(templateBindings.map((binding) => binding.projectUid)).size,
            reports: templateReports.length
          }
        ];
      })
    );
  }, [snapshot, templates]);

  const latestVersion = templateVersions[0] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto px-6 py-5">
      <header className="rounded-2xl border border-neutral-200 bg-white/80 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Role-first agent system
            </p>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
              Agents Library
            </h1>
            <p className="max-w-3xl text-sm text-neutral-600 dark:text-neutral-300">
              Manage reusable role templates, inspect version baselines, and understand how each
              template is performing across projects before dropping into a project binding.
            </p>
          </div>
          <button
            onClick={onRefresh}
            className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Refresh library
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <WorkspaceStat
            label="Templates"
            value={String(templates.length)}
            hint="Builtin and custom role assets"
          />
          <WorkspaceStat
            label="Bindings"
            value={String((snapshot?.bindings ?? []).length)}
            hint="Project role instances using those templates"
          />
          <WorkspaceStat
            label="Reports"
            value={String((snapshot?.reports ?? []).length)}
            hint="Implementation history flowing through bindings"
          />
          <WorkspaceStat
            label="Healthy bindings"
            value={String(
              (snapshot?.bindings ?? []).filter((binding) => binding.health === 'healthy').length
            )}
            hint="Bindings ready to keep participating"
          />
        </div>
      </header>

      <section className="min-h-[560px] rounded-2xl border border-neutral-200 bg-white/80 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
        <div className="flex h-full min-h-0">
          <aside className="flex w-80 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-800">
            <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <h2 className="text-sm font-semibold">Templates</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Reusable roles shared across projects.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {loading ? (
                <p className="px-2 py-3 text-sm text-neutral-500">Loading templates…</p>
              ) : templates.length === 0 ? (
                <p className="px-2 py-3 text-sm text-neutral-500">No templates registered yet.</p>
              ) : (
                <ul className="space-y-2">
                  {templates.map((template) => {
                    const stats = templateStats.get(template.id);
                    const active = selectedTemplate?.id === template.id;
                    return (
                      <li key={template.id}>
                        <button
                          onClick={() => onSelectTemplate(template.id)}
                          className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                            active
                              ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/30'
                              : 'border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/70'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-semibold">
                                  {template.name}
                                </span>
                                <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[9px] dark:bg-neutral-800">
                                  {template.kind}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-neutral-500">{template.slug}</div>
                            </div>
                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] dark:bg-neutral-800">
                              {stats?.bindings ?? 0} bindings
                            </span>
                          </div>
                          <div className="mt-2 text-[11px] text-neutral-500">
                            {stats?.projects ?? 0} projects · {stats?.reports ?? 0} reports
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          <main className="flex min-h-0 flex-1 flex-col">
            {!selectedTemplate ? (
              <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                Select a template to inspect versions and project usage.
              </div>
            ) : (
              <>
                <header className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold">{selectedTemplate.name}</h2>
                        <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] uppercase dark:bg-neutral-800">
                          {selectedTemplate.kind}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-neutral-500">
                        {selectedTemplate.slug} · Latest version {latestVersion?.version ?? '—'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] text-neutral-500">
                      <span>Updated: {new Date(selectedTemplate.updatedAt).toLocaleString()}</span>
                      <span>Bindings: {selectedBindings.length}</span>
                    </div>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto p-5">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
                    <div className="space-y-4">
                      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                        <h3 className="text-sm font-semibold">Template Baseline</h3>
                        {!latestVersion ? (
                          <p className="mt-3 text-sm text-neutral-500">
                            No published versions for this template yet.
                          </p>
                        ) : (
                          <div className="mt-3 space-y-4">
                            <div>
                              <div className="text-xs uppercase tracking-wide text-neutral-500">
                                Instructions
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-200">
                                {latestVersion.instructions}
                              </p>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <InfoCard
                                label="Default dispatch"
                                value={latestVersion.defaultDispatchMode}
                              />
                              <InfoCard
                                label="Autonomous"
                                value={latestVersion.allowAutonomous ? 'allowed' : 'manual first'}
                              />
                              <InfoCard
                                label="Concurrency"
                                value={String(latestVersion.defaultConcurrency)}
                              />
                              <InfoCard
                                label="Output style"
                                value={latestVersion.outputStyle ?? 'unspecified'}
                              />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {(latestVersion.providerPreferences ?? []).map((provider) => (
                                <span
                                  key={provider}
                                  className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-700 dark:text-sky-300"
                                >
                                  {provider}
                                </span>
                              ))}
                              {latestVersion.providerPreferences?.length ? null : (
                                <span className="rounded-full bg-neutral-200 px-2.5 py-1 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                                  No provider preference
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {latestVersion.skillRefs.map((skill) => (
                                <span
                                  key={skill}
                                  className="rounded-full bg-neutral-200 px-2.5 py-1 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                                >
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </section>

                      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold">Project Bindings</h3>
                          <span className="text-xs text-neutral-500">
                            {selectedBindings.length}
                          </span>
                        </div>
                        {selectedBindings.length === 0 ? (
                          <p className="mt-3 text-sm text-neutral-500">
                            No project is binding this template yet.
                          </p>
                        ) : (
                          <ul className="mt-3 space-y-2">
                            {selectedBindings.map((binding) => (
                              <BindingListItem
                                key={binding.id}
                                binding={binding}
                                projects={projects}
                                onOpenProjectRoles={onOpenProjectRoles}
                              />
                            ))}
                          </ul>
                        )}
                      </section>

                      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold">Recent Reports</h3>
                          <span className="text-xs text-neutral-500">{selectedReports.length}</span>
                        </div>
                        {selectedReports.length === 0 ? (
                          <p className="mt-3 text-sm text-neutral-500">
                            No execution reports attached to this template yet.
                          </p>
                        ) : (
                          <ul className="mt-3 space-y-2">
                            {selectedReports.slice(0, 8).map((report) => (
                              <TemplateReportItem
                                key={report.reportId}
                                report={report}
                                projects={projects}
                                onOpenProjectRoles={onOpenProjectRoles}
                              />
                            ))}
                          </ul>
                        )}
                      </section>
                    </div>

                    <div className="space-y-4">
                      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                        <h3 className="text-sm font-semibold">Version History</h3>
                        <ul className="mt-3 space-y-2">
                          {templateVersions.map((version) => (
                            <li
                              key={version.id}
                              className="rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-800"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium">v{version.version}</span>
                                <span className="text-[11px] text-neutral-500">
                                  {new Date(version.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                              {version.changeSummary && (
                                <p className="mt-2 text-xs text-neutral-500">
                                  {version.changeSummary}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </section>

                      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                        <h3 className="text-sm font-semibold">Cross-project summary</h3>
                        <dl className="mt-3 grid gap-3 text-sm">
                          <InfoCard
                            label="Projects"
                            value={String(
                              new Set(selectedBindings.map((binding) => binding.projectUid)).size
                            )}
                          />
                          <InfoCard label="Bindings" value={String(selectedBindings.length)} />
                          <InfoCard
                            label="Healthy"
                            value={String(
                              selectedBindings.filter((binding) => binding.health === 'healthy')
                                .length
                            )}
                          />
                          <InfoCard label="Reports" value={String(selectedReports.length)} />
                        </dl>
                      </section>
                    </div>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}

function BindingListItem({
  binding,
  projects,
  onOpenProjectRoles
}: {
  binding: ProjectRoleBinding;
  projects: Array<{ uid: string; name: string }>;
  onOpenProjectRoles(projectUid: string): void;
}): JSX.Element {
  const project = projects.find((entry) => entry.uid === binding.projectUid);
  return (
    <li className="rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{project?.name ?? binding.projectUid}</span>
            <BindingHealthBadge health={binding.health} />
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {binding.dispatchMode}
            {binding.runtimePreference && <> · prefers {binding.runtimePreference}</>}
          </div>
        </div>
        <button
          onClick={() => onOpenProjectRoles(binding.projectUid)}
          className="rounded border border-neutral-300 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Open roles
        </button>
      </div>
    </li>
  );
}

function TemplateReportItem({
  report,
  projects,
  onOpenProjectRoles
}: {
  report: ImplementationReport;
  projects: Array<{ uid: string; name: string }>;
  onOpenProjectRoles(projectUid: string): void;
}): JSX.Element {
  const project = projects.find((entry) => entry.uid === report.projectUid);
  return (
    <li className="rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{report.title}</span>
            <ReportStatusBadge status={report.status} />
          </div>
          <p className="mt-1 text-xs text-neutral-500">{report.summary}</p>
          <div className="mt-2 text-[11px] text-neutral-500">
            {project?.name ?? report.projectUid ?? 'No project'} ·{' '}
            {new Date(report.createdAt).toLocaleString()}
          </div>
        </div>
        {report.projectUid && (
          <button
            onClick={() => onOpenProjectRoles(report.projectUid!)}
            className="rounded border border-neutral-300 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Open roles
          </button>
        )}
      </div>
    </li>
  );
}

function WorkspaceStat({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint: string;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950/60">
      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-neutral-500">{hint}</div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">{label}</div>
      <div className="mt-2 text-sm font-medium">{value}</div>
    </div>
  );
}

function BindingHealthBadge({ health }: { health: ProjectRoleBinding['health'] }): JSX.Element {
  const color =
    health === 'healthy'
      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
      : health === 'degraded'
        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
        : health === 'paused'
          ? 'bg-neutral-500/20 text-neutral-700 dark:text-neutral-300'
          : 'bg-red-500/20 text-red-700 dark:text-red-300';
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${color}`}
    >
      {health}
    </span>
  );
}

function ReportStatusBadge({ status }: { status: ImplementationReport['status'] }): JSX.Element {
  const color =
    status === 'completed'
      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
      : status === 'running'
        ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300'
        : status === 'failed'
          ? 'bg-red-500/20 text-red-700 dark:text-red-300'
          : 'bg-neutral-500/20 text-neutral-700 dark:text-neutral-300';
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${color}`}
    >
      {status}
    </span>
  );
}
