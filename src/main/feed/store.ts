import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  CreateFeedSourceInput,
  FeedAiSubtitlePayload,
  FeedAiSubtitleTranslationInput,
  FeedAiSubtitleTranslationResult,
  FeedBilingualPairRef,
  FeedClusterPayload,
  FeedDigestPayload,
  FeedFetchResult,
  FeedFetchRun,
  FeedFetchRunStage,
  FeedItem,
  FeedItemAnalysisPayload,
  FeedItemContent,
  FeedItemFilter,
  FeedItemTranslationPayload,
  FeedReadableRef,
  FeedReportPayload,
  FeedSource,
  FeedSynthesisResult,
  FeedTranscriptSegment,
  FeedTranscriptSegmentsFile,
  FeedTranscriptTrackRef,
  SaveFeedToLibraryInput,
  SaveFeedToLibraryResult,
  UpdateFeedSourceInput
} from '@shared/feed';
import { createLibraryStore } from '../library/store';
import { createSynthesisStore } from '../synthesis/store';
import { parseContentSource } from '../content-connectors';
import { parseRss } from '../capture/feed/rss';
import {
  defaultYouTubeFeedProvider,
  normalizeYouTubeSource,
  transcriptTrackId,
  youtubeSourceTitle,
  type YouTubeFeedProvider,
  type YouTubeSourceType
} from './youtube';

const FEEDS_ROOT = 'feeds';
const SOURCES_FILE = '_sources.json';
const FEED_ASSET_ROOT = path.join('.orbit', 'feed');
const DEFAULT_YOUTUBE_RECENT_COUNT = 20;
const DEFAULT_YOUTUBE_SUBTITLE_LANGUAGES = ['en', 'zh-Hans', 'zh'];
const YOUTUBE_DOWNLOAD_INTERVAL_MS = 5_000;
const YOUTUBE_RATE_LIMIT_BASE_DELAY_MS = 30_000;
const YOUTUBE_RATE_LIMIT_MAX_RETRIES = 5;
const YOUTUBE_TRANSIENT_RETRY_DELAY_MS = 5_000;

export interface FeedStoreOptions {
  now?: () => Date;
  fetchText?: (url: string) => Promise<string>;
  fetchReadableText?: (url: string) => Promise<string>;
  youtubeProvider?: YouTubeFeedProvider;
}

export class FeedStore {
  private readonly now: () => Date;
  private readonly fetchText: (url: string) => Promise<string>;
  private readonly fetchReadableText: (url: string) => Promise<string>;
  private readonly youtubeProvider: YouTubeFeedProvider;

  constructor(private readonly vaultPath: string, options: FeedStoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.fetchText = options.fetchText ?? defaultFetchText;
    this.fetchReadableText = options.fetchReadableText ?? defaultFetchReadableText;
    this.youtubeProvider = options.youtubeProvider ?? defaultYouTubeFeedProvider;
  }

