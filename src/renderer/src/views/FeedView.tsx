import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  AtSign,
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
  MessageSquare,
  Newspaper,
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
  FeedSource,
  FeedTask,
  FeedTaskSnapshot,
  FeedTaskStatus
} from '@shared/feed';
import type { SynthesisArtifact } from '@shared/synthesis';
import { useSidebar } from '../store/sidebar';

const STATUSES: Array<FeedItemStatus | 'all'> = [
  'all',
  'new',
  'seen',
  'saved',
  'ignored',
  'expired'
];
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
  const [taskSnapshot, setTaskSnapshot] = useState<FeedTaskSnapshot | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [status, setStatus] = useState<FeedItemStatus | 'all'>('new');
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [sourceKind, setSourceKind] = useState<FeedSource['kind']>('rss');
  const [youtubeBackfill, setYoutubeBackfill] = useState<'recent' | 'full'>('recent');
  const [xMode, setXMode] = useState<'profile' | 'following' | 'for-you'>('profile');
  const [xIncludeReplies, setXIncludeReplies] = useState(true);
  const [xCaptureThreadOnSave, setXCaptureThreadOnSave] = useState(false);
  const [redditSort, setRedditSort] = useState<'hot' | 'new' | 'top' | 'rising'>('hot');
  const [redditCaptureComments, setRedditCaptureComments] = useState(false);
  const [hnFeedType, setHnFeedType] = useState<'top' | 'new' | 'best' | 'show' | 'ask' | 'jobs'>('top');
  const [hnCaptureComments, setHnCaptureComments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [digest, setDigest] = useState<SynthesisArtifact<FeedDigestPayload> | null>(null);
  const [cluster, setCluster] = useState<SynthesisArtifact<FeedClusterPayload> | null>(null);
  const [report, setReport] = useState<SynthesisArtifact<FeedReportPayload> | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview');
  const [enrichments, setEnrichments] = useState<EnrichmentArtifact[]>([]);
  const openSidebarPanel = useSidebar((state) => state.openPanel);

  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources]
  );
  const activeSource = activeSourceId ? (sourceById.get(activeSourceId) ?? null) : null;
  const latestRunBySource = useMemo(() => {
    const map = new Map<string, FeedFetchRun>();
    for (const run of runs) {
      if (!map.has(run.source_id)) map.set(run.source_id, run);
    }
    return map;
  }, [runs]);
  const runningRuns = useMemo(() => runs.filter((run) => run.status === 'running'), [runs]);
  const activeRun = activeSourceId
    ? (latestRunBySource.get(activeSourceId) ?? null)
    : (runningRuns[0] ?? null);
  const activeRunningRun = activeRun?.status === 'running' ? activeRun : null;
  const activeTaskCount =
    (taskSnapshot?.running ?? 0) + (taskSnapshot?.queued ?? 0) + (taskSnapshot?.retry_wait ?? 0);
  const activeTaskBySource = useMemo(() => taskBySource(taskSnapshot), [taskSnapshot]);
  const operationBusy = busy;

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allItems
      .filter((item) => !activeSourceId || item.source_id === activeSourceId)
      .filter((item) => status === 'all' || item.status === status)
      .filter((item) => {
        if (!normalizedQuery) return true;
        return `${item.title} ${item.summary ?? ''} ${item.excerpt ?? ''} ${item.url}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) =>
        (b.published_at ?? b.fetched_at).localeCompare(a.published_at ?? a.fetched_at)
      );
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
    const scopedItems = allItems.filter(
      (item) => !activeSourceId || item.source_id === activeSourceId
    );
    const byStatus = new Map<FeedItemStatus, number>();
    for (const item of scopedItems) byStatus.set(item.status, (byStatus.get(item.status) ?? 0) + 1);
    const today = scopedItems.filter((item) => item.fetched_at.startsWith(todayKey)).length;
    const failedSources = sources.filter(
      (source) => source.last_fetch_error && !isTranscriptExtractionWarning(source.last_fetch_error)
    ).length;
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
    const map = new Map<
      string,
      { total: number; today: number; newItems: number; saved: number }
    >();
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
      const [nextSources, nextItems, nextRuns, nextTasks] = await Promise.all([
        window.orbit.feeds.listSources(),
        window.orbit.feeds.listItems({ include_ignored: true, include_saved: true }),
        window.orbit.feeds.listRuns(),
        window.orbit.feeds.listTasks()
      ]);
      setSources(nextSources);
      setAllItems(nextItems);
      setRuns(nextRuns);
      setTaskSnapshot(nextTasks);
      if (nextActiveItemId && nextItems.some((item) => item.id === nextActiveItemId)) {
        setActiveItemId(nextActiveItemId);
      } else {
        setActiveItemId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 Feed 数据失败。');
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (runningRuns.length === 0 && activeTaskCount === 0) return;
    const timer = window.setInterval(() => {
      void reload(activeItemId);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [activeItemId, activeTaskCount, runningRuns.length]);

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
    const sourceUrl =
      sourceKind === 'hackernews' && !url.trim()
        ? `hn:${hnFeedType}`
        : sourceKind === 'twitter' && xMode !== 'profile' && !url.trim()
          ? `x:${xMode}`
          : url.trim();
    if (!sourceUrl) return;
    if (sourceKind === 'rss' && sourceUrl.startsWith('@')) {
      setError('请先选择 YouTube 或 X 账号，再添加 @handle。');
      return;
    }
    const nextKind =
      sourceKind === 'rss' && looksLikeXSource(sourceUrl)
        ? 'twitter'
        : sourceKind === 'rss' && looksLikeYouTubeSource(sourceUrl)
          ? 'youtube'
          : sourceKind === 'rss' && looksLikeRedditSource(sourceUrl)
            ? 'reddit'
            : sourceKind === 'rss' && looksLikeHackerNewsSource(sourceUrl)
              ? 'hackernews'
              : sourceKind;
    const normalizedSourceUrl =
      nextKind === 'reddit' ? redditSourceInputWithSort(sourceUrl, redditSort) : nextKind === 'hackernews' && !url.trim() ? `hn:${hnFeedType}` : sourceUrl;
    setBusy(true);
    setMessage(null);
    try {
      const source = await window.orbit.feeds.createSource({
        url: normalizedSourceUrl,
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
          : nextKind === 'twitter'
            ? {
                fetch_policy: {
                  interval_minutes: 1440,
                  max_items_per_fetch: 20,
                  initial_backfill: 'recent',
                  initial_backfill_count: 20,
                  respect_cache: true
                },
                processing_policy: {
                  extract_readable: false,
                  auto_analyze: false,
                  generate_item_summary: true,
                  include_replies: xIncludeReplies,
                  capture_comments: xCaptureThreadOnSave
                }
              }
            : nextKind === 'reddit'
              ? {
                  fetch_policy: {
                    interval_minutes: 1440,
                    max_items_per_fetch: 20,
                    initial_backfill: 'recent',
                    initial_backfill_count: 20,
                    respect_cache: true
                  },
                  processing_policy: {
                    extract_readable: false,
                    auto_analyze: false,
                    generate_item_summary: true,
                    capture_comments: redditCaptureComments
                  }
                }
              : nextKind === 'hackernews'
                ? {
                    fetch_policy: {
                      interval_minutes: 1440,
                      max_items_per_fetch: 20,
                      initial_backfill: 'recent',
                      initial_backfill_count: 20,
                      respect_cache: true
                    },
                    processing_policy: {
                      extract_readable: false,
                      auto_analyze: false,
                      generate_item_summary: true,
                      capture_comments: hnCaptureComments
                    }
                  }
                : {})
      });
      setUrl('');
      setTitle('');
      setActiveSourceId(source.id);
      openSidebarPanel({ surface: 'feeds', panel: 'feed-tasks' });
      await reload(null);
      setMessage(
        source.kind === 'youtube'
          ? `已添加 ${source.title}，首次抓取已加入任务中心：${source.fetch_policy?.initial_backfill === 'full' ? '完整频道' : '最新 20 条'}。`
          : source.kind === 'twitter'
            ? `已添加 ${source.title}，最新 20 条 X 内容已加入任务中心。`
            : source.kind === 'reddit'
              ? `已添加 ${source.title}，最新 20 条 Reddit 内容已加入任务中心。`
              : source.kind === 'hackernews'
                ? `已添加 ${source.title}，最新 20 条 Hacker News 内容已加入任务中心。`
                : `已添加 ${source.title}，抓取已加入任务中心。`
      );
      window.setTimeout(() => void reload(null), 400);
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加来源失败。');
    } finally {
      setBusy(false);
    }
  }

  async function refresh(sourceId?: string): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      window.setTimeout(() => void reload(activeItemId), 400);
      const result = await window.orbit.feeds.enqueueTask({
        source_id: sourceId,
        kind: 'source.refresh',
        priority: 'manual'
      });
      openSidebarPanel({ surface: 'feeds', panel: 'feed-tasks' });
      await reload(activeItemId);
      setMessage(
        result.jobs.length > 0
          ? `已加入任务中心：${result.jobs.length} 个抓取任务。`
          : '当前没有启用的 Feed 来源。'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '刷新 Feed 失败。');
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
      setMessage(`已保存到资料库：${result.library_item.frontmatter.title}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存条目失败。');
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
    if (!window.confirm(`移除 Feed 来源「${source.title}」？`)) return;
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
              <h1 className="text-base font-semibold">Feed 信号</h1>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-900">
                保存前属于 Layer 0
              </span>
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">
              每日输入信号，用于分拣、合成与提升到资料库。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <IconButton title="每日日报" onClick={() => void runDigest()} disabled={operationBusy}>
              <FileText size={15} />
              <span>摘要</span>
            </IconButton>
            <IconButton
              title="聚类可见信号"
              onClick={() => void runCluster()}
              disabled={operationBusy}
            >
              <Sparkles size={15} />
              <span>聚类</span>
            </IconButton>
            <IconButton
              title="生成每日报告"
              onClick={() => void runReport()}
              disabled={operationBusy}
            >
              <Library size={15} />
              <span>报告</span>
            </IconButton>
            <button
              disabled={operationBusy}
              onClick={() => void refresh(activeSourceId ?? undefined)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sky-600 px-3 text-xs font-medium text-white disabled:opacity-50"
            >
              <RefreshCw size={14} className={taskSnapshot?.running ? 'animate-spin' : ''} />
              刷新
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
            <option value="twitter">X</option>
            <option value="reddit">Reddit</option>
            <option value="hackernews">Hacker News</option>
          </select>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="可选来源标题"
            className="h-8 rounded-md border border-neutral-200 bg-white px-3 text-xs outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-900"
          />
          <input
            value={url}
            onChange={(event) => {
              const nextUrl = event.target.value;
              setUrl(nextUrl);
              if (looksLikeXTimelineSource(nextUrl)) {
                setSourceKind('twitter');
                setXMode(xTimelineModeFromInput(nextUrl) ?? 'following');
              } else if (looksLikeXSource(nextUrl)) {
                setSourceKind('twitter');
                setXMode('profile');
              } else if (looksLikeRedditSource(nextUrl)) {
                setSourceKind('reddit');
              } else if (looksLikeHackerNewsSource(nextUrl)) {
                setSourceKind('hackernews');
              } else if (sourceKind !== 'twitter' && looksLikeYouTubeSource(nextUrl)) {
                setSourceKind('youtube');
              }
            }}
            placeholder={
              sourceKind === 'youtube'
                ? 'YouTube 频道 / 播放列表 / @handle / 视频 URL'
                : sourceKind === 'twitter'
                  ? xMode === 'profile'
                    ? '@handle 或 https://x.com/handle'
                    : '留空直接添加，或输入 x:following / x:for-you'
                  : sourceKind === 'reddit'
                    ? 'r/LocalLLaMA 或 Reddit subreddit URL'
                    : sourceKind === 'hackernews'
                      ? '留空使用频道，或输入 top / new / best / show / ask / jobs'
                      : 'RSS / Atom URL'
            }
            className="h-8 rounded-md border border-neutral-200 bg-white px-3 text-xs outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-900"
          />
          <button
            disabled={operationBusy || (!url.trim() && sourceKind !== 'hackernews' && !(sourceKind === 'twitter' && xMode !== 'profile'))}
            onClick={() => void addSource()}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 text-xs font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            <Plus size={14} />
            添加来源
          </button>
        </div>
        {sourceKind === 'youtube' ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
            <span>YouTube 回填</span>
            <button
              type="button"
              onClick={() => setYoutubeBackfill('recent')}
              className={`h-7 rounded-md border px-2 ${
                youtubeBackfill === 'recent'
                  ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200'
                  : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
              }`}
            >
              最新 20 条
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
              完整频道
            </button>
            <span>每日刷新仍会检查最新 20 条新发布视频。</span>
          </div>
        ) : null}
        {sourceKind === 'twitter' ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
            <span>X 来源</span>
            {(['profile', 'following', 'for-you'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setXMode(mode);
                  if (mode !== 'profile') setUrl('');
                }}
                className={`h-7 rounded-md border px-2 ${
                  xMode === mode
                    ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100'
                    : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                }`}
              >
                {mode === 'profile' ? '账号' : mode === 'following' ? 'Following' : 'For You'}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setXIncludeReplies((value) => !value)}
              className={`h-7 rounded-md border px-2 ${
                xIncludeReplies
                  ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100'
                  : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
              }`}
            >
              {xIncludeReplies ? '包含回复' : '只看主贴'}
            </button>
            <button
              type="button"
              onClick={() => setXCaptureThreadOnSave((value) => !value)}
              className={`h-7 rounded-md border px-2 ${
                xCaptureThreadOnSave
                  ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100'
                  : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
              }`}
            >
              {xCaptureThreadOnSave ? '抓线程详情' : '只缓存原帖'}
            </button>
            <span>
              {xMode === 'profile'
                ? '默认每次用 OpenCLI 抓取该账号最近 20 条。'
                : '需要本机浏览器已登录 X；默认抓取 timeline 最近 20 条。'}
            </span>
          </div>
        ) : null}
        {sourceKind === 'reddit' ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
            <span>Reddit 排序</span>
            {(['hot', 'new', 'top', 'rising'] as const).map((sort) => (
              <button
                key={sort}
                type="button"
                onClick={() => setRedditSort(sort)}
                className={`h-7 rounded-md border px-2 ${
                  redditSort === sort
                    ? 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-100'
                    : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                }`}
              >
                {sort}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setRedditCaptureComments((value) => !value)}
              className={`h-7 rounded-md border px-2 ${
                redditCaptureComments
                  ? 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-100'
                  : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
              }`}
            >
              {redditCaptureComments ? '保存时抓评论' : '只缓存帖子'}
            </button>
            <span>默认抓取 subreddit 最新 20 条候选。</span>
          </div>
        ) : null}
        {sourceKind === 'hackernews' ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
            <span>HN 频道</span>
            {(['top', 'new', 'best', 'show', 'ask', 'jobs'] as const).map((feedType) => (
              <button
                key={feedType}
                type="button"
                onClick={() => setHnFeedType(feedType)}
                className={`h-7 rounded-md border px-2 ${
                  hnFeedType === feedType
                    ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
                    : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                }`}
              >
                {feedType}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setHnCaptureComments((value) => !value)}
              className={`h-7 rounded-md border px-2 ${
                hnCaptureComments
                  ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
                  : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
              }`}
            >
              {hnCaptureComments ? '保存时抓评论' : '只缓存故事'}
            </button>
            <span>使用 Hacker News public API 抓取最近 20 条。</span>
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <Metric label="今日" value={metrics.today} tone="sky" />
          <Metric label="新增" value={metrics.newItems} tone="emerald" />
          <Metric label="已保存" value={metrics.saved} tone="violet" />
          <Metric
            label="来源问题"
            value={metrics.failedSources}
            tone={metrics.failedSources ? 'rose' : 'neutral'}
          />
        </div>
        {activeRunningRun ? (
          <RunNotice run={activeRunningRun} source={sourceById.get(activeRunningRun.source_id)} />
        ) : null}
        {message ? <Notice tone="sky" message={message} /> : null}
        {error ? <Notice tone="rose" message={error} /> : null}
      </header>

      <div className="grid h-full min-h-0 min-w-0 flex-1 grid-cols-[288px_minmax(0,1fr)] overflow-hidden">
        <SourceRail
          sources={sources}
          sourceCounts={sourceCounts}
          latestRunBySource={latestRunBySource}
          activeTaskBySource={activeTaskBySource}
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

        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-white dark:bg-neutral-950">
          <div className="shrink-0 border-b border-neutral-200 p-3 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索当前 Feed 范围"
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
                    {labelForStatus(item)}{' '}
                    {item === 'all'
                      ? metrics.scopedItems.length
                      : (metrics.byStatus.get(item) ?? 0)}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
              <span>
                {activeSource ? activeSource.title : '全部来源'} / {filteredItems.length} 条可见信号
              </span>
              <span>{digest || cluster || report ? '已有合成结果' : '本会话尚未生成合成结果'}</span>
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

      </div>
    </div>
  );
}

function SourceRail({
  sources,
  sourceCounts,
  latestRunBySource,
  activeTaskBySource,
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
  activeTaskBySource: Map<string, FeedTask>;
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
          activeSourceId === null
            ? 'bg-white shadow-sm dark:bg-neutral-900'
            : 'hover:bg-white dark:hover:bg-neutral-900'
        }`}
      >
        <span className="font-medium">全部来源</span>
        <Inbox size={15} className="text-neutral-400" />
      </button>
      <div className="mt-3 space-y-2">
        {sources.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 p-3 text-sm text-neutral-500 dark:border-neutral-800">
            添加来源以启动每日信号循环。
          </div>
        ) : null}
        {sources.map((source) => {
          const counts = sourceCounts.get(source.id) ?? {
            total: 0,
            today: 0,
            newItems: 0,
            saved: 0
          };
          const latestRun = latestRunBySource.get(source.id) ?? null;
          const activeTask = activeTaskBySource.get(source.id) ?? null;
          const running = latestRun?.status === 'running' || activeTask?.status === 'running';
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
                  <span
                    className={`mt-1 h-2 w-2 rounded-full ${source.enabled ? 'bg-emerald-500' : 'bg-neutral-300'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className="min-w-0 flex-1 truncate font-medium">{source.title}</div>
                      <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase text-neutral-500 dark:bg-neutral-900">
                        {source.kind === 'youtube'
                          ? (source.metadata?.youtube_source_type ?? 'youtube')
                          : source.kind === 'twitter'
                            ? xSourceBadge(source)
                            : source.kind === 'reddit'
                              ? `r/${source.metadata?.reddit_subreddit ?? 'reddit'}`
                              : source.kind === 'hackernews'
                                ? `HN ${source.metadata?.hn_feed_type ?? 'top'}`
                                : source.kind}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-neutral-500">{source.url}</div>
                  </div>
                </div>
              </button>
              <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[11px]">
                <SmallStat label="今日" value={counts.today} />
                <SmallStat label="新增" value={counts.newItems} />
                <SmallStat label="已保存" value={counts.saved} />
              </div>
              {activeTask ? (
                <TaskInline task={activeTask} />
              ) : running && latestRun ? (
                <RunInline run={latestRun} stage={stage} />
              ) : source.last_fetch_error &&
                !isTranscriptExtractionWarning(source.last_fetch_error) ? (
                <div className="mt-2 flex gap-1.5 rounded-md bg-rose-50 p-2 text-[11px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
                  <AlertTriangle size={13} className="shrink-0" />
                  <span className="line-clamp-2">{source.last_fetch_error}</span>
                </div>
              ) : latestRun?.status === 'partial' ? (
                <div className="mt-2 flex gap-1.5 rounded-md bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                  <AlertTriangle size={13} className="shrink-0" />
                  <span className="line-clamp-2">
                    {latestRun.error ?? '部分条目已抓取，但没有转录文本。'}
                  </span>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-1 text-[11px] text-neutral-500">
                  <Clock size={12} />
                  <span>
                    {source.last_fetched_at ? formatRelative(source.last_fetched_at) : '从未抓取'}
                  </span>
                </div>
              )}
              <div className="mt-3 flex items-center gap-1">
                <button
                  title="刷新来源"
                  disabled={busy}
                  onClick={() => onRefresh(source)}
                  className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-neutral-200 text-[11px] hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                >
                  <RefreshCw size={12} className={running ? 'animate-spin' : ''} />
                  {activeTask ? feedTaskStatusLabel(activeTask.status) : running ? '抓取中' : '抓取'}
                </button>
                <button
                  title={source.enabled ? '停用来源' : '启用来源'}
                  onClick={() => onToggle(source)}
                  className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-neutral-200 text-[11px] hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                >
                  {source.enabled ? <Check size={12} /> : <Ban size={12} />}
                  {source.enabled ? '开启' : '关闭'}
                </button>
                <button
                  title="移除来源"
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
  const isX = item.metadata?.provider === 'x';
  const isReddit = item.metadata?.provider === 'reddit';
  const isHackerNews = item.metadata?.provider === 'hackernews';
  return (
    <article
      className={`group cursor-pointer px-4 py-3 transition ${
        active
          ? 'bg-sky-50/80 dark:bg-sky-950/25'
          : 'bg-white hover:bg-neutral-50 dark:bg-neutral-950 dark:hover:bg-neutral-900/70'
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
              <span
                title="YouTube 视频"
                className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] text-red-700 dark:bg-red-950/40 dark:text-red-200"
              >
                <PlayCircle size={11} />
                视频
              </span>
            ) : null}
            {isX ? (
              <span
                title="X 内容"
                className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] text-sky-700 dark:bg-sky-950/40 dark:text-sky-100"
              >
                <AtSign size={11} />
                X
              </span>
            ) : null}
            {isReddit ? (
              <span
                title="Reddit 内容"
                className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] text-orange-700 dark:bg-orange-950/40 dark:text-orange-100"
              >
                <MessageSquare size={11} />
                Reddit
              </span>
            ) : null}
            {isHackerNews ? (
              <span
                title="Hacker News 内容"
                className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
              >
                <Newspaper size={11} />
                HN
              </span>
            ) : null}
            {hasAnalysis ? (
              <span
                title="已有分析"
                className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700 dark:bg-violet-950/40 dark:text-violet-200"
              >
                <Sparkles size={11} />
                分析
              </span>
            ) : null}
            {item.extracted_ref ? (
              <span
                title="已缓存可读提取内容"
                className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
              >
                {isYouTube ? (hasYouTubeTranscript(item) ? '转录' : '描述') : '已提取'}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-500">
            <span>{source?.title ?? item.source_id}</span>
            <span>{formatRelative(item.published_at ?? item.fetched_at)}</span>
            <span>{labelForStatus(item.status)}</span>
            {item.language ? <span>{item.language}</span> : null}
            {item.metadata?.duration_human ? <span>{item.metadata.duration_human}</span> : null}
            {typeof item.metadata?.view_count === 'number' ? (
              <span>{formatCompactNumber(item.metadata.view_count)} 次查看</span>
            ) : null}
            {typeof item.metadata?.like_count === 'number' ? (
              <span>{formatCompactNumber(item.metadata.like_count)} 喜欢</span>
            ) : null}
            {typeof item.metadata?.score_count === 'number' ? (
              <span>{formatCompactNumber(item.metadata.score_count)} 分</span>
            ) : null}
            {typeof item.metadata?.comment_count === 'number' ? (
              <span>{formatCompactNumber(item.metadata.comment_count)} 评论</span>
            ) : null}
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-5 text-neutral-600 dark:text-neutral-300">
            {item.summary || item.excerpt || item.url}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            title="保存到资料库"
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
            title="标为已读"
            onClick={(event) => {
              event.stopPropagation();
              onSeen();
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
          >
            <Eye size={13} />
          </button>
          <button
            title="忽略"
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
      setContentError('转录读取 IPC 尚未激活。请重启开发应用以加载更新后的 preload。');
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
        if (!cancelled) setContentError(err instanceof Error ? err.message : '加载可读内容失败。');
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
          选择一个信号以查看来源、合成与提升路径。
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      <div className="shrink-0 p-4 pb-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">已选信号</div>
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
            {item.metadata?.provider === 'x' ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
                <span className="inline-flex items-center gap-1">
                  <AtSign size={12} />
                  X
                </span>
                {item.metadata.author_handle ? <span>@{item.metadata.author_handle}</span> : null}
                {item.metadata.is_reply ? <span>回复</span> : <span>主贴</span>}
              </div>
            ) : null}
            {item.metadata?.provider === 'reddit' ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
                <span className="inline-flex items-center gap-1">
                  <MessageSquare size={12} />
                  Reddit
                </span>
                {item.metadata.subreddit ? <span>r/{item.metadata.subreddit}</span> : null}
                {item.author ? <span>{item.author}</span> : null}
              </div>
            ) : null}
            {item.metadata?.provider === 'hackernews' ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
                <span className="inline-flex items-center gap-1">
                  <Newspaper size={12} />
                  Hacker News
                </span>
                {item.metadata.hn_feed_type ? <span>{item.metadata.hn_feed_type}</span> : null}
                {item.author ? <span>{item.author}</span> : null}
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
            保存
          </button>
          <button
            onClick={() => onSeen(item)}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-neutral-200 bg-white text-[11px] dark:border-neutral-800 dark:bg-neutral-900"
          >
            <Eye size={13} />
            已读
          </button>
          <button
            onClick={() => onIgnore(item)}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-neutral-200 bg-white text-[11px] dark:border-neutral-800 dark:bg-neutral-900"
          >
            <Ban size={13} />
            忽略
          </button>
        </div>

        <a
          href={item.url}
          className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1 rounded-md border border-neutral-200 bg-white text-[11px] dark:border-neutral-800 dark:bg-neutral-900"
        >
          <ExternalLink size={13} />
          打开原文
        </a>

        <div className="mt-4 flex rounded-md border border-neutral-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-900">
          {INSPECTOR_TABS.map((itemTab) => (
            <button
              key={itemTab}
              onClick={() => setTab(itemTab)}
              className={`h-7 flex-1 rounded text-[11px] capitalize ${
                tab === itemTab
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'text-neutral-500'
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
            <Section title="可读信号">
              <ReadableSignalText item={item} />
              {item.metadata?.provider === 'youtube' ? (
                <div className="mt-3 rounded-md bg-neutral-50 p-3 text-xs leading-5 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                  {hasYouTubeTranscript(item)
                    ? '此视频已捕获完整转录。'
                    : `此视频当前没有已捕获转录。${youtubeSubtitleStatusLabel(item)}。`}
                  <button
                    type="button"
                    onClick={() => setTab('content')}
                    className="mt-2 inline-flex h-7 items-center rounded-md border border-neutral-200 bg-white px-2 text-[11px] font-medium text-neutral-800 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
                  >
                    {hasYouTubeTranscript(item) ? '打开完整转录' : '打开缓存描述'}
                  </button>
                </div>
              ) : null}
              {item.metadata?.provider === 'x' ? (
                <div className="mt-3 grid grid-cols-4 gap-1 text-[11px] text-neutral-500">
                  <MiniMeta label="作者" value={item.metadata.author_handle ? `@${item.metadata.author_handle}` : '未知'} />
                  <MiniMeta label="喜欢" value={formatCompactNumber(item.metadata.like_count ?? 0)} />
                  <MiniMeta label="转发" value={formatCompactNumber(item.metadata.retweet_count ?? 0)} />
                  <MiniMeta label="查看" value={formatCompactNumber(item.metadata.view_count ?? 0)} />
                </div>
              ) : null}
              {item.metadata?.provider === 'reddit' ? (
                <div className="mt-3 grid grid-cols-3 gap-1 text-[11px] text-neutral-500">
                  <MiniMeta label="社区" value={item.metadata.subreddit ? `r/${item.metadata.subreddit}` : '未知'} />
                  <MiniMeta label="分数" value={formatCompactNumber(item.metadata.score_count ?? 0)} />
                  <MiniMeta label="评论" value={formatCompactNumber(item.metadata.comment_count ?? 0)} />
                </div>
              ) : null}
              {item.metadata?.provider === 'hackernews' ? (
                <div className="mt-3 grid grid-cols-3 gap-1 text-[11px] text-neutral-500">
                  <MiniMeta label="频道" value={item.metadata.hn_feed_type ?? 'top'} />
                  <MiniMeta label="分数" value={formatCompactNumber(item.metadata.score_count ?? 0)} />
                  <MiniMeta label="评论" value={formatCompactNumber(item.metadata.comment_count ?? 0)} />
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-1">
                <Pill
                  icon={<FileText size={12} />}
                  text={
                    item.metadata?.provider === 'youtube'
                      ? item.extracted_ref
                        ? hasYouTubeTranscript(item)
                          ? '已缓存转录'
                          : `已缓存描述；${youtubeSubtitleStatusLabel(item)}`
                        : '转录待处理'
                      : item.metadata?.provider === 'x'
                        ? item.extracted_ref
                          ? '已缓存 X 正文'
                          : '可按需缓存'
                        : item.metadata?.provider === 'reddit'
                          ? item.extracted_ref
                            ? '已缓存 Reddit 快照'
                            : '可按需缓存'
                          : item.metadata?.provider === 'hackernews'
                            ? item.extracted_ref
                              ? '已缓存 HN 快照'
                              : '可按需缓存'
                            : item.extracted_ref
                              ? '已缓存提取文本'
                              : '提取待处理'
                  }
                />
                <Pill
                  icon={<Languages size={12} />}
                  text={translation ? `翻译 ${translation.payload.target_language}` : '暂无翻译'}
                />
                <Pill icon={<Sparkles size={12} />} text={analysis ? '已有分析' : '暂无条目分析'} />
                {item.metadata?.subtitle_language ? (
                  <Pill
                    icon={<PlayCircle size={12} />}
                    text={`字幕 ${item.metadata.subtitle_language}`}
                  />
                ) : null}
              </div>
            </Section>

            <Section title="今日合成">
              <SynthesisSummary artifact={digest} fallback="生成摘要以查看今日重点信号。" />
              <SynthesisSummary artifact={cluster} fallback="生成聚类以分组相关信号。" />
              <SynthesisSummary artifact={report} fallback="生成报告以记录变化。" />
              <div className="mt-3 grid grid-cols-3 gap-1">
                <MiniAction onClick={onDigest} label="摘要" />
                <MiniAction onClick={onCluster} label="聚类" />
                <MiniAction onClick={onReport} label="报告" />
              </div>
            </Section>
          </div>
        ) : null}

        {tab === 'content' ? (
          <div className="mt-4 space-y-4">
            <Section
              title={
                item.metadata?.provider === 'youtube'
                  ? hasYouTubeTranscript(item)
                    ? 'YouTube 字幕 / 转录'
                    : 'YouTube 描述'
                  : item.metadata?.provider === 'x'
                    ? 'X 正文'
                    : item.metadata?.provider === 'reddit'
                      ? 'Reddit 快照'
                      : item.metadata?.provider === 'hackernews'
                        ? 'Hacker News 快照'
                        : '可读内容'
              }
            >
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
            <Section title="条目分析">
              {analysis ? (
                <div className="space-y-3 text-sm">
                  <p className="leading-6 text-neutral-700 dark:text-neutral-300">
                    {analysis.payload.summary}
                  </p>
                  <KeyValueList title="关键点" values={analysis.payload.key_points} />
                  <KeyValueList title="实体" values={analysis.payload.entities} inline />
                  <KeyValueList title="建议行动" values={analysis.payload.suggested_actions} />
                </div>
              ) : (
                <p className="text-sm text-neutral-500">
                  条目保存后，或来源处理策略运行 enrich 时，会创建分析产物。
                </p>
              )}
            </Section>
            <Section title="翻译">
              {translation ? (
                <div className="text-sm leading-6 text-neutral-700 dark:text-neutral-300">
                  <div className="mb-2 text-xs text-neutral-500">
                    目标：{translation.payload.target_language}
                  </div>
                  <div className="max-h-72 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words rounded-md bg-neutral-50 p-3 text-xs leading-5 [overflow-wrap:anywhere] dark:bg-neutral-900">
                    {translation.payload.content}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-500">尚未附加翻译产物。</p>
              )}
            </Section>
          </div>
        ) : null}

        {tab === 'provenance' ? (
          <div className="mt-4 space-y-4">
            <Section title="来源">
              <Meta label="来源" value={source?.title ?? item.source_id} />
              {item.metadata?.provider ? (
                <Meta label="Provider" value={item.metadata.provider} />
              ) : null}
              {item.metadata?.external_id ? (
                <Meta label="外部 ID" value={item.metadata.external_id} mono />
              ) : null}
              {item.metadata?.channel_name ? (
                <Meta label="频道" value={item.metadata.channel_name} />
              ) : null}
              {item.metadata?.author_handle ? (
                <Meta label="X 作者" value={`@${item.metadata.author_handle}`} />
              ) : null}
              {item.metadata?.x_handle ? (
                <Meta label="X 来源账号" value={`@${item.metadata.x_handle}`} />
              ) : null}
              {item.metadata?.subreddit ? (
                <Meta label="Reddit 社区" value={`r/${item.metadata.subreddit}`} />
              ) : null}
              {item.metadata?.hn_feed_type ? (
                <Meta label="HN 频道" value={item.metadata.hn_feed_type} />
              ) : null}
              {item.metadata?.outbound_url ? (
                <Meta label="外链" value={item.metadata.outbound_url} />
              ) : null}
              {item.metadata?.duration_human ? (
                <Meta label="时长" value={item.metadata.duration_human} />
              ) : null}
              {typeof item.metadata?.view_count === 'number' ? (
                <Meta label="查看次数" value={formatCompactNumber(item.metadata.view_count)} />
              ) : null}
              {typeof item.metadata?.like_count === 'number' ? (
                <Meta label="喜欢" value={formatCompactNumber(item.metadata.like_count)} />
              ) : null}
              {typeof item.metadata?.retweet_count === 'number' ? (
                <Meta label="转发" value={formatCompactNumber(item.metadata.retweet_count)} />
              ) : null}
              {typeof item.metadata?.score_count === 'number' ? (
                <Meta label="分数" value={formatCompactNumber(item.metadata.score_count)} />
              ) : null}
              {typeof item.metadata?.comment_count === 'number' ? (
                <Meta label="评论" value={formatCompactNumber(item.metadata.comment_count)} />
              ) : null}
              <Meta
                label="发布时间"
                value={item.published_at ? new Date(item.published_at).toLocaleString() : '未知'}
              />
              <Meta label="抓取时间" value={new Date(item.fetched_at).toLocaleString()} />
              <Meta label="规范 URL" value={item.canonical_url ?? item.url} />
              <Meta label="内容哈希" value={item.content_hash ?? '缺失'} mono />
            </Section>
            <Section title="存储引用">
              <Meta label="原始" value={item.raw_ref?.path ?? '缺失'} mono />
              {item.raw_refs?.length ? (
                <Meta
                  label="原始引用"
                  value={item.raw_refs.map((ref) => ref.path ?? ref.kind).join('\n')}
                  mono
                />
              ) : null}
              <Meta label="已提取" value={item.extracted_ref?.path ?? '缺失'} mono />
              <Meta label="抓取运行" value={item.fetch_run_id ?? '缺失'} mono />
              <Meta label="资料库条目" value={item.saved_library_item_id ?? '未保存'} mono />
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
  if (loading) return <p className="text-sm text-neutral-500">提取内容加载中...</p>;
  if (error) {
    return (
      <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
        {error}
      </div>
    );
  }
  if (!content) return <p className="text-sm text-neutral-500">打开此标签页以加载提取内容。</p>;

  const isYouTube = item.metadata?.provider === 'youtube';
  const isX = item.metadata?.provider === 'x';
  const isReddit = item.metadata?.provider === 'reddit';
  const isHackerNews = item.metadata?.provider === 'hackernews';
  const transcriptSection = isYouTube ? extractMarkdownSection(content.content, '转录') : null;
  const transcript =
    transcriptSection && !isMissingTranscriptText(transcriptSection) ? transcriptSection : null;
  const description = isYouTube ? extractMarkdownSection(content.content, '描述') : null;
  const displayContent = isYouTube ? transcript : content.content;

  return (
    <div className="space-y-3">
      {isYouTube ? (
        <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-500">
          <MiniMeta label="字幕" value={youtubeSubtitleStatusLabel(item)} />
          <MiniMeta label="格式" value={item.metadata?.subtitle_format ?? '未知'} />
          <MiniMeta
            label="请求语言"
            value={compactLanguageList(item.metadata?.subtitle_requested_languages)}
          />
          <MiniMeta label="公开字幕" value={youtubeExposedSubtitleLabel(item)} />
          <MiniMeta label="轨道" value={youtubeTranscriptTracksLabel(item)} />
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
              {track.translation_of_track_id ? ' 翻译' : ''}
            </span>
          ))}
        </div>
      ) : null}
      {isX ? (
        <div className="grid grid-cols-4 gap-2 text-[11px] text-neutral-500">
          <MiniMeta label="作者" value={item.metadata?.author_handle ? `@${item.metadata.author_handle}` : '未知'} />
          <MiniMeta label="喜欢" value={formatCompactNumber(item.metadata?.like_count ?? 0)} />
          <MiniMeta label="转发" value={formatCompactNumber(item.metadata?.retweet_count ?? 0)} />
          <MiniMeta label="查看" value={formatCompactNumber(item.metadata?.view_count ?? 0)} />
        </div>
      ) : null}
      {isReddit ? (
        <div className="grid grid-cols-3 gap-2 text-[11px] text-neutral-500">
          <MiniMeta label="社区" value={item.metadata?.subreddit ? `r/${item.metadata.subreddit}` : '未知'} />
          <MiniMeta label="分数" value={formatCompactNumber(item.metadata?.score_count ?? 0)} />
          <MiniMeta label="评论" value={formatCompactNumber(item.metadata?.comment_count ?? 0)} />
        </div>
      ) : null}
      {isHackerNews ? (
        <div className="grid grid-cols-3 gap-2 text-[11px] text-neutral-500">
          <MiniMeta label="频道" value={item.metadata?.hn_feed_type ?? 'top'} />
          <MiniMeta label="分数" value={formatCompactNumber(item.metadata?.score_count ?? 0)} />
          <MiniMeta label="评论" value={formatCompactNumber(item.metadata?.comment_count ?? 0)} />
        </div>
      ) : null}
      {description ? (
        <details className="rounded-md bg-neutral-50 p-3 text-xs dark:bg-neutral-900">
          <summary className="cursor-pointer text-neutral-600 dark:text-neutral-300">描述</summary>
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
          {isYouTube ? 'YouTube 未提供此视频字幕。Orbit 仍已缓存视频元数据和描述。' : '此条目没有可读缓存。'}
        </div>
      )}
      <div className="text-[11px] text-neutral-500">
        存储为 {content.content_kind}
        {content.ref?.path ? ` / ${content.ref.path}` : ''}
      </div>
    </div>
  );
}

function MiniMeta({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-md bg-neutral-50 px-2 py-1 dark:bg-neutral-900">
      <div>{label}</div>
      <div className="mt-0.5 break-words font-medium text-neutral-700 dark:text-neutral-200">
        {value}
      </div>
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
          <span className="truncate font-medium">正在抓取 {source?.title ?? run.source_url}</span>
        </div>
        <span className="shrink-0 text-sky-600 dark:text-sky-200">{progress}</span>
      </div>
      <div className="mt-1 truncate text-sky-700 dark:text-sky-200">
        {stage?.detail ?? '正在准备 Feed 运行。'}
      </div>
    </div>
  );
}

function RunInline({
  run,
  stage
}: {
  run: FeedFetchRun;
  stage?: FeedFetchRunStageLike;
}): JSX.Element {
  return (
    <div className="mt-2 rounded-md bg-sky-50 p-2 text-[11px] text-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1">
          <RefreshCw size={12} className="shrink-0 animate-spin" />
          <span className="truncate">{stage?.label ?? '抓取中'}</span>
        </span>
        <span className="shrink-0">{progressLabel(stage)}</span>
      </div>
      <div className="mt-1 line-clamp-2 text-sky-700 dark:text-sky-200">
        {stage?.detail ?? `已抓取 ${run.created}/${run.fetched} 条内容。`}
      </div>
    </div>
  );
}

function TaskInline({ task }: { task: FeedTask }): JSX.Element {
  return (
    <div className="mt-2 rounded-md bg-sky-50 p-2 text-[11px] text-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1">
          <RefreshCw
            size={12}
            className={`shrink-0 ${task.status === 'running' ? 'animate-spin' : ''}`}
          />
          <span className="truncate">{feedTaskKindLabel(task.kind)}</span>
        </span>
        <span className="shrink-0">{feedTaskStatusLabel(task.status)}</span>
      </div>
      <div className="mt-1 line-clamp-2 text-sky-700 dark:text-sky-200">
        {task.status === 'retry_wait'
          ? `等待重试：${formatRelative(task.due_at)}`
          : task.error ?? `${feedTaskPlatformLabel(task.platform)} 任务处理中。`}
      </div>
    </div>
  );
}

type FeedFetchRunStageLike = NonNullable<FeedFetchRun['stages']>[number];

function currentRunStage(run?: FeedFetchRun | null): FeedFetchRunStageLike | undefined {
  return (
    run?.stages?.find((stage) => stage.status === 'running') ??
    run?.stages?.find((stage) => stage.status === 'pending') ??
    run?.stages?.at(-1)
  );
}

function progressLabel(stage?: FeedFetchRunStageLike): string {
  if (!stage || stage.total === undefined) return '处理中';
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

  const Icon =
    item.metadata?.provider === 'youtube'
      ? PlayCircle
      : item.metadata?.provider === 'x'
        ? AtSign
        : item.metadata?.provider === 'reddit'
          ? MessageSquare
          : item.metadata?.provider === 'hackernews'
            ? Newspaper
            : FileText;
  return (
    <div
      className={`${className} flex items-center justify-center bg-neutral-100 text-neutral-400 dark:bg-neutral-900`}
    >
      <Icon size={compact ? 18 : 32} />
    </div>
  );
}

function SynthesisSummary({
  artifact,
  fallback
}: {
  artifact: FeedSynthesisArtifact | null;
  fallback: string;
}): JSX.Element {
  if (!artifact) return <p className="mt-2 text-xs text-neutral-500">{fallback}</p>;
  if (artifact.kind === 'feed.digest') {
    const payload = artifact.payload as FeedDigestPayload;
    return (
      <div className="mt-2 rounded-md bg-sky-50 p-2 text-xs text-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
        <div className="font-medium">{payload.headline}</div>
        <div className="mt-1 text-sky-700 dark:text-sky-200">
          {payload.highlights
            .slice(0, 3)
            .map((item) => item.title)
            .join(' / ')}
        </div>
      </div>
    );
  }
  if (artifact.kind === 'feed.cluster') {
    const payload = artifact.payload as FeedClusterPayload;
    return (
      <div className="mt-2 rounded-md bg-violet-50 p-2 text-xs text-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
        <div className="font-medium">{payload.clusters.length} 个聚类</div>
        <div className="mt-1 text-violet-700 dark:text-violet-200">
          {payload.clusters
            .slice(0, 3)
            .map((item) => item.label)
            .join(' / ')}
        </div>
      </div>
    );
  }
  const payload = artifact.payload as FeedReportPayload;
  return (
    <div className="mt-2 rounded-md bg-emerald-50 p-2 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
      <div className="font-medium">{payload.item_count} 条内容报告</div>
      <div className="mt-1 text-emerald-700 dark:text-emerald-200">
        {payload.sections
          .slice(0, 3)
          .map((item) => item.summary)
          .join(' / ')}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: 'sky' | 'emerald' | 'violet' | 'rose' | 'neutral';
}): JSX.Element {
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

function TaskStat({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: 'sky' | 'neutral' | 'amber' | 'rose';
}): JSX.Element {
  const className = {
    sky: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-200',
    neutral: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300',
    amber: 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-100',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200'
  }[tone];
  return (
    <div className={`rounded-md px-2 py-2 text-center ${className}`}>
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[11px]">{label}</div>
    </div>
  );
}

function Meta({
  label,
  value,
  mono
}: {
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div className="mt-2">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div
        className={`mt-0.5 whitespace-pre-wrap break-words text-xs text-neutral-800 [overflow-wrap:anywhere] dark:text-neutral-200 ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </div>
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

function KeyValueList({
  title,
  values,
  inline
}: {
  title: string;
  values: string[];
  inline?: boolean;
}): JSX.Element | null {
  if (values.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-medium text-neutral-500">{title}</div>
      <div className={`mt-1 ${inline ? 'flex flex-wrap gap-1' : 'space-y-1'}`}>
        {values.map((value) =>
          inline ? (
            <span
              key={value}
              className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300"
            >
              {value}
            </span>
          ) : (
            <div
              key={value}
              className="rounded-md bg-neutral-50 p-2 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            >
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
    <button
      onClick={onClick}
      className="h-7 rounded-md border border-neutral-200 bg-white text-[11px] dark:border-neutral-800 dark:bg-neutral-900"
    >
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
        {activeSource ? '此来源没有符合当前筛选条件的信号。' : '没有符合当前筛选条件的信号。'}
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
  if (status === 'all') return '全部';
  if (status === 'new') return '新增';
  if (status === 'seen') return '已读';
  if (status === 'saved') return '已保存';
  if (status === 'ignored') return '已忽略';
  if (status === 'expired') return '已过期';
  return status;
}

function taskBySource(snapshot: FeedTaskSnapshot | null): Map<string, FeedTask> {
  const map = new Map<string, FeedTask>();
  const active = (snapshot?.jobs ?? [])
    .filter((job) => job.status === 'running' || job.status === 'queued' || job.status === 'retry_wait')
    .sort((a, b) => feedTaskStatusWeight(a.status) - feedTaskStatusWeight(b.status));
  for (const job of active) {
    if (!map.has(job.source_id)) map.set(job.source_id, job);
  }
  return map;
}

function feedTaskStatusWeight(status: FeedTaskStatus): number {
  if (status === 'running') return 0;
  if (status === 'queued') return 1;
  if (status === 'retry_wait') return 2;
  if (status === 'failed') return 3;
  if (status === 'success') return 4;
  return 5;
}

function feedTaskKindLabel(kind: FeedTask['kind']): string {
  return kind === 'source.initial_fetch' ? '首次抓取' : '订阅更新';
}

function feedTaskPlatformLabel(platform: FeedTask['platform']): string {
  if (platform === 'youtube') return 'YouTube';
  if (platform === 'x') return 'X';
  if (platform === 'reddit') return 'Reddit';
  if (platform === 'hackernews') return 'Hacker News';
  if (platform === 'rss') return 'RSS';
  return 'Custom';
}

function feedTaskStatusLabel(status: FeedTaskStatus): string {
  if (status === 'queued') return '排队';
  if (status === 'running') return '运行中';
  if (status === 'retry_wait') return '等待重试';
  if (status === 'success') return '成功';
  if (status === 'failed') return '失败';
  return '已取消';
}

function feedTaskStatusDotClass(status: FeedTaskStatus): string {
  if (status === 'running') return 'bg-sky-500';
  if (status === 'queued') return 'bg-neutral-400';
  if (status === 'retry_wait') return 'bg-amber-500';
  if (status === 'success') return 'bg-emerald-500';
  if (status === 'failed') return 'bg-rose-500';
  return 'bg-neutral-300';
}

function feedTaskStatusClass(status: FeedTaskStatus): string {
  if (status === 'running') return 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-100';
  if (status === 'queued') return 'bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300';
  if (status === 'retry_wait') return 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-100';
  if (status === 'success') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200';
  if (status === 'failed') return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200';
  return 'bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400';
}

function looksLikeYouTubeSource(value: string): boolean {
  const trimmed = value.trim();
  try {
    const host = new URL(trimmed).hostname.replace(/^www\./, '').replace(/^m\./, '');
    return host === 'youtube.com' || host === 'youtu.be';
  } catch {
    return false;
  }
}

function looksLikeXSource(value: string): boolean {
  try {
    const host = new URL(value.trim()).hostname.replace(/^www\./, '').replace(/^mobile\./, '');
    return host === 'x.com' || host === 'twitter.com';
  } catch {
    return false;
  }
}

function looksLikeXTimelineSource(value: string): boolean {
  return xTimelineModeFromInput(value) !== null;
}

function xTimelineModeFromInput(value: string): 'following' | 'for-you' | null {
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, '').replace(/^mobile\./, '');
    if (host === 'x.com' || host === 'twitter.com') {
      const segment = parsed.pathname.split('/').filter(Boolean)[0];
      if (segment) return xTimelineModeFromToken(segment);
    }
  } catch {
    // Fall through to shorthand parsing below.
  }
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^x:/, '')
    .replace(/^twitter:/, '')
    .replace(/^\/+/, '')
    .replace(/^timeline\//, '')
    .replace(/^x:\/\/timeline\//, '');
  return xTimelineModeFromToken(normalized);
}

function xTimelineModeFromToken(value: string): 'following' | 'for-you' | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'following') return 'following';
  if (normalized === 'foryou' || normalized === 'for-you' || normalized === 'for_you' || normalized === 'home') return 'for-you';
  return null;
}

function xSourceBadge(source: FeedSource): string {
  if (source.metadata?.x_timeline_type === 'following') return 'X Following';
  if (source.metadata?.x_timeline_type === 'for-you') return 'X For You';
  return `@${source.metadata?.x_handle ?? 'x'}`;
}

function looksLikeRedditSource(value: string): boolean {
  const trimmed = value.trim();
  if (/^(?:\/?r\/|reddit:)/i.test(trimmed)) return true;
  try {
    const host = new URL(trimmed).hostname.replace(/^www\./, '').replace(/^old\./, '').replace(/^new\./, '').replace(/^m\./, '');
    return host === 'reddit.com';
  } catch {
    return false;
  }
}

function looksLikeHackerNewsSource(value: string): boolean {
  const trimmed = value.trim();
  if (/^(?:hn:|hackernews:)/i.test(trimmed)) return true;
  try {
    return new URL(trimmed).hostname.replace(/^www\./, '') === 'news.ycombinator.com';
  } catch {
    return false;
  }
}

function redditSourceInputWithSort(value: string, sort: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const cleaned = trimmed.replace(/^reddit:/i, '').replace(/^\/+/, '');
  const segments = cleaned.split('/').filter(Boolean);
  const subreddit = segments[0]?.toLowerCase() === 'r' ? segments[1] : segments[0];
  const explicitSort = segments[0]?.toLowerCase() === 'r' ? segments[2] : segments[1];
  if (!subreddit || explicitSort) return trimmed;
  return `r/${subreddit}/${sort}`;
}

function hasYouTubeTranscript(item: FeedItem): boolean {
  return (
    item.metadata?.provider === 'youtube' &&
    (item.metadata.has_transcript === true ||
      (item.media?.transcript_tracks?.some((track) => track.status === 'captured') ?? false))
  );
}

function inspectorTabLabel(item: FeedItem, tab: InspectorTab): string {
  if (tab !== 'content') return tab;
  if (item.metadata?.provider === 'reddit') return '帖子';
  if (item.metadata?.provider === 'hackernews') return '讨论';
  if (item.metadata?.provider !== 'youtube') return tab;
  return hasYouTubeTranscript(item) ? '转录' : '描述';
}

function youtubeSubtitleStatusLabel(item: FeedItem): string {
  if (item.metadata?.provider !== 'youtube') return 'N/A';
  if (item.metadata.has_transcript) {
    return item.metadata.subtitle_language ? `已捕获 ${item.metadata.subtitle_language}` : '已捕获';
  }
  if (item.metadata.subtitle_status === 'not_exposed') return 'YouTube 未公开';
  if (item.metadata.subtitle_status === 'available_but_not_downloaded') return '可用但未下载';
  return '缺失';
}

function youtubeTranscriptTracksLabel(item: FeedItem): string {
  const tracks = item.media?.transcript_tracks ?? [];
  if (tracks.length === 0) return '无';
  const languages = [...new Set(tracks.map((track) => track.language))];
  return `${tracks.length} / ${compactLanguageList(languages)}`;
}

function youtubeExposedSubtitleLabel(item: FeedItem): string {
  const manual = item.metadata?.subtitle_available_languages ?? [];
  const automatic = item.metadata?.automatic_caption_languages ?? [];
  const values = [
    manual.length > 0 ? `手动 ${compactLanguageList(manual)}` : null,
    automatic.length > 0 ? `自动 ${compactLanguageList(automatic)}` : null
  ].filter(Boolean);
  return values.length > 0 ? values.join(' / ') : '无公开信息';
}

function compactLanguageList(values?: string[]): string {
  if (!values || values.length === 0) return '无';
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
    heading === '转录'
      ? /<!-- YOUTUBE_TRANSCRIPT_START -->[\s\S]*?## Transcript\s*\n([\s\S]*?)\n<!-- YOUTUBE_TRANSCRIPT_END -->/i
      : null;
  const markerMatch = markerPattern?.exec(content);
  if (markerMatch?.[1]) return markerMatch[1].trim();

  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionMatch = new RegExp(
    `(?:^|\\n)## ${escapedHeading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
    'i'
  ).exec(content);
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
  if (diffMs < 0) {
    const futureMs = Math.abs(diffMs);
    if (futureMs < hour) return `${Math.max(1, Math.round(futureMs / minute))} 分钟后`;
    if (futureMs < day) return `${Math.round(futureMs / hour)} 小时后`;
    return date.toLocaleString();
  }
  if (Math.abs(diffMs) < hour) return `${Math.max(1, Math.round(diffMs / minute))} 分钟前`;
  if (Math.abs(diffMs) < day) return `${Math.round(diffMs / hour)} 小时前`;
  if (Math.abs(diffMs) < day * 7) return `${Math.round(diffMs / day)} 天前`;
  return date.toLocaleDateString();
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  );
}
