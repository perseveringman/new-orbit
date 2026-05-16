import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DispatchSnapshot,
  ImplementationReport,
  RuntimeDescriptor,
  TaskLease
} from '@shared/orchestration';
import type { SDKEndpointRegistrySnapshot, SDKEndpointView } from '@shared/runtime';
import { useFiles } from '../store/files';
import { usePara } from '../store/para';
import { useWorkspace } from '../store/workspace';

export interface RuntimesWorkspaceSurfaceProps {
  snapshot: DispatchSnapshot | null;
  loading: boolean;
  projects: Array<{ uid: string; name: string }>;
  sdkSnapshot?: SDKEndpointRegistrySnapshot | null;
  selectedRuntimeId: string | null;
  onRefresh(): void;
  onSelectRuntime(runtimeId: string): void;
  onOpenProjectRoles(projectUid: string): void;
}

export function RuntimesWorkspaceView(): JSX.Element {
  const toast = useFiles((s) => s.toast);
  const projects = useWorkspace((s) =>
    s.projects.map((project) => ({ uid: project.uid, name: project.name }))
  );
  const setActiveProjectUid = useWorkspace((s) => s.setActiveProjectUid);
  const setView = usePara((s) => s.setView);
  const [snapshot, setSnapshot] = useState<DispatchSnapshot | null>(null);
  const [sdkSnapshot, setSdkSnapshot] = useState<SDKEndpointRegistrySnapshot | null>(null);
  const [selectedRuntimeId, setSelectedRuntimeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(
    async (mode: 'status' | 'refresh' = 'status') => {
      setLoading(true);
      try {
        if (mode === 'refresh') await window.orbit.runtime.refresh();
        const [next, nextSdkSnapshot] = await Promise.all([
          window.orbit.dispatch.status(),
          window.orbit.runtime.sdk.snapshot().catch(() => null)
        ]);
        setSnapshot(next);
        setSdkSnapshot(nextSdkSnapshot);
        setSelectedRuntimeId((current) => {
          if (current && next.runtimes.some((runtime) => runtime.runtimeId === current))
            return current;
          return next.runtimes[0]?.runtimeId ?? null;
        });
      } catch (error) {
        toast(`加载 Runtime 失败：${(error as Error).message}`);
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const offRuntime = window.orbit.runtime.onEvent(() => {
      void refresh();
    });
    const offDispatch = window.orbit.dispatch.onEvent(() => {
      void refresh();
    });
    return () => {
      offRuntime();
      offDispatch();
    };
  }, [refresh]);

  const openProjectRoles = useCallback(
    (projectUid: string) => {
      setActiveProjectUid(projectUid);
      setView({ kind: 'project', projectUid, pane: 'roles' });
    },
    [setActiveProjectUid, setView]
  );

  return (
    <RuntimesWorkspaceSurface
      snapshot={snapshot}
      loading={loading}
      projects={projects}
      sdkSnapshot={sdkSnapshot}
      selectedRuntimeId={selectedRuntimeId}
      onRefresh={() => void refresh('refresh')}
      onSelectRuntime={setSelectedRuntimeId}
      onOpenProjectRoles={openProjectRoles}
    />
  );
}

export function RuntimesWorkspaceSurface({
  snapshot,
  loading,
  projects,
  sdkSnapshot,
  selectedRuntimeId,
  onRefresh,
  onSelectRuntime,
  onOpenProjectRoles
}: RuntimesWorkspaceSurfaceProps): JSX.Element {
  const runtimes = snapshot?.runtimes ?? [];
  const sdkEndpoints = sdkSnapshot?.endpoints ?? [];
  const selectedRuntime =
    runtimes.find((runtime) => runtime.runtimeId === selectedRuntimeId) ?? runtimes[0] ?? null;

  const activeLeases = useMemo(
    () =>
      (snapshot?.leases ?? []).filter(
        (lease) =>
          lease.status === 'claimed' ||
          lease.status === 'running' ||
          lease.status === 'needs_attention'
      ),
    [snapshot]
  );
  const runtimeLeases = useMemo(
    () => activeLeases.filter((lease) => lease.runtimeId === selectedRuntime?.runtimeId),
    [activeLeases, selectedRuntime?.runtimeId]
  );
  const runtimeReports = useMemo(
    () =>
      (snapshot?.reports ?? [])
        .filter((report) => report.runtimeId === selectedRuntime?.runtimeId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [snapshot, selectedRuntime?.runtimeId]
  );

  const stats = {
    online: runtimes.filter((runtime) => runtime.status === 'online').length,
    degraded: runtimes.filter((runtime) => runtime.status === 'degraded').length,
    sdkReady: sdkEndpoints.filter((endpoint) => endpoint.enabled && endpoint.keyConfigured).length,
    roleBindings: (snapshot?.bindings ?? []).length
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto px-6 py-5">
      <header className="rounded-2xl border border-neutral-200 bg-white/80 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Runtime 与角色路由
            </p>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
              AI 控制平面
            </h1>
            <p className="max-w-3xl text-sm text-neutral-600 dark:text-neutral-300">
              观察 CLI Runtime、SDK endpoint、角色绑定，以及当前流经 Orbit 编排层的 lease / report。
            </p>
          </div>
          <button
            onClick={onRefresh}
            className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            刷新注册表
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <WorkspaceStat
            label="在线"
            value={String(stats.online)}
            hint="已检测到 CLI provider"
          />
          <WorkspaceStat
            label="降级"
            value={String(stats.degraded)}
            hint="需要检查或恢复"
          />
          <WorkspaceStat
            label="SDK 就绪"
            value={String(stats.sdkReady)}
            hint="已启用且配置 key 的 endpoint"
          />
          <WorkspaceStat
            label="角色绑定"
            value={String(stats.roleBindings)}
            hint="已连接模板的项目角色"
          />
        </div>
      </header>

      <section className="min-h-[560px] rounded-2xl border border-neutral-200 bg-white/80 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
        <div className="flex h-full min-h-0">
          <aside className="flex w-80 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-800">
            <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <h2 className="text-sm font-semibold">CLI Runtime 注册表</h2>
              <p className="mt-1 text-xs text-neutral-500">在本机发现的 provider。</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {loading ? (
                <p className="px-2 py-3 text-sm text-neutral-500">正在加载 Runtime…</p>
              ) : runtimes.length === 0 ? (
                <p className="px-2 py-3 text-sm text-neutral-500">
                  尚未检测到本地 Runtime。
                </p>
              ) : (
                <ul className="space-y-2">
                  {runtimes.map((runtime) => {
                    const count = activeLeases.filter(
                      (lease) => lease.runtimeId === runtime.runtimeId
                    ).length;
                    const active = selectedRuntime?.runtimeId === runtime.runtimeId;
                    return (
                      <li key={runtime.runtimeId}>
                        <button
                          onClick={() => onSelectRuntime(runtime.runtimeId)}
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
                                  {runtime.name}
                                </span>
                                <RuntimeStatusBadge status={runtime.status} />
                              </div>
                              <div className="mt-1 text-xs text-neutral-500">
                                {runtime.provider} · {runtimeVersionLabel(runtime)}
                              </div>
                            </div>
                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] dark:bg-neutral-800">
                              {count} 个活跃
                            </span>
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
            {!selectedRuntime ? (
              <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                选择一个 Runtime 来查看能力与工作负载。
              </div>
            ) : (
              <>
                <header className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold">{selectedRuntime.name}</h2>
                        <RuntimeStatusBadge status={selectedRuntime.status} />
                      </div>
                      <p className="mt-1 text-sm text-neutral-500">
                        {selectedRuntime.provider} · {selectedRuntime.binaryPath}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] text-neutral-500">
                      <span>版本：{runtimeVersionLabel(selectedRuntime)}</span>
                      <span>
                        上次出现：{new Date(selectedRuntime.lastSeenAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto p-5">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
                    <div className="space-y-4">
                      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                        <h3 className="text-sm font-semibold">能力</h3>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <CapabilityBadge
                            label="Resume"
                            active={selectedRuntime.capabilities.supportsResume}
                          />
                          <CapabilityBadge
                            label="Hooks"
                            active={selectedRuntime.capabilities.supportsHooks}
                          />
                          <CapabilityBadge
                            label="Worktree"
                            active={selectedRuntime.capabilities.supportsWorktree}
                          />
                          <CapabilityBadge
                            label="后台运行"
                            active={selectedRuntime.capabilities.supportsBackgroundRuns}
                          />
                          <CapabilityBadge
                            label="长上下文"
                            active={Boolean(selectedRuntime.capabilities.supportsLongContext)}
                          />
                        </div>
                        <div className="mt-4 text-xs text-neutral-500">
                          最大并发运行数：{selectedRuntime.limits.maxConcurrentRuns}
                        </div>
                        <div className="mt-2 text-xs text-neutral-500">
                          默认模型：{selectedRuntime.defaultModel ?? 'provider 默认值'}
                        </div>
                        <div className="mt-2 text-xs text-neutral-500">
                          可选模型：{runtimeModelChoicesLabel(selectedRuntime)}
                        </div>
                      </section>

                      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold">活跃 Lease</h3>
                          <span className="text-xs text-neutral-500">{runtimeLeases.length}</span>
                        </div>
                        {runtimeLeases.length === 0 ? (
                          <p className="mt-3 text-sm text-neutral-500">
                            这个 Runtime 上没有活跃 Lease。
                          </p>
                        ) : (
                          <ul className="mt-3 space-y-2">
                            {runtimeLeases.map((lease) => (
                              <LeaseListItem
                                key={lease.leaseId}
                                lease={lease}
                                reports={runtimeReports}
                                projects={projects}
                                onOpenProjectRoles={onOpenProjectRoles}
                              />
                            ))}
                          </ul>
                        )}
                      </section>

                      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold">最近报告</h3>
                          <span className="text-xs text-neutral-500">{runtimeReports.length}</span>
                        </div>
                        {runtimeReports.length === 0 ? (
                          <p className="mt-3 text-sm text-neutral-500">
                            这个 Runtime 还没有产生报告。
                          </p>
                        ) : (
                          <ul className="mt-3 space-y-2">
                            {runtimeReports.slice(0, 8).map((report) => (
                              <ReportListItem
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
                        <h3 className="text-sm font-semibold">Runtime 快照</h3>
                        <dl className="mt-3 space-y-3 text-sm">
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-neutral-500">
                              Runtime ID
                            </dt>
                            <dd className="mt-1 break-all font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
                              {selectedRuntime.runtimeId}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-neutral-500">
                              二进制
                            </dt>
                            <dd className="mt-1 break-all text-neutral-700 dark:text-neutral-200">
                              {selectedRuntime.binaryPath}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-neutral-500">
                              发现时间
                            </dt>
                            <dd className="mt-1 text-neutral-700 dark:text-neutral-200">
                              {new Date(selectedRuntime.discoveredAt).toLocaleString()}
                            </dd>
                          </div>
                          {selectedRuntime.metadata?.versionProbeError && (
                            <div>
                              <dt className="text-xs uppercase tracking-wide text-neutral-500">
                                探测问题
                              </dt>
                              <dd className="mt-1 break-words text-amber-700 dark:text-amber-300">
                                {selectedRuntime.metadata.versionProbeError}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </section>

                      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold">Runtime B SDK Endpoints</h3>
                          <span className="text-xs text-neutral-500">{sdkEndpoints.length}</span>
                        </div>
                        {sdkEndpoints.length === 0 ? (
                          <p className="mt-3 text-sm text-neutral-500">
                            尚未注册 SDK endpoint。
                          </p>
                        ) : (
                          <ul className="mt-3 space-y-2">
                            {sdkEndpoints.map((endpoint) => (
                              <SDKEndpointItem
                                key={endpoint.id}
                                endpoint={endpoint}
                                defaults={sdkSnapshot?.defaults ?? {}}
                              />
                            ))}
                          </ul>
                        )}
                      </section>

                      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                        <h3 className="text-sm font-semibold">角色路由</h3>
                        <div className="mt-3 grid gap-2 text-sm">
                          <InfoRow
                            label="绑定"
                            value={String(snapshot?.bindings.length ?? 0)}
                          />
                          <InfoRow
                            label="自主"
                            value={String(
                              (snapshot?.bindings ?? []).filter(
                                (binding) => binding.dispatchMode === 'autonomous'
                              ).length
                            )}
                          />
                          <InfoRow
                            label="暂停 / 阻塞"
                            value={String(
                              (snapshot?.bindings ?? []).filter(
                                (binding) =>
                                  binding.health === 'paused' || binding.health === 'blocked'
                              ).length
                            )}
                          />
                        </div>
                      </section>

                      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                        <h3 className="text-sm font-semibold">触达项目</h3>
                        <ul className="mt-3 space-y-2 text-sm">
                          {Array.from(
                            new Map(
                              runtimeReports
                                .filter((report) => report.projectUid)
                                .map((report) => [report.projectUid!, report])
                            ).entries()
                          ).map(([projectUid]) => {
                            const project = projects.find((item) => item.uid === projectUid);
                            return (
                              <li
                                key={projectUid}
                                className="flex items-center justify-between rounded border border-neutral-200 px-3 py-2 dark:border-neutral-800"
                              >
                                <span>{project?.name ?? projectUid}</span>
                                <button
                                  onClick={() => onOpenProjectRoles(projectUid)}
                                  className="rounded border border-neutral-300 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                                >
                                  打开角色
                                </button>
                              </li>
                            );
                          })}
                          {runtimeReports.every((report) => !report.projectUid) && (
                            <li className="text-neutral-500">暂无关联项目的报告。</li>
                          )}
                        </ul>
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

function LeaseListItem({
  lease,
  reports,
  projects,
  onOpenProjectRoles
}: {
  lease: TaskLease;
  reports: ImplementationReport[];
  projects: Array<{ uid: string; name: string }>;
  onOpenProjectRoles(projectUid: string): void;
}): JSX.Element {
  const report = reports.find(
    (entry) => entry.reportId === lease.reportId || entry.runId === lease.runId
  );
  const project = projects.find((entry) => entry.uid === report?.projectUid);

  return (
    <li className="rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">
              {report?.title ?? lease.taskUid ?? lease.taskId}
            </span>
            <LeaseStatusBadge status={lease.status} />
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {lease.ownerId}
            {lease.runId && <> · 运行 {lease.runId}</>}
          </div>
        </div>
        {report?.projectUid && (
          <button
            onClick={() => onOpenProjectRoles(report.projectUid!)}
            className="rounded border border-neutral-300 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {project?.name ?? '打开角色'}
          </button>
        )}
      </div>
    </li>
  );
}

function ReportListItem({
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
            {new Date(report.createdAt).toLocaleString()}
            {report.runId && <> · 运行 {report.runId}</>}
          </div>
        </div>
        {report.projectUid && (
          <button
            onClick={() => onOpenProjectRoles(report.projectUid!)}
            className="rounded border border-neutral-300 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {project?.name ?? '打开角色'}
          </button>
        )}
      </div>
    </li>
  );
}

function SDKEndpointItem({
  endpoint,
  defaults
}: {
  endpoint: SDKEndpointView;
  defaults: SDKEndpointRegistrySnapshot['defaults'];
}): JSX.Element {
  const modes = (['ask', 'synthesis', 'background'] as const)
    .filter((mode) => defaults[mode] === endpoint.id)
    .map((mode) => sdkDefaultModeLabel(mode))
    .join(', ');
  const ready = endpoint.enabled && endpoint.keyConfigured;
  return (
    <li className="rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{endpoint.label}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${
                ready
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                  : endpoint.enabled
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                    : 'bg-neutral-500/20 text-neutral-700 dark:text-neutral-300'
              }`}
            >
              {ready ? '就绪' : endpoint.enabled ? '缺少 key' : '已停用'}
            </span>
          </div>
          <div className="mt-1 break-all text-xs text-neutral-500">
            {endpoint.provider} · {endpoint.defaultModel}
          </div>
          {modes && (
            <div className="mt-2 text-[11px] text-neutral-500">默认用于 {modes}</div>
          )}
        </div>
      </div>
    </li>
  );
}

function InfoRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between rounded border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium text-neutral-800 dark:text-neutral-100">{value}</span>
    </div>
  );
}

function runtimeVersionLabel(runtime: RuntimeDescriptor): string {
  if (runtime.version) return runtime.version;
  return runtime.status === 'degraded' ? '版本不可用' : '未知版本';
}

function runtimeModelChoicesLabel(runtime: RuntimeDescriptor): string {
  const options = runtime.modelOptions ?? [];
  if (options.length === 0) return 'provider 已配置';
  return options.map((option) => option.label).join(', ');
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

function CapabilityBadge({ label, active }: { label: string; active: boolean }): JSX.Element {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] ${
        active
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
      }`}
    >
      {label}
    </span>
  );
}

function sdkDefaultModeLabel(mode: 'ask' | 'synthesis' | 'background'): string {
  const labels: Record<typeof mode, string> = {
    ask: '提问',
    synthesis: '合成',
    background: '后台'
  };
  return labels[mode];
}

function runtimeStatusLabel(status: RuntimeDescriptor['status']): string {
  const labels: Record<RuntimeDescriptor['status'], string> = {
    online: '在线',
    offline: '离线',
    degraded: '降级'
  };
  return labels[status] ?? status;
}

function leaseStatusLabel(status: TaskLease['status']): string {
  const labels: Partial<Record<TaskLease['status'], string>> = {
    claimed: '已领取',
    running: '运行中',
    needs_attention: '需要关注',
    released: '已释放',
    completed: '已完成',
    failed: '失败'
  };
  return labels[status] ?? status;
}

function reportStatusLabel(status: ImplementationReport['status']): string {
  const labels: Partial<Record<ImplementationReport['status'], string>> = {
    running: '运行中',
    needs_attention: '需要关注',
    released: '已释放',
    completed: '已完成',
    failed: '失败'
  };
  return labels[status] ?? status;
}

function RuntimeStatusBadge({ status }: { status: RuntimeDescriptor['status'] }): JSX.Element {
  const color =
    status === 'online'
      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
      : status === 'degraded'
        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
        : 'bg-neutral-500/20 text-neutral-700 dark:text-neutral-300';
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${color}`}
    >
      {runtimeStatusLabel(status)}
    </span>
  );
}

function LeaseStatusBadge({ status }: { status: TaskLease['status'] }): JSX.Element {
  const color =
    status === 'running'
      ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300'
      : status === 'claimed'
        ? 'bg-violet-500/20 text-violet-700 dark:text-violet-300'
        : status === 'needs_attention'
          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
          : status === 'completed'
            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
            : 'bg-neutral-500/20 text-neutral-700 dark:text-neutral-300';
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${color}`}
    >
      {leaseStatusLabel(status)}
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
    <span
      className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${color}`}
    >
      {reportStatusLabel(status)}
    </span>
  );
}