  async listSources(): Promise<FeedSource[]> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.sourcesPath(), 'utf8')) as unknown;
      return Array.isArray(parsed)
        ? parsed.flatMap((value) => (isFeedSource(value) ? [normalizeFeedSource(value)] : []))
        : [];
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }

  async createSource(input: CreateFeedSourceInput): Promise<FeedSource> {
    const sources = await this.listSources();
    const requestedKind = input.kind ?? inferFeedSourceKind(input.url);
    const youtube = requestedKind === 'youtube' ? this.youtubeProvider.normalizeSource(input.url) : null;
    const url = youtube?.url ?? normalizeUrl(input.url);
    const duplicate = sources.find((source) => source.url === url);
    if (duplicate) return duplicate;
    const now = this.now().toISOString();
    const defaultProcessing = youtube
      ? { extract_readable: true, auto_analyze: false, generate_item_summary: true, preferred_languages: DEFAULT_YOUTUBE_SUBTITLE_LANGUAGES }
      : { extract_readable: false, auto_analyze: false, generate_item_summary: true };
    const defaultFetchPolicy = youtube
      ? {
          interval_minutes: 1440,
          max_items_per_fetch: DEFAULT_YOUTUBE_RECENT_COUNT,
          initial_backfill: 'recent' as const,
          initial_backfill_count: DEFAULT_YOUTUBE_RECENT_COUNT,
          respect_cache: true
        }
      : { interval_minutes: 1440, max_items_per_fetch: 50, respect_cache: true };
    const source: FeedSource = normalizeFeedSource({
      id: stableId('feed-source', url),
      title: input.title?.trim() || (youtube ? youtubeSourceTitle(youtube) : hostnameTitle(url)),
      url,
      kind: requestedKind,
      ...(youtube ? { metadata: { provider: 'youtube', youtube_source_type: youtube.source_type } } : {}),
      areas: input.areas ?? [],
      resource_refs: normalizeStrings(input.resource_refs ?? []),
      tags: normalizeTags(input.tags ?? []),
      priority: input.priority ?? 'normal',
      fetch_policy: { ...defaultFetchPolicy, ...(input.fetch_policy ?? {}) },
      processing_policy: { ...defaultProcessing, ...(input.processing_policy ?? {}) },
      retention_policy: input.retention_policy ?? { keep_raw_days: 30, keep_ignored_days: 30 },
      enabled: input.enabled ?? true,
      added_at: now,
      updated_at: now
    });
    await this.writeSources([...sources, source]);
    await fs.mkdir(this.sourceDir(source.id), { recursive: true });
    return source;
  }

  async updateSource(id: string, patch: UpdateFeedSourceInput): Promise<FeedSource> {
    const sources = await this.listSources();
    const index = sources.findIndex((source) => source.id === id);
    if (index < 0) throw new Error(`feed_source_not_found:${id}`);
    const next: FeedSource = normalizeFeedSource({
      ...sources[index],
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.areas !== undefined ? { areas: patch.areas } : {}),
      ...(patch.resource_refs !== undefined ? { resource_refs: normalizeStrings(patch.resource_refs) } : {}),
      ...(patch.tags !== undefined ? { tags: normalizeTags(patch.tags) } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.fetch_policy !== undefined ? { fetch_policy: patch.fetch_policy } : {}),
      ...(patch.processing_policy !== undefined ? { processing_policy: patch.processing_policy } : {}),
      ...(patch.retention_policy !== undefined ? { retention_policy: patch.retention_policy } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      updated_at: this.now().toISOString()
    });
    const all = [...sources];
    all[index] = next;
    await this.writeSources(all);
    return next;
  }

  async deleteSource(id: string): Promise<FeedSource | null> {
    const sources = await this.listSources();
    const removed = sources.find((source) => source.id === id) ?? null;
    if (!removed) return null;
    await this.writeSources(sources.filter((source) => source.id !== id));
    return removed;
  }

  async fetch(sourceId?: string): Promise<FeedFetchResult[]> {
    const sources = (await this.listSources()).filter((source) => source.enabled);
    const targets = sourceId ? sources.filter((source) => source.id === sourceId) : sources;
    if (sourceId && targets.length === 0) throw new Error(`feed_source_not_found:${sourceId}`);
    const results: FeedFetchResult[] = [];
    for (const source of targets) results.push(await this.fetchOne(source));
    return results;
  }

  async listFetchRuns(sourceId?: string): Promise<FeedFetchRun[]> {
    const dir = this.assetDir('runs');
    const files = await fs.readdir(dir).catch((error: unknown) => {
      if (isNotFound(error)) return [];
      throw error;
    });
    const runs = await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map((file) => fs.readFile(path.join(dir, file), 'utf8').then((raw) => JSON.parse(raw) as FeedFetchRun))
    );
    return runs
      .filter((run) => !sourceId || run.source_id === sourceId)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
  }

  async listItems(filter: FeedItemFilter = {}): Promise<FeedItem[]> {
    const sources = await this.listSources();
    const targetSourceIds = filter.source_id ? [filter.source_id] : sources.map((source) => source.id);
    const items = (await Promise.all(targetSourceIds.map((sourceId) => this.readItemsForSource(sourceId)))).flat();
    return items
      .filter((item) => !filter.status || item.status === filter.status)
      .filter((item) => filter.include_ignored || item.status !== 'ignored')
      .filter((item) => filter.include_saved || item.status !== 'saved')
      .sort((a, b) => b.fetched_at.localeCompare(a.fetched_at));
  }

  async getItem(id: string): Promise<FeedItem | null> {
    return (await this.listItems({ include_ignored: true, include_saved: true })).find((item) => item.id === id) ?? null;
  }

  async getItemContent(id: string): Promise<FeedItemContent> {
    const readable = await this.ensureReadableContent(id);
    return {
      item: readable.feed_item,
      content: readable.content,
      ref: readable.ref,
      content_kind: readable.ref.kind
    };
  }

  async markSeen(id: string): Promise<FeedItem> {
    const item = await this.requireItem(id);
    if (item.status === 'saved' || item.status === 'ignored') return item;
    return this.writeItem({ ...item, status: 'seen', seen_at: this.now().toISOString() });
  }

  async ignore(id: string): Promise<FeedItem> {
    const item = await this.requireItem(id);
    return this.writeItem({ ...item, status: 'ignored', ignored_at: this.now().toISOString() });
  }

  async ensureReadableContent(id: string): Promise<{ feed_item: FeedItem; content: string; ref: FeedReadableRef }> {
    const item = await this.requireItem(id);
    if (item.extracted_ref?.path) {
      const existing = await readOptional(path.join(this.vaultPath, item.extracted_ref.path));
      if (existing) return { feed_item: item, content: existing, ref: item.extracted_ref };
    }
    if (isYouTubeItem(item)) return this.ensureYouTubeReadableContent(item);

    const fetchedAt = this.now().toISOString();
    let rawRef = item.raw_ref;
    let markdown = '';
    try {
      const parsed = await parseContentSource(
        {
          url: item.url,
          canonicalUrl: item.canonical_url,
          title: item.title,
          text: item.summary ?? item.excerpt,
          platformHint: 'web',
          sourceKind: 'feed'
        },
        {
          now: this.now,
          fetch: async (url, init) => {
            const html = await this.fetchReadableText(url);
            rawRef = await this.writeAsset('raw', `${item.id}.html`, html, 'article_html', fetchedAt);
            return {
              ok: true,
              status: 200,
              text: async () => html,
              json: async () => JSON.parse(html)
            };
          }
        }
      );
      markdown = parsed.content_markdown ?? '';
    } catch {
      markdown = fallbackReadableMarkdown(item);
    }

    const content = markdown.trim() ? markdown : fallbackReadableMarkdown(item);
    const ref = await this.writeAsset('extracted', `${item.id}.md`, content, 'article_markdown', fetchedAt);
    const next = await this.writeItem({
      ...item,
      raw_ref: rawRef,
      extracted_ref: ref,
      content_hash: ref.content_hash,
      language: item.language ?? detectLanguage(content),
      excerpt: item.excerpt ?? firstMeaningfulParagraph(content)?.slice(0, 500),
      summary: item.summary ?? firstMeaningfulParagraph(content)?.slice(0, 500)
    });
    return { feed_item: next, content, ref };
  }

  async translateItem(id: string, targetLanguage = 'zh-CN'): Promise<FeedSynthesisResult<FeedItemTranslationPayload>> {
    const readable = await this.ensureReadableContent(id);
    const item = readable.feed_item;
    const payload: FeedItemTranslationPayload = {
      item_id: item.id,
      source_language: item.language,
      target_language: targetLanguage,
      title: item.title,
      excerpt: item.excerpt ?? item.summary,
      content: readable.content,
      note: 'Local fallback artifact: translation pipeline is wired, model-backed translation can replace this payload later.'
    };
    const artifact = (await createSynthesisStore(this.vaultPath).writeFresh({
      kind: 'feed.item.translation',
      scope_key: `feed.item.translation:${item.id}:${targetLanguage}`,
      sources: [feedSourceForArtifact(item, readable.content.slice(0, 500))],
      provenance: localFeedProvenance('feed.item.translation.v1'),
      payload
    })) as FeedSynthesisResult<FeedItemTranslationPayload>['artifact'];
    await this.appendItemArtifacts(item.id, [artifact.id], 'enrichment');
    return { artifact };
  }

  async attachAiSubtitleTranslation(
    id: string,
    input: FeedAiSubtitleTranslationInput
  ): Promise<FeedAiSubtitleTranslationResult> {
    const readable = await this.ensureReadableContent(id);
    const item = readable.feed_item;
    if (item.metadata?.provider !== 'youtube' || item.media?.provider !== 'youtube') {
      throw new Error(`feed_item_not_youtube:${id}`);
    }

    const sourceTrack =
      item.media.transcript_tracks.find((track) => track.id === input.source_track_id) ??
      item.media.transcript_tracks.find((track) => track.id === item.media?.preferred_track_id) ??
      item.media.transcript_tracks.find((track) => track.source === 'youtube' && track.status === 'captured');
    if (!sourceTrack?.segments_ref?.path) throw new Error(`feed_subtitle_source_track_missing:${id}`);

    const sourceSegmentsFile = await this.readSegmentsFile(sourceTrack.segments_ref.path);
    const translatedSegments = alignTranslatedSubtitleSegments(sourceSegmentsFile.segments, input.translated_segments);
    if (translatedSegments.length === 0) throw new Error('feed_subtitle_translation_empty');

    const createdAt = this.now().toISOString();
    const outputTrackId = transcriptTrackId('ai', input.target_language, 'ai_translation');
    const segmentsFile: FeedTranscriptSegmentsFile = {
      version: 1,
      item_id: item.id,
      track_id: outputTrackId,
      language: input.target_language,
      source: 'ai',
      source_kind: 'ai_translation',
      translation_of_track_id: sourceTrack.id,
      generated_from_track_id: sourceTrack.id,
      segments: translatedSegments
    };
    const outputSegmentsRef = await this.writeAsset(
      'extracted',
      `${item.id}.transcript.ai.${safeAssetName(input.target_language)}.segments.json`,
      `${JSON.stringify(segmentsFile, null, 2)}\n`,
      'youtube_transcript_segments',
      createdAt
    );
    const interleavedMarkdown = buildInterleavedSubtitleMarkdown({
      title: item.title,
      sourceTrackLabel: sourceTrack.label,
      targetLanguage: input.target_language,
      sourceSegments: sourceSegmentsFile.segments,
      translatedSegments
    });
    const outputMarkdownRef = await this.writeAsset(
      'extracted',
      `${item.id}.transcript.bilingual.${safeAssetName(sourceTrack.language)}.${safeAssetName(input.target_language)}.md`,
      interleavedMarkdown,
      'youtube_bilingual_transcript',
      createdAt
    );

    const payload: FeedAiSubtitlePayload = {
      item_id: item.id,
      source_track_id: sourceTrack.id,
      target_language: input.target_language,
      mode: 'translate_subtitle',
      model: input.model ?? 'external-ai-translation',
      prompt_version: input.prompt_version ?? 'feed.youtube.subtitle.ai.v1',
      output_track_id: outputTrackId,
      output_segments_ref: outputSegmentsRef,
      output_markdown_ref: outputMarkdownRef
    };
    const artifact = (await createSynthesisStore(this.vaultPath).writeFresh({
      kind: 'feed.youtube.subtitle.ai',
      scope_key: `feed.youtube.subtitle.ai:${item.id}:${sourceTrack.id}:${input.target_language}`,
      sources: [feedSourceForArtifact(item, readable.content.slice(0, 500))],
      provenance: localFeedProvenance(payload.prompt_version),
      payload
    })) as FeedAiSubtitleTranslationResult['artifact'];

    const track: FeedTranscriptTrackRef = {
      id: outputTrackId,
      language: input.target_language,
      label: `AI translation ${input.target_language}`,
      source: 'ai',
      source_kind: 'ai_translation',
      status: 'captured',
      alignment: 'segment_exact',
      segments_ref: outputSegmentsRef,
      markdown_ref: outputMarkdownRef,
      translation_of_track_id: sourceTrack.id,
      generated_from_track_id: sourceTrack.id,
      artifact_id: artifact.id,
      content_hash: outputSegmentsRef.content_hash,
      created_at: createdAt
    };
    const bilingualPair: FeedBilingualPairRef = {
      id: `bilingual:${sourceTrack.id}:${outputTrackId}`,
      source_track_id: sourceTrack.id,
      translation_track_id: outputTrackId,
      mode: 'interleaved',
      markdown_ref: outputMarkdownRef,
      created_at: createdAt
    };
    const next = await this.writeItem({
      ...item,
      media: {
        ...item.media,
        transcript_tracks: replaceById(item.media.transcript_tracks, track),
        preferred_bilingual_pair_id: bilingualPair.id,
        bilingual_pairs: replaceById(item.media.bilingual_pairs ?? [], bilingualPair)
      },
      enrichment_artifact_ids: [...new Set([...(item.enrichment_artifact_ids ?? []), artifact.id])]
    });
    return { feed_item: next, artifact, track, bilingual_pair: bilingualPair };
  }

  async analyzeItem(id: string): Promise<FeedSynthesisResult<FeedItemAnalysisPayload>> {
    const readable = await this.ensureReadableContent(id);
    const item = readable.feed_item;
    const paragraphs = meaningfulParagraphs(readable.content);
    const keyPoints = paragraphs.slice(0, 5).map((part) => part.slice(0, 220));
    const payload: FeedItemAnalysisPayload = {
      item_id: item.id,
      summary: paragraphs[0]?.slice(0, 500) || item.summary || `Saved signal from ${item.title}.`,
      key_points: keyPoints.length ? keyPoints : [item.summary ?? item.title],
      entities: extractEntities(`${item.title}\n${readable.content}`).slice(0, 16),
      suggested_actions: [
        'Decide whether this item should be promoted to Library.',
        'Link it to an Area or Resource if it supports an active thread.'
      ]
    };
    const artifact = (await createSynthesisStore(this.vaultPath).writeFresh({
      kind: 'feed.item.analysis',
      scope_key: `feed.item.analysis:${item.id}`,
      sources: [feedSourceForArtifact(item, readable.content.slice(0, 500))],
      provenance: localFeedProvenance('feed.item.analysis.v1'),
      payload
    })) as FeedSynthesisResult<FeedItemAnalysisPayload>['artifact'];
    await this.appendItemArtifacts(item.id, [artifact.id], 'enrichment');
    return { artifact };
  }

  async saveToLibrary(id: string, input: SaveFeedToLibraryInput = {}): Promise<SaveFeedToLibraryResult> {
    const initialItem = await this.requireItem(id);
    if (initialItem.saved_library_item_id) {
      const existing = await createLibraryStore(this.vaultPath).get(initialItem.saved_library_item_id);
      if (existing) return { feed_item: initialItem, library_item: existing };
    }

    let readable = await this.ensureReadableContent(id);
    const source = await this.getSource(readable.feed_item.source_id);
    const shouldAnalyze = input.include_enrichments !== false;
    if (shouldAnalyze) {
      await this.analyzeItem(id);
      readable = await this.ensureReadableContent(id);
    }
    if (source?.processing_policy?.auto_translate_to && input.include_enrichments !== false) {
      await this.translateItem(id, source.processing_policy.auto_translate_to);
      readable = await this.ensureReadableContent(id);
    }
    const item = await this.requireItem(id);
    const preferredArtifactId = input.preferred_display === 'translated' ? input.translation_artifact_id : undefined;
    const libraryItem = await createLibraryStore(this.vaultPath).save({
      kind: item.url.match(/youtube\.com|youtu\.be|vimeo\.com/i) ? 'video' : 'article',
      title: item.title,
      url: item.url,
      body: readable.content,
      tags: [...new Set([...(source?.tags ?? []), ...(input.tags ?? [])])],
      areas: input.areas ?? source?.areas ?? [],
      resource_refs: [...new Set([...(source?.resource_refs ?? []), ...(input.resource_refs ?? [])])],
      source: {
        kind: 'feed',
        url: item.url,
        canonical_url: item.canonical_url,
        provider: item.metadata?.provider,
        external_id: item.metadata?.external_id,
        feed_item_id: item.id,
        feed_source_id: item.source_id,
        feed_fetch_run_id: item.fetch_run_id,
        source_title: source?.title,
        channel_name: item.metadata?.channel_name,
        channel_id: item.metadata?.channel_id,
        duration_seconds: item.metadata?.duration_seconds,
        fetched_at: item.fetched_at,
        published_at: item.published_at,
        language: item.language,
        preferred_transcript_track_id: item.media?.preferred_track_id,
        preferred_bilingual_pair_id: item.media?.preferred_bilingual_pair_id,
        transcript_tracks: item.media?.transcript_tracks.map((track) => ({
          id: track.id,
          language: track.language,
          label: track.label,
          source: track.source,
          source_kind: track.source_kind,
          status: track.status,
          alignment: track.alignment,
          segments_ref_path: track.segments_ref?.path,
          markdown_ref_path: track.markdown_ref?.path,
          translation_of_track_id: track.translation_of_track_id,
          generated_from_track_id: track.generated_from_track_id,
          artifact_id: track.artifact_id
        })),
        bilingual_pairs: item.media?.bilingual_pairs?.map((pair) => ({
          id: pair.id,
          source_track_id: pair.source_track_id,
          translation_track_id: pair.translation_track_id,
          mode: pair.mode,
          markdown_ref_path: pair.markdown_ref?.path
        })),
        note: input.note
      },
      source_snapshot_ref: item.extracted_ref?.path ?? item.raw_ref?.path,
      promoted_enrichment_artifact_ids: input.include_enrichments === false ? [] : item.enrichment_artifact_ids ?? [],
      feed_collection_artifact_ids: item.collection_artifact_ids ?? [],
      ...(preferredArtifactId ? { preferred_display_artifact_id: preferredArtifactId } : {})
    });
    const saved = await this.writeItem({
      ...item,
      status: 'saved',
      saved_library_item_id: libraryItem.frontmatter.id,
      pinned_by: appendPinnedBy(item.pinned_by, { kind: 'library', ref: libraryItem.frontmatter.id, at: this.now().toISOString() })
    });
    return { feed_item: saved, library_item: libraryItem };
  }

  async digest(date: string): Promise<FeedSynthesisResult<FeedDigestPayload>> {
    const items = (await this.listItems({ include_saved: true })).filter((item) => item.fetched_at.startsWith(date));
    const payload: FeedDigestPayload = {
      date,
      item_count: items.length,
      headline: items.length ? `${items.length} feed item(s) fetched` : 'No feed items fetched',
      highlights: items.slice(0, 8).map((item) => ({
        item_id: item.id,
        source_id: item.source_id,
        title: item.title,
        url: item.url,
        published_at: item.published_at,
        summary: item.summary ?? item.excerpt
      }))
    };
    const artifact = (await createSynthesisStore(this.vaultPath).writeFresh({
      kind: 'feed.digest',
      scope_key: `feed.digest:${date}`,
      sources: items.map((item) => feedSourceForArtifact(item, item.summary ?? item.excerpt)),
      provenance: localFeedProvenance('feed.digest.v1'),
      payload
    })) as FeedSynthesisResult<FeedDigestPayload>['artifact'];
    await this.appendItemArtifacts(
      items.map((item) => item.id),
      [artifact.id],
      'collection',
      'digest'
    );
    return { artifact };
  }

  async cluster(scope = 'all'): Promise<FeedSynthesisResult<FeedClusterPayload>> {
    const items = await this.itemsForScope(scope);
    const buckets = new Map<string, FeedItem[]>();
    for (const item of items) {
      const label = clusterLabel(item);
      buckets.set(label, [...(buckets.get(label) ?? []), item]);
    }
    const payload: FeedClusterPayload = {
      scope,
      clusters: [...buckets.entries()].slice(0, 8).map(([label, bucket]) => ({
        label,
        item_ids: bucket.map((item) => item.id),
        source_ids: [...new Set(bucket.map((item) => item.source_id))],
        rationale: `Grouped ${bucket.length} item(s) by title, source, and excerpt terms.`
      }))
    };
    const artifact = (await createSynthesisStore(this.vaultPath).writeFresh({
      kind: 'feed.cluster',
      scope_key: `feed.cluster:${scope}`,
      sources: items.map((item) => feedSourceForArtifact(item, item.summary ?? item.excerpt)),
      provenance: localFeedProvenance('feed.cluster.v1'),
      payload
    })) as FeedSynthesisResult<FeedClusterPayload>['artifact'];
    await this.appendItemArtifacts(
      items.map((item) => item.id),
      [artifact.id],
      'collection',
      'cluster'
    );
    return { artifact };
  }

  async dailyReport(
    date: string,
    refs: { digest_artifact_id?: string; cluster_artifact_id?: string } = {}
  ): Promise<FeedSynthesisResult<FeedReportPayload>> {
    const items = (await this.listItems({ include_saved: true })).filter((item) => item.fetched_at.startsWith(date));
    const bySource = new Map<string, FeedItem[]>();
    for (const item of items) bySource.set(item.source_id, [...(bySource.get(item.source_id) ?? []), item]);
    const payload: FeedReportPayload = {
      date,
      item_count: items.length,
      digest_artifact_id: refs.digest_artifact_id,
      cluster_artifact_id: refs.cluster_artifact_id,
      sections: [...bySource.entries()].map(([sourceId, bucket]) => ({
        title: sourceId,
        item_ids: bucket.map((item) => item.id),
        summary: bucket
          .slice(0, 3)
          .map((item) => item.title)
          .join(' / ')
      }))
    };
    const artifact = (await createSynthesisStore(this.vaultPath).writeFresh({
      kind: 'feed.report.daily',
      scope_key: `feed.report.daily:${date}`,
      sources: items.map((item) => feedSourceForArtifact(item, item.summary ?? item.excerpt)),
      provenance: localFeedProvenance('feed.report.daily.v1'),
      payload
    })) as FeedSynthesisResult<FeedReportPayload>['artifact'];
    await this.appendItemArtifacts(
      items.map((item) => item.id),
      [artifact.id],
      'collection',
      'report'
    );
    return { artifact };
  }

  private async ensureYouTubeReadableContent(item: FeedItem): Promise<{ feed_item: FeedItem; content: string; ref: FeedReadableRef }> {
    const videoId = youtubeVideoIdFromItem(item);
    if (!videoId) throw new Error(`youtube_video_id_missing:${item.id}`);
    const source = await this.getSource(item.source_id);
    const sourceType = youtubeSourceTypeFromItem(item, source);
    const fetchedAt = this.now().toISOString();
    const archive = await this.youtubeProvider.fetchArchive(videoId, {
      subtitleLanguages: source?.processing_policy?.preferred_languages
    });
    const record = this.youtubeProvider.buildMarkdown(sourceType, archive);
    const infoRef = await this.writeAsset(
      'raw',
      `${item.id}.youtube.info.json`,
      `${JSON.stringify(archive.info, null, 2)}\n`,
      'youtube_info_json',
      fetchedAt
    );
    const transcriptTrackRefs: FeedTranscriptTrackRef[] = [];
    const subtitleRawRefs: FeedReadableRef[] = [];
    for (const track of archive.subtitle_tracks) {
      const trackId = transcriptTrackId('youtube', track.language, track.source_kind);
      const rawRef = await this.writeAsset(
        'raw',
        `${item.id}.subtitle.youtube.${track.source_kind}.${safeAssetName(track.language)}.${track.format}`,
        track.content,
        'youtube_subtitle',
        fetchedAt
      );
      const segmentsFile: FeedTranscriptSegmentsFile = {
        version: 1,
        item_id: item.id,
        track_id: trackId,
        language: track.language,
        source: 'youtube',
        source_kind: track.source_kind,
        segments: track.segments
      };
      const segmentsRef = await this.writeAsset(
        'extracted',
        `${item.id}.transcript.youtube.${track.source_kind}.${safeAssetName(track.language)}.segments.json`,
        `${JSON.stringify(segmentsFile, null, 2)}\n`,
        'youtube_transcript_segments',
        fetchedAt
      );
      subtitleRawRefs.push(rawRef);
      transcriptTrackRefs.push({
        id: trackId,
        language: track.language,
        label: track.label,
        source: 'youtube',
        source_kind: track.source_kind,
        status: 'captured',
        alignment: 'segment_exact',
        raw_ref: rawRef,
        segments_ref: segmentsRef,
        content_hash: segmentsRef.content_hash,
        created_at: fetchedAt
      });
    }
    const preferredTrack = transcriptTrackRefs.find((track) => track.language === archive.subtitle_language) ?? transcriptTrackRefs[0];
    const ref = await this.writeAsset(
      'extracted',
      `${item.id}.youtube.md`,
      record.markdown,
      'youtube_transcript_markdown',
      fetchedAt
    );
    const existingMetadata = { ...(item.metadata ?? {}) };
    delete existingMetadata.last_processing_error;
    const metadata = {
      ...existingMetadata,
      ...record.metadata,
      ...(source ? { source_url: source.url } : {})
    };
    const next = await this.writeItem({
      ...item,
      url: record.metadata.video_url,
      canonical_url: record.metadata.video_url,
      site_name: record.metadata.channel_name ?? item.site_name ?? 'YouTube',
      author: record.metadata.channel_name ?? item.author,
      published_at: record.metadata.published_at ?? item.published_at,
      image_url: record.metadata.thumbnail_url ?? item.image_url,
      raw_ref: infoRef,
      raw_refs: mergeReadableRefs([...(item.raw_refs ?? []), item.raw_ref, infoRef, ...subtitleRawRefs]),
      extracted_ref: ref,
      media: {
        kind: 'video',
        provider: 'youtube',
        ...(record.metadata.duration_seconds !== undefined ? { duration_seconds: record.metadata.duration_seconds } : {}),
        transcript_tracks: transcriptTrackRefs,
        ...(preferredTrack ? { preferred_track_id: preferredTrack.id } : {}),
        ...(item.media?.bilingual_pairs?.length ? { bilingual_pairs: item.media.bilingual_pairs } : {})
      },
      content_hash: ref.content_hash,
      language: record.metadata.language ?? item.language ?? detectLanguage(record.markdown),
      summary: record.description?.slice(0, 500) || item.summary,
      excerpt: record.description?.slice(0, 500) || record.transcript?.slice(0, 500) || item.excerpt,
      metadata
    });
    return { feed_item: next, content: record.markdown, ref };
  }

  private async fetchOne(source: FeedSource): Promise<FeedFetchResult> {
    const run: FeedFetchRun = {
      id: `feed-run-${randomUUID()}`,
      source_id: source.id,
      source_url: source.url,
      started_at: this.now().toISOString(),
      status: 'running',
      fetched: 0,
      created: 0,
      skipped: 0,
      stages: initialRunStages(source.kind)
    };
    await this.writeFetchRun(run);
    try {
      if (source.kind === 'youtube') return await this.fetchYouTubeSource(source, run);
      const xml = await this.fetchText(source.url);
      const rawFeedRef = await this.writeAsset('raw', `${run.id}.xml`, xml, 'feed_xml', run.started_at);
      const parsed = parseRss(xml, source.url, this.now);
      const parsedItems = parsed.items.slice(0, source.fetch_policy?.max_items_per_fetch ?? parsed.items.length);
      const existingItems = await this.readItemsForSource(source.id);
      const existingIds = new Set(existingItems.map((item) => item.id));
      const existingDedupeKeys = new Set(existingItems.map((item) => item.dedupe_key).filter(Boolean));
      let created = 0;
      for (const parsedItem of parsedItems) {
        const canonicalUrl = canonicalizeUrl(parsedItem.url);
        const id = stableId('feed-item', `${source.id}:${parsedItem.guid ?? canonicalUrl}`);
        const dedupeKey = stableId('feed-dedupe', canonicalUrl);
        if (existingIds.has(id) || existingDedupeKeys.has(dedupeKey)) continue;
        const fetchedAt = this.now().toISOString();
        const item: FeedItem = normalizeFeedItem({
          id,
          source_id: source.id,
          fetch_run_id: run.id,
          guid: parsedItem.guid,
          title: parsedItem.title,
          url: parsedItem.url,
          canonical_url: canonicalUrl,
          dedupe_key: dedupeKey,
          published_at: parsedItem.publishedAt,
          fetched_at: fetchedAt,
          site_name: hostnameTitle(parsedItem.url),
          summary: parsedItem.excerpt,
          excerpt: parsedItem.excerpt,
          image_url: parsedItem.imageUrl,
          content_hash: hashContent(`${parsedItem.title}\n${parsedItem.excerpt}\n${canonicalUrl}`),
          raw_ref: rawFeedRef,
          enrichment_artifact_ids: [],
          collection_artifact_ids: [],
          pinned_by: [],
          status: 'new'
        });
        await this.writeItem(item);
        existingIds.add(id);
        existingDedupeKeys.add(dedupeKey);
        created += 1;
        if (source.processing_policy?.extract_readable) await this.ensureReadableContent(id);
        if (source.processing_policy?.auto_analyze) await this.analyzeItem(id);
        if (source.processing_policy?.auto_translate_to) await this.translateItem(id, source.processing_policy.auto_translate_to);
      }
      const completedAt = this.now().toISOString();
      await this.updateSourceAfterFetch(source, {
        title: parsed.title || source.title,
        last_fetched_at: completedAt,
        last_fetch_error: undefined,
        updated_at: completedAt
      });
      const completedRun: FeedFetchRun = {
        ...run,
        completed_at: completedAt,
        status: 'success',
        fetched: parsedItems.length,
        created,
        skipped: parsedItems.length - created,
        raw_feed_ref: rawFeedRef.path,
        stages: markRunStage(run.stages, 'fetch', 'success', `Fetched ${parsedItems.length} RSS item(s).`, completedAt)
      };
      await this.writeFetchRun(completedRun);
      return {
        run_id: run.id,
        source_id: source.id,
        fetched: parsedItems.length,
        created,
        skipped: parsedItems.length - created
      };
    } catch (error) {
      const completedAt = this.now().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      await this.updateSourceAfterFetch(source, {
        last_fetched_at: completedAt,
        last_fetch_error: message,
        updated_at: completedAt
      });
      await this.writeFetchRun({
        ...run,
        completed_at: completedAt,
        status: 'failure',
        error: message,
        stages: markRunStage(run.stages, 'fetch', 'failure', message, completedAt)
      });
      return { run_id: run.id, source_id: source.id, fetched: 0, created: 0, skipped: 0, error: message };
    }
  }

  private async fetchYouTubeSource(source: FeedSource, run: FeedFetchRun): Promise<FeedFetchResult> {
    const descriptor = this.youtubeProvider.normalizeSource(source.url);
    const existingForSource = await this.readItemsForSource(source.id);
    const isInitialBackfill = !source.metadata?.youtube_initial_backfill_completed_at && existingForSource.length === 0;
    const candidateLimit = youtubeCandidateLimit(source, isInitialBackfill);
    const startedAt = this.now().toISOString();
    await this.writeFetchRun({
      ...run,
      stages: markRunStage(
        run.stages,
        'resolve-source',
        'running',
        isInitialBackfill && source.fetch_policy?.initial_backfill === 'full'
          ? 'Resolving full YouTube source with yt-dlp.'
          : `Resolving latest ${candidateLimit ?? DEFAULT_YOUTUBE_RECENT_COUNT} YouTube item(s) with yt-dlp.`,
        startedAt
      )
    });
    const candidates = await this.youtubeProvider.listCandidates(descriptor, { limit: candidateLimit });
    const selected = candidates;
    const rawFeedRef = await this.writeAsset(
      'raw',
      `${run.id}.youtube.candidates.json`,
      `${JSON.stringify({ source: descriptor, candidates: selected }, null, 2)}\n`,
      'youtube_candidate_json',
      run.started_at
    );
    const allExistingItems = await this.listItems({ include_ignored: true, include_saved: true });
    const existingIds = new Set(allExistingItems.map((item) => item.id));
    const existingDedupeKeys = new Set(allExistingItems.map((item) => item.dedupe_key).filter(Boolean));
    const createdItems: FeedItem[] = [];
    for (const candidate of selected) {
      const id = stableId('feed-item', `${source.id}:youtube:${candidate.id}`);
      const dedupeKey = `youtube:${candidate.id}`;
      if (existingIds.has(id) || existingDedupeKeys.has(dedupeKey)) continue;
      const fetchedAt = this.now().toISOString();
      const item = await this.writeItem(
        normalizeFeedItem({
          id,
          source_id: source.id,
          fetch_run_id: run.id,
          guid: candidate.id,
          title: candidate.title,
          url: candidate.url,
          canonical_url: candidate.canonical_url,
          dedupe_key: dedupeKey,
          fetched_at: fetchedAt,
          site_name: source.title || 'YouTube',
          summary: candidate.title,
          excerpt: candidate.title,
          raw_ref: rawFeedRef,
          raw_refs: [rawFeedRef],
          enrichment_artifact_ids: [],
          collection_artifact_ids: [],
          pinned_by: [],
          metadata: {
            provider: 'youtube',
            external_id: candidate.id,
            source_type: descriptor.source_type,
            source_url: descriptor.url,
            video_url: candidate.canonical_url,
            has_transcript: false
          },
          status: 'new'
        })
      );
      existingIds.add(id);
      existingDedupeKeys.add(dedupeKey);
      createdItems.push(item);
    }

    const createdItemIds = new Set(createdItems.map((item) => item.id));
    const retryItems = source.processing_policy?.extract_readable
      ? allExistingItems.filter(
          (item) => item.source_id === source.id && !createdItemIds.has(item.id) && shouldRefreshYouTubeReadableContent(item)
        )
      : [];
    const extractionTargets = [...createdItems, ...retryItems];
    let transcriptFetched = 0;
    let failed = 0;
    const transcriptLimit =
      source.processing_policy?.max_transcripts_per_fetch ?? (source.processing_policy?.extract_readable ? extractionTargets.length : 0);
    const extractTotal = source.processing_policy?.extract_readable ? Math.min(extractionTargets.length, transcriptLimit) : extractionTargets.length;
    const resolvedAt = this.now().toISOString();
    const extractionStartedAt = this.now().toISOString();
    const resolvingStages = markRunStage(run.stages, 'resolve-source', 'success', `Resolved ${selected.length} YouTube candidate(s).`, resolvedAt);
    const progressStages = markRunStage(
      resolvingStages,
      'extract-readable',
      source.processing_policy?.extract_readable ? 'running' : 'skipped',
      source.processing_policy?.extract_readable
        ? `Fetching transcripts for ${extractTotal} YouTube item(s).`
        : 'Readable extraction is disabled for this source.',
      extractionStartedAt,
      { total: extractTotal, completed: 0 }
    );
    let progressRun: FeedFetchRun = {
      ...run,
      fetched: selected.length,
      created: createdItems.length,
      skipped: selected.length - createdItems.length,
      raw_feed_ref: rawFeedRef.path,
      stages: progressStages,
      stats: {
        source_type: descriptor.source_type,
        candidates: selected.length,
        initial_backfill: isInitialBackfill,
        candidate_limit: candidateLimit ?? 'all',
        transcripts_fetched: 0,
        transcript_failures: 0
      }
    };
    await this.writeFetchRun(progressRun);
    const boundedExtractionTargets = source.processing_policy?.extract_readable
      ? extractionTargets.slice(0, transcriptLimit)
      : [];
    for (const [index, item] of boundedExtractionTargets.entries()) {
      if (!source.processing_policy?.extract_readable) break;
      if (index > 0 && YOUTUBE_DOWNLOAD_INTERVAL_MS > 0) {
        const waitingAt = this.now().toISOString();
        progressRun = {
          ...progressRun,
          stages: markRunStage(
            progressRun.stages,
            'extract-readable',
            'running',
            `Waiting ${formatWait(YOUTUBE_DOWNLOAD_INTERVAL_MS)} before the next YouTube transcript request.`,
            waitingAt,
            { total: extractTotal, completed: transcriptFetched }
          )
        };
        await this.writeFetchRun(progressRun);
        await sleep(YOUTUBE_DOWNLOAD_INTERVAL_MS);
      }
      try {
        await this.processYouTubeExtractionTarget(item, source, async (detail) => {
          const retryAt = this.now().toISOString();
          progressRun = {
            ...progressRun,
            stages: markRunStage(progressRun.stages, 'extract-readable', 'running', detail, retryAt, {
              total: extractTotal,
              completed: transcriptFetched
            }),
            stats: {
              ...(progressRun.stats ?? {}),
              transcripts_fetched: transcriptFetched,
              transcript_failures: failed,
              transcript_retry_targets: retryItems.length
            }
          };
          await this.writeFetchRun(progressRun);
        });
        transcriptFetched += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        await this.writeItem({
          ...item,
          metadata: { ...(item.metadata ?? {}), last_processing_error: message }
        });
      }
      const progressAt = this.now().toISOString();
      progressRun = {
        ...progressRun,
        failed,
        stages: markRunStage(
          progressRun.stages,
          'extract-readable',
          'running',
          `Fetched transcripts for ${transcriptFetched}/${extractTotal} YouTube item(s).`,
          progressAt,
          { total: extractTotal, completed: transcriptFetched }
        ),
        stats: {
          ...(progressRun.stats ?? {}),
          transcripts_fetched: transcriptFetched,
          transcript_failures: failed,
          transcript_retry_targets: retryItems.length
        }
      };
      await this.writeFetchRun(progressRun);
    }

    const completedAt = this.now().toISOString();
    const nextSourceMetadata = {
      ...(source.metadata ?? {}),
      provider: 'youtube',
      youtube_source_type: descriptor.source_type,
      ...(isInitialBackfill ? { youtube_initial_backfill_completed_at: completedAt } : {})
    };
    await this.updateSourceAfterFetch(source, {
      title: source.title || youtubeSourceTitle(descriptor),
      metadata: nextSourceMetadata,
      last_fetched_at: completedAt,
      last_fetch_error: undefined,
      updated_at: completedAt
    });
    const status = failed > 0 ? 'partial' : 'success';
    const extractStatus = source.processing_policy?.extract_readable ? (failed > 0 ? 'partial' : 'success') : 'skipped';
    const finalStages = markRunStage(
      markRunStage(progressRun.stages, 'resolve-source', 'success', `Resolved ${selected.length} YouTube candidate(s).`, completedAt),
      'extract-readable',
      extractStatus,
      source.processing_policy?.extract_readable
        ? `Fetched transcripts for ${transcriptFetched}/${extractTotal} YouTube item(s).`
        : 'Readable extraction is disabled for this source.',
      completedAt,
      { total: extractTotal, completed: transcriptFetched }
    );
    const completedRun: FeedFetchRun = {
      ...run,
      completed_at: completedAt,
      status,
      fetched: selected.length,
      created: createdItems.length,
      skipped: selected.length - createdItems.length,
      failed,
      error: failed > 0 ? `${failed} YouTube item(s) failed transcript extraction.` : undefined,
      raw_feed_ref: rawFeedRef.path,
      stages: finalStages,
      stats: {
        source_type: descriptor.source_type,
        candidates: selected.length,
        initial_backfill: isInitialBackfill,
        candidate_limit: candidateLimit ?? 'all',
        transcripts_fetched: transcriptFetched,
        transcript_failures: failed,
        transcript_retry_targets: retryItems.length
      }
    };
    await this.writeFetchRun(completedRun);
    return {
      run_id: run.id,
      source_id: source.id,
      fetched: selected.length,
      created: createdItems.length,
      skipped: selected.length - createdItems.length,
      failed
    };
  }

  private async processYouTubeExtractionTarget(
    item: FeedItem,
    source: FeedSource,
    onRetry: (detail: string) => Promise<void>
  ): Promise<void> {
    let lastError: unknown;
    let usedTransientRetry = false;
    for (let retry = 0; retry <= YOUTUBE_RATE_LIMIT_MAX_RETRIES; retry += 1) {
      try {
        await this.ensureYouTubeReadableContent(item);
        if (source.processing_policy?.auto_analyze) await this.analyzeItem(item.id);
        if (source.processing_policy?.auto_translate_to) await this.translateItem(item.id, source.processing_policy.auto_translate_to);
        return;
      } catch (error) {
        lastError = error;
        const message = errorMessage(error);
        if (isYouTubeUnavailableError(message)) break;
        if (isYouTubeRateLimitError(message) && retry < YOUTUBE_RATE_LIMIT_MAX_RETRIES) {
          const delay = YOUTUBE_RATE_LIMIT_BASE_DELAY_MS * 2 ** retry;
          await onRetry(
            `YouTube rate limited transcript extraction for ${item.title}. Retrying in ${formatWait(delay)} (${retry + 1}/${YOUTUBE_RATE_LIMIT_MAX_RETRIES}).`
          );
          await sleep(delay);
          continue;
        }
        if (!usedTransientRetry) {
          usedTransientRetry = true;
          await onRetry(`Retrying transcript extraction for ${item.title} after a transient yt-dlp failure.`);
          await sleep(YOUTUBE_TRANSIENT_RETRY_DELAY_MS);
          continue;
        }
        break;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'youtube_transcript_extraction_failed'));
  }

  private async updateSourceAfterFetch(source: FeedSource, patch: Partial<FeedSource>): Promise<void> {
    const sources = await this.listSources();
    await this.writeSources(sources.map((item) => (item.id === source.id ? normalizeFeedSource({ ...item, ...patch }) : item)));
  }

  private async getSource(id: string): Promise<FeedSource | null> {
    return (await this.listSources()).find((source) => source.id === id) ?? null;
  }

  private async requireItem(id: string): Promise<FeedItem> {
    const item = await this.getItem(id);
    if (!item) throw new Error(`feed_item_not_found:${id}`);
    return item;
  }

  private async itemsForScope(scope: string): Promise<FeedItem[]> {
    if (scope === 'all') return this.listItems({ include_saved: true });
    if (/^\d{4}-\d{2}-\d{2}$/.test(scope)) {
      return (await this.listItems({ include_saved: true })).filter((item) => item.fetched_at.startsWith(scope));
    }
    const bySource = await this.listItems({ source_id: scope, include_saved: true });
    return bySource.length ? bySource : this.listItems({ include_saved: true });
  }

  private async readItemsForSource(sourceId: string): Promise<FeedItem[]> {
    const dir = this.sourceDir(sourceId);
    const files = await fs.readdir(dir).catch((error: unknown) => {
      if (isNotFound(error)) return [];
      throw error;
    });
    const items = await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map((file) => fs.readFile(path.join(dir, file), 'utf8').then((raw) => normalizeFeedItem(JSON.parse(raw) as FeedItem)))
    );
    return items;
  }

  private async writeItem(item: FeedItem): Promise<FeedItem> {
    await fs.mkdir(this.sourceDir(item.source_id), { recursive: true });
    const normalized = normalizeFeedItem(item);
    await fs.writeFile(path.join(this.sourceDir(item.source_id), `${item.id}.json`), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    return normalized;
  }

  private async appendItemArtifacts(
    ids: string[] | string,
    artifactIds: string[],
    target: 'enrichment' | 'collection',
    pinKind?: 'digest' | 'cluster' | 'report'
  ): Promise<void> {
    const itemIds = Array.isArray(ids) ? ids : [ids];
    const at = this.now().toISOString();
    for (const id of itemIds) {
      const item = await this.getItem(id);
      if (!item) continue;
      const patch =
        target === 'enrichment'
          ? { enrichment_artifact_ids: [...new Set([...(item.enrichment_artifact_ids ?? []), ...artifactIds])] }
          : { collection_artifact_ids: [...new Set([...(item.collection_artifact_ids ?? []), ...artifactIds])] };
      await this.writeItem({
        ...item,
        ...patch,
        pinned_by: pinKind
          ? artifactIds.reduce((pins, ref) => appendPinnedBy(pins, { kind: pinKind, ref, at }), item.pinned_by)
          : item.pinned_by
      });
    }
  }

  private async writeAsset(
    dirName: 'raw' | 'extracted',
    fileName: string,
    content: string,
    kind: FeedReadableRef['kind'],
    createdAt: string
  ): Promise<FeedReadableRef> {
    const relPath = path.join(FEED_ASSET_ROOT, dirName, fileName);
    const absPath = path.join(this.vaultPath, relPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, 'utf8');
    return {
      kind,
      path: relPath,
      content_hash: hashContent(content),
      created_at: createdAt
    };
  }

  private async readSegmentsFile(refPath: string): Promise<FeedTranscriptSegmentsFile> {
    const raw = await fs.readFile(path.join(this.vaultPath, refPath), 'utf8');
    const parsed = JSON.parse(raw) as FeedTranscriptSegmentsFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.segments)) {
      throw new Error(`feed_transcript_segments_invalid:${refPath}`);
    }
    return parsed;
  }

  private async writeFetchRun(run: FeedFetchRun): Promise<void> {
    const filePath = path.join(this.assetDir('runs'), `${run.id}.json`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
  }

  private assetDir(kind: 'raw' | 'extracted' | 'runs'): string {
    return path.join(this.vaultPath, FEED_ASSET_ROOT, kind);
  }

  private sourcesPath(): string {
    return path.join(this.vaultPath, FEEDS_ROOT, SOURCES_FILE);
  }

  private sourceDir(sourceId: string): string {
    return path.join(this.vaultPath, FEEDS_ROOT, sourceId);
  }

  private async writeSources(sources: FeedSource[]): Promise<void> {
    await fs.mkdir(path.dirname(this.sourcesPath()), { recursive: true });
    await fs.writeFile(this.sourcesPath(), `${JSON.stringify(sources.map(normalizeFeedSource), null, 2)}\n`, 'utf8');
  }
}

