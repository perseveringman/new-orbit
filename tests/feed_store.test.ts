import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFeedStore } from '../src/main/feed/store';
import {
  defaultYouTubeFeedProvider,
  json3ToSegments,
  json3ToTranscript,
  normalizeYouTubeSource,
  type YouTubeFeedProvider,
  type YouTubeVideoCandidate
} from '../src/main/feed/youtube';
import { defaultXFeedProvider, normalizeXSource, type XFeedProvider, type XPostCandidate } from '../src/main/feed/x';
import { createLibraryStore } from '../src/main/library/store';
import { createSynthesisStore } from '../src/main/synthesis/store';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-feed-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const rss = `<?xml version="1.0"?>
<rss><channel>
  <title>Orbit Signals</title>
  <item>
    <guid>item-1</guid>
    <title>Feed item one</title>
    <link>https://example.com/one</link>
    <description>First external signal.</description>
    <pubDate>Tue, 28 Apr 2026 09:00:00 GMT</pubDate>
  </item>
  <item>
    <guid>item-2</guid>
    <title>Feed item two</title>
    <link>https://example.com/two</link>
    <description>Second external signal.</description>
    <pubDate>Tue, 28 Apr 2026 10:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

describe('FeedStore Phase 6.3 Layer 0 reader', () => {
  it('manages sources, fetches and dedupes raw feed items without creating Library truth', async () => {
    const feed = createFeedStore(tmp, {
      now: () => new Date('2026-04-28T12:00:00.000Z'),
      fetchText: async () => rss
    });
    const source = await feed.createSource({ url: 'https://example.com/rss.xml', title: 'Example RSS' });

    const first = await feed.fetch(source.id);
    const second = await feed.fetch(source.id);
    const items = await feed.listItems({ include_saved: true });
    const runs = await feed.listFetchRuns(source.id);

    expect(first[0]).toMatchObject({ fetched: 2, created: 2, skipped: 0 });
    expect(first[0]?.run_id).toBeDefined();
    expect(second[0]).toMatchObject({ fetched: 2, created: 0, skipped: 2 });
    expect(runs).toHaveLength(2);
    expect(runs[0].raw_feed_ref).toBeDefined();
    expect(items).toHaveLength(2);
    expect(items[0].fetch_run_id).toBe(first[0]?.run_id);
    expect(items[0].canonical_url).toBeDefined();
    expect(items[0].content_hash).toBeDefined();
    expect(items[0].raw_ref?.kind).toBe('feed_xml');
    expect(await createLibraryStore(tmp).list({ include_archived: true })).toEqual([]);

    const raw = await readFile(path.join(tmp, 'feeds', source.id, `${items[0].id}.json`), 'utf8');
    expect(raw).toContain('"status": "new"');
  });

  it('supports seen/ignore state and Save to Library promotion gate', async () => {
    const feed = createFeedStore(tmp, {
      now: () => new Date('2026-04-28T12:00:00.000Z'),
      fetchText: async () => rss,
      fetchReadableText: async () => `<html>
        <title>Readable article</title>
        <article>
          <p>Full readable article body about Orbit attention systems and personal data flow.</p>
          <p>Second paragraph with enough detail to become a Library reading body.</p>
        </article>
      </html>`
    });
    const source = await feed.createSource({ url: 'https://example.com/rss.xml' });
    await feed.fetch(source.id);
    const [first, second] = await feed.listItems();

    expect((await feed.markSeen(first.id)).status).toBe('seen');
    expect((await feed.ignore(second.id)).status).toBe('ignored');

    const promoted = await feed.saveToLibrary(first.id, { tags: ['signal'] });
    expect(promoted.feed_item.status).toBe('saved');
    expect(promoted.feed_item.saved_library_item_id).toBe(promoted.library_item.frontmatter.id);
    expect(promoted.feed_item.extracted_ref?.kind).toBe('article_markdown');
    expect(promoted.feed_item.enrichment_artifact_ids?.length).toBeGreaterThan(0);
    expect(promoted.library_item.body).toContain('Full readable article body');
    expect(promoted.library_item.frontmatter.source).toMatchObject({
      kind: 'feed',
      feed_item_id: first.id,
      feed_source_id: source.id,
      feed_fetch_run_id: promoted.feed_item.fetch_run_id
    });
    expect(promoted.library_item.frontmatter.source_snapshot_ref).toBe(promoted.feed_item.extracted_ref?.path);
    expect(promoted.library_item.frontmatter.promoted_enrichment_artifact_ids).toEqual(promoted.feed_item.enrichment_artifact_ids);
    const analysis = await createSynthesisStore(tmp).get(promoted.feed_item.enrichment_artifact_ids?.[0] ?? '');
    expect(analysis?.kind).toBe('feed.item.analysis');
    expect((await createLibraryStore(tmp).list()).map((item) => item.frontmatter.id)).toEqual([
      promoted.library_item.frontmatter.id
    ]);
  });

  it('creates feed-scoped digest and cluster artifacts outside main truth data', async () => {
    const feed = createFeedStore(tmp, {
      now: () => new Date('2026-04-28T12:00:00.000Z'),
      fetchText: async () => rss
    });
    const source = await feed.createSource({ url: 'https://example.com/rss.xml' });
    await feed.fetch(source.id);

    const digest = await feed.digest('2026-04-28');
    const cluster = await feed.cluster(source.id);
    const report = await feed.dailyReport('2026-04-28', {
      digest_artifact_id: digest.artifact.id,
      cluster_artifact_id: cluster.artifact.id
    });

    expect(digest.artifact.kind).toBe('feed.digest');
    expect(digest.artifact.scope_key).toBe('feed.digest:2026-04-28');
    expect(cluster.artifact.kind).toBe('feed.cluster');
    expect(cluster.artifact.scope_key).toBe(`feed.cluster:${source.id}`);
    expect(report.artifact.kind).toBe('feed.report.daily');
    expect(report.artifact.payload.digest_artifact_id).toBe(digest.artifact.id);
    expect(await createLibraryStore(tmp).list()).toEqual([]);
  });

  it('fetches YouTube subscriptions as Layer 0 videos and promotes transcript snapshots to Library', async () => {
    const listLimits: Array<number | undefined> = [];
    const subtitleRequests: string[][] = [];
    const subtitleContent = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 1100, segs: [{ utf8: 'hello orbit' }] },
        { tStartMs: 1100, dDurationMs: 1200, segs: [{ utf8: 'feed data arrives every day' }] }
      ]
    });
    const youtubeProvider: YouTubeFeedProvider = {
      normalizeSource: normalizeYouTubeSource,
      listCandidates: async (source, options) => {
        listLimits.push(options?.limit);
        return [
          {
            id: 'video-1',
            title: `First video from ${source.source_type}`,
            url: 'https://www.youtube.com/watch?v=video-1',
            canonical_url: 'https://www.youtube.com/watch?v=video-1'
          }
        ];
      },
      fetchArchive: async (_videoId, options) => {
        subtitleRequests.push(options?.subtitleLanguages ?? []);
        return {
          info: {
            id: 'video-1',
            title: 'First video from channel',
            webpage_url: 'https://www.youtube.com/watch?v=video-1',
            thumbnail: 'https://i.ytimg.com/vi/video-1/hqdefault.jpg',
            channel: 'Orbit Channel',
            channel_id: 'UC123',
            uploader_id: '@orbit',
            uploader_url: 'https://www.youtube.com/@orbit',
            timestamp: 1777370400,
            upload_date: '20260428',
            duration: 95,
            view_count: 1200,
            like_count: 88,
            language: 'en',
            availability: 'public',
            description: 'A useful video about daily feed workflows and personal data loops.',
            tags: ['orbit', 'feed'],
            categories: ['Education']
          },
          subtitle_content: subtitleContent,
          subtitle_format: 'json3',
          subtitle_language: 'en',
          subtitle_tracks: [
            {
              language: 'en',
              label: 'English auto',
              source_kind: 'auto',
              file_name: 'video-1.en.auto.json3',
              content: subtitleContent,
              format: 'json3',
              segments: json3ToSegments(subtitleContent),
              transcript: json3ToTranscript(subtitleContent)
            }
          ],
          subtitle_status: 'captured',
          subtitle_requested_languages: options?.subtitleLanguages ?? [],
          subtitle_available_languages: [],
          automatic_caption_languages: ['en']
        };
      },
      buildMarkdown: defaultYouTubeFeedProvider.buildMarkdown
    };
    const feed = createFeedStore(tmp, {
      now: () => new Date('2026-04-28T12:00:00.000Z'),
      youtubeProvider
    });
    const source = await feed.createSource({
      kind: 'youtube',
      url: '@orbit',
      title: 'Orbit Videos',
      processing_policy: { extract_readable: true, auto_analyze: true, auto_translate_to: 'zh-CN' }
    });

    const first = await feed.fetch(source.id);
    const second = await feed.fetch(source.id);
    const [item] = await feed.listItems({ include_saved: true });
    const content = await feed.getItemContent(item.id);
    const subtitleTranslation = await feed.attachAiSubtitleTranslation(item.id, {
      source_track_id: 'youtube:auto:en',
      target_language: 'zh-CN',
      model: 'test-translator',
      prompt_version: 'test.subtitle.translation.v1',
      translated_segments: [
        { source_segment_id: 'seg-00000', text: '你好 Orbit' },
        { source_segment_id: 'seg-00001', text: 'Feed 数据每天都会到达' }
      ]
    });
    const promoted = await feed.saveToLibrary(item.id);

    expect(source.url).toBe('https://www.youtube.com/@orbit/videos');
    expect(source.fetch_policy).toMatchObject({ max_items_per_fetch: 20, initial_backfill: 'recent', initial_backfill_count: 20 });
    expect(source.metadata).toMatchObject({ provider: 'youtube', youtube_source_type: 'channel' });
    expect(listLimits).toEqual([20, 20]);
    expect(subtitleRequests[0]).toEqual(['zh.*', 'en.*']);
    expect(first[0]).toMatchObject({ fetched: 1, created: 1, skipped: 0, failed: 0 });
    expect(second[0]).toMatchObject({ fetched: 1, created: 0, skipped: 1 });
    expect(item.dedupe_key).toBe('youtube:video-1');
    expect(item.metadata).toMatchObject({
      provider: 'youtube',
      external_id: 'video-1',
      channel_name: 'Orbit Channel',
      has_transcript: true,
      subtitle_track_count: 1,
      subtitle_languages: ['en'],
      preferred_transcript_track_id: 'youtube:auto:en'
    });
    expect(item.media?.transcript_tracks).toHaveLength(1);
    expect(item.media?.preferred_track_id).toBe('youtube:auto:en');
    expect(item.media?.transcript_tracks[0]).toMatchObject({
      id: 'youtube:auto:en',
      language: 'en',
      source: 'youtube',
      source_kind: 'auto',
      status: 'captured'
    });
    expect(item.media?.transcript_tracks[0]?.segments_ref?.kind).toBe('youtube_transcript_segments');
    expect(subtitleTranslation.artifact.kind).toBe('feed.youtube.subtitle.ai');
    expect(subtitleTranslation.track).toMatchObject({
      id: 'ai:ai_translation:zh-CN',
      source: 'ai',
      source_kind: 'ai_translation',
      translation_of_track_id: 'youtube:auto:en'
    });
    expect(subtitleTranslation.bilingual_pair.markdown_ref?.kind).toBe('youtube_bilingual_transcript');
    expect(subtitleTranslation.feed_item.media?.preferred_bilingual_pair_id).toBe('bilingual:youtube:auto:en:ai:ai_translation:zh-CN');
    expect(item.raw_ref?.kind).toBe('youtube_info_json');
    expect(item.raw_refs?.map((ref) => ref.kind)).toEqual(
      expect.arrayContaining(['youtube_candidate_json', 'youtube_info_json', 'youtube_subtitle'])
    );
    expect(item.extracted_ref?.kind).toBe('youtube_transcript_markdown');
    expect(content.content_kind).toBe('youtube_transcript_markdown');
    expect(content.content).toContain('## Transcript');
    expect(content.content).toContain('feed data arrives every day');
    expect(item.enrichment_artifact_ids?.length).toBeGreaterThanOrEqual(2);
    expect(promoted.library_item.frontmatter.kind).toBe('video');
    expect(promoted.library_item.body).toContain('## Transcript');
    expect(promoted.library_item.frontmatter.source).toMatchObject({
      kind: 'feed',
      provider: 'youtube',
      external_id: 'video-1',
      channel_name: 'Orbit Channel',
      duration_seconds: 95,
      preferred_transcript_track_id: 'youtube:auto:en',
      preferred_bilingual_pair_id: 'bilingual:youtube:auto:en:ai:ai_translation:zh-CN'
    });
    expect(promoted.library_item.frontmatter.source?.transcript_tracks?.map((track) => track.id)).toEqual(
      expect.arrayContaining(['youtube:auto:en', 'ai:ai_translation:zh-CN'])
    );
    expect(promoted.library_item.frontmatter.source_snapshot_ref).toBe(item.extracted_ref?.path);
  });

  it('fetches X account subscriptions as Layer 0 posts and promotes bookmarks to Library', async () => {
    const listLimits: Array<number | undefined> = [];
    const threadRequests: string[] = [];
    const candidates: XPostCandidate[] = [
      {
        id: '2056340861773136121',
        author: 'jakevin7',
        text: 'OpenCLI 支持了官方的 weread 微信读书 CLI。',
        url: 'https://x.com/i/status/2056340861773136121',
        canonical_url: 'https://x.com/jakevin7/status/2056340861773136121',
        created_at: 'Mon May 18 11:47:21 +0000 2026',
        published_at: '2026-05-18T11:47:21.000Z',
        likes: 24,
        retweets: 3,
        views: 3011,
        is_reply: false
      },
      {
        id: '2056334923070582834',
        author: 'jakevin7',
        text: '@yangyi 真难啊😂',
        url: 'https://x.com/i/status/2056334923070582834',
        canonical_url: 'https://x.com/jakevin7/status/2056334923070582834',
        created_at: 'Mon May 18 11:23:45 +0000 2026',
        published_at: '2026-05-18T11:23:45.000Z',
        likes: 0,
        views: 337,
        is_reply: true
      }
    ];
    const xProvider: XFeedProvider = {
      normalizeSource: normalizeXSource,
      listCandidates: async (_source, options) => {
        listLimits.push(options?.limit);
        return candidates;
      },
      fetchThread: async (tweetId) => {
        threadRequests.push(tweetId);
        return { tweets: candidates };
      },
      buildMarkdown: defaultXFeedProvider.buildMarkdown
    };
    const feed = createFeedStore(tmp, {
      now: () => new Date('2026-05-18T12:00:00.000Z'),
      xProvider
    });
    const source = await feed.createSource({
      kind: 'twitter',
      url: '@jakevin7',
      processing_policy: { include_replies: false, capture_comments: true }
    });

    const first = await feed.fetch(source.id);
    const second = await feed.fetch(source.id);
    const items = await feed.listItems({ include_saved: true });

    expect(source.url).toBe('https://x.com/jakevin7');
    expect(source.metadata).toMatchObject({ provider: 'x', x_handle: 'jakevin7' });
    expect(listLimits).toEqual([20, 20]);
    expect(first[0]).toMatchObject({ fetched: 1, created: 1, skipped: 0 });
    expect(second[0]).toMatchObject({ fetched: 1, created: 0, skipped: 1 });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      dedupe_key: 'x:2056340861773136121',
      url: 'https://x.com/jakevin7/status/2056340861773136121',
      metadata: {
        provider: 'x',
        external_id: '2056340861773136121',
        x_handle: 'jakevin7',
        author_handle: 'jakevin7',
        is_reply: false,
        like_count: 24,
        view_count: 3011
      }
    });
    expect(items[0].raw_ref?.kind).toBe('x_candidate_json');
    const raw = await readFile(path.join(tmp, items[0].raw_ref?.path ?? ''), 'utf8');
    expect(raw).toContain('2056334923070582834');

    const promoted = await feed.saveToLibrary(items[0].id);
    expect(threadRequests).toEqual(['2056340861773136121']);
    expect(promoted.feed_item.extracted_ref?.kind).toBe('x_post_markdown');
    expect(promoted.library_item.frontmatter.kind).toBe('bookmark');
    expect(promoted.library_item.frontmatter.source).toMatchObject({
      kind: 'feed',
      provider: 'x',
      external_id: '2056340861773136121',
      feed_source_id: source.id
    });
    expect(promoted.library_item.body).toContain('OpenCLI 支持了官方的 weread');
    expect(promoted.library_item.body).toContain('Reply by @jakevin7');
    expect(await createLibraryStore(tmp).list()).toHaveLength(1);
  });

  it('refreshes older YouTube transcript caches that predate bilingual subtitle requests', async () => {
    const subtitleRequests: string[][] = [];
    const subtitleContent = JSON.stringify({
      events: [{ tStartMs: 0, dDurationMs: 1100, segs: [{ utf8: 'hello orbit' }] }]
    });
    const youtubeProvider: YouTubeFeedProvider = {
      normalizeSource: normalizeYouTubeSource,
      listCandidates: async () => [
        {
          id: 'video-1',
          title: 'Bilingual cache video',
          url: 'https://www.youtube.com/watch?v=video-1',
          canonical_url: 'https://www.youtube.com/watch?v=video-1'
        }
      ],
      fetchArchive: async (_videoId, options) => {
        subtitleRequests.push(options?.subtitleLanguages ?? []);
        return {
          info: {
            id: 'video-1',
            title: 'Bilingual cache video',
            webpage_url: 'https://www.youtube.com/watch?v=video-1',
            description: 'A video with refreshed subtitle request policy.'
          },
          subtitle_content: subtitleContent,
          subtitle_format: 'json3',
          subtitle_language: 'en',
          subtitle_tracks: [
            {
              language: 'en',
              label: 'English auto',
              source_kind: 'auto',
              file_name: 'video-1.en.auto.json3',
              content: subtitleContent,
              format: 'json3',
              segments: json3ToSegments(subtitleContent),
              transcript: json3ToTranscript(subtitleContent)
            }
          ],
          subtitle_status: 'captured',
          subtitle_requested_languages: options?.subtitleLanguages ?? [],
          subtitle_available_languages: [],
          automatic_caption_languages: ['en']
        };
      },
      buildMarkdown: defaultYouTubeFeedProvider.buildMarkdown
    };
    const feed = createFeedStore(tmp, {
      now: () => new Date('2026-04-28T12:00:00.000Z'),
      youtubeProvider
    });
    const source = await feed.createSource({ kind: 'youtube', url: '@orbit' });
    await feed.fetch(source.id);
    const [item] = await feed.listItems({ include_saved: true });
    const itemPath = path.join(tmp, 'feeds', source.id, `${item.id}.json`);
    const stale = JSON.parse(await readFile(itemPath, 'utf8')) as typeof item;
    stale.metadata = { ...(stale.metadata ?? {}), subtitle_requested_languages: ['en', 'zh-Hans', 'zh'] };
    await writeFile(itemPath, `${JSON.stringify(stale, null, 2)}\n`, 'utf8');

    await feed.getItemContent(item.id);

    expect(subtitleRequests).toEqual([
      ['zh.*', 'en.*'],
      ['zh.*', 'en.*']
    ]);
  });

  it('allows full YouTube initial backfill while keeping recurring refresh bounded', async () => {
    const listLimits: Array<number | undefined> = [];
    const youtubeProvider: YouTubeFeedProvider = {
      normalizeSource: normalizeYouTubeSource,
      listCandidates: async (_source, options) => {
        listLimits.push(options?.limit);
        return [
          { id: 'video-1', title: 'Newest video', url: 'https://www.youtube.com/watch?v=video-1', canonical_url: 'https://www.youtube.com/watch?v=video-1' },
          { id: 'video-2', title: 'Older video', url: 'https://www.youtube.com/watch?v=video-2', canonical_url: 'https://www.youtube.com/watch?v=video-2' }
        ];
      },
      fetchArchive: async (videoId) => ({
        info: {
          id: videoId,
          title: videoId,
          webpage_url: `https://www.youtube.com/watch?v=${videoId}`,
          description: `Description for ${videoId}`
        },
        subtitle_content: null,
        subtitle_format: null,
        subtitle_tracks: [],
        subtitle_status: 'not_exposed',
        subtitle_requested_languages: ['zh.*', 'en.*'],
        subtitle_available_languages: [],
        automatic_caption_languages: []
      }),
      buildMarkdown: defaultYouTubeFeedProvider.buildMarkdown
    };
    const feed = createFeedStore(tmp, {
      now: () => new Date('2026-04-28T12:00:00.000Z'),
      youtubeProvider
    });
    const source = await feed.createSource({
      kind: 'youtube',
      url: '@fullarchive',
      fetch_policy: { initial_backfill: 'full', max_items_per_fetch: 20, respect_cache: true },
      processing_policy: { extract_readable: false }
    });

    const first = await feed.fetch(source.id);
    const afterFirst = (await feed.listSources()).find((item) => item.id === source.id);
    const second = await feed.fetch(source.id);

    expect(listLimits).toEqual([undefined, 20]);
    expect(first[0]).toMatchObject({ fetched: 2, created: 2, skipped: 0 });
    expect(afterFirst?.metadata?.youtube_initial_backfill_completed_at).toBeDefined();
    expect(second[0]).toMatchObject({ fetched: 2, created: 0, skipped: 2 });
  });

  it('persists visible YouTube fetch progress while a run is active', async () => {
    let releaseCandidates!: (value: YouTubeVideoCandidate[]) => void;
    const candidates = new Promise<YouTubeVideoCandidate[]>((resolve) => {
      releaseCandidates = resolve;
    });
    const youtubeProvider: YouTubeFeedProvider = {
      normalizeSource: normalizeYouTubeSource,
      listCandidates: async () => candidates,
      fetchArchive: async () => ({
        info: {
          id: 'video-1',
          title: 'Progress video',
          webpage_url: 'https://www.youtube.com/watch?v=video-1',
          description: 'Progress description'
        },
        subtitle_content: null,
        subtitle_format: null,
        subtitle_tracks: [],
        subtitle_status: 'not_exposed',
        subtitle_requested_languages: ['zh.*', 'en.*'],
        subtitle_available_languages: [],
        automatic_caption_languages: []
      }),
      buildMarkdown: defaultYouTubeFeedProvider.buildMarkdown
    };
    const feed = createFeedStore(tmp, {
      now: () => new Date('2026-04-28T12:00:00.000Z'),
      youtubeProvider
    });
    const source = await feed.createSource({ kind: 'youtube', url: '@progress' });

    const fetchPromise = feed.fetch(source.id);
    let running = (await feed.listFetchRuns(source.id))[0];
    for (
      let attempt = 0;
      (!running || running.stages?.find((stage) => stage.id === 'resolve-source')?.status !== 'running') && attempt < 10;
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      running = (await feed.listFetchRuns(source.id))[0];
    }

    expect(running).toMatchObject({
      source_id: source.id,
      status: 'running',
      fetched: 0,
      created: 0
    });
    expect(running.stages?.find((stage) => stage.id === 'resolve-source')).toMatchObject({
      status: 'running',
      detail: 'Resolving latest 20 YouTube item(s) with yt-dlp.'
    });

    releaseCandidates([
      {
        id: 'video-1',
        title: 'Progress video',
        url: 'https://www.youtube.com/watch?v=video-1',
        canonical_url: 'https://www.youtube.com/watch?v=video-1'
      }
    ]);
    await fetchPromise;

    const [completed] = await feed.listFetchRuns(source.id);
    expect(completed).toMatchObject({ status: 'success', fetched: 1, created: 1 });
    expect(completed.stages?.filter((stage) => stage.id === 'extract-readable')).toHaveLength(1);
    expect(completed.stages?.find((stage) => stage.id === 'extract-readable')).toMatchObject({
      status: 'success',
      total: 1,
      completed: 1
    });
  });
});
