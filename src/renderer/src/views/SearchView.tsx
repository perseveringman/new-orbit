import { useEffect, useMemo, useState } from 'react';
import type { MemoryNode, MemoryRecallMatch, RecallResult } from '@shared/memory';
import type { IndexableEntityKind, SearchAnswerResponse, SearchMatchMode, SearchQuery, SearchResult, SemanticIndexStatus } from '@shared/semantic';
import { INDEXABLE_ENTITY_KINDS } from '@shared/semantic';
import { usePara } from '../store/para';

type SearchState = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export function SearchView(): JSX.Element {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<SearchMatchMode>('hybrid');
  const [kind, setKind] = useState<string>('all');
  const [layer, setLayer] = useState<string>('all');
  const [area, setArea] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState<SemanticIndexStatus | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [memoryRecall, setMemoryRecall] = useState<RecallResult | null>(null);
  const [answer, setAnswer] = useState<SearchAnswerResponse['answer'] | null>(null);
  const [state, setState] = useState<SearchState>('idle');
  const [error, setError] = useState<string | null>(null);
  const setView = usePara((store) => store.setView);

  const query = useMemo<SearchQuery>(
    () => ({
      text,
      match_mode: mode,
      top_k: 20,
      ...(kind === 'all' ? {} : { entity_kinds: [kind as IndexableEntityKind] }),
      ...(layer === 'all' ? {} : { layers: [Number(layer) as 1 | 2] }),
      ...(area.trim() ? { areas: [area.trim()] } : {}),
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {})
    }),
    [area, dateFrom, dateTo, kind, layer, mode, text]
  );

  useEffect(() => {
    let cancelled = false;
    void window.orbit.semantic.indexStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    const off = window.orbit.semantic.onEvent((event) => {
      if (event.status) setStatus(event.status);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void runSearch(query, setState, setError, setResults, setMemoryRecall, setAnswer, cancelled);
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  async function rebuild(): Promise<void> {
    setState('loading');
    setError(null);
    try {
      const next = await window.orbit.semantic.rebuildIndex();
      setStatus(next);
      await runSearch(query, setState, setError, setResults, setMemoryRecall, setAnswer, false);
    } catch (err) {
      setError((err as Error).message);
      setState('error');
    }
  }

  async function answerAcrossResults(): Promise<void> {
    if (!results.length) return;
    setState('loading');
    setError(null);
    try {
      const response = await window.orbit.semantic.searchAndAnswer(query);
      setResults(response.results);
      setAnswer(response.answer ?? null);
      setState(response.results.length ? 'success' : 'empty');
    } catch (err) {
      setError((err as Error).message);
      setState('error');
    }
  }

  async function askAcrossResults(): Promise<void> {
    if (!results.length && !memoryRecall?.memories.length) return;
    const now = new Date().toISOString();
    const conversation = await window.orbit.chat.createConversation({
      anchor: { kind: 'ask_anywhere_session', refId: `search:${now}`, addedAt: now },
      scope: { kind: 'global' },
      title: `Ask across search: ${query.text || 'all results'}`
    });
    await window.orbit.chat.appendTurn({
      conversationId: conversation.id,
      role: 'user',
      content: `Use these Orbit search results and recalled memories as context:\n\n${[
        results.slice(0, 8).map(formatResultForPrompt).join('\n\n'),
        memoryRecall?.memories.slice(0, 5).map((memory) => formatMemoryForPrompt(memory, memoryRecall.matches.find((match) => match.memory_id === memory.id))).join('\n\n')
      ].filter(Boolean).join('\n\n')}\n\nQuestion: ${query.text || 'What should I notice?'}`,
      artifactRefs: answer ? [answer.id] : undefined
    });
    setView({ kind: 'askAnywhere', activeId: conversation.id });
  }

  async function markMemory(id: string, helpful: boolean): Promise<void> {
    const updated = await window.orbit.memory.feedback(id, helpful);
    setMemoryRecall((current) =>
      current
        ? {
            ...current,
            memories: current.memories.map((memory) => (memory.id === updated.id ? updated : memory))
          }
        : current
    );
  }

  return (
    <SearchContent
      text={text}
      mode={mode}
      kind={kind}
      layer={layer}
      area={area}
      dateFrom={dateFrom}
      dateTo={dateTo}
      status={status}
      results={results}
      memoryRecall={memoryRecall}
      answer={answer}
      state={state}
      error={error}
      setText={setText}
      setMode={setMode}
      setKind={setKind}
      setLayer={setLayer}
      setArea={setArea}
      setDateFrom={setDateFrom}
      setDateTo={setDateTo}
      onRebuild={() => void rebuild()}
      onAnswer={() => void answerAcrossResults()}
      onAsk={() => void askAcrossResults()}
      onMemoryFeedback={(id, helpful) => void markMemory(id, helpful)}
    />
  );
}

export function SearchContent(props: {
  text: string;
  mode: SearchMatchMode;
  kind: string;
  layer: string;
  area: string;
  dateFrom: string;
  dateTo: string;
  status: SemanticIndexStatus | null;
  results: SearchResult[];
  memoryRecall: RecallResult | null;
  answer: SearchAnswerResponse['answer'] | null;
  state: SearchState;
  error: string | null;
  setText(value: string): void;
  setMode(value: SearchMatchMode): void;
  setKind(value: string): void;
  setLayer(value: string): void;
  setArea(value: string): void;
  setDateFrom(value: string): void;
  setDateTo(value: string): void;
  onRebuild(): void;
  onAnswer(): void;
  onAsk(): void;
  onMemoryFeedback(id: string, helpful: boolean): void;
}): JSX.Element {
  const stale = (props.status?.stale_docs ?? 0) > 0;
  const memoryCount = props.memoryRecall?.memories.length ?? 0;
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 p-6 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Semantic Search</p>
              <h1 className="mt-1 text-2xl font-semibold">Search across Orbit truth and synthesis</h1>
              <p className="mt-2 text-sm text-neutral-500">
                Natural-language search over Notes, Library, Resources, Projects, Areas, Conversations, KB docs, and Layer 2 artifacts.
              </p>
            </div>
            <IndexStatusBadge status={props.status} stale={stale} onRebuild={props.onRebuild} />
          </div>

          <label className="mt-5 block text-sm font-medium" htmlFor="semantic-search-input">
            Search query
          </label>
          <input
            id="semantic-search-input"
            value={props.text}
            onChange={(event) => props.setText(event.currentTarget.value)}
            placeholder="e.g. decisions about local-first memory or resource health"
            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-neutral-700 dark:bg-neutral-950"
          />

          <div className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Select label="Mode" value={props.mode} onChange={(value) => props.setMode(value as SearchMatchMode)} options={['hybrid', 'semantic', 'keyword']} />
            <Select label="Entity" value={props.kind} onChange={props.setKind} options={['all', ...INDEXABLE_ENTITY_KINDS]} />
            <Select label="Layer" value={props.layer} onChange={props.setLayer} options={['all', '1', '2']} />
            <FilterInput label="Area" value={props.area} onChange={props.setArea} placeholder="area slug" />
            <FilterInput label="From" value={props.dateFrom} onChange={props.setDateFrom} placeholder="YYYY-MM-DD" />
            <FilterInput label="To" value={props.dateTo} onChange={props.setDateTo} placeholder="YYYY-MM-DD" />
          </div>
        </section>

        {props.answer && (
          <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-900 dark:bg-sky-950/40">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">AI synthesis answer</h2>
              <span className="rounded-full border border-sky-300 px-2 py-1 text-xs text-sky-700 dark:border-sky-700 dark:text-sky-300">
                {props.answer.status}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6">{String((props.answer.payload as { answer?: string })?.answer ?? 'No answer generated.')}</p>
            <p className="mt-3 text-xs text-neutral-500">Provenance: {props.answer.provenance.runtime} / {props.answer.provenance.prompt_version}</p>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-500">{props.results.length} result(s) · {memoryCount} memory hit(s)</p>
          <div className="flex gap-2">
            <button onClick={props.onAnswer} disabled={!props.results.length} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-neutral-700">
              Generate answer
            </button>
            <button onClick={props.onAsk} disabled={!props.results.length && !memoryCount} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-950">
              Ask across results
            </button>
          </div>
        </div>

        {props.memoryRecall?.memories.length ? (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Recalled memory</h2>
              <span className="text-xs text-emerald-700 dark:text-emerald-300">{props.memoryRecall.explanation}</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {props.memoryRecall.memories.map((memory) => (
                <SearchMemoryCard
                  key={memory.id}
                  memory={memory}
                  match={props.memoryRecall?.matches.find((item) => item.memory_id === memory.id)}
                  onFeedback={props.onMemoryFeedback}
                />
              ))}
            </div>
          </section>
        ) : null}

        {props.state === 'loading' ? (
          <SearchSkeleton />
        ) : props.state === 'error' ? (
          <StateCard title="Search failed" body={props.error ?? 'Unknown semantic search error.'} actionLabel="Rebuild index" onAction={props.onRebuild} />
        ) : props.state === 'empty' ? (
          <StateCard title="No matching documents yet" body="Try a broader query, rebuild the index, or create Notes/Library/Resources so Orbit has Layer 1 truth to search." actionLabel="Rebuild index" onAction={props.onRebuild} />
        ) : props.results.length ? (
          <section className="grid gap-3">
            {props.results.map((result) => <ResultCard key={result.doc.id} result={result} />)}
          </section>
        ) : (
          <StateCard title="Search your Orbit vault" body="Type a natural-language query to find truth records and synthesis artifacts. Feed items only appear after Save to Library promotion." actionLabel="Rebuild index" onAction={props.onRebuild} />
        )}
      </div>
    </main>
  );
}

async function runSearch(
  query: SearchQuery,
  setState: (state: SearchState) => void,
  setError: (error: string | null) => void,
  setResults: (results: SearchResult[]) => void,
  setMemoryRecall: (result: RecallResult | null) => void,
  setAnswer: (answer: SearchAnswerResponse['answer'] | null) => void,
  cancelled: boolean
): Promise<void> {
  if (cancelled) return;
  setState('loading');
  setError(null);
  try {
    const [response, recall] = await Promise.all([
      window.orbit.semantic.search(query),
      query.text.trim()
        ? window.orbit.memory.recall(query.text, {
            max_memories: 5,
            min_confidence: 0.45,
            triggered_by: { kind: 'search', ref: query.text.slice(0, 120) },
            used_in: 'question_answer'
          }).catch(() => null)
        : Promise.resolve(null)
    ]);
    if (cancelled) return;
    setResults(response.results);
    setMemoryRecall(recall);
    setAnswer(null);
    setState(response.results.length || recall?.memories.length ? 'success' : 'empty');
  } catch (err) {
    if (cancelled) return;
    setError((err as Error).message);
    setMemoryRecall(null);
    setState('error');
  }
}

function FilterInput(props: { label: string; value: string; placeholder: string; onChange(value: string): void }): JSX.Element {
  return (
    <label className="text-xs font-medium text-neutral-500">
      {props.label}
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        placeholder={props.placeholder}
        className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
      />
    </label>
  );
}

function Select(props: { label: string; value: string; options: readonly string[]; onChange(value: string): void }): JSX.Element {
  return (
    <label className="text-xs font-medium text-neutral-500">
      {props.label}
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
      >
        {props.options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function IndexStatusBadge(props: { status: SemanticIndexStatus | null; stale: boolean; onRebuild(): void }): JSX.Element {
  if (!props.status) return <span className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-500">Index unknown</span>;
  return (
    <div className="flex items-center gap-2">
      <span className={`rounded-full border px-3 py-1 text-xs ${props.stale ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300' : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
        {props.stale ? 'Stale' : 'Fresh'} · {props.status.indexed_docs}/{props.status.total_docs}
      </span>
      {props.stale && <button onClick={props.onRebuild} className="rounded-lg border border-amber-300 px-2 py-1 text-xs text-amber-700 dark:border-amber-800 dark:text-amber-300">Refresh</button>}
    </div>
  );
}

function SearchSkeleton(): JSX.Element {
  return (
    <section className="grid gap-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-28 animate-pulse rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
      ))}
    </section>
  );
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

function ResultCard({ result }: { result: SearchResult }): JSX.Element {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700">{result.entity_label}</span>
        <span className="rounded-full border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700">{result.match_type}</span>
        <span className="rounded-full border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700">{result.score.toFixed(2)}</span>
        <span className={result.doc.layer === 2 ? 'rounded-full bg-sky-100 px-2 py-1 text-xs text-sky-700 dark:bg-sky-950 dark:text-sky-300' : 'rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}>
          Layer {result.doc.layer}
        </span>
      </div>
      <h3 className="mt-3 text-lg font-semibold">{result.doc.title}</h3>
      <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">{result.snippets?.[0] ?? result.doc.content.slice(0, 220)}</p>
      <p className="mt-3 text-xs text-neutral-500">{result.why} · updated {result.doc.updated_at.slice(0, 10)}</p>
    </article>
  );
}

function SearchMemoryCard(props: {
  memory: MemoryNode;
  match?: MemoryRecallMatch;
  onFeedback(id: string, helpful: boolean): void;
}): JSX.Element {
  return (
    <article className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm dark:border-emerald-900 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{props.memory.layer}</span>
        <span className="rounded-full border border-emerald-300 px-2 py-1 text-xs text-emerald-700 dark:border-emerald-800 dark:text-emerald-300">{props.memory.kind}</span>
        {props.match ? <span className="rounded-full border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700">score {props.match.score.toFixed(2)}</span> : null}
      </div>
      <h3 className="mt-3 text-sm font-semibold">{props.memory.title}</h3>
      <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">{props.memory.summary}</p>
      <p className="mt-3 text-xs text-neutral-500">
        {props.match?.reasons.slice(0, 2).join(' · ') ?? 'recalled from memory'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => props.onFeedback(props.memory.id, true)} className="rounded-lg border border-emerald-300 px-2 py-1 text-xs text-emerald-700 dark:border-emerald-800 dark:text-emerald-300">Helpful</button>
        <button onClick={() => props.onFeedback(props.memory.id, false)} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700">Not relevant</button>
      </div>
    </article>
  );
}

function formatResultForPrompt(result: SearchResult): string {
  return `- ${result.doc.title} (${result.entity_label}, score ${result.score}): ${result.snippets?.[0] ?? result.doc.content.slice(0, 300)}`;
}

function formatMemoryForPrompt(memory: MemoryNode, match?: MemoryRecallMatch): string {
  return `- Memory [${memory.layer}/${memory.kind}] ${memory.title}: ${memory.summary}${match ? `\n  Why recalled: ${match.reasons.join('; ')}` : ''}`;
}
