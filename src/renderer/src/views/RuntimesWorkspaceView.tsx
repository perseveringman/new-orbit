import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DispatchSnapshot,
  ImplementationReport,
  RuntimeDescriptor,
  TaskLease
} from '@shared/orchestration';
import type { EvidenceSource, ExternalAISessionSettings } from '@shared/evidence';
import { wholeSourceSelector } from '@shared/evidence';
import type { SDKEndpointRegistrySnapshot, SDKEndpointView } from '@shared/runtime';
import type { ExternalSessionDistillPayload, SynthesisArtifact } from '@shared/synthesis';
import { useFiles } from '../store/files';
import { usePara } from '../store/para';
import { useWorkspace } from '../store/workspace';

export interface RuntimesWorkspaceSurfaceProps {
  snapshot: DispatchSnapshot | null;
  loading: boolean;
  projects: Array<{ uid: string; name: string }>;
  sdkSnapshot?: SDKEndpointRegistrySnapshot | null;
  externalSessions?: EvidenceSource[];
  externalSessionSummaries?: Record<string, SynthesisArtifact<ExternalSessionDistillPayload>>;
  externalSessionSettings?: ExternalAISessionSettings | null;
  externalSessionsLoading?: boolean;
  externalSessionMessage?: string | null;
  busyExternalSessionId?: string | null;
  selectedRuntimeId: string | null;
  onRefresh(): void;
  onSelectRuntime(runtimeId: string): void;
  onOpenProjectRoles(projectUid: string): void;
  onSyncExternalSessions?(): void;
  onDistillExternalSession?(source: EvidenceSource): void;
  onOpenMemory?(): void;
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
  const [externalSessions, setExternalSessions] = useState<EvidenceSource[]>([]);
  const [externalSessionSettings, setExternalSessionSettings] =
    useState<ExternalAISessionSettings | null>(null);
  const [externalSessionSummaries, setExternalSessionSummaries] = useState<
    Record<string, SynthesisArtifact<ExternalSessionDistillPayload>>
  >({});
  const [externalSessionsLoading, setExternalSessionsLoading] = useState(false);
  const [externalSessionMessage, setExternalSessionMessage] = useState<string | null>(null);
  const [busyExternalSessionId, setBusyExternalSessionId] = useState<string | null>(null);
  const [selectedRuntimeId, setSelectedRuntimeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadExternalSessions = useCallback(async () => {
    setExternalSessionsLoading(true);
    try {
      const [sources, summaries, settings] = await Promise.all([
        window.orbit.evidence.list({
          kind: 'external_ai_session',
          include_unavailable: true,
          limit: 120
        }),
        window.orbit.synthesis.list({ kind: 'distill.external_session', limit: 160 }),
        window.orbit.evidence.externalSessionSettings().catch(() => null)
      ]);
      setExternalSessions(sources);
      setExternalSessionSettings(settings);
      setExternalSessionSummaries(
        Object.fromEntries(
          summaries
            .filter(
              (
                artifact
              ): artifact is SynthesisArtifact<ExternalSessionDistillPayload> =>
                artifact.kind === 'distill.external_session'
            )
            .map((artifact) => [artifact.payload.source_id, artifact])
        )
      );
    } catch (error) {
      setExternalSessionMessage(`Runtime 会话库加载失败：${(error as Error).message}`);
    } finally {
      setExternalSessionsLoading(false);
    }
  }, []);

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
    void loadExternalSessions();
  }, [loadExternalSessions]);

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

  const syncExternalSessions = useCallback(async () => {
    setExternalSessionsLoading(true);
    setExternalSessionMessage('正在同步 Runtime 全量会话库…');
    try {
      await window.orbit.evidence.sync({ includeExternalAISessions: true });
      await loadExternalSessions();
      setExternalSessionMessage('Runtime 全量会话库已同步到 PMIL 证据层。');
    } catch (error) {
      setExternalSessionMessage(`同步 Runtime 会话库失败：${(error as Error).message}`);
    } finally {
      setExternalSessionsLoading(false);
    }
  }, [loadExternalSessions]);

  const distillExternalSession = useCallback(async (source: EvidenceSource) => {
    setBusyExternalSessionId(source.id);
    setExternalSessionMessage(null);
    try {
      const selector = wholeSourceSelector(
        source.id,
        'safe_projection',
        'runtime session-library summary'
      );
      const read = await window.orbit.evidence.read(selector);
      const text = read.excerpts.map((excerpt) => excerpt.text).join('\n\n');
      const artifact = (await window.orbit.synthesis.ensure({
        kind: 'distill.external_session',
        scope_key: `distill.external_session:${source.id}`,
        sources: [
          {
            kind: 'external_ai_session',
            ref: source.id,
            title: source.title,
            excerpt: text.slice(0, 8000),
            metadata: {
              selector,
              source_hash: source.fingerprint.value,
              agent: stringMetadata(source, 'agent'),
              project_name: stringMetadata(source, 'project_name')
            }
          }
        ],
        priority: 'interactive',
        reason: 'manual',
        force: true
      })) as SynthesisArtifact<ExternalSessionDistillPayload>;
      setExternalSessionSummaries((current) => ({ ...current, [source.id]: artifact }));
      setExternalSessionMessage('会话摘要已生成。');
    } catch (error) {
      setExternalSessionMessage(`生成会话摘要失败：${(error as Error).message}`);
    } finally {
      setBusyExternalSessionId(null);
    }
  }, []);

  const openMemory = useCallback(() => {
    setView({ kind: 'memory' });
  }, [setView]);

  return (
    <RuntimesWorkspaceSurface
      snapshot={snapshot}
      loading={loading}
      projects={projects}
      sdkSnapshot={sdkSnapshot}
      externalSessions={externalSessions}
      externalSessionSettings={externalSessionSettings}
      externalSessionSummaries={externalSessionSummaries}
      externalSessionsLoading={externalSessionsLoading}
      externalSessionMessage={externalSessionMessage}
      busyExternalSessionId={busyExternalSessionId}
      selectedRuntimeId={selectedRuntimeId}
      onRefresh={() => void refresh('refresh')}
      onSelectRuntime={setSelectedRuntimeId}
      onOpenProjectRoles={openProjectRoles}
      onSyncExternalSessions={() => void syncExternalSessions()}
      onDistillExternalSession={(source) => void distillExternalSession(source)}
      onOpenMemory={openMemory}
    />
  );
}