export function createFeedStore(vaultPath: string, options?: FeedStoreOptions): FeedStore {
  return new FeedStore(vaultPath, options);
}

function normalizeFeedSource(value: FeedSource): FeedSource {
  if (!value.id || !value.title || !value.url || !value.kind) throw new Error('invalid_feed_source');
  const youtube =
    value.kind === 'youtube'
      ? (() => {
          try {
            return normalizeYouTubeSource(value.url);
          } catch {
            return null;
          }
        })()
      : null;
  return {
    ...value,
    ...(youtube ? { url: youtube.url, metadata: { ...(value.metadata ?? {}), provider: 'youtube', youtube_source_type: youtube.source_type } } : {}),
    areas: value.areas ?? [],
    resource_refs: normalizeStrings(value.resource_refs ?? []),
    tags: normalizeTags(value.tags ?? []),
    priority: value.priority ?? 'normal',
    fetch_policy: normalizeFetchPolicy(value.fetch_policy, value.kind),
    processing_policy: value.processing_policy ?? { extract_readable: false, auto_analyze: false, generate_item_summary: true },
    retention_policy: value.retention_policy ?? { keep_raw_days: 30, keep_ignored_days: 30 }
  };
}

function normalizeFeedItem(value: FeedItem): FeedItem {
  if (!value.id || !value.source_id || !value.title || !value.url) throw new Error('invalid_feed_item');
  const canonicalUrl = value.canonical_url ?? canonicalizeUrl(value.url);
  return {
    ...value,
    canonical_url: canonicalUrl,
    dedupe_key: value.dedupe_key ?? stableId('feed-dedupe', canonicalUrl),
    excerpt: value.excerpt ?? value.summary,
    raw_refs: mergeReadableRefs([...(value.raw_refs ?? []), value.raw_ref]),
    enrichment_artifact_ids: [...new Set(value.enrichment_artifact_ids ?? [])],
    collection_artifact_ids: [...new Set(value.collection_artifact_ids ?? [])],
    pinned_by: value.pinned_by ?? []
  };
}

