import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ProjectRoleBinding,
  RoleTemplate,
  RoleTemplateVersion,
  RuntimeDescriptor,
  RuntimeModelOption,
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
      toast(`加载角色失败：${(e as Error).message}`);
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
  const selectedTemplateVersion = useMemo(() => {
    if (!selectedBinding) return null;
    return (
      snapshot?.templateVersions.find(
        (version) => version.id === selectedBinding.templateVersionId
      ) ?? null
    );
  }, [selectedBinding, snapshot]);
  const selectedRuntime = useMemo(
    () =>
      selectedBinding
        ? resolveBindingRuntime(selectedBinding, selectedTemplateVersion, snapshot?.runtimes ?? [])
        : null,
    [selectedBinding, selectedTemplateVersion, snapshot]
  );
  const selectedModelOptions = selectedRuntime?.modelOptions ?? [];
  const selectedModelIsPreset = selectedModelOptions.some(
    (option) => option.id === selectedBinding?.modelPreference
  );

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
          toast(`加载绑定详情失败：${(e as Error).message}`);
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
      toast(`加载模板版本失败：${(e as Error).message}`);
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
      toast('这个模板没有可用版本');
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
      toast(`已创建绑定：${template.name}`);
      await refresh();
      setSelectedBindingId(created.id);
    } catch (e) {
      toast(`创建绑定失败：${(e as Error).message}`);
    }
  }

  async function updateBinding(
    bindingId: string,
    patch: Partial<ProjectRoleBinding>
  ): Promise<void> {
    try {
      await window.orbit.role.updateBinding(projectUid, bindingId, patch);
      toast('绑定已更新');
      await refresh();
    } catch (e) {
      toast(`更新绑定失败：${(e as Error).message}`);
    }
  }

  const tasks = selectedBindingId ? bindingTasks.get(selectedBindingId) ?? [] : [];
  const reports = selectedBindingId ? bindingReports.get(selectedBindingId) ?? [] : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">项目角色</h2>
        <div className="flex gap-2">
          <button
            onClick={() => void refresh()}
            className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            刷新
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 border-r border-neutral-200 dark:border-neutral-800">
          <div className="flex h-full flex-col">
            <div className="shrink-0 border-b border-neutral-200 p-3 dark:border-neutral-800">
              <h3 className="mb-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                 项目绑定（{bindings.length}）
              </h3>
              {bindings.length === 0 ? (
                 <p className="text-xs text-neutral-500">还没有绑定。</p>
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
                             <span className="truncate font-medium">{tmpl?.name ?? '未知'}</span>
                            <HealthBadge health={b.health} />
                          </div>
                          <div className="mt-0.5 text-[10px] text-neutral-500">
                             {dispatchModeLabel(b.dispatchMode)} · {tmpl?.kind ?? ''}
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
                 可用模板（{templates.length}）
              </h3>
              {templates.length === 0 ? (
                 <p className="text-xs text-neutral-500">未找到模板。</p>
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
                             + 绑定
                          </button>
                        </div>
                        {creatingFromTemplate === t.id && (
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => void createBinding(t.id)}
                              className="flex-1 rounded border border-sky-300 px-2 py-1 text-[10px] text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-950/30"
                            >
                               创建绑定
                            </button>
                            <button
                              onClick={() => setCreatingFromTemplate(null)}
                              className="rounded border border-neutral-300 px-2 py-1 text-[10px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                            >
                               取消
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
                ? '从模板创建绑定即可开始。'
                : '请选择一个绑定以查看详情。'}
            </div>
          ) : (
            <>
              <header className="shrink-0 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">
                         {selectedTemplate?.name ?? '未知模板'}
                      </h3>
                      <HealthBadge health={selectedBinding.health} />
                    </div>
                    {selectedTemplate && (
                      <p className="mt-1 text-xs text-neutral-500">
                        {selectedTemplate.slug} · {selectedTemplate.kind}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-neutral-500">
                       <span>创建：{new Date(selectedBinding.createdAt).toLocaleString()}</span>
                       <span>更新：{new Date(selectedBinding.updatedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </header>

              <div className="flex-1 overflow-auto p-4">
                <div className="space-y-4">
                  <section>
                     <h4 className="mb-2 text-sm font-semibold">配置</h4>
                    <div className="space-y-3 rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                             分发模式
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
                             <option value="manual-only">仅手动</option>
                             <option value="suggested">建议</option>
                             <option value="autonomous">自主</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                             健康状态
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
                             <option value="healthy">健康</option>
                             <option value="degraded">降级</option>
                             <option value="paused">已暂停</option>
                             <option value="blocked">阻塞</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                             Runtime 偏好
                          </label>
                          <select
                            value={selectedBinding.runtimePreference ?? ''}
                            onChange={(e) => {
                              const runtimePreference = e.target.value || undefined;
                              const nextRuntime = runtimePreference
                                ? (snapshot?.runtimes ?? []).find(
                                    (runtime) => runtime.runtimeId === runtimePreference
                                  ) ?? null
                                : resolveBindingRuntime(
                                    { ...selectedBinding, runtimePreference: undefined },
                                    selectedTemplateVersion,
                                    snapshot?.runtimes ?? []
                                  );
                              const keepModel =
                                !selectedBinding.modelPreference ||
                                !nextRuntime ||
                                nextRuntime.modelOptions?.some(
                                  (option) => option.id === selectedBinding.modelPreference
                                );
                              void updateBinding(selectedBinding.id, {
                                runtimePreference,
                                ...(keepModel ? {} : { modelPreference: undefined })
                              });
                            }}
                            className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                          >
                             <option value="">根据角色/默认值自动选择</option>
                            {(snapshot?.runtimes ?? []).map((runtime) => (
                              <option key={runtime.runtimeId} value={runtime.runtimeId}>
                                {runtimeOptionLabel(runtime)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                             模型偏好
                          </label>
                          <select
                            value={selectedBinding.modelPreference ?? ''}
                            onChange={(e) =>
                              void updateBinding(selectedBinding.id, {
                                modelPreference: e.target.value || undefined
                              })
                            }
                            disabled={!selectedRuntime}
                            className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                          >
                            <option value="">
                              {modelDefaultLabel(selectedRuntime, selectedTemplateVersion)}
                            </option>
                            {selectedModelOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {modelOptionLabel(option)}
                              </option>
                            ))}
                            {selectedBinding.modelPreference && !selectedModelIsPreset ? (
                              <option value={selectedBinding.modelPreference}>
                                 {selectedBinding.modelPreference}（当前）
                              </option>
                            ) : null}
                          </select>
                        </div>
                      </div>

                      {selectedTemplateVersion && (
                        <div className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
                          <div className="font-medium text-neutral-700 dark:text-neutral-200">
                             模板路由默认值
                          </div>
                          <div className="mt-1">
                             Provider：{' '}
                             {selectedTemplateVersion.providerPreferences?.join(', ') || '任意'}
                             {' · '}
                             模型：{selectedTemplateVersion.modelPreference ?? 'Provider 默认'}
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                           覆盖指令
                        </label>
                        <textarea
                          value={selectedBinding.overlayInstructions ?? ''}
                          onChange={(e) =>
                            void updateBinding(selectedBinding.id, {
                              overlayInstructions: e.target.value
                            })
                          }
                           placeholder="此绑定的附加指令…"
                          className="w-full resize-none rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                          rows={3}
                        />
                      </div>
                    </div>
                  </section>

                  <section>
                    <h4 className="mb-2 text-sm font-semibold">
                       绑定任务（{tasks.length}）
                    </h4>
                    {tasks.length === 0 ? (
                       <p className="text-xs text-neutral-500">还没有任务分配给这个绑定。</p>
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
                                   {taskStatusLabel(task.status)} · {task.relPath}
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
                       最近报告（{reports.length}）
                    </h4>
                    {reports.length === 0 ? (
                       <p className="text-xs text-neutral-500">还没有报告。</p>
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
                                   创建：{new Date(report.createdAt).toLocaleString()}
                                   {report.completedAt && (
                                     <> · 完成：{new Date(report.completedAt).toLocaleString()}</>
                                   )}
                                </div>
                                {report.details.length > 0 && (
                                  <ul className="mt-2 space-y-1 border-l-2 border-neutral-300 pl-2 text-[10px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
                                    {report.details.slice(0, 3).map((detail, idx) => (
                                      <li key={idx}>{detail}</li>
                                    ))}
                                    {report.details.length > 3 && (
                                      <li className="text-neutral-500">
                                         …还有 {report.details.length - 3} 条
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
                         Runtime Provider（{snapshot.runtimes.length}）
                      </h4>
                      <ul className="space-y-2">
                        {snapshot.runtimes
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
                                     {runtime.provider} · {runtime.version ?? '未知版本'}
                                    {' · '}
                                    {runtimeTaskReadiness(runtime)}
                                    {runtime.activeRunIds && runtime.activeRunIds.length > 0 && (
                                       <> · {runtime.activeRunIds.length} 个活跃运行</>
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

function runtimeOptionLabel(runtime: RuntimeDescriptor): string {
  return `${runtime.name} · ${runtimeStatusLabel(runtime.status)} · ${runtimeTaskReadiness(runtime)}`;
}

function dispatchModeLabel(mode: DispatchMode): string {
  if (mode === 'manual-only') return '仅手动';
  if (mode === 'suggested') return '建议';
  return '自主';
}

function taskStatusLabel(status: TaskRecord['status']): string {
  if (status === 'backlog') return '积压';
  if (status === 'waiting') return '等待';
  if (status === 'todo') return '待办';
  if (status === 'doing') return '进行中';
  if (status === 'blocked') return '阻塞';
  if (status === 'done') return '完成';
  return status;
}

function runtimeTaskReadiness(runtime: RuntimeDescriptor): string {
  if (runtime.status !== 'online') return '需要关注';
  if (!runtime.capabilities.supportsBackgroundRuns) return '仅手动/会话';
  return '可运行任务';
}

function resolveBindingRuntime(
  binding: ProjectRoleBinding,
  templateVersion: RoleTemplateVersion | null,
  runtimes: RuntimeDescriptor[]
): RuntimeDescriptor | null {
  if (binding.runtimePreference) {
    return (
      runtimes.find(
        (runtime) =>
          runtime.runtimeId === binding.runtimePreference ||
          runtime.provider === binding.runtimePreference
      ) ?? null
    );
  }
  for (const provider of templateVersion?.providerPreferences ?? []) {
    const match = runtimes.find((runtime) => runtime.provider === provider);
    if (match) return match;
  }
  return runtimes.find((runtime) => runtime.status === 'online') ?? runtimes[0] ?? null;
}

function modelDefaultLabel(
  runtime: RuntimeDescriptor | null,
  templateVersion: RoleTemplateVersion | null
): string {
  if (templateVersion?.modelPreference) return `角色默认（${templateVersion.modelPreference}）`;
  if (runtime?.defaultModel) return `Runtime 默认（${runtime.defaultModel}）`;
  return runtime ? 'Provider 默认' : '请先选择 Runtime';
}

function modelOptionLabel(option: RuntimeModelOption): string {
  return option.description ? `${option.label} · ${option.description}` : option.label;
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
      {healthLabel(health)}
    </span>
  );
}

function healthLabel(health: BindingHealth): string {
  if (health === 'healthy') return '健康';
  if (health === 'degraded') return '降级';
  if (health === 'paused') return '已暂停';
  return '阻塞';
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
      {reportStatusLabel(status)}
    </span>
  );
}

function reportStatusLabel(status: ImplementationReport['status']): string {
  if (status === 'completed') return '已完成';
  if (status === 'running') return '运行中';
  if (status === 'needs_attention') return '需要关注';
  if (status === 'failed') return '失败';
  return status;
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
      {runtimeStatusLabel(status)}
    </span>
  );
}

function runtimeStatusLabel(status: RuntimeDescriptor['status']): string {
  if (status === 'online') return '在线';
  if (status === 'degraded') return '降级';
  return '离线';
}
