import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { EvidenceReadResult, EvidenceSelector, EvidenceSource, EvidenceSourceKind } from '@shared/evidence';
import { evidenceSourceId, wholeSourceSelector } from '@shared/evidence';
import type { MemoryBackendId, MemoryDigestResult, MemoryGraph, MemoryKind, MemoryLayer, MemoryNode, MemoryRelationKind, MemorySourceSyncResult, MemoryStability } from '@shared/memory';
import { MEMORY_KINDS, MEMORY_LAYERS } from '@shared/memory';
import type { EntityProfilePayload, ExternalSessionDistillPayload, SynthesisArtifact, SynthesisSource } from '@shared/synthesis';

type LoadState = 'loading' | 'success' | 'empty' | 'error';
type MemoryPageTab = 'memories' | 'sources' | 'recall' | 'advanced';

interface ManualMemoryDraft {
  title: string;
  summary: string;
}

export function MemoryView(): JSX.Element {
  const [layer, setLayer] = useState<MemoryLayer | 'all'>('all');
  const [kind, setKind] = useState<MemoryKind | 'all'>('all');
  const [nodes, setNodes] = useState<MemoryNode[]>([]);
  const [graph, setGraph] = useState<MemoryGraph | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [digest, setDigest] = useState<MemoryDigestResult | null>(null);
  const [sourceSync, setSourceSync] = useState<MemorySourceSyncResult | null>(null);
  const [syncingSources, setSyncingSources] = useState(false);
  const [sourceSyncError, setSourceSyncError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setState('loading');
    setError(null);
    try {
      const filter = { layer, kind };
      const [next, nextGraph] = await Promise.all([
        window.orbit.memory.list(filter),
        window.orbit.memory.graph(filter)
      ]);
      setNodes(next);
      setGraph(nextGraph);
      setState(next.length ? 'success' : 'empty');
    } catch (err) {
      setError((err as Error).message);
      setState('error');
    }
  }, [kind, layer]);

  useEffect(() => {
    void load();
    const off = window.orbit.memory.onEvent(() => void load());
    return off;
  }, [load]);

  async function createManual(input: ManualMemoryDraft): Promise<void> {
    const title = input.title.trim();
    const summary = input.summary.trim();
    if (!title || !summary) return;
    await window.orbit.memory.create({ kind: 'preference', title, summary, user_confirmed: true, confidence: 0.7 });
    await load();
  }

  async function archive(id: string): Promise<void> {
    if (!window.confirm('归档这条记忆？')) return;
    await window.orbit.memory.archive(id);
    await load();
  }

  async function confirmMemory(node: MemoryNode): Promise<void> {
    await window.orbit.memory.update(node.id, { user_confirmed: true, confidence: Math.max(node.confidence, 0.75), evidence_count: Math.max(node.evidence_count, 3) });
    await load();
  }

  async function generateDigest(): Promise<void> {
    setDigest(await window.orbit.memory.generateDigest());
    await load();
  }

  async function syncTruthLayer(): Promise<void> {
    setSyncingSources(true);
    setSourceSyncError(null);
    try {
      const result = await window.orbit.memory.syncTruthLayer({
        includeExternalAISessions: true,
        limit: 200,
        maxMemoriesPerSource: 2
      });
      setSourceSync(result);
      await load();
    } catch (err) {
      setSourceSyncError((err as Error).message);
    } finally {
      setSyncingSources(false);
    }
  }

  async function promote(id: string, target: 'resource' | 'project'): Promise<void> {
    if (target === 'resource') await window.orbit.memory.promoteToResource(id);
    else await window.orbit.memory.promoteToProject(id);
    await load();
  }

  async function feedback(id: string, helpful: boolean): Promise<void> {
    await window.orbit.memory.feedback(id, helpful);
    await load();
  }

  return (
    <MemoryContent
      kind={kind}
      layer={layer}
      nodes={nodes}
      graph={graph}
      state={state}
      error={error}
      digest={digest}
      sourceSync={sourceSync}
      sourceSyncError={sourceSyncError}
      syncingSources={syncingSources}
      onLayerChange={setLayer}
      onKindChange={setKind}
      onReload={() => void load()}
      onCreate={(input) => void createManual(input)}
      onArchive={(id) => void archive(id)}
      onConfirm={(node) => void confirmMemory(node)}
      onDigest={() => void generateDigest()}
      onSyncTruthLayer={() => void syncTruthLayer()}
      onPromote={(id, target) => void promote(id, target)}
      onFeedback={(id, helpful) => void feedback(id, helpful)}
    />
  );
}