export function RuntimesWorkspaceSurface({
  snapshot,
  loading,
  projects,
  sdkSnapshot,
  externalSessions = [],
  externalSessionSummaries = {},
  externalSessionSettings = null,
  externalSessionsLoading = false,
  externalSessionMessage = null,
  busyExternalSessionId = null,
  selectedRuntimeId,
  onRefresh,
  onSelectRuntime,
  onOpenProjectRoles,
  onSyncExternalSessions,
  onDistillExternalSession,
  onOpenMemory
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
    roleBindings: (snapshot?.bindings ?? []).length,
    externalSessions: externalSessions.length,
    externalSummaries: Object.keys(externalSessionSummaries).length
  };
  const selectedRuntimeSessions = selectedRuntime
    ? sessionsForRuntime(selectedRuntime, externalSessions)
    : [];

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
              观察 CLI Runtime、SDK endpoint、角色绑定、编排层 lease / report，以及这些 Runtime 自己保存的全量历史会话库。
            </p>
          </div>
          <button
            onClick={onRefresh}
            className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            刷新注册表
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
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
          <WorkspaceStat
            label="Runtime 会话"
            value={`${stats.externalSessions}/${stats.externalSummaries}`}
            hint="证据源 / 已摘要"
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

                      <ExternalSessionRuntimePanel
                        busyExternalSessionId={busyExternalSessionId}
                        externalSessionsLoading={externalSessionsLoading}
                        message={externalSessionMessage}
                        runtime={selectedRuntime}
                        sessions={selectedRuntimeSessions}
                        settings={externalSessionSettings}
                        summaries={externalSessionSummaries}
                        totalSessions={externalSessions.length}
                        onDistill={onDistillExternalSession}
                        onOpenMemory={onOpenMemory}
                        onSync={onSyncExternalSessions}
                      />

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
                          <h3 className="text-sm font-semibold">Runtime B SDK 端点</h3>
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

                      <PMILLocalSessionDigestCard
                        sessions={externalSessions}
                        settings={externalSessionSettings}
                        summaries={externalSessionSummaries}
                      />

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

function ExternalSessionRuntimePanel({
  runtime,
  sessions,
  summaries,
  settings,
  totalSessions,
  externalSessionsLoading,
  busyExternalSessionId,
  message,
  onSync,
  onDistill,
  onOpenMemory
}: {
  runtime: RuntimeDescriptor;
  sessions: EvidenceSource[];
  summaries: Record<string, SynthesisArtifact<ExternalSessionDistillPayload>>;
  settings: ExternalAISessionSettings | null;
  totalSessions: number;
  externalSessionsLoading: boolean;
  busyExternalSessionId: string | null;
  message: string | null;
  onSync?: () => void;
  onDistill?: (source: EvidenceSource) => void;
  onOpenMemory?: () => void;
}): JSX.Element {
  const summarized = sessions.filter((source) => summaries[source.id]).length;
  const settingsLabel = settings?.enabled ? '已启用' : '未启用';
  const indexLabel = settings?.indexLevel ?? '未配置';

  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900 dark:bg-sky-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-sky-900 dark:text-sky-100">
            Runtime 会话库接入
          </h3>
          <p className="mt-1 text-xs leading-5 text-neutral-600 dark:text-neutral-300">
            扫描 {runtime.provider} runtime 自己保存的历史会话，不限于 Orbit 里启动过的任务；原始会话作为 reference-truth，摘要只按需生成。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSync}
            disabled={!onSync || externalSessionsLoading}
            className="rounded border border-sky-300 bg-white px-3 py-1.5 text-xs text-sky-700 disabled:opacity-50 dark:border-sky-900 dark:bg-neutral-950 dark:text-sky-300"
          >
            {externalSessionsLoading ? '同步中' : '同步会话'}
          </button>
          <button
            type="button"
            onClick={onOpenMemory}
            disabled={!onOpenMemory}
            className="rounded border border-sky-300 bg-white px-3 py-1.5 text-xs text-sky-700 disabled:opacity-50 dark:border-sky-900 dark:bg-neutral-950 dark:text-sky-300"
          >
            打开 Memory
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs md:grid-cols-4">
        <InfoPill label="来源设置" value={settingsLabel} />
        <InfoPill label="索引级别" value={indexLabel} />
        <InfoPill label="会话库总量" value={String(totalSessions)} />
        <InfoPill label="当前 Runtime" value={`${sessions.length}/${summarized}`} />
      </div>
      {message ? <p className="mt-3 text-xs text-neutral-500">{message}</p> : null}

      <div className="mt-4 space-y-2">
        {sessions.slice(0, 5).map((source) => (
          <RuntimeExternalSessionCard
            key={source.id}
            busy={busyExternalSessionId === source.id}
            source={source}
            summary={summaries[source.id]}
            onDistill={onDistill}
          />
        ))}
        {!sessions.length ? (
          <p className="rounded-xl border border-dashed border-sky-300 bg-white p-4 text-sm text-neutral-500 dark:border-sky-900 dark:bg-neutral-950">
            当前 Runtime 还没有匹配到已索引的历史会话。先同步 Runtime 会话库，或在设置里的「记忆源」调整 agent / 路径过滤。
          </p>
        ) : null}
      </div>
    </section>
  );
}