function replaceById<T extends { id: string }>(items: T[], replacement: T): T[] {
  const filtered = items.filter((item) => item.id !== replacement.id);
  return [...filtered, replacement];
}

function alignTranslatedSubtitleSegments(
  sourceSegments: FeedTranscriptSegment[],
  translations: FeedAiSubtitleTranslationInput['translated_segments']
): FeedTranscriptSegment[] {
  const sourceById = new Map(sourceSegments.map((segment) => [segment.id, segment]));
  const output: FeedTranscriptSegment[] = [];
  for (const [index, translation] of translations.entries()) {
    const sourceIds = [...new Set([...(translation.source_segment_ids ?? []), ...(translation.source_segment_id ? [translation.source_segment_id] : [])])];
    const matched = sourceIds.map((sourceId) => sourceById.get(sourceId)).filter((segment): segment is FeedTranscriptSegment => Boolean(segment));
    const firstMatched = matched[0];
    const lastMatched = matched.at(-1);
    const text = translation.text.trim();
    if (!text) continue;
    output.push({
      id: `ai-seg-${String(index).padStart(5, '0')}`,
      start_ms: translation.start_ms ?? firstMatched?.start_ms ?? 0,
      end_ms: translation.end_ms ?? lastMatched?.end_ms ?? translation.start_ms ?? firstMatched?.end_ms ?? 0,
      text,
      translated_from_segment_ids: sourceIds.length > 0 ? sourceIds : undefined
    });
  }
  return output;
}

