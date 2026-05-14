import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Ban,
  BookmarkPlus,
  Check,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Inbox,
  Languages,
  Library,
  PlayCircle,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Trash2
} from 'lucide-react';
import type {
  FeedClusterPayload,
  FeedDigestPayload,
  FeedFetchRun,
  FeedItem,
  FeedItemContent,
  FeedItemAnalysisPayload,
  FeedItemStatus,
  FeedItemTranslationPayload,
  FeedReportPayload,
  FeedSource
} from '@shared/feed';
import type { SynthesisArtifact } from '@shared/synthesis';

const STATUSES: Array<FeedItemStatus | 'all'> = ['all', 'new', 'seen', 'saved', 'ignored', 'expired'];
const INSPECTOR_TABS = ['overview', 'content', 'analysis', 'provenance'] as const;
type InspectorTab = (typeof INSPECTOR_TABS)[number];

type FeedSynthesisArtifact =
  | SynthesisArtifact<FeedDigestPayload>
  | SynthesisArtifact<FeedClusterPayload>
  | SynthesisArtifact<FeedReportPayload>;

type EnrichmentArtifact =
  | SynthesisArtifact<FeedItemAnalysisPayload>
  | SynthesisArtifact<FeedItemTranslationPayload>
  | SynthesisArtifact<unknown>;