export function MemoryContent(props: {
  layer: MemoryLayer | 'all';
  kind: MemoryKind | 'all';
  nodes: MemoryNode[];
  graph: MemoryGraph | null;
  state: LoadState;
  error: string | null;
  digest: MemoryDigestResult | null;
  sourceSync: MemorySourceSyncResult | null;
  sourceSyncError: string | null;
  syncingSources: boolean;
  onLayerChange(layer: MemoryLayer | 'all'): void;
  onKindChange(kind: MemoryKind | 'all'): void;
  onReload(): void;
  onCreate(input: ManualMemoryDraft): Promise<void> | void;
  onArchive(id: string): void;
  onConfirm(node: MemoryNode): void;
  onDigest(): void;
  onSyncTruthLayer(): void;
  onPromote(id: string, target: 'resource' | 'project'): void;
  onFeedback(id: string, helpful: boolean): void;
}): JSX.Element {
  const stats = useMemo(() => summarize(props.nodes), [props.nodes]);
  const sourceStats = useMemo(() => summarizeSources(props.nodes), [props.nodes]);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<MemoryPageTab>('memories');
  const [manualTitle, setManualTitle] = useState('');
  const [manualSummary, setManualSummary] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [savingManual, setSavingManual] = useState(false);

  async function submitManual(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const title = manualTitle.trim();
    const summary = manualSummary.trim();
    if (!title || !summary) {
      setManualError('请填写标题和摘要。');
      return;
    }
    setManualError(null);
    setSavingManual(true);
    try {
      await props.onCreate({ title, summary });
      setManualTitle('');
      setManualSummary('');
      setCreateOpen(false);
    } catch (err) {
      setManualError((err as Error).message);
    } finally {
      setSavingManual(false);
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-stone-50 p-6 text-stone-950 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <p className="text-xs font-medium text-stone-500 dark:text-neutral-500">我的记忆</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Orbit 现在知道什么</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600 dark:text-neutral-400">
                这里展示会被 Ask、Review 和项目上下文自动带上的长期背景。每条记忆都可以查看来源、确认、纠正或归档。
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button onClick={() => setActiveTab('sources')} className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800">
                管理来源
              </button>
              <button onClick={() => setActiveTab('recall')} className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800">
                测试召回
              </button>
              <button onClick={() => setCreateOpen(true)} className="rounded-lg bg-stone-950 px-3 py-2 text-sm text-white transition hover:bg-stone-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white">
                添加记忆
              </button>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Stat label="已记住" value={stats.total} hint="当前可用的长期记忆" />
            <Stat label="已稳定" value={stats.stable + stats.core} hint="可信度较高，可优先带入上下文" />
            <Stat label="有来源" value={sourceStats.withSources} hint="能追溯到笔记、资料或会话" />
            <Stat label="已被使用" value={stats.recalls} hint="被 Ask / Review 召回的次数" />
          </div>
          <div className="mt-5 flex flex-wrap gap-2 border-b border-stone-200 pb-1 dark:border-neutral-800">
            {([
              ['memories', '我的记忆'],
              ['sources', '记忆来源'],
              ['recall', '召回测试'],
              ['advanced', '图谱与主题']
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-3 py-2 text-sm transition ${activeTab === tab ? 'bg-stone-950 text-white dark:bg-neutral-100 dark:text-neutral-950' : 'text-stone-600 hover:bg-stone-100 dark:text-neutral-400 dark:hover:bg-neutral-800'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {createOpen ? (
          <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <form className="grid gap-3" onSubmit={(event) => void submitManual(event)}>
              <div>
                <h2 className="text-base font-semibold">添加一条你希望 Orbit 记住的内容</h2>
                <p className="mt-1 text-sm text-stone-500 dark:text-neutral-400">适合写偏好、长期目标、工作习惯或明确经验。</p>
              </div>
              <label className="grid gap-1 text-sm font-medium">
                标题
                <input
                  value={manualTitle}
                  onChange={(event) => setManualTitle(event.currentTarget.value)}
                  placeholder="例如：先读源文件"
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-950"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                摘要
                <textarea
                  value={manualSummary}
                  onChange={(event) => setManualSummary(event.currentTarget.value)}
                  placeholder="描述 Orbit 应该记住什么，以及为什么重要。"
                  rows={3}
                  className="resize-none rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-950"
                />
              </label>
              {manualError ? <p className="text-sm text-red-600 dark:text-red-300">{manualError}</p> : null}
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={savingManual} className="rounded-lg bg-stone-950 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-950">
                  {savingManual ? '创建中...' : '创建记忆'}
                </button>
                <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-neutral-700">取消</button>
              </div>
            </form>
          </section>
        ) : null}

        {activeTab === 'memories' ? (
          <MemoriesTab
            kind={props.kind}
            layer={props.layer}
            nodes={props.nodes}
            state={props.state}
            error={props.error}
            onArchive={props.onArchive}
            onConfirm={props.onConfirm}
            onFeedback={props.onFeedback}
            onKindChange={props.onKindChange}
            onLayerChange={props.onLayerChange}
            onPromote={props.onPromote}
            onReload={props.onReload}
            onCreate={() => setCreateOpen(true)}
          />
        ) : null}
        {activeTab === 'sources' ? (
          <SourcesTab
            digest={props.digest}
            sourceStats={sourceStats}
            sourceSync={props.sourceSync}
            sourceSyncError={props.sourceSyncError}
            syncingSources={props.syncingSources}
            onDigest={props.onDigest}
            onSyncTruthLayer={props.onSyncTruthLayer}
          />
        ) : null}
        {activeTab === 'recall' ? <RecallTestTab nodes={props.nodes} /> : null}
        {activeTab === 'advanced' ? (
          <AdvancedMemoryTab graph={props.graph} nodes={props.nodes} />
        ) : null}
      </div>
    </main>
  );
}

function MemoriesTab(props: {
  layer: MemoryLayer | 'all';
  kind: MemoryKind | 'all';
  nodes: MemoryNode[];
  state: LoadState;
  error: string | null;
  onLayerChange(layer: MemoryLayer | 'all'): void;
  onKindChange(kind: MemoryKind | 'all'): void;
  onReload(): void;
  onCreate(): void;
  onArchive(id: string): void;
  onConfirm(node: MemoryNode): void;
  onFeedback(id: string, helpful: boolean): void;
  onPromote(id: string, target: 'resource' | 'project'): void;
}): JSX.Element {
  return (
    <section className="grid gap-4">
      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">会进入上下文的记忆</h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-neutral-400">这些内容会在相关问题、项目和复盘里自动被带给 AI。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', ...MEMORY_KINDS] as const).map((item) => (
              <button
                key={item}
                onClick={() => props.onKindChange(item)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${props.kind === item ? 'border-stone-900 bg-stone-950 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-950' : 'border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800'}`}
              >
                {memoryKindLabel(item)}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['all', ...MEMORY_LAYERS] as const).map((item) => (
            <button
              key={item}
              onClick={() => props.onLayerChange(item)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${props.layer === item ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800'}`}
            >
              {memoryLayerLabel(item)}
            </button>
          ))}
        </div>
      </div>

      {props.state === 'loading' ? (
        <MemorySkeleton />
      ) : props.state === 'error' ? (
        <StateCard title="记忆加载失败" body={props.error ?? '未知记忆错误。'} actionLabel="重试" onAction={props.onReload} />
      ) : props.state === 'empty' ? (
        <StateCard title="还没有可用记忆" body="先从来源更新记忆，或手动添加一条你希望 Orbit 长期记住的内容。" actionLabel="添加记忆" onAction={props.onCreate} />
      ) : (
        <section className="grid gap-3">
          {props.nodes.map((node) => (
            <MemoryCard
              key={node.id}
              node={node}
              onArchive={props.onArchive}
              onConfirm={props.onConfirm}
              onFeedback={props.onFeedback}
              onPromote={props.onPromote}
            />
          ))}
        </section>
      )}
    </section>
  );
}

function SourcesTab(props: {
  sourceStats: SourceStats;
  sourceSync: MemorySourceSyncResult | null;
  sourceSyncError: string | null;
  syncingSources: boolean;
  digest: MemoryDigestResult | null;
  onSyncTruthLayer(): void;
  onDigest(): void;
}): JSX.Element {
  return (
    <section className="grid gap-4">
      <div className="rounded-xl border border-stone-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <h2 className="text-base font-semibold">记忆从哪里来</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-500 dark:text-neutral-400">
              Orbit 不把所有文件原样塞进记忆，而是从笔记、资料、资源、本地 AI 会话和连接器里提取可复用背景，并保留来源证据。
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button onClick={props.onSyncTruthLayer} disabled={props.syncingSources} className="rounded-lg bg-stone-950 px-3 py-2 text-sm text-white transition hover:bg-stone-800 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-950">
              {props.syncingSources ? '更新中...' : '从来源更新记忆'}
            </button>
            <button onClick={props.onDigest} className="rounded-lg border border-stone-300 px-3 py-2 text-sm transition hover:bg-stone-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
              生成记忆摘要
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Stat label="带来源的记忆" value={props.sourceStats.withSources} hint="可追溯证据" />
          <Stat label="Orbit 内部来源" value={props.sourceStats.orbitOwned} hint="笔记、资料、资源、项目" />
          <Stat label="本地 AI 会话" value={props.sourceStats.externalSessions} hint="Codex、Copilot 等历史" />
          <Stat label="连接器文档" value={props.sourceStats.externalFiles} hint="Obsidian 与外部文件" />
        </div>
      </div>

      {props.sourceSyncError ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          来源更新失败：{props.sourceSyncError}
        </section>
      ) : null}

      {props.sourceSync ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
          <strong>已更新到 {props.sourceSync.backend === 'hy-memory' ? 'HY Memory' : 'Orbit 记忆'}</strong>
          <p className="mt-1 text-stone-600 dark:text-neutral-300">
            处理 {props.sourceSync.processed_count} 个来源，新增 {props.sourceSync.created_count} 条，更新 {props.sourceSync.updated_count} 条，跳过 {props.sourceSync.skipped_count} 个未变化来源。
          </p>
          {props.sourceSync.errors.length ? (
            <p className="mt-2 text-amber-700 dark:text-amber-300">{props.sourceSync.errors.length} 个来源暂未同步，可稍后重试。</p>
          ) : null}
        </section>
      ) : null}

      {props.digest ? (
        <section className="rounded-xl border border-stone-200 bg-white p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">
          <strong>记忆摘要已生成</strong>
          <p className="mt-1 text-stone-600 dark:text-neutral-300">
            新增 {props.digest.artifact.payload.new_memories.length} 条，强化 {props.digest.artifact.payload.reinforced_memories.length} 条。
          </p>
        </section>
      ) : null}

      <MemoryAgentSessionsPanel />
    </section>
  );
}