function buildInterleavedSubtitleMarkdown(input: {
  title: string;
  sourceTrackLabel: string;
  targetLanguage: string;
  sourceSegments: FeedTranscriptSegment[];
  translatedSegments: FeedTranscriptSegment[];
}): string {
  const translationsBySource = new Map<string, FeedTranscriptSegment[]>();
  for (const translation of input.translatedSegments) {
    for (const sourceId of translation.translated_from_segment_ids ?? []) {
      translationsBySource.set(sourceId, [...(translationsBySource.get(sourceId) ?? []), translation]);
    }
  }
  const body = input.sourceSegments.flatMap((segment) => {
    const translationText = (translationsBySource.get(segment.id) ?? []).map((translation) => translation.text).join('\n');
    return [
      `### ${formatSubtitleTimestamp(segment.start_ms)} --> ${formatSubtitleTimestamp(segment.end_ms)}`,
      '',
      segment.text,
      '',
      translationText ? `> ${translationText.replace(/\n/g, '\n> ')}` : '> _No translation._',
      ''
    ];
  });
  return [
    `# ${input.title}`,
    '',
    '## Bilingual Transcript',
    '',
    `- source_track: ${input.sourceTrackLabel}`,
    `- translation_language: ${input.targetLanguage}`,
    '',
    ...body
  ].join('\n');
}