export function FeedView(): JSX.Element {
  const [sources, setSources] = useState<FeedSource[]>([]);
  const [allItems, setAllItems] = useState<FeedItem[]>([]);
  const [runs, setRuns] = useState<FeedFetchRun[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [status, setStatus] = useState<FeedItemStatus | 'all'>('new');
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [sourceKind, setSourceKind] = useState<FeedSource['kind']>('rss');
  const [youtubeBackfill, setYoutubeBackfill] = useState<'recent' | 'full'>('recent');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [digest, setDigest] = useState<SynthesisArtifact<FeedDigestPayload> | null>(null);
  const [cluster, setCluster] = useState<SynthesisArtifact<FeedClusterPayload> | null>(null);
  const [report, setReport] = useState<SynthesisArtifact<FeedReportPayload> | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview');
  const [enrichments, setEnrichments] = useState<EnrichmentArtifact[]>([]);

  const sourceById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);
  const activeSource = activeSourceId ? sourceById.get(activeSourceId) ?? null : null;
  const latestRunBySource = useMemo(() => {
    const map = new Map<string, FeedFetchRun>();
    for (const run of runs) {
      if (!map.has(run.source_id)) map.set(run.source_id, run);
    }
    return map;
  }, [runs]);
  const runningRuns = useMemo(() => runs.filter((run) => run.status === 'running'), [runs]);
  const activeRun = activeSourceId ? latestRunBySource.get(activeSourceId) ?? null : runningRuns[0] ?? null;
  const activeRunningRun = activeRun?.status === 'running' ? activeRun : null;
  const operationBusy = busy || runningRuns.length > 0;

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allItems
      .filter((item) => !activeSourceId || item.source_id === activeSourceId)
      .filter((item) => status === 'all' || item.status === status)
      .filter((item) => {
        if (!normalizedQuery) return true;
        return `${item.title} ${item.summary ?? ''} ${item.excerpt ?? ''} ${item.url}`.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => (b.published_at ?? b.fetched_at).localeCompare(a.published_at ?? a.fetched_at));
  }, [activeSourceId, allItems, query, status]);

  const activeItem = useMemo(() => {
    if (activeItemId) {
      const found = allItems.find((item) => item.id === activeItemId);
      if (found && filteredItems.some((item) => item.id === found.id)) return found;
    }
    return filteredItems[0] ?? null;
  }, [activeItemId, allItems, filteredItems]);

  const todayKey = localDateKey(new Date());

  const metrics = useMemo(() => {
    const scopedItems = allItems.filter((item) => !activeSourceId || item.source_id === activeSourceId);
    const byStatus = new Map<FeedItemStatus, number>();
    for (const item of scopedItems) byStatus.set(item.status, (byStatus.get(item.status) ?? 0) + 1);
    const today = scopedItems.filter((item) => item.fetched_at.startsWith(todayKey)).length;
    const failedSources = sources.filter((source) => source.last_fetch_error && !isTranscriptExtractionWarning(source.last_fetch_error)).length;
    return {
      scopedItems,
      byStatus,
      today,
      failedSources,
      saved: byStatus.get('saved') ?? 0,
      newItems: byStatus.get('new') ?? 0
    };
  }, [activeSourceId, allItems, sources, todayKey]);

  const sourceCounts = useMemo(() => {
    const map = new Map<string, { total: number; today: number; newItems: number; saved: number }>();
    for (const item of allItems) {
      const current = map.get(item.source_id) ?? { total: 0, today: 0, newItems: 0, saved: 0 };
      current.total += 1;
      if (item.fetched_at.startsWith(todayKey)) current.today += 1;
      if (item.status === 'new') current.newItems += 1;
      if (item.status === 'saved') current.saved += 1;
      map.set(item.source_id, current);
    }
    return map;
  }, [allItems, todayKey]);

  async function reload(nextActiveItemId = activeItemId): Promise<void> {
    try {
      setError(null);
      const [nextSources, nextItems, nextRuns] = await Promise.all([
        window.orbit.feeds.listSources(),
        window.orbit.feeds.listItems({ include_ignored: true, include_saved: true }),
        window.orbit.feeds.listRuns()
      ]);
      setSources(nextSources);
      setAllItems(nextItems);
      setRuns(nextRuns);
      if (nextActiveItemId && nextItems.some((item) => item.id === nextActiveItemId)) {
        setActiveItemId(nextActiveItemId);
      } else {
        setActiveItemId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feed data.');
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (runningRuns.length === 0) return;
    const timer = window.setInterval(() => {
      void reload(activeItemId);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [activeItemId, runningRuns.length]);

  useEffect(() => {
    if (!activeItemId || allItems.some((item) => item.id === activeItemId)) return;
    setActiveItemId(filteredItems[0]?.id ?? null);
  }, [activeItemId, allItems, filteredItems]);

  useEffect(() => {
    const ids = activeItem?.enrichment_artifact_ids ?? [];
    if (ids.length === 0) {
      setEnrichments([]);
      return;
    }
    let cancelled = false;
    void Promise.all(ids.map((id) => window.orbit.synthesis.getArtifact(id))).then((artifacts) => {
      if (!cancelled) setEnrichments(artifacts.filter(Boolean) as EnrichmentArtifact[]);
    });
    return () => {
      cancelled = true;
    };
  }, [activeItem?.id, activeItem?.enrichment_artifact_ids?.join('|')]);

  async function addSource(): Promise<void> {
    if (!url.trim()) return;
    const nextKind = looksLikeYouTubeSource(url) ? 'youtube' : sourceKind;
    setBusy(true);
    setMessage(null);
    try {
      const source = await window.orbit.feeds.createSource({
        url: url.trim(),
        title: title.trim() || undefined,
        kind: nextKind,
        ...(nextKind === 'youtube'
          ? {
              fetch_policy: {
                interval_minutes: 1440,
                max_items_per_fetch: 20,
                initial_backfill: youtubeBackfill,
                initial_backfill_count: 20,
                respect_cache: true
              }
            }
          : {})
      });
      setUrl('');
      setTitle('');
      setActiveSourceId(source.id);
      await reload(null);
      setMessage(
        source.kind === 'youtube'
          ? `Added ${source.title}. Fetching ${source.fetch_policy?.initial_backfill === 'full' ? 'full channel' : 'latest 20'} now.`
          : `Added ${source.title}. Fetching now.`
      );
      window.setTimeout(() => void reload(null), 400);
      const result = await window.orbit.feeds.fetch(source.id);
      const created = result.reduce((sum, item) => sum + item.created, 0);
      await reload(null);
      setMessage(`Added ${source.title} and fetched ${created} new item(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add source.');
    } finally {
      setBusy(false);
    }
  }

  async function refresh(sourceId?: string): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      window.setTimeout(() => void reload(activeItemId), 400);
      const result = await window.orbit.feeds.fetch(sourceId);
      const created = result.reduce((sum, item) => sum + item.created, 0);
      await reload();
      setMessage(`Fetched ${created} new item(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh feeds.');
    } finally {
      setBusy(false);
    }
  }

  async function save(item: FeedItem): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.orbit.feeds.saveToLibrary(item.id);
      await reload(item.id);
      setMessage(`Saved to Library: ${result.library_item.frontmatter.title}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save item.');
    } finally {
      setBusy(false);
    }
  }

  async function markSeen(item: FeedItem): Promise<void> {
    await window.orbit.feeds.markSeen(item.id);
    await reload(item.id);
  }

  async function ignore(item: FeedItem): Promise<void> {
    await window.orbit.feeds.ignore(item.id);
    await reload();
  }

  async function toggleSource(source: FeedSource): Promise<void> {
    await window.orbit.feeds.updateSource(source.id, { enabled: !source.enabled });
    await reload(activeItemId);
  }

  async function deleteSource(source: FeedSource): Promise<void> {
    if (!window.confirm(`Remove feed source "${source.title}"?`)) return;
    await window.orbit.feeds.deleteSource(source.id);
    if (activeSourceId === source.id) setActiveSourceId(null);
    await reload();
  }

  async function runDigest(): Promise<void> {
    setBusy(true);
    try {
      const result = await window.orbit.feeds.digest(todayKey);
      setDigest(result.artifact);
      await reload(activeItemId);
    } finally {
      setBusy(false);
    }
  }

  async function runCluster(): Promise<void> {
    setBusy(true);
    try {
      const result = await window.orbit.feeds.cluster(activeSourceId ?? todayKey);
      setCluster(result.artifact);
      await reload(activeItemId);
    } finally {
      setBusy(false);
    }
  }

  async function runReport(): Promise<void> {
    setBusy(true);
    try {
      const result = await window.orbit.feeds.report(todayKey);
      setReport(result.artifact);
      await reload(activeItemId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Radio size={17} className="text-sky-600 dark:text-sky-400" />
              <h1 className="text-base font-semibold">Feed Signals</h1>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-900">
                Layer 0 until saved
              </span>
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">
              Daily incoming signals for triage, synthesis, and Library promotion.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <IconButton title="Daily digest" onClick={() => void runDigest()} disabled={operationBusy}>
              <FileText size={15} />
              <span>Digest</span>
            </IconButton>
            <IconButton title="Cluster visible signals" onClick={() => void runCluster()} disabled={operationBusy}>
              <Sparkles size={15} />
              <span>Cluster</span>
            </IconButton>
            <IconButton title="Generate daily report" onClick={() => void runReport()} disabled={operationBusy}>
              <Library size={15} />
              <span>Report</span>
            </IconButton>
            <button
              disabled={operationBusy}
              onClick={() => void refresh(activeSourceId ?? undefined)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sky-600 px-3 text-xs font-medium text-white disabled:opacity-50"
            >
              <RefreshCw size={14} className={operationBusy ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-[140px_minmax(180px,1fr)_minmax(260px,1.5fr)_auto]">
          <select
            value={sourceKind}
            onChange={(event) => setSourceKind(event.target.value as FeedSource['kind'])}
            className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <option value="rss">RSS / Atom</option>
            <option value="youtube">YouTube</option>
          </select>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Optional source title"
            className="h-8 rounded-md border border-neutral-200 bg-white px-3 text-xs outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-900"
          />
          <input
            value={url}
            onChange={(event) => {
              const nextUrl = event.target.value;
              setUrl(nextUrl);
              if (looksLikeYouTubeSource(nextUrl)) setSourceKind('youtube');
            }}
            placeholder={sourceKind === 'youtube' ? 'YouTube channel / playlist / @handle / video URL' : 'RSS / Atom URL'}
            className="h-8 rounded-md border border-neutral-200 bg-white px-3 text-xs outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-900"
          />
          <button
            disabled={operationBusy || !url.trim()}
            onClick={() => void addSource()}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 text-xs font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            <Plus size={14} />
            Add source
          </button>
        </div>
        {sourceKind === 'youtube' ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
            <span>YouTube backfill</span>
            <button
              type="button"
              onClick={() => setYoutubeBackfill('recent')}
              className={`h-7 rounded-md border px-2 ${
                youtubeBackfill === 'recent'
                  ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200'
                  : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
              }`}
            >
              Latest 20
            </button>
            <button
              type="button"
              onClick={() => setYoutubeBackfill('full')}
              className={`h-7 rounded-md border px-2 ${
                youtubeBackfill === 'full'
                  ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200'
                  : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
              }`}
            >
              Full channel
            </button>
            <span>Daily refresh still checks the latest 20 for newly published videos.</span>
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <Metric label="Today" value={metrics.today} tone="sky" />
          <Metric label="New" value={metrics.newItems} tone="emerald" />
          <Metric label="Saved" value={metrics.saved} tone="violet" />
          <Metric label="Source issues" value={metrics.failedSources} tone={metrics.failedSources ? 'rose' : 'neutral'} />
        </div>
        {activeRunningRun ? <RunNotice run={activeRunningRun} source={sourceById.get(activeRunningRun.source_id)} /> : null}
        {message ? <Notice tone="sky" message={message} /> : null}
        {error ? <Notice tone="rose" message={error} /> : null}
      </header>

      <div className="grid h-full min-h-0 min-w-0 flex-1 grid-cols-[288px_minmax(0,1fr)_minmax(360px,420px)] overflow-hidden">
        <SourceRail
          sources={sources}
          sourceCounts={sourceCounts}
          latestRunBySource={latestRunBySource}
          activeSourceId={activeSourceId}
          onSelect={(id) => {
            setActiveSourceId(id);
            setActiveItemId(null);
          }}
          onRefresh={(source) => void refresh(source.id)}
          onToggle={(source) => void toggleSource(source)}
          onDelete={(source) => void deleteSource(source)}
          busy={busy}
        />

        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <div className="shrink-0 border-b border-neutral-200 p-3 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search current feed scope"
                  className="h-8 w-full rounded-md border border-neutral-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-900"
                />
              </div>
              <div className="flex shrink-0 gap-1">
                {STATUSES.map((item) => (
                  <button
                    key={item}
                    onClick={() => setStatus(item)}
                    className={`h-8 rounded-md border px-2 text-[11px] ${
                      status === item
                        ? 'border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-100'
                        : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900'
                    }`}
                  >
                    {labelForStatus(item)} {item === 'all' ? metrics.scopedItems.length : metrics.byStatus.get(item) ?? 0}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
              <span>{activeSource ? activeSource.title : 'All sources'} / {filteredItems.length} visible signals</span>
              <span>{digest || cluster || report ? 'Synthesis available' : 'No synthesis generated in this session'}</span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {filteredItems.length === 0 ? (
              <EmptyFeedState activeSource={activeSource} />
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-900">
                {filteredItems.map((item) => (
                  <FeedItemRow
                    key={item.id}
                    item={item}
                    source={sourceById.get(item.source_id)}
                    active={activeItem?.id === item.id}
                    onSelect={() => setActiveItemId(item.id)}
                    onSave={() => void save(item)}
                    onSeen={() => void markSeen(item)}
                    onIgnore={() => void ignore(item)}
                  />
                ))}
              </div>
            )}
          </div>
        </main>

        <Inspector
          item={activeItem}
          source={activeItem ? sourceById.get(activeItem.source_id) : undefined}
          tab={inspectorTab}
          setTab={setInspectorTab}
          enrichments={enrichments}
          digest={digest}
          cluster={cluster}
          report={report}
          busy={busy}
          onSave={(item) => void save(item)}
          onSeen={(item) => void markSeen(item)}
          onIgnore={(item) => void ignore(item)}
          onDigest={() => void runDigest()}
          onCluster={() => void runCluster()}
          onReport={() => void runReport()}
        />
      </div>
    </div>
  );
}

function SourceRail({
  sources,
  sourceCounts,
  latestRunBySource,
  activeSourceId,
  onSelect,
  onRefresh,
  onToggle,
  onDelete,
  busy
}: {
  sources: FeedSource[];
  sourceCounts: Map<string, { total: number; today: number; newItems: number; saved: number }>;
  latestRunBySource: Map<string, FeedFetchRun>;
  activeSourceId: string | null;
  onSelect: (id: string | null) => void;
  onRefresh: (source: FeedSource) => void;
  onToggle: (source: FeedSource) => void;
  onDelete: (source: FeedSource) => void;
  busy: boolean;
}): JSX.Element {
  return (
    <aside className="h-full min-h-0 overflow-y-auto overscroll-contain border-r border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <button
        onClick={() => onSelect(null)}
        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
          activeSourceId === null ? 'bg-white shadow-sm dark:bg-neutral-900' : 'hover:bg-white dark:hover:bg-neutral-900'
        }`}
      >
        <span className="font-medium">All sources</span>
        <Inbox size={15} className="text-neutral-400" />
      </button>
      <div className="mt-3 space-y-2">
        {sources.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 p-3 text-sm text-neutral-500 dark:border-neutral-800">
            Add a source to start the daily signal loop.
          </div>
        ) : null}
        {sources.map((source) => {
          const counts = sourceCounts.get(source.id) ?? { total: 0, today: 0, newItems: 0, saved: 0 };
          const latestRun = latestRunBySource.get(source.id) ?? null;
          const running = latestRun?.status === 'running';
          const stage = currentRunStage(latestRun);
          return (
            <section
              key={source.id}
              className={`rounded-md border p-3 text-sm ${
                activeSourceId === source.id
                  ? 'border-sky-300 bg-white shadow-sm dark:border-sky-800 dark:bg-neutral-900'
                  : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950'
              }`}
            >
              <button onClick={() => onSelect(source.id)} className="w-full text-left">
                <div className="flex items-start gap-2">
                  <span className={`mt-1 h-2 w-2 rounded-full ${source.enabled ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className="min-w-0 flex-1 truncate font-medium">{source.title}</div>
                      <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase text-neutral-500 dark:bg-neutral-900">
                        {source.kind === 'youtube' ? source.metadata?.youtube_source_type ?? 'youtube' : source.kind}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-neutral-500">{source.url}</div>
                  </div>
                </div>
              </button>
              <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[11px]">
                <SmallStat label="Today" value={counts.today} />
                <SmallStat label="New" value={counts.newItems} />
                <SmallStat label="Saved" value={counts.saved} />
              </div>
              {running && latestRun ? (
                <RunInline run={latestRun} stage={stage} />
              ) : source.last_fetch_error && !isTranscriptExtractionWarning(source.last_fetch_error) ? (
                <div className="mt-2 flex gap-1.5 rounded-md bg-rose-50 p-2 text-[11px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
                  <AlertTriangle size={13} className="shrink-0" />
                  <span className="line-clamp-2">{source.last_fetch_error}</span>
                </div>
              ) : latestRun?.status === 'partial' ? (
                <div className="mt-2 flex gap-1.5 rounded-md bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                  <AlertTriangle size={13} className="shrink-0" />
                  <span className="line-clamp-2">{latestRun.error ?? 'Some items were fetched without transcripts.'}</span>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-1 text-[11px] text-neutral-500">
                  <Clock size={12} />
                  <span>{source.last_fetched_at ? formatRelative(source.last_fetched_at) : 'Never fetched'}</span>
                </div>
              )}
              <div className="mt-3 flex items-center gap-1">
                <button
                  title="Refresh source"
                  disabled={busy || running}
                  onClick={() => onRefresh(source)}
                  className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-neutral-200 text-[11px] hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                >
                  <RefreshCw size={12} className={running ? 'animate-spin' : ''} />
                  {running ? 'Fetching' : 'Fetch'}
                </button>
                <button
                  title={source.enabled ? 'Disable source' : 'Enable source'}
                  onClick={() => onToggle(source)}
                  className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-neutral-200 text-[11px] hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                >
                  {source.enabled ? <Check size={12} /> : <Ban size={12} />}
                  {source.enabled ? 'On' : 'Off'}
                </button>
                <button
                  title="Remove source"
                  onClick={() => onDelete(source)}
                  className="inline-flex h-7 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-rose-50 hover:text-rose-600 dark:border-neutral-800 dark:hover:bg-rose-950/30"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}

function FeedItemRow({
  item,
  source,
  active,
  onSelect,
  onSave,
  onSeen,
  onIgnore
}: {
  item: FeedItem;
  source?: FeedSource;
  active: boolean;
  onSelect: () => void;
  onSave: () => void;
  onSeen: () => void;
  onIgnore: () => void;
}): JSX.Element {
  const hasAnalysis = (item.enrichment_artifact_ids ?? []).length > 0;
  const saved = item.status === 'saved';
  const isYouTube = item.metadata?.provider === 'youtube';
  return (
    <article
      className={`group cursor-pointer px-4 py-3 transition ${
        active ? 'bg-sky-50/80 dark:bg-sky-950/25' : 'bg-white hover:bg-neutral-50 dark:bg-neutral-950 dark:hover:bg-neutral-900/70'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <StatusDot status={item.status} />
        <FeedThumbnail item={item} compact />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</h2>
            {isYouTube ? (
              <span title="YouTube video" className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] text-red-700 dark:bg-red-950/40 dark:text-red-200">
                <PlayCircle size={11} />
                Video
              </span>
            ) : null}
            {hasAnalysis ? (
              <span title="Analysis available" className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700 dark:bg-violet-950/40 dark:text-violet-200">
                <Sparkles size={11} />
                Analysis
              </span>
            ) : null}
            {item.extracted_ref ? (
              <span title="Readable extraction cached" className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                {isYouTube ? (hasYouTubeTranscript(item) ? 'Transcript' : 'Description') : 'Extracted'}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-500">
            <span>{source?.title ?? item.source_id}</span>
            <span>{formatRelative(item.published_at ?? item.fetched_at)}</span>
            <span>{labelForStatus(item.status)}</span>
            {item.language ? <span>{item.language}</span> : null}
            {item.metadata?.duration_human ? <span>{item.metadata.duration_human}</span> : null}
            {typeof item.metadata?.view_count === 'number' ? <span>{formatCompactNumber(item.metadata.view_count)} views</span> : null}
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-5 text-neutral-600 dark:text-neutral-300">
            {item.summary || item.excerpt || item.url}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            title="Save to Library"
            disabled={saved}
            onClick={(event) => {
              event.stopPropagation();
              onSave();
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 disabled:opacity-40 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
          >
            <BookmarkPlus size={13} />
          </button>
          <button
            title="Mark seen"
            onClick={(event) => {
              event.stopPropagation();
              onSeen();
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
          >
            <Eye size={13} />
          </button>
          <button
            title="Ignore"
            onClick={(event) => {
              event.stopPropagation();
              onIgnore();
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
          >
            <Ban size={13} />
          </button>
        </div>
      </div>
    </article>
  );
}

function Inspector({
  item,
  source,
  tab,
  setTab,
  enrichments,
  digest,
  cluster,
  report,
  busy,
  onSave,
  onSeen,
  onIgnore,
  onDigest,
  onCluster,
  onReport
}: {
  item: FeedItem | null;
  source?: FeedSource;
  tab: InspectorTab;
  setTab: (tab: InspectorTab) => void;
  enrichments: EnrichmentArtifact[];
  digest: SynthesisArtifact<FeedDigestPayload> | null;
  cluster: SynthesisArtifact<FeedClusterPayload> | null;
  report: SynthesisArtifact<FeedReportPayload> | null;
  busy: boolean;
  onSave: (item: FeedItem) => void;
  onSeen: (item: FeedItem) => void;
  onIgnore: (item: FeedItem) => void;
  onDigest: () => void;
  onCluster: () => void;
  onReport: () => void;
}): JSX.Element {
  const analysis = enrichments.find((artifact) => artifact.kind === 'feed.item.analysis') as
    | SynthesisArtifact<FeedItemAnalysisPayload>
    | undefined;
  const translation = enrichments.find((artifact) => artifact.kind === 'feed.item.translation') as
    | SynthesisArtifact<FeedItemTranslationPayload>
    | undefined;
  const [content, setContent] = useState<FeedItemContent | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  useEffect(() => {
    setContent(null);
    setContentError(null);
    if (!item || tab !== 'content') {
      setContentLoading(false);
      return;
    }
    const getItemContent = window.orbit.feeds.getItemContent;
    if (typeof getItemContent !== 'function') {
      setContentError('Transcript reader IPC is not active yet. Restart the dev app once so the updated preload is loaded.');
      setContentLoading(false);
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    void getItemContent(item.id)
      .then((nextContent) => {
        if (!cancelled) setContent(nextContent);
      })
      .catch((err) => {
        if (!cancelled) setContentError(err instanceof Error ? err.message : 'Failed to load readable content.');
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item?.id, tab]);

  useEffect(() => {
    if (item?.metadata?.provider === 'youtube' && hasYouTubeTranscript(item)) {
      setTab('content');
    }
  }, [item?.id, setTab]);

  if (!item) {
    return (
      <aside className="h-full min-h-0 overflow-y-auto overscroll-contain bg-neutral-50 p-4 dark:bg-neutral-950">
        <div className="rounded-md border border-dashed border-neutral-300 p-5 text-sm text-neutral-500 dark:border-neutral-800">
          Select a signal to inspect its source, synthesis, and promotion path.
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      <div className="shrink-0 p-4 pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500">Selected signal</div>
          <h2 className="mt-1 line-clamp-2 text-base font-semibold">{item.title}</h2>
          {item.metadata?.provider === 'youtube' ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
              <span className="inline-flex items-center gap-1">
                <PlayCircle size={12} />
                YouTube
              </span>
              {item.metadata.channel_name ? <span>{item.metadata.channel_name}</span> : null}
              {item.metadata.duration_human ? <span>{item.metadata.duration_human}</span> : null}
            </div>
          ) : null}
        </div>
        <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {labelForStatus(item.status)}
        </span>
      </div>

      <FeedThumbnail item={item} />

      <div className="mt-3 grid grid-cols-3 gap-1">
        <button
          disabled={busy || item.status === 'saved'}
          onClick={() => onSave(item)}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-neutral-900 text-[11px] font-medium text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
        >
          <BookmarkPlus size={13} />
          Save
        </button>
        <button
          onClick={() => onSeen(item)}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-neutral-200 bg-white text-[11px] dark:border-neutral-800 dark:bg-neutral-900"
        >
          <Eye size={13} />
          Seen
        </button>
        <button
          onClick={() => onIgnore(item)}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-neutral-200 bg-white text-[11px] dark:border-neutral-800 dark:bg-neutral-900"
        >
          <Ban size={13} />
          Ignore
        </button>
      </div>

      <a
        href={item.url}
        className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1 rounded-md border border-neutral-200 bg-white text-[11px] dark:border-neutral-800 dark:bg-neutral-900"
      >
        <ExternalLink size={13} />
        Open original
      </a>

      <div className="mt-4 flex rounded-md border border-neutral-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-900">
        {INSPECTOR_TABS.map((itemTab) => (
          <button
            key={itemTab}
            onClick={() => setTab(itemTab)}
            className={`h-7 flex-1 rounded text-[11px] capitalize ${
              tab === itemTab ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'text-neutral-500'
            }`}
          >
            {inspectorTabLabel(item, itemTab)}
          </button>
        ))}
      </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
      {tab === 'overview' ? (
        <div className="mt-4 space-y-4">
          <Section title="Readable signal">
            <ReadableSignalText item={item} />
            {item.metadata?.provider === 'youtube' ? (
              <div className="mt-3 rounded-md bg-neutral-50 p-3 text-xs leading-5 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                {hasYouTubeTranscript(item)
                  ? 'Full transcript is captured for this video.'
                  : `This video currently has no captured transcript. ${youtubeSubtitleStatusLabel(item)}.`}
                <button
                  type="button"
                  onClick={() => setTab('content')}
                  className="mt-2 inline-flex h-7 items-center rounded-md border border-neutral-200 bg-white px-2 text-[11px] font-medium text-neutral-800 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
                >
                  {hasYouTubeTranscript(item) ? 'Open full transcript' : 'Open cached description'}
                </button>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-1">
              <Pill
                icon={<FileText size={12} />}
                text={
                  item.metadata?.provider === 'youtube'
                    ? item.extracted_ref
                      ? hasYouTubeTranscript(item)
                        ? 'Transcript cached'
                        : `Description cached; ${youtubeSubtitleStatusLabel(item)}`
                      : 'Transcript pending'
                    : item.extracted_ref
                      ? 'Extracted text cached'
                      : 'Extraction pending'
                }
              />
              <Pill icon={<Languages size={12} />} text={translation ? `Translation ${translation.payload.target_language}` : 'No translation'} />
              <Pill icon={<Sparkles size={12} />} text={analysis ? 'Analysis available' : 'No item analysis'} />
              {item.metadata?.subtitle_language ? <Pill icon={<PlayCircle size={12} />} text={`Subtitle ${item.metadata.subtitle_language}`} /> : null}
            </div>
          </Section>

          <Section title="Today synthesis">
            <SynthesisSummary artifact={digest} fallback="Generate a digest to see today's top signals." />
            <SynthesisSummary artifact={cluster} fallback="Generate clusters to group related signals." />
            <SynthesisSummary artifact={report} fallback="Generate a report to capture what changed." />
            <div className="mt-3 grid grid-cols-3 gap-1">
              <MiniAction onClick={onDigest} label="Digest" />
              <MiniAction onClick={onCluster} label="Cluster" />
              <MiniAction onClick={onReport} label="Report" />
            </div>
          </Section>
        </div>
      ) : null}

      {tab === 'content' ? (
        <div className="mt-4 space-y-4">
          <Section title={item.metadata?.provider === 'youtube' ? (hasYouTubeTranscript(item) ? 'YouTube subtitle / transcript' : 'YouTube description') : 'Readable content'}>
            <ReadableContentPanel
              item={item}
              content={content}
              loading={contentLoading}
              error={contentError}
            />
          </Section>
        </div>
      ) : null}

      {tab === 'analysis' ? (
        <div className="mt-4 space-y-4">
          <Section title="Item analysis">
            {analysis ? (
              <div className="space-y-3 text-sm">
                <p className="leading-6 text-neutral-700 dark:text-neutral-300">{analysis.payload.summary}</p>
                <KeyValueList title="Key points" values={analysis.payload.key_points} />
                <KeyValueList title="Entities" values={analysis.payload.entities} inline />
                <KeyValueList title="Suggested actions" values={analysis.payload.suggested_actions} />
              </div>
            ) : (
              <p className="text-sm text-neutral-500">
                Analysis artifacts are created when an item is saved or when source processing policy runs enrichment.
              </p>
            )}
          </Section>
          <Section title="Translation">
            {translation ? (
              <div className="text-sm leading-6 text-neutral-700 dark:text-neutral-300">
                <div className="mb-2 text-xs text-neutral-500">Target: {translation.payload.target_language}</div>
                <div className="max-h-72 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words rounded-md bg-neutral-50 p-3 text-xs leading-5 [overflow-wrap:anywhere] dark:bg-neutral-900">
                  {translation.payload.content}
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No translation artifact attached yet.</p>
            )}
          </Section>
        </div>
      ) : null}

      {tab === 'provenance' ? (
        <div className="mt-4 space-y-4">
          <Section title="Source">
            <Meta label="Source" value={source?.title ?? item.source_id} />
            {item.metadata?.provider ? <Meta label="Provider" value={item.metadata.provider} /> : null}
            {item.metadata?.external_id ? <Meta label="External ID" value={item.metadata.external_id} mono /> : null}
            {item.metadata?.channel_name ? <Meta label="Channel" value={item.metadata.channel_name} /> : null}
            {item.metadata?.duration_human ? <Meta label="Duration" value={item.metadata.duration_human} /> : null}
            {typeof item.metadata?.view_count === 'number' ? <Meta label="Views" value={formatCompactNumber(item.metadata.view_count)} /> : null}
            <Meta label="Published" value={item.published_at ? new Date(item.published_at).toLocaleString() : 'Unknown'} />
            <Meta label="Fetched" value={new Date(item.fetched_at).toLocaleString()} />
            <Meta label="Canonical URL" value={item.canonical_url ?? item.url} />
            <Meta label="Content hash" value={item.content_hash ?? 'Missing'} mono />
          </Section>
          <Section title="Stored refs">
            <Meta label="Raw" value={item.raw_ref?.path ?? 'Missing'} mono />
            {item.raw_refs?.length ? <Meta label="Raw refs" value={item.raw_refs.map((ref) => ref.path ?? ref.kind).join('\n')} mono /> : null}
            <Meta label="Extracted" value={item.extracted_ref?.path ?? 'Missing'} mono />
            <Meta label="Fetch run" value={item.fetch_run_id ?? 'Missing'} mono />
            <Meta label="Library item" value={item.saved_library_item_id ?? 'Not saved'} mono />
          </Section>
        </div>
      ) : null}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function ReadableSignalText({ item }: { item: FeedItem }): JSX.Element {
  return (
    <div className="max-h-[32vh] overflow-y-auto overscroll-contain whitespace-pre-wrap break-words pr-1 text-sm leading-6 text-neutral-700 [overflow-wrap:anywhere] dark:text-neutral-300">
      {item.summary || item.excerpt || item.url}
    </div>
  );
}

function ReadableContentPanel({
  item,
  content,
  loading,
  error
}: {
  item: FeedItem;
  content: FeedItemContent | null;
  loading: boolean;
  error: string | null;
}): JSX.Element {
  if (loading) return <p className="text-sm text-neutral-500">Loading extracted content...</p>;
  if (error) {
    return (
      <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
        {error}
      </div>
    );
  }
  if (!content) return <p className="text-sm text-neutral-500">Open this tab to load the extracted content.</p>;

  const isYouTube = item.metadata?.provider === 'youtube';
  const transcriptSection = isYouTube ? extractMarkdownSection(content.content, 'Transcript') : null;
  const transcript = transcriptSection && !isMissingTranscriptText(transcriptSection) ? transcriptSection : null;
  const description = isYouTube ? extractMarkdownSection(content.content, 'Description') : null;
  const displayContent = isYouTube ? transcript : content.content;

  return (
    <div className="space-y-3">
      {isYouTube ? (
        <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-500">
          <MiniMeta label="Subtitle" value={youtubeSubtitleStatusLabel(item)} />
          <MiniMeta label="Format" value={item.metadata?.subtitle_format ?? 'Unknown'} />
          <MiniMeta label="Requested" value={compactLanguageList(item.metadata?.subtitle_requested_languages)} />
          <MiniMeta label="Exposed" value={youtubeExposedSubtitleLabel(item)} />
          <MiniMeta label="Tracks" value={youtubeTranscriptTracksLabel(item)} />
        </div>
      ) : null}
      {isYouTube && item.media?.transcript_tracks?.length ? (
        <div className="flex flex-wrap gap-1">
          {item.media.transcript_tracks.map((track) => (
            <span
              key={track.id}
              className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200"
            >
              {track.label}
              {track.translation_of_track_id ? ' translation' : ''}
            </span>
          ))}
        </div>
      ) : null}
      {description ? (
        <details className="rounded-md bg-neutral-50 p-3 text-xs dark:bg-neutral-900">
          <summary className="cursor-pointer text-neutral-600 dark:text-neutral-300">Description</summary>
          <div className="mt-2 max-h-40 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words leading-5 text-neutral-700 [overflow-wrap:anywhere] dark:text-neutral-300">
            {description}
          </div>
        </details>
      ) : null}
      {displayContent ? (
        <div className="max-h-[46vh] overflow-y-auto overscroll-contain whitespace-pre-wrap break-words rounded-md bg-neutral-50 p-3 font-mono text-[11px] leading-5 text-neutral-800 [overflow-wrap:anywhere] dark:bg-neutral-900 dark:text-neutral-200">
          {displayContent}
        </div>
      ) : (
        <div className="rounded-md bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          No subtitles were available from YouTube for this video. Orbit still cached the video metadata and description.
        </div>
      )}
      <div className="text-[11px] text-neutral-500">
        Stored as {content.content_kind}
        {content.ref?.path ? ` / ${content.ref.path}` : ''}
      </div>
    </div>
  );
}

function MiniMeta({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-md bg-neutral-50 px-2 py-1 dark:bg-neutral-900">
      <div>{label}</div>
      <div className="mt-0.5 break-words font-medium text-neutral-700 dark:text-neutral-200">{value}</div>
    </div>
  );
}

function RunNotice({ run, source }: { run: FeedFetchRun; source?: FeedSource }): JSX.Element {
  const stage = currentRunStage(run);
  const progress = progressLabel(stage);
  return (
    <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <RefreshCw size={13} className="shrink-0 animate-spin" />
          <span className="truncate font-medium">Fetching {source?.title ?? run.source_url}</span>
        </div>
        <span className="shrink-0 text-sky-600 dark:text-sky-200">{progress}</span>
      </div>
      <div className="mt-1 truncate text-sky-700 dark:text-sky-200">{stage?.detail ?? 'Preparing feed run.'}</div>
    </div>
  );
}

function RunInline({ run, stage }: { run: FeedFetchRun; stage?: FeedFetchRunStageLike }): JSX.Element {
  return (
    <div className="mt-2 rounded-md bg-sky-50 p-2 text-[11px] text-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1">
          <RefreshCw size={12} className="shrink-0 animate-spin" />
          <span className="truncate">{stage?.label ?? 'Fetching'}</span>
        </span>
        <span className="shrink-0">{progressLabel(stage)}</span>
      </div>
      <div className="mt-1 line-clamp-2 text-sky-700 dark:text-sky-200">
        {stage?.detail ?? `Fetched ${run.created}/${run.fetched} item(s).`}
      </div>
    </div>
  );
}

type FeedFetchRunStageLike = NonNullable<FeedFetchRun['stages']>[number];

function currentRunStage(run?: FeedFetchRun | null): FeedFetchRunStageLike | undefined {
  return run?.stages?.find((stage) => stage.status === 'running') ?? run?.stages?.find((stage) => stage.status === 'pending') ?? run?.stages?.at(-1);
}

function progressLabel(stage?: FeedFetchRunStageLike): string {
  if (!stage || stage.total === undefined) return 'Working';
  return `${stage.completed ?? 0}/${stage.total}`;
}

function FeedThumbnail({ item, compact }: { item: FeedItem; compact?: boolean }): JSX.Element {
  const src = item.image_url ?? item.metadata?.thumbnail_url;
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  const className = compact
    ? 'h-12 w-20 shrink-0 rounded-md border border-neutral-200 dark:border-neutral-800'
    : 'mt-3 aspect-video w-full rounded-md border border-neutral-200 dark:border-neutral-800';

  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setBroken(true)}
        className={`${className} object-cover`}
      />
    );
  }

  const Icon = item.metadata?.provider === 'youtube' ? PlayCircle : FileText;
  return (
    <div className={`${className} flex items-center justify-center bg-neutral-100 text-neutral-400 dark:bg-neutral-900`}>
      <Icon size={compact ? 18 : 32} />
    </div>
  );
}

function SynthesisSummary({ artifact, fallback }: { artifact: FeedSynthesisArtifact | null; fallback: string }): JSX.Element {
  if (!artifact) return <p className="mt-2 text-xs text-neutral-500">{fallback}</p>;
  if (artifact.kind === 'feed.digest') {
    const payload = artifact.payload as FeedDigestPayload;
    return (
      <div className="mt-2 rounded-md bg-sky-50 p-2 text-xs text-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
        <div className="font-medium">{payload.headline}</div>
        <div className="mt-1 text-sky-700 dark:text-sky-200">{payload.highlights.slice(0, 3).map((item) => item.title).join(' / ')}</div>
      </div>
    );
  }
  if (artifact.kind === 'feed.cluster') {
    const payload = artifact.payload as FeedClusterPayload;
    return (
      <div className="mt-2 rounded-md bg-violet-50 p-2 text-xs text-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
        <div className="font-medium">{payload.clusters.length} cluster(s)</div>
        <div className="mt-1 text-violet-700 dark:text-violet-200">{payload.clusters.slice(0, 3).map((item) => item.label).join(' / ')}</div>
      </div>
    );
  }
  const payload = artifact.payload as FeedReportPayload;
  return (
    <div className="mt-2 rounded-md bg-emerald-50 p-2 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
      <div className="font-medium">{payload.item_count} item report</div>
      <div className="mt-1 text-emerald-700 dark:text-emerald-200">{payload.sections.slice(0, 3).map((item) => item.summary).join(' / ')}</div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'sky' | 'emerald' | 'violet' | 'rose' | 'neutral' }): JSX.Element {
  const toneClass = {
    sky: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-200',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-200',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200',
    neutral: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300'
  }[tone];
  return (
    <div className={`rounded-md px-3 py-2 ${toneClass}`}>
      <div className="text-[11px]">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-md bg-neutral-50 px-2 py-1 dark:bg-neutral-900">
      <div className="font-medium">{value}</div>
      <div className="text-neutral-500">{label}</div>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }): JSX.Element {
  return (
    <div className="mt-2">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className={`mt-0.5 whitespace-pre-wrap break-words text-xs text-neutral-800 [overflow-wrap:anywhere] dark:text-neutral-200 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function Pill({ icon, text }: { icon: ReactNode; text: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
      {icon}
      {text}
    </span>
  );
}

function KeyValueList({ title, values, inline }: { title: string; values: string[]; inline?: boolean }): JSX.Element | null {
  if (values.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-medium text-neutral-500">{title}</div>
      <div className={`mt-1 ${inline ? 'flex flex-wrap gap-1' : 'space-y-1'}`}>
        {values.map((value) =>
          inline ? (
            <span key={value} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
              {value}
            </span>
          ) : (
            <div key={value} className="rounded-md bg-neutral-50 p-2 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
              {value}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function IconButton({
  title,
  children,
  disabled,
  onClick
}: {
  title: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
    >
      {children}
    </button>
  );
}

function MiniAction({ label, onClick }: { label: string; onClick: () => void }): JSX.Element {
  return (
    <button onClick={onClick} className="h-7 rounded-md border border-neutral-200 bg-white text-[11px] dark:border-neutral-800 dark:bg-neutral-900">
      {label}
    </button>
  );
}

function Notice({ tone, message }: { tone: 'sky' | 'rose'; message: string }): JSX.Element {
  const className =
    tone === 'sky'
      ? 'bg-sky-50 text-sky-800 dark:bg-sky-950/30 dark:text-sky-100'
      : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-100';
  return <div className={`mt-2 rounded-md px-3 py-2 text-xs ${className}`}>{message}</div>;
}

function EmptyFeedState({ activeSource }: { activeSource: FeedSource | null }): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-sm rounded-md border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
        <Inbox className="mx-auto mb-3 text-neutral-400" size={24} />
        {activeSource ? 'No signals match the current filters for this source.' : 'No signals match the current filters.'}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: FeedItemStatus }): JSX.Element {
  const className =
    status === 'new'
      ? 'bg-emerald-500'
      : status === 'saved'
        ? 'bg-violet-500'
        : status === 'ignored'
          ? 'bg-neutral-300'
          : status === 'expired'
            ? 'bg-rose-400'
            : 'bg-sky-400';
  return <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${className}`} />;
}

function labelForStatus(status: FeedItemStatus | 'all'): string {
  if (status === 'all') return 'All';
  return status[0].toUpperCase() + status.slice(1);
}

function looksLikeYouTubeSource(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith('@')) return true;
  try {
    const host = new URL(trimmed).hostname.replace(/^www\./, '').replace(/^m\./, '');
    return host === 'youtube.com' || host === 'youtu.be';
  } catch {
    return false;
  }
}

function hasYouTubeTranscript(item: FeedItem): boolean {
  return (
    item.metadata?.provider === 'youtube' &&
    (item.metadata.has_transcript === true || (item.media?.transcript_tracks?.some((track) => track.status === 'captured') ?? false))
  );
}

function inspectorTabLabel(item: FeedItem, tab: InspectorTab): string {
  if (tab !== 'content' || item.metadata?.provider !== 'youtube') return tab;
  return hasYouTubeTranscript(item) ? 'Transcript' : 'Description';
}

function youtubeSubtitleStatusLabel(item: FeedItem): string {
  if (item.metadata?.provider !== 'youtube') return 'N/A';
  if (item.metadata.has_transcript) {
    return item.metadata.subtitle_language ? `Captured ${item.metadata.subtitle_language}` : 'Captured';
  }
  if (item.metadata.subtitle_status === 'not_exposed') return 'Not exposed by YouTube';
  if (item.metadata.subtitle_status === 'available_but_not_downloaded') return 'Available but not downloaded';
  return 'Missing';
}

function youtubeTranscriptTracksLabel(item: FeedItem): string {
  const tracks = item.media?.transcript_tracks ?? [];
  if (tracks.length === 0) return 'None';
  const languages = [...new Set(tracks.map((track) => track.language))];
  return `${tracks.length} / ${compactLanguageList(languages)}`;
}

function youtubeExposedSubtitleLabel(item: FeedItem): string {
  const manual = item.metadata?.subtitle_available_languages ?? [];
  const automatic = item.metadata?.automatic_caption_languages ?? [];
  const values = [
    manual.length > 0 ? `manual ${compactLanguageList(manual)}` : null,
    automatic.length > 0 ? `auto ${compactLanguageList(automatic)}` : null
  ].filter(Boolean);
  return values.length > 0 ? values.join(' / ') : 'None reported';
}

function compactLanguageList(values?: string[]): string {
  if (!values || values.length === 0) return 'None';
  const preview = values.slice(0, 3).join(', ');
  return values.length > 3 ? `${preview} +${values.length - 3}` : preview;
}

function isTranscriptExtractionWarning(value: string): boolean {
  return /YouTube item\(s\) failed transcript extraction/i.test(value);
}

function isMissingTranscriptText(value: string): boolean {
  return /^_?No subtitles available\._?$/i.test(value.trim());
}

function extractMarkdownSection(content: string, heading: string): string | null {
  const markerPattern =
    heading === 'Transcript'
      ? /<!-- YOUTUBE_TRANSCRIPT_START -->[\s\S]*?## Transcript\s*\n([\s\S]*?)\n<!-- YOUTUBE_TRANSCRIPT_END -->/i
      : null;
  const markerMatch = markerPattern?.exec(content);
  if (markerMatch?.[1]) return markerMatch[1].trim();

  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionMatch = new RegExp(`(?:^|\\n)## ${escapedHeading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i').exec(content);
  return sectionMatch?.[1]?.trim() || null;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatRelative(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;
  if (Math.abs(diffMs) < hour) return `${Math.max(1, Math.round(diffMs / minute))}m ago`;
  if (Math.abs(diffMs) < day) return `${Math.round(diffMs / hour)}h ago`;
  if (Math.abs(diffMs) < day * 7) return `${Math.round(diffMs / day)}d ago`;
  return date.toLocaleDateString();
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