function RuntimeExternalSessionCard({
  source,
  summary,
  busy,
  onDistill
}: {
  source: EvidenceSource;
  summary?: SynthesisArtifact<ExternalSessionDistillPayload>;
  busy: boolean;
  onDistill?: (source: EvidenceSource) => void;
}): JSX.Element {
  const payload = summary?.payload;
  return (
    <article className="rounded-xl border border-sky-200 bg-white p-3 text-sm dark:border-sky-900 dark:bg-neutral-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              {stringMetadata(source, 'agent') ?? 'local-agent'}
            </span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-800">
              {source.privacy.index_level}
            </span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-800">
              {source.availability}
            </span>
          </div>
          <h4 className="mt-2 truncate font-semibold">{source.title}</h4>
          <p className="mt-1 truncate text-xs text-neutral-500">
            {sourceProjectLabel(source)} · {formatMaybeDate(source.updated_at)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDistill?.(source)}
          disabled={!onDistill || busy}
          className="rounded border border-sky-300 px-2.5 py-1.5 text-[11px] text-sky-700 disabled:opacity-50 dark:border-sky-900 dark:text-sky-300"
        >
          {busy ? '生成中' : payload ? '更新摘要' : '生成摘要'}
        </button>
      </div>
      {payload ? (
        <div className="mt-3 rounded-lg bg-sky-50 p-3 text-xs leading-5 text-neutral-700 dark:bg-sky-950/30 dark:text-neutral-200">
          <p>{payload.summary}</p>
          {payload.open_loops.length ? (
            <p className="mt-2 text-neutral-500">
              开放回路：{payload.open_loops.slice(0, 2).map((loop) => loop.title).join('；')}
            </p>
          ) : null}
          {payload.next_actions.length ? (
            <p className="mt-1 text-neutral-500">
              下一步：{payload.next_actions.slice(0, 2).join('；')}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs leading-5 text-neutral-500">
          {source.summary ?? '已作为证据源保存，尚未生成会话级摘要。'}
        </p>
      )}
    </article>
  );
}

function PMILLocalSessionDigestCard({
  sessions,
  summaries,
  settings
}: {
  sessions: EvidenceSource[];
  summaries: Record<string, SynthesisArtifact<ExternalSessionDistillPayload>>;
  settings: ExternalAISessionSettings | null;
}): JSX.Element {
  const summaryCount = Object.keys(summaries).length;
  const stage = localSessionMaturityStage(settings, sessions, summaryCount);
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            PMIL 消化链路
          </h3>
          <p className="mt-1 text-xs leading-5 text-neutral-600 dark:text-neutral-300">
            从 runtime 原始历史会话到可召回上下文的完整路径，目前属于 foundation 可演示状态。
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:bg-neutral-950 dark:text-emerald-300">
          {stage}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-xs">
        <DigestStep
          title="真相源接入"
          status={settings?.enabled ? '已接入' : '待启用'}
          detail={`${sessions.length} 条 external_ai_session EvidenceSource`}
          active={Boolean(settings?.enabled)}
        />
        <DigestStep
          title="安全投影与索引"
          status={sessions.length ? '已接入' : '等待数据'}
          detail="支持 metadata / safe_projection / full_text 策略，默认进入 evidence chunk index。"
          active={sessions.length > 0}
        />
        <DigestStep
          title="会话级摘要"
          status={summaryCount ? '已生成' : '可生成'}
          detail={`${summaryCount} 条 distill.external_session，包含摘要、决策、开放回路和下一步。`}
          active={summaryCount > 0}
        />
        <DigestStep
          title="进入 Orbit 上下文"
          status="基础完成"
          detail="Ask / Search / Review / Project Context 可以引用证据、图谱邻居和会话摘要。"
          active
        />
        <DigestStep
          title="仍需增强"
          status="未完成"
          detail="message-range selector、first-class snapshot store、更深的 LLM refinement 和专门浏览入口。"
          active={false}
        />
      </div>
    </section>
  );
}

function DigestStep({
  title,
  status,
  detail,
  active
}: {
  title: string;
  status: string;
  detail: string;
  active: boolean;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-3 dark:border-emerald-900 dark:bg-neutral-950">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-neutral-800 dark:text-neutral-100">{title}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] ${
            active
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
          }`}
        >
          {status}
        </span>
      </div>
      <p className="mt-1 text-neutral-500">{detail}</p>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-sky-200 bg-white px-3 py-2 dark:border-sky-900 dark:bg-neutral-950">
      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div className="mt-1 truncate font-medium text-neutral-800 dark:text-neutral-100">{value}</div>
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

function sessionsForRuntime(
  runtime: RuntimeDescriptor,
  sessions: EvidenceSource[]
): EvidenceSource[] {
  const provider = normalizeRuntimeToken(runtime.provider);
  const runtimeName = normalizeRuntimeToken(runtime.name);
  return sessions
    .filter((source) => {
      const agent = normalizeRuntimeToken(stringMetadata(source, 'agent'));
      const providerId = normalizeRuntimeToken(source.provider_id);
      const haystack = normalizeRuntimeToken(
        [source.title, source.canonical_ref, stringMetadata(source, 'project_name')]
          .filter(Boolean)
          .join(' ')
      );
      return (
        agent === provider ||
        providerId === provider ||
        haystack.includes(provider) ||
        (runtimeName.length > 2 && haystack.includes(runtimeName))
      );
    })
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

function normalizeRuntimeToken(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

function stringMetadata(source: EvidenceSource, key: string): string | undefined {
  const value = source.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function sourceProjectLabel(source: EvidenceSource): string {
  return stringMetadata(source, 'project_name') ?? '未关联项目';
}

function formatMaybeDate(value: string | undefined): string {
  if (!value) return '未知时间';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  return new Date(time).toLocaleString();
}

function localSessionMaturityStage(
  settings: ExternalAISessionSettings | null,
  sessions: EvidenceSource[],
  summaryCount: number
): string {
  if (!settings?.enabled) return '待启用';
  if (sessions.length === 0) return '已配置';
  if (summaryCount === 0) return '已接入';
  return '可演示闭环';
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