function formatSubtitleTimestamp(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function isFeedSource(value: unknown): value is FeedSource {
  const record = value as FeedSource;
  return Boolean(record?.id && record.title && record.url && record.kind);
}

function normalizeFetchPolicy(value: FeedSource['fetch_policy'], kind: FeedSource['kind']): FeedSource['fetch_policy'] {
  if (kind === 'youtube') {
    return {
      interval_minutes: 1440,
      max_items_per_fetch: DEFAULT_YOUTUBE_RECENT_COUNT,
      initial_backfill: 'recent',
      initial_backfill_count: DEFAULT_YOUTUBE_RECENT_COUNT,
      respect_cache: true,
      ...(value ?? {})
    };
  }
  return {
    interval_minutes: 1440,
    max_items_per_fetch: 50,
    respect_cache: true,
    ...(value ?? {})
  };
}

function normalizeUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('feed URL must be http(s)');
  return url.toString();
}

function inferFeedSourceKind(value: string): FeedSource['kind'] {
  const trimmed = value.trim();
  if (trimmed.startsWith('@')) return 'youtube';
  try {
    const host = new URL(trimmed).hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtube.com' || host === 'youtu.be') return 'youtube';
  } catch {
    return 'rss';
  }
  return 'rss';
}

function canonicalizeUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_|^(fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value.trim();
  }
}

