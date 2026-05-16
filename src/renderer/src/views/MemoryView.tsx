import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { EvidenceReadResult, EvidenceSelector, EvidenceSource, EvidenceSourceKind } from '@shared/evidence';
import { evidenceSourceId, wholeSourceSelector } from '@shared/evidence';
import type { MemoryDigestResult, MemoryGraph, MemoryKind, MemoryLayer, MemoryNode, MemoryRelationKind, MemoryStability } from '@shared/memory';
import { MEMORY_KINDS, MEMORY_LAYERS } from '@shared/memory';
import type { EntityProfilePayload, ExternalSessionDistillPayload, SynthesisArtifact, SynthesisSource } from '@shared/synthesis';

type LoadState = 'loading' | 'success' | 'empty' | 'error';
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

  const load = async (): Promise<void> => {
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
  };

  useEffect(() => {
    void load();
    const off = window.orbit.memory.onEvent(() => void load());
    return off;
  }, [layer, kind]);

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
      onLayerChange={setLayer}
      onKindChange={setKind}
      onReload={() => void load()}
      onCreate={(input) => void createManual(input)}
      onArchive={(id) => void archive(id)}
      onConfirm={(node) => void confirmMemory(node)}
      onDigest={() => void generateDigest()}
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
  onLayerChange(layer: MemoryLayer | 'all'): void;
  onKindChange(kind: MemoryKind | 'all'): void;
  onReload(): void;
  onCreate(input: ManualMemoryDraft): Promise<void> | void;
  onArchive(id: string): void;
  onConfirm(node: MemoryNode): void;
  onDigest(): void;
  onPromote(id: string, target: 'resource' | 'project'): void;
  onFeedback(id: string, helpful: boolean): void;
}): JSX.Element {
  const stats = useMemo(() => summarize(props.nodes), [props.nodes]);
  const [createOpen, setCreateOpen] = useState(false);
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
    <main className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 p-6 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">记忆浏览器</p>
              <h1 className="mt-1 text-2xl font-semibold">透明的长期记忆</h1>
              <p className="mt-2 max-w-3xl text-sm text-neutral-500">
                查看、确认、编辑、归档，并提升从对话和审查中提取的记忆。
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={props.onDigest} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">生成摘要</button>
              <button onClick={() => setCreateOpen(true)} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-950">+ 记忆</button>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Stat label="总数" value={stats.total} />
            <Stat label="稳定" value={stats.stable} />
            <Stat label="核心" value={stats.core} />
            <Stat label="召回" value={stats.recalls} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(['all', ...MEMORY_LAYERS] as const).map((item) => (
              <button
                key={item}
                onClick={() => props.onLayerChange(item)}
                className={`rounded-full border px-3 py-1.5 text-xs ${props.layer === item ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'border-neutral-300 text-neutral-500 dark:border-neutral-700'}`}
              >
                {memoryLayerLabel(item)}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-500">
            <span>语义 {stats.semantic}</span>
            <span>情景 {stats.episodic}</span>
            <span>流程 {stats.procedural}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(['all', ...MEMORY_KINDS] as const).map((item) => (
              <button
                key={item}
                onClick={() => props.onKindChange(item)}
                className={`rounded-full border px-3 py-1.5 text-xs ${props.kind === item ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300' : 'border-neutral-300 text-neutral-500 dark:border-neutral-700'}`}
              >
                {memoryKindLabel(item)}
              </button>
            ))}
          </div>
        </section>

        {createOpen ? (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <form className="grid gap-3" onSubmit={(event) => void submitManual(event)}>
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">创建记忆</h2>
                <p className="mt-1 text-sm text-neutral-500">向透明记忆层添加一条用户确认的偏好、经验、目标或模式。</p>
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
                <button type="submit" disabled={savingManual} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-950">
                  {savingManual ? '创建中...' : '创建记忆'}
                </button>
                <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">取消</button>
              </div>
            </form>
          </section>
        ) : null}

        {props.digest && (
          <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5 text-sm dark:border-violet-900 dark:bg-violet-950/40">
            <strong>记忆摘要已生成</strong>
            <p className="mt-1 text-neutral-600 dark:text-neutral-300">
              {props.digest.artifact.scope_key}: {props.digest.artifact.payload.new_memories.length} 条新增，{props.digest.artifact.payload.reinforced_memories.length} 条已强化。
            </p>
            <p className="mt-2 text-neutral-600 dark:text-neutral-300">
              语义 {props.digest.artifact.payload.layer_counts.semantic.total} · 情景 {props.digest.artifact.payload.layer_counts.episodic.total} · 流程 {props.digest.artifact.payload.layer_counts.procedural.total}
            </p>
          </section>
        )}

        {props.graph ? <MemoryGraphPanel graph={props.graph} /> : null}
        <MemoryAgentSessionsPanel />
        <MemoryEntityProfilesPanel graph={props.graph} nodes={props.nodes} />

        {props.state === 'loading' ? (
          <MemorySkeleton />
        ) : props.state === 'error' ? (
          <StateCard title="记忆加载失败" body={props.error ?? '未知记忆错误。'} actionLabel="重试" onAction={props.onReload} />
        ) : props.state === 'empty' ? (
          <StateCard title="暂无记忆" body="开始一次随处问对话，或手动创建记忆。Orbit 会透明地提取偏好、经验、目标和模式。" actionLabel="创建记忆" onAction={() => setCreateOpen(true)} />
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
      </div>
    </main>
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
      setMessage(`Runtime 会话库加载失败：${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSessions();
  }, []);

  async function syncSessions(): Promise<void> {
    setLoading(true);
    setMessage('同步 Runtime 全量会话库…');
    try {
      await window.orbit.evidence.sync({ includeExternalAISessions: true });
      await loadSessions();
      setMessage('Runtime 全量会话库已同步。');
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
        title: `Runtime 会话：${source.title}`,
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
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">Runtime 会话库</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            {sessions.length} 条 reference-truth 会话 · {Object.keys(artifacts).length} 条会话摘要
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            扫描本机 runtime 自己保存的历史会话，不限于 Orbit 内使用过的会话；原始会话保留为真相源，只在需要时生成摘要、保存为笔记，或转为 Orbit 会话继续整理。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="筛选 agent / project / title"
            className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-sky-900 dark:bg-neutral-950"
          />
          <button
            type="button"
            onClick={() => void syncSessions()}
            disabled={loading}
            className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm text-sky-700 disabled:opacity-60 dark:border-sky-900 dark:bg-neutral-950 dark:text-sky-300"
          >
            {loading ? '同步中' : '同步会话'}
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
            还没有匹配的 Runtime 历史会话。先在设置里的「记忆源」启用并同步，或调整筛选条件。
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
  const tone =
    props.node.stability === 'core'
      ? 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300'
      : props.node.stability === 'stable'
        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
        : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300';
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap gap-2">
        <span className={`rounded-full border px-2 py-1 text-xs ${tone}`}>{memoryStabilityLabel(props.node.stability)}</span>
        <span className="rounded-full border border-emerald-300 px-2 py-1 text-xs text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">{memoryLayerLabel(props.node.layer)}</span>
        <span className="rounded-full border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700">{memoryKindLabel(props.node.kind)}</span>
        <span className="rounded-full border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700">置信度 {props.node.confidence.toFixed(2)}</span>
      </div>
      <h2 className="mt-3 text-lg font-semibold">{props.node.title}</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">{props.node.summary}</p>
      <p className="mt-3 text-xs text-neutral-500">
        证据 {props.node.evidence_count} · 召回 {props.node.recall_count} · 来源 {props.node.sources.length}
      </p>
      <p className="mt-2 text-xs text-neutral-500">
        存在原因：{props.node.sources[0]?.title ?? props.node.sources[0]?.ref ?? '手动记忆'}{props.node.user_confirmed ? ' · 用户已确认' : ''}
      </p>
      {selectors.length ? (
        <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">来源证据</h3>
            <span className="text-xs text-neutral-500">{selectors.length} 条</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selectors.slice(0, 5).map((selector) => (
              <MemoryEvidenceButton key={memoryEvidenceSelectorKey(selector)} selector={selector} />
            ))}
          </div>
        </section>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-neutral-300 p-3 text-xs text-neutral-500 dark:border-neutral-700">
          这条记忆还没有可下钻的 evidence selector；它可能来自手动创建或旧版 synthesis source。
        </p>
      )}
      {props.node.related_entities?.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {props.node.related_entities.slice(0, 6).map((entity) => (
            <span key={entity} className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] text-neutral-500 dark:bg-neutral-800">
              {entity}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => props.onConfirm(props.node)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">确认</button>
        <button onClick={() => props.onFeedback(props.node.id, true)} className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">有帮助</button>
        <button onClick={() => props.onFeedback(props.node.id, false)} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs text-amber-700 dark:border-amber-900 dark:text-amber-300">不相关</button>
        <button onClick={() => props.onPromote(props.node.id, 'resource')} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">提升为 Resource</button>
        <button onClick={() => props.onPromote(props.node.id, 'project')} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">提升为 Project</button>
        <button onClick={() => props.onArchive(props.node.id)} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600 dark:border-red-900 dark:text-red-300">归档</button>
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

function Stat({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function MemorySkeleton(): JSX.Element {
  return <div className="h-40 animate-pulse rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />;
}

function StateCard(props: { title: string; body: string; actionLabel: string; onAction(): void }): JSX.Element {
  return (
    <section className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center dark:border-neutral-700 dark:bg-neutral-900">
      <h2 className="text-lg font-semibold">{props.title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-neutral-500">{props.body}</p>
      <button onClick={props.onAction} className="mt-4 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">{props.actionLabel}</button>
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
    `# Runtime 会话：${source.title}`,
    '',
    '> 这是一条从 Runtime 历史会话安全投影保存的 Orbit Note。原始会话仍作为 reference-truth evidence 保留，可按证据入口继续读取。',
    '',
    '## 来源',
    '',
    `- Source ID: ${source.id}`,
    `- Agent: ${stringMetadata(source, 'agent') ?? 'local-agent'}`,
    `- Project: ${stringMetadata(source, 'project_name') ?? 'local'}`,
    `- Path: ${source.canonical_ref}`,
    `- Source hash: ${source.fingerprint.value}`,
    `- Evidence selector: ${projection.selector.source_id} / ${projection.selector.kind} / ${projection.selector.content_view}`,
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
    '这条 Orbit Conversation 由 Runtime 历史会话主动转入，用于浏览、继续整理和后续上下文召回。',
    '',
    `Source ID: ${source.id}`,
    `Agent: ${stringMetadata(source, 'agent') ?? 'local-agent'}`,
    `Project: ${stringMetadata(source, 'project_name') ?? 'local'}`,
    `Path: ${source.canonical_ref}`,
    `Source hash: ${source.fingerprint.value}`,
    `Evidence selector: ${projection.selector.source_id} / ${projection.selector.kind} / ${projection.selector.content_view}`
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