type RecallRunStatus = 'idle' | 'success' | 'empty' | 'error';

interface RecallRunState {
  status: RecallRunStatus;
  query: string;
  explanation: string;
  durationMs: number;
  items: Array<{ memory: MemoryNode; score?: number; reasons: string[] }>;
}

function RecallTestTab({ nodes }: { nodes: MemoryNode[] }): JSX.Element {
  const [query, setQuery] = useState('我最近在推进什么？');
  const [run, setRun] = useState<RecallRunState>({
    status: 'idle',
    query: '',
    explanation: '',
    durationMs: 0,
    items: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backend, setBackend] = useState<MemoryBackendId | null>(null);
  const suggestions = useMemo(() => recallQuerySuggestions(nodes), [nodes]);

  useEffect(() => {
    let cancelled = false;
    void window.orbit.memory.backendStatus()
      .then((status) => {
        if (!cancelled) setBackend(status.active);
      })
      .catch(() => {
        if (!cancelled) setBackend(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function runRecall(): Promise<void> {
    const q = query.trim();
    if (!q) {
      setError('请输入一个问题。');
      return;
    }
    setLoading(true);
    setError(null);
    const started = performance.now();
    try {
      const recalled = await window.orbit.memory.recall(q, { max_memories: 8, min_confidence: 0.01, triggered_by: { kind: 'manual' }, used_in: 'question_answer' });
      const items = recalled.memories.map((memory) => ({
        memory,
        score: recalled.matches.find((match) => match.memory_id === memory.id)?.score,
        reasons: recalled.matches.find((match) => match.memory_id === memory.id)?.reasons ?? []
      }));
      setRun({
        status: items.length ? 'success' : 'empty',
        query: q,
        explanation: recalled.explanation,
        durationMs: Math.max(1, Math.round(performance.now() - started)),
        items
      });
    } catch (err) {
      setError((err as Error).message);
      setRun({
        status: 'error',
        query: q,
        explanation: (err as Error).message,
        durationMs: Math.max(1, Math.round(performance.now() - started)),
        items: []
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid gap-4">
      <div className="rounded-xl border border-stone-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">测试 Ask 会想起什么</h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-neutral-400">输入一个真实问题，Orbit 会模拟 Ask 注入上下文前的记忆召回。</p>
          </div>
          <div className="rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs text-stone-600 dark:bg-neutral-800 dark:text-neutral-300">
            当前后端：{backend ? memoryBackendLabel(backend) : '读取中'}
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runRecall();
            }}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10 dark:border-neutral-700 dark:bg-neutral-950"
          />
          <button onClick={() => void runRecall()} disabled={loading} className="rounded-lg bg-stone-950 px-4 py-2 text-sm text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-950">
            {loading ? '召回中...' : '测试召回'}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setQuery(item)}
              className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs text-stone-600 transition hover:bg-stone-100 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              {item}
            </button>
          ))}
        </div>
        {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p> : null}
        {run.status !== 'idle' ? (
          <p className="mt-3 text-xs text-stone-500 dark:text-neutral-500">
            已测试「{run.query}」· {run.durationMs}ms · {run.explanation}
          </p>
        ) : null}
      </div>
      {run.items.length ? (
        <section className="grid gap-3">
          {run.items.map((item) => (
            <article key={item.memory.id} className="rounded-xl border border-stone-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{humanMemoryTitle(item.memory)}</h3>
                <span className="rounded-lg bg-stone-100 px-2 py-1 text-xs text-stone-600 dark:bg-neutral-800 dark:text-neutral-300">
                  分数 {item.score?.toFixed(2) ?? 'n/a'}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-neutral-300">{humanMemorySummary(item.memory)}</p>
              {item.reasons.length ? <p className="mt-2 text-xs text-stone-500">{item.reasons.join('；')}</p> : null}
            </article>
          ))}
        </section>
      ) : run.status === 'empty' ? (
        <StateCard
          title="这次没有命中记忆"
          body="召回已经执行，但当前后端没有返回足够相关的记忆。可以换一个更具体的问题，或先从来源更新记忆。"
          actionLabel="从推荐问题再试"
          onAction={() => {
            setQuery(suggestions[0] ?? '我最近在推进什么？');
          }}
        />
      ) : run.status === 'error' ? (
        <StateCard title="召回测试失败" body={run.explanation} actionLabel="重试" onAction={() => void runRecall()} />
      ) : (
        <StateCard title="还没有召回结果" body="运行一次测试后，这里会显示 Ask 会带上的记忆、匹配分数和原因。" actionLabel="测试召回" onAction={() => void runRecall()} />
      )}
    </section>
  );
}

function AdvancedMemoryTab({ graph, nodes }: { graph: MemoryGraph | null; nodes: MemoryNode[] }): JSX.Element {
  return (
    <section className="grid gap-4">
      <div className="rounded-xl border border-stone-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-base font-semibold">图谱与主题</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-neutral-400">这里展示记忆之间的关系，以及反复出现的人、项目、主题和未闭环线索。</p>
      </div>
      {graph ? <MemoryGraphPanel graph={graph} /> : null}
      <MemoryEntityProfilesPanel graph={graph} nodes={nodes} />
    </section>
  );
}

function MemoryAgentSessionsPanel(): JSX.Element {
  const [sessions, setSessions] = useState<EvidenceSource[]>([]);
  const [artifacts, setArtifacts] = useState<Record<string, SynthesisArtifact<ExternalSessionDistillPayload>>>({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadSessions(): Promise<void> {
    setLoading(true);
    setMessage(null);
    try {
      const [sources, summaries] = await Promise.all([
        window.orbit.evidence.list({ kind: 'external_ai_session', include_unavailable: true, limit: 80 }),
        window.orbit.synthesis.list({ kind: 'distill.external_session', limit: 120 })
      ]);
      setSessions(sources);
      setArtifacts(Object.fromEntries(
        summaries
          .filter((artifact): artifact is SynthesisArtifact<ExternalSessionDistillPayload> => artifact.kind === 'distill.external_session')
          .map((artifact) => [artifact.payload.source_id, artifact])
      ));
    } catch (error) {
      setMessage(`本地 AI 会话加载失败：${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSessions();
  }, []);

  async function syncSessions(): Promise<void> {
    setLoading(true);
    setMessage('正在同步本地 AI 会话…');
    try {
      await window.orbit.evidence.sync({ includeExternalAISessions: true });
      await loadSessions();
      setMessage('本地 AI 会话已同步。');
    } catch (error) {
      setMessage(`同步失败：${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function distillSession(source: EvidenceSource): Promise<void> {
    setBusyAction(sessionActionKey(source, 'distill'));
    setMessage(null);
    try {
      const projection = await readSessionProjection(source, 'memory session center');
      const artifact = await window.orbit.synthesis.ensure({
        kind: 'distill.external_session',
        scope_key: `distill.external_session:${source.id}`,
        sources: [
          {
            kind: 'external_ai_session',
            ref: source.id,
            title: source.title,
            excerpt: projection.text.slice(0, 8000),
            metadata: {
              selector: projection.selector,
              source_hash: source.fingerprint.value,
              agent: stringMetadata(source, 'agent'),
              project_name: stringMetadata(source, 'project_name')
            }
          }
        ],
        priority: 'interactive',
        reason: 'manual',
        force: true
      }) as SynthesisArtifact<ExternalSessionDistillPayload>;
      setArtifacts((current) => ({ ...current, [source.id]: artifact }));
      setMessage('会话摘要已生成。');
    } catch (error) {
      setMessage(`摘要失败：${(error as Error).message}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function saveSessionAsNote(source: EvidenceSource): Promise<void> {
    setBusyAction(sessionActionKey(source, 'note'));
    setMessage(null);
    try {
      const projection = await readSessionProjection(source, 'save external session as note');
      const artifact = artifacts[source.id];
      const note = await window.orbit.notes.create({
        type: 'capture',
        title: `本地 AI 会话：${source.title}`,
        tags: ['pmil', 'runtime-session', normalizeTag(stringMetadata(source, 'agent') ?? 'local-agent')],
        source: {
          kind: 'external_ai_session',
          ref: source.id,
          excerpt: projection.text.slice(0, 600)
        },
        ...(artifact ? { synthesis_ref: artifact.id } : {}),
        body: externalSessionNoteBody(source, projection, artifact)
      });
      setMessage(`已保存为笔记：${note.path}`);
    } catch (error) {
      setMessage(`保存笔记失败：${(error as Error).message}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function materializeSession(source: EvidenceSource): Promise<void> {
    setBusyAction(sessionActionKey(source, 'conversation'));
    setMessage(null);
    try {
      const existing = await window.orbit.chat.findConversationsByAnchor('external_session', source.id);
      if (existing[0]) {
        setMessage(`已存在 Orbit 会话：${existing[0].title ?? existing[0].id}`);
        return;
      }
      const projection = await readSessionProjection(source, 'materialize external session as conversation');
      const artifact = artifacts[source.id];
      const agent = stringMetadata(source, 'agent') ?? 'local-agent';
      const project = stringMetadata(source, 'project_name') ?? 'local';
      const conversation = await window.orbit.chat.createConversation({
        anchor: { kind: 'external_session', refId: source.id, addedAt: new Date().toISOString() },
        scope: { kind: 'external', platform: agent, user_id: project, session_id: source.id },
        title: `${source.title}（外部会话）`
      });
      await window.orbit.chat.appendTurn({
        conversationId: conversation.id,
        role: 'system',
        content: externalSessionSystemTurn(source, projection)
      });
      await window.orbit.chat.appendTurn({
        conversationId: conversation.id,
        role: 'assistant',
        content: externalSessionConversationTurn(source, projection, artifact)
      });
      await window.orbit.chat.updateConversation(conversation.id, {
        summary: artifact?.payload.summary ?? source.summary ?? `从 ${agent} runtime 历史会话转入 Orbit。`,
        tags: ['pmil', 'external-session', normalizeTag(agent)]
      });
      setMessage(`已转为 Orbit 会话：${conversation.title ?? conversation.id}`);
    } catch (error) {
      setMessage(`转为会话失败：${(error as Error).message}`);
    } finally {
      setBusyAction(null);
    }
  }

  const filtered = sessions.filter((source) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [source.title, source.summary, source.canonical_ref, stringMetadata(source, 'agent'), stringMetadata(source, 'project_name')]
      .filter(Boolean)
      .join('\n')
      .toLowerCase()
      .includes(needle);
  });

  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-900 dark:bg-sky-950/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">本地 AI 会话</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            {sessions.length} 条历史会话 · {Object.keys(artifacts).length} 条会话摘要
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            扫描 Codex、Copilot 等本机历史会话；Orbit 只提取可复用背景，原始内容仍作为可查看来源保留。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="筛选工具、项目或标题"
            className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-sky-900 dark:bg-neutral-950"
          />
          <button
            type="button"
            onClick={() => void syncSessions()}
            disabled={loading}
            className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm text-sky-700 disabled:opacity-60 dark:border-sky-900 dark:bg-neutral-950 dark:text-sky-300"
          >
            {loading ? '同步中' : '同步本地会话'}
          </button>
        </div>
      </div>
      {message ? <p className="mt-3 text-xs text-neutral-500">{message}</p> : null}
      <div className="mt-4 grid gap-3">
        {filtered.slice(0, 8).map((source) => (
          <AgentSessionCard
            key={source.id}
            artifact={artifacts[source.id]}
            busyAction={busyAction?.endsWith(`:${source.id}`) ? busyAction.split(':')[0] : null}
            source={source}
            onDistill={() => void distillSession(source)}
            onSaveNote={() => void saveSessionAsNote(source)}
            onMaterialize={() => void materializeSession(source)}
          />
        ))}
        {!filtered.length ? (
          <p className="rounded-xl border border-dashed border-sky-300 bg-white p-4 text-sm text-neutral-500 dark:border-sky-900 dark:bg-neutral-950">
            还没有匹配的本地 AI 会话。先在设置里的「记忆源」启用并同步，或调整筛选条件。
          </p>
        ) : null}
      </div>
    </section>
  );
}

function AgentSessionCard(props: {
  source: EvidenceSource;
  artifact?: SynthesisArtifact<ExternalSessionDistillPayload>;
  busyAction: string | null;
  onDistill(): void;
  onSaveNote(): void;
  onMaterialize(): void;
}): JSX.Element {
  const payload = props.artifact?.payload;
  const selector = wholeSourceSelector(props.source.id, 'safe_projection', 'session center preview');
  const busy = props.busyAction !== null;
  return (
    <article className="rounded-xl border border-sky-200 bg-white p-4 text-sm dark:border-sky-900 dark:bg-neutral-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-sky-100 px-2 py-1 text-[11px] text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              {stringMetadata(props.source, 'agent') ?? 'agent'}
            </span>
            <span className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] text-neutral-500 dark:bg-neutral-800">
              {props.source.privacy.index_level}
            </span>
            <span className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] text-neutral-500 dark:bg-neutral-800">
              {props.source.availability}
            </span>
          </div>
          <h3 className="mt-2 truncate text-base font-semibold">{props.source.title}</h3>
          <p className="mt-1 text-xs text-neutral-500">{props.source.canonical_ref}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MemoryEvidenceButton selector={selector} />
          <button
            type="button"
            onClick={props.onDistill}
            disabled={busy}
            className="rounded-lg border border-sky-300 px-3 py-1.5 text-xs text-sky-700 disabled:opacity-60 dark:border-sky-900 dark:text-sky-300"
          >
            {props.busyAction === 'distill' ? '生成中' : payload ? '重新摘要' : '生成摘要'}
          </button>
          <button
            type="button"
            onClick={props.onSaveNote}
            disabled={busy}
            className="rounded-lg border border-sky-300 px-3 py-1.5 text-xs text-sky-700 disabled:opacity-60 dark:border-sky-900 dark:text-sky-300"
          >
            {props.busyAction === 'note' ? '保存中' : '保存为笔记'}
          </button>
          <button
            type="button"
            onClick={props.onMaterialize}
            disabled={busy}
            className="rounded-lg border border-sky-300 px-3 py-1.5 text-xs text-sky-700 disabled:opacity-60 dark:border-sky-900 dark:text-sky-300"
          >
            {props.busyAction === 'conversation' ? '转入中' : '转为 Orbit 会话'}
          </button>
        </div>
      </div>
      {payload ? (
        <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/30">
          <p className="text-sm leading-6 text-neutral-700 dark:text-neutral-200">{payload.summary}</p>
          {payload.open_loops.length ? (
            <div className="mt-2 text-xs text-neutral-500">
              开放回路：{payload.open_loops.slice(0, 3).map((loop) => loop.title).join('；')}
            </div>
          ) : null}
          {payload.next_actions.length ? (
            <div className="mt-1 text-xs text-neutral-500">
              下一步：{payload.next_actions.slice(0, 3).join('；')}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-neutral-500">还没有会话摘要。生成后，这段会话会变成可召回的中间地图，原始会话仍然是证据源。</p>
      )}
    </article>
  );
}

function MemoryEntityProfilesPanel({ graph, nodes }: { graph: MemoryGraph | null; nodes: MemoryNode[] }): JSX.Element {
  const candidates = useMemo(() => entityCandidates(nodes), [nodes]);
  const [profiles, setProfiles] = useState<Record<string, SynthesisArtifact<EntityProfilePayload>>>({});
  const [busyEntity, setBusyEntity] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadProfiles(): Promise<void> {
    try {
      const artifacts = await window.orbit.synthesis.list({ kind: 'entity.profile', limit: 80 });
      setProfiles(Object.fromEntries(
        artifacts
          .filter((artifact): artifact is SynthesisArtifact<EntityProfilePayload> => artifact.kind === 'entity.profile')
          .map((artifact) => [normalizeEntityKey(artifact.payload.entity), artifact])
      ));
    } catch (error) {
      setMessage(`实体画像加载失败：${(error as Error).message}`);
    }
  }

  useEffect(() => {
    void loadProfiles();
  }, []);

  async function generateProfile(entity: string): Promise<void> {
    setBusyEntity(entity);
    setMessage(null);
    try {
      const evidence = dedupeMemorySelectors(nodes.flatMap((node) => node.related_entities?.includes(entity) ? evidenceSelectorsFromMemory(node) : []));
      const related = relatedEntitiesFor(entity, graph);
      const relevant = nodes.filter((node) => node.related_entities?.includes(entity) || node.title.includes(entity) || node.summary.includes(entity));
      const artifact = await window.orbit.synthesis.ensure({
        kind: 'entity.profile',
        scope_key: `entity.profile:${slugKey(entity)}`,
        sources: [
          {
            kind: 'raw',
            ref: `entity:${entity}`,
            title: `Entity profile: ${entity}`,
            excerpt: relevant.map((node) => `${node.title}\n${node.summary}`).join('\n\n').slice(0, 6000),
            metadata: {
              entity,
              evidence,
              related_entities: related,
              top_sources: topSourcesForEntity(entity, nodes),
              source_hash: profileHash(entity, relevant)
            }
          }
        ],
        priority: 'interactive',
        reason: 'manual',
        force: true
      }) as SynthesisArtifact<EntityProfilePayload>;
      setProfiles((current) => ({ ...current, [normalizeEntityKey(entity)]: artifact }));
      setMessage('实体画像已生成。');
    } catch (error) {
      setMessage(`生成失败：${(error as Error).message}`);
    } finally {
      setBusyEntity(null);
    }
  }

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-900 dark:bg-indigo-950/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700 dark:text-indigo-300">实体画像</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            把反复出现的主题变成可浏览的上下文主页。
          </p>
        </div>
        {message ? <span className="text-xs text-neutral-500">{message}</span> : null}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {candidates.slice(0, 8).map((entity) => (
          <EntityProfileCard
            key={entity}
            busy={busyEntity === entity}
            entity={entity}
            artifact={profiles[normalizeEntityKey(entity)]}
            onGenerate={() => void generateProfile(entity)}
          />
        ))}
        {!candidates.length ? (
          <p className="rounded-xl border border-dashed border-indigo-300 bg-white p-4 text-sm text-neutral-500 dark:border-indigo-900 dark:bg-neutral-950">
            还没有足够的相关实体。随着 Memory 和证据来源增加，这里会出现可生成画像的主题。
          </p>
        ) : null}
      </div>
    </section>
  );
}

function EntityProfileCard(props: {
  entity: string;
  artifact?: SynthesisArtifact<EntityProfilePayload>;
  busy: boolean;
  onGenerate(): void;
}): JSX.Element {
  const payload = props.artifact?.payload;
  return (
    <article className="rounded-xl border border-indigo-200 bg-white p-4 text-sm dark:border-indigo-900 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{props.entity}</h3>
          <p className="mt-1 text-xs text-neutral-500">{payload ? `${payload.related_entities.length} 个关联实体 · ${payload.top_sources.length} 个来源` : '尚未生成画像'}</p>
        </div>
        <button
          type="button"
          onClick={props.onGenerate}
          disabled={props.busy}
          className="rounded-lg border border-indigo-300 px-3 py-1.5 text-xs text-indigo-700 disabled:opacity-60 dark:border-indigo-900 dark:text-indigo-300"
        >
          {props.busy ? '生成中' : payload ? '更新画像' : '生成画像'}
        </button>
      </div>
      {payload ? (
        <div className="mt-3">
          <p className="text-sm leading-6 text-neutral-700 dark:text-neutral-200">{payload.summary}</p>
          {payload.related_entities.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {payload.related_entities.slice(0, 6).map((item) => (
                <span key={`${item.entity}:${item.relation}`} className="rounded-full bg-indigo-100 px-2 py-1 text-[11px] text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {item.entity}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-neutral-500">画像会汇总这个主题的含义、关联实体、证据来源和未解问题。</p>
      )}
    </article>
  );
}

function MemoryGraphPanel({ graph }: { graph: MemoryGraph }): JSX.Element {
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">记忆图谱</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            {graph.nodes.length} 个节点，{graph.relations.length} 条关系
          </p>
        </div>
        <span className="text-xs text-neutral-500">生成于 {graph.generated_at.slice(0, 10)}</span>
      </div>
      {graph.relations.length ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {graph.relations.slice(0, 6).map((relation) => (
            <div key={relation.id} className="rounded-xl border border-emerald-200 bg-white p-3 text-sm dark:border-emerald-900 dark:bg-neutral-900">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{memoryRelationKindLabel(relation.kind)}</span>
                <span className="text-xs text-neutral-500">强度 {relation.strength.toFixed(2)}</span>
              </div>
              <p className="mt-2 text-neutral-700 dark:text-neutral-200">{relation.label}</p>
              <p className="mt-1 text-xs text-neutral-500">{relation.evidence.slice(0, 4).join(' · ')}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-500">暂无记忆关系。共享实体、来源和重叠主题会显示在这里。</p>
      )}
    </section>
  );
}

function MemoryCard(props: {
  node: MemoryNode;
  onArchive(id: string): void;
  onConfirm(node: MemoryNode): void;
  onFeedback(id: string, helpful: boolean): void;
  onPromote(id: string, target: 'resource' | 'project'): void;
}): JSX.Element {
  const selectors = evidenceSelectorsFromMemory(props.node);
  const sourceLabel = primarySourceLabel(props.node);
  return (
    <article className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-stone-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-lg px-2 py-1 text-xs ${stabilityTone(props.node.stability)}`}>{memoryStabilityLabel(props.node.stability)}</span>
            <span className="rounded-lg bg-stone-100 px-2 py-1 text-xs text-stone-600 dark:bg-neutral-800 dark:text-neutral-300">{memoryKindLabel(props.node.kind)}</span>
            <span className="rounded-lg bg-stone-100 px-2 py-1 text-xs text-stone-600 dark:bg-neutral-800 dark:text-neutral-300">{memoryLayerLabel(props.node.layer)}</span>
          </div>
          <h2 className="mt-3 text-lg font-semibold tracking-tight">{humanMemoryTitle(props.node)}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600 dark:text-neutral-300">{humanMemorySummary(props.node)}</p>
        </div>
        <div className="min-w-36 rounded-xl bg-stone-50 p-3 text-sm dark:bg-neutral-950">
          <p className="text-xs text-stone-500">可信度</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{Math.round(props.node.confidence * 100)}%</p>
          <p className="mt-2 text-xs text-stone-500">证据 {props.node.evidence_count} · 使用 {props.node.recall_count}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-stone-500 dark:text-neutral-500">
        来源：{sourceLabel}{props.node.user_confirmed ? ' · 你已确认' : ''}
      </p>
      {selectors.length ? (
        <section className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-medium text-stone-600 dark:text-neutral-300">为什么会记住</h3>
            <span className="text-xs text-stone-500">{selectors.length} 个来源</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selectors.slice(0, 5).map((selector) => (
              <MemoryEvidenceButton key={memoryEvidenceSelectorKey(selector)} selector={selector} />
            ))}
          </div>
        </section>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-stone-300 p-3 text-xs text-stone-500 dark:border-neutral-700">
          这条记忆没有可查看的来源，可能是手动添加或旧版导入。
        </p>
      )}
      {props.node.related_entities?.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {props.node.related_entities.slice(0, 6).map((entity) => (
            <span key={entity} className="rounded-lg bg-stone-100 px-2 py-1 text-[11px] text-stone-500 dark:bg-neutral-800">
              {entity}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => props.onConfirm(props.node)} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs transition hover:bg-stone-100 dark:border-neutral-700 dark:hover:bg-neutral-800">确认正确</button>
        <button onClick={() => props.onFeedback(props.node.id, true)} className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300">有帮助</button>
        <button onClick={() => props.onFeedback(props.node.id, false)} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs text-amber-700 transition hover:bg-amber-50 dark:border-amber-900 dark:text-amber-300">不准确</button>
        <button onClick={() => props.onPromote(props.node.id, 'resource')} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs transition hover:bg-stone-100 dark:border-neutral-700 dark:hover:bg-neutral-800">变成资源</button>
        <button onClick={() => props.onPromote(props.node.id, 'project')} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs transition hover:bg-stone-100 dark:border-neutral-700 dark:hover:bg-neutral-800">变成项目</button>
        <button onClick={() => props.onArchive(props.node.id)} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:text-red-300">忘记</button>
      </div>
    </article>
  );
}

function MemoryEvidenceButton({ selector }: { selector: EvidenceSelector }): JSX.Element {
  const [result, setResult] = useState<EvidenceReadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function readEvidence(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setResult(await window.orbit.evidence.read(selector));
    } catch (err) {
      setResult(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex max-w-full flex-col gap-1">
      <button
        type="button"
        onClick={() => void readEvidence()}
        disabled={loading}
        className="rounded-md border border-emerald-300 bg-white px-2 py-0.5 text-[11px] text-emerald-700 disabled:opacity-60 dark:border-emerald-900 dark:bg-neutral-950 dark:text-emerald-300"
      >
        {loading ? '读取中' : `查看证据 ${shortEvidenceLabel(selector)}`}
      </button>
      {error ? <span className="text-[11px] text-red-600 dark:text-red-300">{error}</span> : null}
      {result ? (
        <span className="rounded-md border border-emerald-200 bg-white p-2 text-[11px] leading-5 text-neutral-600 dark:border-emerald-900 dark:bg-neutral-950 dark:text-neutral-300">
          <span className="block font-medium text-neutral-800 dark:text-neutral-100">{result.source.title}</span>
          {result.excerpts[0]?.text.slice(0, 520) ?? '没有可用摘录。'}
        </span>
      ) : null}
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-xs text-stone-500 dark:text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-neutral-500">{hint}</p> : null}
    </div>
  );
}

function MemorySkeleton(): JSX.Element {
  return <div className="h-40 animate-pulse rounded-xl border border-stone-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />;
}

function StateCard(props: { title: string; body: string; actionLabel: string; onAction(): void }): JSX.Element {
  return (
    <section className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center dark:border-neutral-700 dark:bg-neutral-900">
      <h2 className="text-lg font-semibold">{props.title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-stone-500 dark:text-neutral-400">{props.body}</p>
      <button onClick={props.onAction} className="mt-4 rounded-lg border border-stone-300 px-3 py-2 text-sm transition hover:bg-stone-100 dark:border-neutral-700 dark:hover:bg-neutral-800">{props.actionLabel}</button>
    </section>
  );
}

function evidenceSelectorsFromMemory(memory: MemoryNode): EvidenceSelector[] {
  return dedupeMemorySelectors(memory.sources.flatMap(evidenceSelectorsFromSource));
}

function evidenceSelectorsFromSource(source: SynthesisSource): EvidenceSelector[] {
  const direct = evidenceSelectorFromMetadata(source.metadata);
  if (direct) return [direct];
  const kind = synthesisSourceToEvidenceKind(source.kind);
  if (!kind || !source.ref) return [];
  return [
    {
      source_id: evidenceSourceId(kind, source.ref),
      kind: 'whole_source',
      content_view: 'safe_projection',
      reason: 'memory source'
    }
  ];
}

function evidenceSelectorFromMetadata(metadata?: Record<string, unknown>): EvidenceSelector | null {
  const selector = metadata?.['selector'];
  if (!selector || typeof selector !== 'object') return null;
  const candidate = selector as Partial<EvidenceSelector>;
  if (typeof candidate.source_id !== 'string' || typeof candidate.kind !== 'string' || typeof candidate.content_view !== 'string') {
    return null;
  }
  return candidate as EvidenceSelector;
}

function synthesisSourceToEvidenceKind(kind: SynthesisSource['kind']): EvidenceSourceKind | null {
  if (kind === 'library') return 'library_item';
  if (kind === 'event') return 'activity_event';
  if (kind === 'kb') return 'kb_doc';
  if (kind === 'external_ai_session') return 'external_ai_session';
  if (kind === 'note' || kind === 'resource' || kind === 'project' || kind === 'area' || kind === 'task' || kind === 'conversation') {
    return kind;
  }
  return null;
}

function dedupeMemorySelectors(selectors: EvidenceSelector[]): EvidenceSelector[] {
  const seen = new Set<string>();
  const out: EvidenceSelector[] = [];
  for (const selector of selectors) {
    const key = memoryEvidenceSelectorKey(selector);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(selector);
  }
  return out;
}

function memoryEvidenceSelectorKey(selector: EvidenceSelector): string {
  return `${selector.source_id}:${selector.kind}:${selector.range?.from ?? ''}:${selector.range?.to ?? ''}:${selector.content_view}`;
}

function shortEvidenceLabel(selector: EvidenceSelector): string {
  const id = selector.source_id.split(':').slice(-2).join(':') || selector.source_id;
  return id.length > 22 ? `${id.slice(0, 22)}...` : id;
}

type SessionAction = 'distill' | 'note' | 'conversation';

interface SessionProjection {
  selector: EvidenceSelector;
  text: string;
}

function sessionActionKey(source: EvidenceSource, action: SessionAction): string {
  return `${action}:${source.id}`;
}

async function readSessionProjection(source: EvidenceSource, reason: string): Promise<SessionProjection> {
  const selector = wholeSourceSelector(source.id, 'safe_projection', reason);
  const read = await window.orbit.evidence.read(selector);
  return {
    selector,
    text: read.excerpts.map((excerpt) => excerpt.text).join('\n\n')
  };
}

function externalSessionNoteBody(
  source: EvidenceSource,
  projection: SessionProjection,
  artifact?: SynthesisArtifact<ExternalSessionDistillPayload>
): string {
  const payload = artifact?.payload;
  const loops = payload?.open_loops ?? [];
  const actions = payload?.next_actions ?? [];
  const lines = [
    `# 本地 AI 会话：${source.title}`,
    '',
    '> 这是一条从本地 AI 历史会话保存的 Orbit 笔记。原始会话仍作为真相来源保留，可按证据入口继续查看。',
    '',
    '## 来源',
    '',
    `- 来源 ID: ${source.id}`,
    `- Agent: ${stringMetadata(source, 'agent') ?? 'local-agent'}`,
    `- Project: ${stringMetadata(source, 'project_name') ?? 'local'}`,
    `- Path: ${source.canonical_ref}`,
    `- 来源指纹: ${source.fingerprint.value}`,
    `- 证据入口: ${projection.selector.source_id} / ${projection.selector.kind} / ${projection.selector.content_view}`,
    '',
    '## 会话摘要',
    '',
    payload?.summary ?? source.summary ?? '尚未生成会话摘要。',
    '',
    '## 开放回路',
    '',
    ...(loops.length ? loops.slice(0, 8).map((loop) => `- ${loop.title}`) : ['- 暂无']),
    '',
    '## 下一步',
    '',
    ...(actions.length ? actions.slice(0, 8).map((action) => `- ${action}`) : ['- 暂无']),
    '',
    '## 安全投影摘录',
    '',
    '```text',
    safeFenceText(projection.text.slice(0, 8000) || '没有可用安全投影。'),
    '```'
  ];
  return `${lines.join('\n')}\n`;
}

function externalSessionSystemTurn(source: EvidenceSource, projection: SessionProjection): string {
  return [
    '这条 Orbit 会话由本地 AI 历史会话转入，用于浏览、继续整理和后续上下文召回。',
    '',
    `来源 ID: ${source.id}`,
    `Agent: ${stringMetadata(source, 'agent') ?? 'local-agent'}`,
    `Project: ${stringMetadata(source, 'project_name') ?? 'local'}`,
    `Path: ${source.canonical_ref}`,
    `来源指纹: ${source.fingerprint.value}`,
    `证据入口: ${projection.selector.source_id} / ${projection.selector.kind} / ${projection.selector.content_view}`
  ].join('\n');
}

function externalSessionConversationTurn(
  source: EvidenceSource,
  projection: SessionProjection,
  artifact?: SynthesisArtifact<ExternalSessionDistillPayload>
): string {
  const payload = artifact?.payload;
  return [
    `# ${source.title}`,
    '',
    payload?.summary ? `摘要：${payload.summary}` : '摘要：尚未生成会话摘要。',
    '',
    payload?.open_loops.length
      ? `开放回路：${payload.open_loops.slice(0, 5).map((loop) => loop.title).join('；')}`
      : '开放回路：暂无',
    '',
    payload?.next_actions.length
      ? `下一步：${payload.next_actions.slice(0, 5).join('；')}`
      : '下一步：暂无',
    '',
    '## 安全投影',
    '',
    safeFenceText(projection.text.slice(0, 12000) || '没有可用安全投影。')
  ].join('\n');
}

function safeFenceText(value: string): string {
  return value.replace(/```/g, "'''");
}

function normalizeTag(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-').replace(/^-+|-+$/g, '') || 'local-agent';
}

function stringMetadata(source: EvidenceSource, key: string): string | undefined {
  const value = source.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function entityCandidates(nodes: MemoryNode[]): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const node of nodes) {
    const entities = node.related_entities?.length ? node.related_entities : fallbackEntitiesFromMemory(node);
    for (const entity of entities) {
      const key = normalizeEntityKey(entity);
      if (!key) continue;
      const current = counts.get(key);
      counts.set(key, { label: current?.label ?? entity, count: (current?.count ?? 0) + 1 });
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map((item) => item.label);
}

function fallbackEntitiesFromMemory(node: MemoryNode): string[] {
  return [node.title, ...node.sources.map((source) => source.title ?? source.ref ?? '')]
    .flatMap((value) => value.match(/\b[A-Z][A-Za-z0-9_.:-]{1,40}(?:\s+[A-Z][A-Za-z0-9_.:-]{1,40}){0,2}\b/g) ?? [])
    .filter((value) => value.length > 2);
}

function relatedEntitiesFor(entity: string, graph: MemoryGraph | null): EntityProfilePayload['related_entities'] {
  if (!graph) return [];
  const key = normalizeEntityKey(entity);
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const related = new Map<string, EntityProfilePayload['related_entities'][number]>();
  for (const relation of graph.relations) {
    const from = nodesById.get(relation.from_id);
    const to = nodesById.get(relation.to_id);
    if (!from || !to) continue;
    const fromMatches = memoryMentionsEntity(from, key) || relation.evidence.some((item) => normalizeEntityKey(item) === key);
    const toMatches = memoryMentionsEntity(to, key) || relation.evidence.some((item) => normalizeEntityKey(item) === key);
    const targets = fromMatches ? [to] : toMatches ? [from] : [];
    for (const target of targets) {
      const label = target.related_entities?.find((item) => normalizeEntityKey(item) !== key) ?? target.title;
      const existing = related.get(normalizeEntityKey(label));
      const next = {
        entity: label,
        relation: relation.kind,
        weight: Math.max(existing?.weight ?? 0, relation.strength),
        evidence: []
      };
      related.set(normalizeEntityKey(label), next);
    }
  }
  return Array.from(related.values()).sort((a, b) => b.weight - a.weight).slice(0, 8);
}

function topSourcesForEntity(entity: string, nodes: MemoryNode[]): EntityProfilePayload['top_sources'] {
  const out: EntityProfilePayload['top_sources'] = [];
  const key = normalizeEntityKey(entity);
  for (const node of nodes.filter((item) => memoryMentionsEntity(item, key))) {
    for (const source of node.sources) {
      const selector = evidenceSelectorsFromSource(source)[0];
      if (!selector) continue;
      out.push({
        source_id: selector.source_id,
        title: source.title ?? node.title,
        source_kind: source.kind,
        reason: `supports memory: ${node.title}`,
        evidence: [selector]
      });
    }
  }
  return out.slice(0, 8);
}

function memoryMentionsEntity(node: MemoryNode, normalizedEntity: string): boolean {
  return Boolean(
    node.related_entities?.some((item) => normalizeEntityKey(item) === normalizedEntity) ||
    normalizeEntityKey(node.title).includes(normalizedEntity) ||
    normalizeEntityKey(node.summary).includes(normalizedEntity)
  );
}

function profileHash(entity: string, nodes: MemoryNode[]): string {
  return simpleHash(`${entity}:${nodes.map((node) => `${node.id}:${node.updated_at}:${node.recall_count}`).join('|')}`);
}

function slugKey(value: string): string {
  return normalizeEntityKey(value).replace(/[^a-z0-9\u4e00-\u9fff._:-]+/gu, '_').slice(0, 80) || 'entity';
}

function normalizeEntityKey(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().toLowerCase();
}

function simpleHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(16);
}

function memoryLayerLabel(value: MemoryLayer | 'all'): string {
  const labels: Record<MemoryLayer | 'all', string> = {
    all: '全部',
    semantic: '语义',
    episodic: '情景',
    procedural: '流程'
  };
  return labels[value];
}

function memoryKindLabel(value: MemoryKind | 'all'): string {
  const labels: Record<MemoryKind | 'all', string> = {
    all: '全部',
    interest: '兴趣',
    preference: '偏好',
    pattern: '模式',
    lesson: '经验',
    entity_memory: '实体记忆',
    goal: '目标'
  };
  return labels[value];
}

function memoryStabilityLabel(value: MemoryStability): string {
  const labels: Record<MemoryStability, string> = {
    volatile: '临时',
    stable: '稳定',
    core: '核心'
  };
  return labels[value];
}

function memoryRelationKindLabel(value: MemoryRelationKind): string {
  const labels: Record<MemoryRelationKind, string> = {
    shared_entity: '共享实体',
    shared_source: '共享来源',
    theme_overlap: '主题重叠'
  };
  return labels[value];
}

function memoryBackendLabel(value: MemoryBackendId): string {
  return value === 'hy-memory' ? 'HY Memory' : 'Orbit 记忆';
}

function recallQuerySuggestions(nodes: MemoryNode[]): string[] {
  const sourceBacked = nodes
    .filter((node) => node.sources.length > 0)
    .slice(0, 3)
    .map((node) => `关于${compactTitle(primarySourceLabel(node)).slice(0, 28)}，你记得什么？`);
  return uniqueStrings([
    '我最近在推进什么？',
    ...sourceBacked,
    '哪些事情还没有闭环？',
    '我有哪些长期偏好？'
  ]).slice(0, 5);
}

function humanMemoryTitle(node: MemoryNode): string {
  const source = node.sources[0];
  if (isSourceIndexMemory(node) && source?.title) {
    if (source.kind === 'external_ai_session') return `本地 AI 会话：${compactTitle(source.title)}`;
    return `${sourceKindDisplayName(source.kind)}：${compactTitle(source.title)}`;
  }
  return compactTitle(node.title);
}

function humanMemorySummary(node: MemoryNode): string {
  const marker = '是可引用的真相层来源：';
  const raw = node.summary.includes(marker) ? node.summary.split(marker).at(1) ?? node.summary : node.summary;
  const cleaned = raw
    .replace(/^#+\s*/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (isSourceIndexMemory(node)) {
    return `Orbit 会把这份${sourceKindDisplayName(node.sources[0]?.kind ?? 'raw')}作为背景引用：${truncateText(cleaned, 260)}`;
  }
  return truncateText(cleaned, 320);
}

function primarySourceLabel(node: MemoryNode): string {
  const source = node.sources[0];
  if (!source) return '手动添加';
  return `${sourceKindDisplayName(source.kind)} · ${source.title ?? source.ref ?? '未命名来源'}`;
}

function sourceKindDisplayName(kind: SynthesisSource['kind'] | string): string {
  const labels: Record<string, string> = {
    note: '笔记',
    library: '资料',
    resource: '资源',
    project: '项目',
    area: '领域',
    task: '任务',
    conversation: '对话',
    external_ai_session: '本地 AI 会话',
    kb: '知识库',
    event: '活动',
    raw: '来源'
  };
  return labels[kind] ?? '来源';
}

function isSourceIndexMemory(node: MemoryNode): boolean {
  return node.summary.includes('是可引用的真相层来源') || node.detail?.includes('来源类型：') === true;
}

function compactTitle(value: string): string {
  return truncateText(value.replace(/\s+/gu, ' ').trim(), 96);
}

function truncateText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function stabilityTone(stability: MemoryStability): string {
  if (stability === 'core') return 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300';
  if (stability === 'stable') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
  return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
}

interface SourceStats {
  withSources: number;
  orbitOwned: number;
  externalSessions: number;
  externalFiles: number;
}

function summarize(nodes: MemoryNode[]): { total: number; stable: number; core: number; recalls: number; semantic: number; episodic: number; procedural: number } {
  return {
    total: nodes.length,
    stable: nodes.filter((node) => node.stability === 'stable').length,
    core: nodes.filter((node) => node.stability === 'core').length,
    recalls: nodes.reduce((sum, node) => sum + node.recall_count, 0),
    semantic: nodes.filter((node) => node.layer === 'semantic').length,
    episodic: nodes.filter((node) => node.layer === 'episodic').length,
    procedural: nodes.filter((node) => node.layer === 'procedural').length
  };
}

function summarizeSources(nodes: MemoryNode[]): SourceStats {
  const sourceKinds = nodes.flatMap((node) => node.sources.map((source) => source.kind));
  return {
    withSources: nodes.filter((node) => node.sources.length > 0).length,
    orbitOwned: sourceKinds.filter((kind) => ['note', 'library', 'resource', 'project', 'area', 'conversation', 'task'].includes(kind)).length,
    externalSessions: sourceKinds.filter((kind) => kind === 'external_ai_session').length,
    externalFiles: sourceKinds.filter((kind) => kind === 'raw' || kind === 'kb').length
  };
}