function hostnameTitle(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return 'Feed source';
  }
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha1').update(value).digest('hex').slice(0, 16)}`;
}

function hashContent(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function localFeedProvenance(promptVersion: string) {
  return {
    runtime: 'local:heuristic',
    model: 'feed-reader-fallback',
    prompt_version: promptVersion,
    generated_at: new Date().toISOString(),
    cost_usd: 0,
    tokens: { input: 0, output: 0 }
  };
}

function feedSourceForArtifact(item: FeedItem, excerpt?: string) {
  return {
    kind: 'feed' as const,
    ref: item.id,
    title: item.title,
    excerpt,
    metadata: {
      source_id: item.source_id,
      url: item.url,
      canonical_url: item.canonical_url,
      fetch_run_id: item.fetch_run_id,
      content_hash: item.content_hash,
      ...(item.metadata ?? {})
    }
  };
}

function initialRunStages(kind: FeedSource['kind']): FeedFetchRunStage[] {
  if (kind === 'youtube') {
    return [
      { id: 'resolve-source', label: 'Resolve YouTube source', status: 'pending' },
      { id: 'extract-readable', label: 'Extract transcripts', status: 'pending' }
    ];
  }
  return [{ id: 'fetch', label: 'Fetch feed document', status: 'pending' }];
}

function markRunStage(
  stages: FeedFetchRunStage[] | undefined,
  id: string,
  status: FeedFetchRunStage['status'],
  detail: string,
  at: string,
  progress: Pick<FeedFetchRunStage, 'total' | 'completed'> = {}
): FeedFetchRunStage[] {
  const existing = stages?.length ? stages : initialRunStages('rss');
  if (!existing.some((stage) => stage.id === id)) {
    return [
      ...existing,
      {
        id,
        label: id,
        status,
        detail,
        ...progress,
        ...(status === 'running' ? { started_at: at } : { completed_at: at })
      }
    ];
  }
  return existing.map((stage) =>
    stage.id === id
      ? {
          ...stage,
          status,
          detail,
          ...progress,
          ...(status === 'running' ? { started_at: stage.started_at ?? at } : { completed_at: at })
        }
      : stage
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isYouTubeRateLimitError(value: string): boolean {
  return /429|too many requests|rate.?limit/i.test(value);
}

function isYouTubeUnavailableError(value: string): boolean {
  return /video unavailable|removed by the uploader|private video|account.*terminated|copyright/i.test(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatWait(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function isYouTubeItem(item: FeedItem): boolean {
  return item.metadata?.provider === 'youtube' || item.dedupe_key?.startsWith('youtube:') === true || /youtu\.be|youtube\.com/i.test(item.url);
}

function shouldRefreshYouTubeReadableContent(item: FeedItem): boolean {
  if (!isYouTubeItem(item)) return false;
  if (!item.extracted_ref) return true;
  if (item.metadata?.last_processing_error) return true;
  return item.metadata?.subtitle_status === undefined;
}

function youtubeVideoIdFromItem(item: FeedItem): string | null {
  if (item.metadata?.external_id) return item.metadata.external_id;
  if (item.dedupe_key?.startsWith('youtube:')) return item.dedupe_key.slice('youtube:'.length);
  return youtubeVideoIdFromUrl(item.url);
}

function youtubeVideoIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] ?? null;
    if (url.searchParams.get('v')) return url.searchParams.get('v');
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] === 'shorts' || segments[0] === 'live') return segments[1] ?? null;
  } catch {
    return null;
  }
  return null;
}

function youtubeSourceTypeFromItem(item: FeedItem, source?: FeedSource | null): YouTubeSourceType {
  return item.metadata?.source_type ?? source?.metadata?.youtube_source_type ?? 'video';
}

function youtubeCandidateLimit(source: FeedSource, isInitialBackfill: boolean): number | undefined {
  if (isInitialBackfill && source.fetch_policy?.initial_backfill === 'full') return undefined;
  if (isInitialBackfill) {
    return source.fetch_policy?.initial_backfill_count ?? source.fetch_policy?.max_items_per_fetch ?? DEFAULT_YOUTUBE_RECENT_COUNT;
  }
  return source.fetch_policy?.max_items_per_fetch ?? DEFAULT_YOUTUBE_RECENT_COUNT;
}

function safeAssetName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_') || 'track';
}

