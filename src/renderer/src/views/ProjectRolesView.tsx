import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ProjectRoleBinding,
  RoleTemplate,
  RoleTemplateVersion,
  RuntimeDescriptor,
  DispatchSnapshot,
  TaskLease,
  ImplementationReport,
  DispatchMode,
  BindingHealth
} from '@shared/orchestration';
import type { TaskRecord } from '@shared/schemas';
import { useFiles } from '../store/files';

interface ProjectRolesViewProps {
  projectUid: string;
}

export function ProjectRolesView({ projectUid }: ProjectRolesViewProps): JSX.Element {
  const toast = useFiles((s) => s.toast);
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [versions, setVersions] = useState<Map<string, RoleTemplateVersion[]>>(new Map());
  const [bindings, setBindings] = useState<ProjectRoleBinding[]>([]);
  const [snapshot, setSnapshot] = useState<DispatchSnapshot | null>(null);
  const [selectedBindingId, setSelectedBindingId] = useState<string | null>(null);
  const [bindingTasks, setBindingTasks] = useState<Map<string, TaskRecord[]>>(new Map());
  const [bindingReports, setBindingReports] = useState<Map<string, ImplementationReport[]>>(
    new Map()
  );
  const [creatingFromTemplate, setCreatingFromTemplate] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [ts, bs, snap] = await Promise.all([
        window.orbit.role.listTemplates(),
        window.orbit.role.listBindings(projectUid),
        window.orbit.dispatch.status(projectUid)
      ]);
      setTemplates(ts);
      setBindings(bs);
      setSnapshot(snap);
      if (bs.length > 0 && !selectedBindingId) {
        setSelectedBindingId(bs[0].id);
      }
    } catch (e) {
      toast(`Load roles failed: ${(e as Error).message}`);
    }
  }, [projectUid, selectedBindingId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const off = window.orbit.dispatch.onEvent((ev) => {
      void refresh();
    });
    return off;
  }, [refresh]);

  const selectedBinding = useMemo(
    () => bindings.find((b) => b.id === selectedBindingId) ?? null,
    [bindings, selectedBindingId]
  );

  const selectedTemplate = useMemo(() => {
    if (!selectedBinding) return null;
    return templates.find((t) => t.id === selectedBinding.templateId) ?? null;
  }, [selectedBinding, templates]);

  useEffect(() => {
    if (!selectedBindingId) {
      return;
    }
    let cancelled = false;
    void Promise.all([
      window.orbit.role.getBindingTasks(projectUid, selectedBindingId),
      window.orbit.role.getBindingReports(projectUid, selectedBindingId)
    ])
      .then(([tasks, reports]) => {
        if (!cancelled) {
          setBindingTasks((m) => new Map(m).set(selectedBindingId, tasks));
          setBindingReports((m) => new Map(m).set(selectedBindingId, reports));
        }
      })
      .catch((e) => {
        if (!cancelled) {
          toast(`Load binding details failed: ${(e as Error).message}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectUid, selectedBindingId, toast]);

  async function fetchVersions(templateId: string): Promise<void> {
    try {
      const vs = await window.orbit.role.listTemplateVersions(templateId);
      setVersions((m) => new Map(m).set(templateId, vs));
    } catch (e) {
      toast(`Load template versions failed: ${(e as Error).message}`);
    }
  }

  async function createBinding(templateId: string): Promise<void> {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    setCreatingFromTemplate(null);

    const latestVersion = await window.orbit.role
      .listTemplateVersions(templateId)
      .then((vs) => vs.find((v) => v.id === template.latestVersionId) ?? vs[0]);

    if (!latestVersion) {
      toast('No versions found for this template');
      return;
    }

    const binding: ProjectRoleBinding = {
      id: `binding-${Date.now()}`,
      projectUid,
      templateId: template.id,
      templateVersionId: latestVersion.id,
      dispatchMode: latestVersion.defaultDispatchMode,
      health: 'healthy',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      const created = await window.orbit.role.createBinding(projectUid, binding);
      toast(`Binding created: ${template.name}`);
      await refresh();
      setSelectedBindingId(created.id);
    } catch (e) {
      toast(`Create binding failed: ${(e as Error).message}`);
    }
  }

  async function updateBinding(
    bindingId: string,
    patch: Partial<ProjectRoleBinding>
  ): Promise<void> {
    try {
      await window.orbit.role.updateBinding(projectUid, bindingId, patch);
      toast('Binding updated');
      await refresh();
    } catch (e) {
      toast(`Update binding failed: ${(e as Error).message}`);
    }
  }

  const tasks = selectedBindingId ? bindingTasks.get(selectedBindingId) ?? [] : [];
  const reports = selectedBindingId ? bindingReports.get(selectedBindingId) ?? [] : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">Project Roles</h2>
        <div className="flex gap-2">
          <button
            onClick={() => void refresh()}
            className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 border-r border-neutral-200 dark:border-neutral-800">
          <div className="flex h-full flex-col">
            <div className="shrink-0 border-b border-neutral-200 p-3 dark:border-neutral-800">
              <h3 className="mb-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                Project Bindings ({bindings.length})
              </h3>
              {bindings.length === 0 ? (
                <p className="text-xs text-neutral-500">No bindings yet.</p>
              ) : (
                <ul className="space-y-1">
                  {bindings.map((b) => {
                    const tmpl = templates.find((t) => t.id === b.templateId);
                    return (
                      <li key={b.id}>
                        <button
                          onClick={() => setSelectedBindingId(b.id)}
                          className={`block w-full rounded px-2 py-1.5 text-left text-xs ${
                            b.id === selectedBindingId
                              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                              : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{tmpl?.name ?? 'Unknown'}</span>
                            <HealthBadge health={b.health} />
                          </div>
                          <div className="mt-0.5 text-[10px] text-neutral-500">
                            {b.dispatchMode} · {tmpl?.kind ?? ''}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex-1 overflow-auto p-3">
              <h3 className="mb-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                Available Templates ({templates.length})
              </h3>
              {templates.length === 0 ? (
                <p className="text-xs text-neutral-500">No templates found.</p>
              ) : (
                <ul className="space-y-1">
                  {templates.map((t) => (
                    <li key={t.id}>
                      <div className="rounded border border-neutral-200 p-2 text-xs dark:border-neutral-800">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold">{t.name}</span>
                              <span className="rounded bg-neutral-200 px-1 text-[9px] dark:bg-neutral-800">
                                {t.kind}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[10px] text-neutral-500">{t.slug}</p>
                          </div>
                          <button
                            onClick={() => setCreatingFromTemplate(t.id)}
                            className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                          >
                            + Bind
                          </button>
                        </div>
                        {creatingFromTemplate === t.id && (
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => void createBinding(t.id)}
                              className="flex-1 rounded border border-sky-300 px-2 py-1 text-[10px] text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-950/30"
                            >
                              Create Binding
                            </button>
                            <button
                              onClick={() => setCreatingFromTemplate(null)}
                              className="rounded border border-neutral-300 px-2 py-1 text-[10px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 flex-1 flex-col">
          {!selectedBinding ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500">
              {bindings.length === 0
                ? 'Create a binding from a template to get started.'
                : 'Select a binding to view details.'}
            </div>
          ) : (
            <>
              <header className="shrink-0 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">
                        {selectedTemplate?.name ?? 'Unknown Template'}
                      </h3>
                      <HealthBadge health={selectedBinding.health} />
                    </div>
                    {selectedTemplate && (
                      <p className="mt-1 text-xs text-neutral-500">
                        {selectedTemplate.slug} · {selectedTemplate.kind}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-neutral-500">
                      <span>Created: {new Date(selectedBinding.createdAt).toLocaleString()}</span>
                      <span>Updated: {new Date(selectedBinding.updatedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </header>

              <div className="flex-1 overflow-auto p-4">
                <div className="space-y-4">
                  <section>
                    <h4 className="mb-2 text-sm font-semibold">Configuration</h4>
                    <div className="space-y-3 rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                            Dispatch Mode
                          </label>
                          <select
                            value={selectedBinding.dispatchMode}
                            onChange={(e) =>
                              void updateBinding(selectedBinding.id, {
                                dispatchMode: e.target.value as DispatchMode
                              })
                            }
                            className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                          >
                            <option value="manual-only">Manual Only</option>
                            <option value="suggested">Suggested</option>
                            <option value="autonomous">Autonomous</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                            Health
                          </label>
                          <select
                            value={selectedBinding.health}
                            onChange={(e) =>
                              void updateBinding(selectedBinding.id, {
                                health: e.target.value as BindingHealth
                              })
                            }
                            className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                          >
                            <option value="healthy">Healthy</option>
                            <option value="degraded">Degraded</option>
                            <option value="paused">Paused</option>
                            <option value="blocked">Blocked</option>
                          </select>
                        </div>
                      </div>

                      {selectedBinding.runtimePreference && (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                            Runtime Preference
                          </label>
                          <input
                            type="text"
                            value={selectedBinding.runtimePreference}
                            readOnly
                            className="w-full rounded border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                          />
                        </div>
                      )}

                      <div>
                        <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                          Overlay Instructions
                        </label>
                        <textarea
                          value={selectedBinding.overlayInstructions ?? ''}
                          onChange={(e) =>
                            void updateBinding(selectedBinding.id, {
                              overlayInstructions: e.target.value
                            })
                          }
                          placeholder="Additional instructions for this binding..."
                          className="w-full resize-none rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                          rows={3}
                        />
                      </div>
                    </div>
                  </section>

                  <section>
                    <h4 className="mb-2 text-sm font-semibold">
                      Binding Tasks ({tasks.length})
                    </h4>
                    {tasks.length === 0 ? (
                      <p className="text-xs text-neutral-500">No tasks assigned to this binding.</p>
                    ) : (
                      <ul className="space-y-2">
                        {tasks.map((task) => (
                          <li
                            key={task.id}
                            className="rounded border border-neutral-200 p-2 text-xs dark:border-neutral-800"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="font-semibold">{task.title}</div>
                                <div className="mt-1 text-[10px] text-neutral-500">
                                  {task.status} · {task.relPath}
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section>
                    <h4 className="mb-2 text-sm font-semibold">
                      Recent Reports ({reports.length})
                    </h4>
                    {reports.length === 0 ? (
                      <p className="text-xs text-neutral-500">No reports yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {reports.slice(0, 10).map((report) => (
                          <li
                            key={report.reportId}
                            className="rounded border border-neutral-200 p-3 text-xs dark:border-neutral-800"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold">{report.title}</span>
                                  <ReportStatusBadge status={report.status} />
                                </div>
                                <p className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400">
                                  {report.summary}
                                </p>
                                <div className="mt-2 text-[10px] text-neutral-500">
                                  Created: {new Date(report.createdAt).toLocaleString()}
                                  {report.completedAt && (
                                    <> · Completed: {new Date(report.completedAt).toLocaleString()}</>
                                  )}
                                </div>
                                {report.details.length > 0 && (
                                  <ul className="mt-2 space-y-1 border-l-2 border-neutral-300 pl-2 text-[10px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
                                    {report.details.slice(0, 3).map((detail, idx) => (
                                      <li key={idx}>{detail}</li>
                                    ))}
                                    {report.details.length > 3 && (
                                      <li className="text-neutral-500">
                                        ... and {report.details.length - 3} more
                                      </li>
                                    )}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {snapshot && (
                    <section>
                      <h4 className="mb-2 text-sm font-semibold">
                        Available Runtimes ({snapshot.runtimes.filter((r) => r.status === 'online').length})
                      </h4>
                      <ul className="space-y-2">
                        {snapshot.runtimes
                          .filter((r) => r.status === 'online')
                          .map((runtime) => (
                            <li
                              key={runtime.runtimeId}
                              className="rounded border border-neutral-200 p-2 text-xs dark:border-neutral-800"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold">{runtime.name}</span>
                                    <RuntimeStatusBadge status={runtime.status} />
                                  </div>
                                  <div className="mt-1 text-[10px] text-neutral-500">
                                    {runtime.provider} · {runtime.version ?? 'unknown version'}
                                    {runtime.activeRunIds && runtime.activeRunIds.length > 0 && (
                                      <> · {runtime.activeRunIds.length} active runs</>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </li>
                          ))}
                      </ul>
                    </section>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function HealthBadge({ health }: { health: BindingHealth }): JSX.Element {
  const color =
    health === 'healthy'
      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
      : health === 'degraded'
        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
        : health === 'paused'
          ? 'bg-neutral-500/20 text-neutral-700 dark:text-neutral-300'
          : 'bg-red-500/20 text-red-700 dark:text-red-300';

  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${color}`}>
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
        : status === 'needs_attention'
          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
        : status === 'failed'
          ? 'bg-red-500/20 text-red-700 dark:text-red-300'
          : 'bg-neutral-500/20 text-neutral-700 dark:text-neutral-300';

  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${color}`}>
      {status}
    </span>
  );
}

function RuntimeStatusBadge({ status }: { status: RuntimeDescriptor['status'] }): JSX.Element {
  const color =
    status === 'online'
      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
      : status === 'degraded'
        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
        : 'bg-red-500/20 text-red-700 dark:text-red-300';

  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${color}`}>
      {status}
    </span>
  );
}
