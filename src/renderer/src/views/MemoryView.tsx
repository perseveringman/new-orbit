import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { EvidenceReadResult, EvidenceSelector, EvidenceSourceKind } from '@shared/evidence';
import { evidenceSourceId } from '@shared/evidence';
import type { MemoryDigestResult, MemoryGraph, MemoryKind, MemoryLayer, MemoryNode } from '@shared/memory';
import { MEMORY_KINDS, MEMORY_LAYERS } from '@shared/memory';
import type { SynthesisSource } from '@shared/synthesis';

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
    if (!window.confirm('Archive this memory?')) return;
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
      setManualError('Title and summary are required.');
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
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Memory Explorer</p>
              <h1 className="mt-1 text-2xl font-semibold">Transparent long-term memory</h1>
              <p className="mt-2 max-w-3xl text-sm text-neutral-500">
                Review, confirm, edit, archive, and promote memories extracted from conversations and reviews.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={props.onDigest} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">Generate digest</button>
              <button onClick={() => setCreateOpen(true)} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-950">+ Memory</button>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Stat label="Total" value={stats.total} />
            <Stat label="Stable" value={stats.stable} />
            <Stat label="Core" value={stats.core} />
            <Stat label="Recalls" value={stats.recalls} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(['all', ...MEMORY_LAYERS] as const).map((item) => (
              <button
                key={item}
                onClick={() => props.onLayerChange(item)}
                className={`rounded-full border px-3 py-1.5 text-xs ${props.layer === item ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'border-neutral-300 text-neutral-500 dark:border-neutral-700'}`}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-500">
            <span>semantic {stats.semantic}</span>
            <span>episodic {stats.episodic}</span>
            <span>procedural {stats.procedural}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(['all', ...MEMORY_KINDS] as const).map((item) => (
              <button
                key={item}
                onClick={() => props.onKindChange(item)}
                className={`rounded-full border px-3 py-1.5 text-xs ${props.kind === item ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300' : 'border-neutral-300 text-neutral-500 dark:border-neutral-700'}`}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        {createOpen ? (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <form className="grid gap-3" onSubmit={(event) => void submitManual(event)}>
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Create memory</h2>
                <p className="mt-1 text-sm text-neutral-500">Add a user-confirmed preference, lesson, goal, or pattern to the transparent memory layer.</p>
              </div>
              <label className="grid gap-1 text-sm font-medium">
                Title
                <input
                  value={manualTitle}
                  onChange={(event) => setManualTitle(event.currentTarget.value)}
                  placeholder="e.g. Read source first"
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-950"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Summary
                <textarea
                  value={manualSummary}
                  onChange={(event) => setManualSummary(event.currentTarget.value)}
                  placeholder="Describe what Orbit should remember and why it matters."
                  rows={3}
                  className="resize-none rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-950"
                />
              </label>
              {manualError ? <p className="text-sm text-red-600 dark:text-red-300">{manualError}</p> : null}
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={savingManual} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-950">
                  {savingManual ? 'Creating...' : 'Create memory'}
                </button>
                <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">Cancel</button>
              </div>
            </form>
          </section>
        ) : null}

        {props.digest && (
          <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5 text-sm dark:border-violet-900 dark:bg-violet-950/40">
            <strong>Memory digest generated</strong>
            <p className="mt-1 text-neutral-600 dark:text-neutral-300">
              {props.digest.artifact.scope_key}: {props.digest.artifact.payload.new_memories.length} new, {props.digest.artifact.payload.reinforced_memories.length} reinforced.
            </p>
            <p className="mt-2 text-neutral-600 dark:text-neutral-300">
              semantic {props.digest.artifact.payload.layer_counts.semantic.total} · episodic {props.digest.artifact.payload.layer_counts.episodic.total} · procedural {props.digest.artifact.payload.layer_counts.procedural.total}
            </p>
          </section>
        )}

        {props.graph ? <MemoryGraphPanel graph={props.graph} /> : null}

        {props.state === 'loading' ? (
          <MemorySkeleton />
        ) : props.state === 'error' ? (
          <StateCard title="Memory failed to load" body={props.error ?? 'Unknown memory error.'} actionLabel="Retry" onAction={props.onReload} />
        ) : props.state === 'empty' ? (
          <StateCard title="No memories yet" body="Start an Ask-Anywhere conversation or create a memory manually. Orbit will extract preferences, lessons, goals, and patterns transparently." actionLabel="Create memory" onAction={() => setCreateOpen(true)} />
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

function MemoryGraphPanel({ graph }: { graph: MemoryGraph }): JSX.Element {
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Memory graph</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            {graph.nodes.length} node(s), {graph.relations.length} relation(s)
          </p>
        </div>
        <span className="text-xs text-neutral-500">generated {graph.generated_at.slice(0, 10)}</span>
      </div>
      {graph.relations.length ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {graph.relations.slice(0, 6).map((relation) => (
            <div key={relation.id} className="rounded-xl border border-emerald-200 bg-white p-3 text-sm dark:border-emerald-900 dark:bg-neutral-900">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{relation.kind}</span>
                <span className="text-xs text-neutral-500">strength {relation.strength.toFixed(2)}</span>
              </div>
              <p className="mt-2 text-neutral-700 dark:text-neutral-200">{relation.label}</p>
              <p className="mt-1 text-xs text-neutral-500">{relation.evidence.slice(0, 4).join(' · ')}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-500">No memory relations yet. Shared entities, sources, and overlapping themes will appear here.</p>
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
        <span className={`rounded-full border px-2 py-1 text-xs ${tone}`}>{props.node.stability}</span>
        <span className="rounded-full border border-emerald-300 px-2 py-1 text-xs text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">{props.node.layer}</span>
        <span className="rounded-full border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700">{props.node.kind}</span>
        <span className="rounded-full border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700">confidence {props.node.confidence.toFixed(2)}</span>
      </div>
      <h2 className="mt-3 text-lg font-semibold">{props.node.title}</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">{props.node.summary}</p>
      <p className="mt-3 text-xs text-neutral-500">
        evidence {props.node.evidence_count} · recalls {props.node.recall_count} · sources {props.node.sources.length}
      </p>
      <p className="mt-2 text-xs text-neutral-500">
        Why it exists: {props.node.sources[0]?.title ?? props.node.sources[0]?.ref ?? 'manual memory'}{props.node.user_confirmed ? ' · user confirmed' : ''}
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
        <button onClick={() => props.onConfirm(props.node)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">Confirm</button>
        <button onClick={() => props.onFeedback(props.node.id, true)} className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">有帮助</button>
        <button onClick={() => props.onFeedback(props.node.id, false)} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs text-amber-700 dark:border-amber-900 dark:text-amber-300">不相关</button>
        <button onClick={() => props.onPromote(props.node.id, 'resource')} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">Promote to Resource</button>
        <button onClick={() => props.onPromote(props.node.id, 'project')} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">Promote to Project</button>
        <button onClick={() => props.onArchive(props.node.id)} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600 dark:border-red-900 dark:text-red-300">Archive</button>
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