function mergeReadableRefs(refs: Array<FeedReadableRef | null | undefined>): FeedReadableRef[] {
  const map = new Map<string, FeedReadableRef>();
  for (const ref of refs) {
    if (!ref) continue;
    const key = `${ref.kind}:${ref.path ?? ref.artifact_id ?? ref.content_hash ?? ''}`;
    if (!map.has(key)) map.set(key, ref);
  }
  return [...map.values()];
}

function appendPinnedBy(existing: FeedItem['pinned_by'], next: NonNullable<FeedItem['pinned_by']>[number]): FeedItem['pinned_by'] {
  const key = `${next.kind}:${next.ref}`;
  const kept = (existing ?? []).filter((pin) => `${pin.kind}:${pin.ref}` !== key);
  return [...kept, next];
}

function fallbackReadableMarkdown(item: FeedItem): string {
  const text = item.summary ?? item.excerpt ?? '';
  return `# ${item.title}\n\n${text}\n\nSource: ${item.url}\n`;
}

function extractReadableMarkdown(html: string, url: string, fallbackTitle: string): string {
  const title = decodeEntities(matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || fallbackTitle);
  const main = matchFirst(html, /<article[^>]*>([\s\S]*?)<\/article>/i) || matchFirst(html, /<main[^>]*>([\s\S]*?)<\/main>/i) || html;
  const text = htmlToText(main);
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 80);
  return `# ${title || fallbackTitle}\n\n${paragraphs.join('\n\n')}\n\nSource: ${url}\n`;
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<(p|div|section|article|main|header|footer|li|br|h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
  ).trim();
}

function matchFirst(value: string, regex: RegExp): string {
  return regex.exec(value)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
}

function meaningfulParagraphs(markdown: string): string[] {
  return markdown
    .replace(/^#\s+.+$/m, '')
    .split(/\n{2,}/)
    .map((part) => part.replace(/^Source:\s+.+$/i, '').trim())
    .filter((part) => part.length > 20);
}

function firstMeaningfulParagraph(markdown: string): string | undefined {
  return meaningfulParagraphs(markdown)[0];
}

function detectLanguage(content: string): string {
  const zh = (content.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (content.match(/[A-Za-z]/g) ?? []).length;
  if (zh > latin * 0.4) return 'zh';
  return 'unknown';
}

function extractEntities(value: string): string[] {
  const english = value.match(/\b[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,3}\b/g) ?? [];
  const chinese = value.match(/[\u4e00-\u9fff]{2,8}/g) ?? [];
  return [...new Set([...english, ...chinese].map((item) => item.trim()).filter((item) => item.length > 1))];
}

function clusterLabel(item: FeedItem): string {
  const text = `${item.title} ${item.summary ?? ''}`;
  const entity = extractEntities(text)[0];
  if (entity) return entity.toLowerCase();
  return text.split(/\s+/).find((part) => part.length > 4)?.toLowerCase() ?? item.source_id;
}

function normalizeTags(tags: string[]): string[] {
  return normalizeStrings(tags).map((tag) => tag.replace(/^#/, ''));
}

function normalizeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function defaultFetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { accept: 'application/rss+xml, application/atom+xml, text/xml, */*;q=0.5' } });
  if (!response.ok) throw new Error(`failed to fetch feed (${response.status})`);
  return response.text();
}

async function defaultFetchReadableText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { accept: 'text/html, application/xhtml+xml, text/plain;q=0.8, */*;q=0.5' } });
  if (!response.ok) throw new Error(`failed to fetch readable content (${response.status})`);
  return response.text();
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  };
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_full, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity] ?? `&${entity};`;
  });
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT';
}
