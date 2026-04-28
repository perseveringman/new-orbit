import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  CreateFeedSourceInput,
  FeedClusterPayload,
  FeedDigestPayload,
  FeedFetchResult,
  FeedItem,
  FeedItemFilter,
  FeedSource,
  FeedSynthesisResult,
  SaveFeedToLibraryInput,
  SaveFeedToLibraryResult,
  UpdateFeedSourceInput
} from '@shared/feed';
import { createLibraryStore } from '../library/store';
import { createSynthesisStore } from '../synthesis/store';
import { parseRss } from '../capture/feed/rss';

const FEEDS_ROOT = 'feeds';
const SOURCES_FILE = '_sources.json';

export interface FeedStoreOptions {
  now?: () => Date;
  fetchText?: (url: string) => Promise<string>;
}

export class FeedStore {
  private readonly now: () => Date;
  private readonly fetchText: (url: string) => Promise<string>;

  constructor(private readonly vaultPath: string, options: FeedStoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.fetchText = options.fetchText ?? defaultFetchText;
  }

  async listSources(): Promise<FeedSource[]> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.sourcesPath(), 'utf8')) as unknown;
      return Array.isArray(parsed) ? parsed.flatMap((value) => (isFeedSource(value) ? [value] : [])) : [];
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }

  async createSource(input: CreateFeedSourceInput): Promise<FeedSource> {
    const sources = await this.listSources();
    const url = normalizeUrl(input.url);
    const duplicate = sources.find((source) => source.url === url);
    if (duplicate) return duplicate;
    const source: FeedSource = {
      id: stableId('feed-source', url),
      title: input.title?.trim() || hostnameTitle(url),
      url,
      kind: input.kind ?? 'rss',
      areas: input.areas ?? [],
      enabled: input.enabled ?? true,
      added_at: this.now().toISOString()
    };
    await this.writeSources([...sources, source]);
    await fs.mkdir(this.sourceDir(source.id), { recursive: true });
    return source;
  }

  async updateSource(id: string, patch: UpdateFeedSourceInput): Promise<FeedSource> {
    const sources = await this.listSources();
    const index = sources.findIndex((source) => source.id === id);
    if (index < 0) throw new Error(`feed_source_not_found:${id}`);
    const next: FeedSource = {
      ...sources[index],
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.areas !== undefined ? { areas: patch.areas } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {})
    };
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

  async markSeen(id: string): Promise<FeedItem> {
    const item = await this.requireItem(id);
    if (item.status === 'saved' || item.status === 'ignored') return item;
    return this.writeItem({ ...item, status: 'seen', seen_at: this.now().toISOString() });
  }

  async ignore(id: string): Promise<FeedItem> {
    const item = await this.requireItem(id);
    return this.writeItem({ ...item, status: 'ignored', ignored_at: this.now().toISOString() });
  }

  async saveToLibrary(id: string, input: SaveFeedToLibraryInput = {}): Promise<SaveFeedToLibraryResult> {
    const item = await this.requireItem(id);
    if (item.saved_library_item_id) {
      const existing = await createLibraryStore(this.vaultPath).get(item.saved_library_item_id);
      if (existing) return { feed_item: item, library_item: existing };
    }
    const libraryItem = await createLibraryStore(this.vaultPath).save({
      kind: item.url.match(/youtube\.com|youtu\.be|vimeo\.com/i) ? 'video' : 'article',
      title: item.title,
      url: item.url,
      body: `# ${item.title}\n\n${item.summary ?? ''}\n\nSource: ${item.url}\n`,
      tags: input.tags,
      source: {
        kind: 'feed',
        url: item.url,
        feed_item_id: item.id,
        feed_source_id: item.source_id,
        note: input.note
      }
    });
    const saved = await this.writeItem({
      ...item,
      status: 'saved',
      saved_library_item_id: libraryItem.frontmatter.id
    });
    return { feed_item: saved, library_item: libraryItem };
  }

  async digest(date: string): Promise<FeedSynthesisResult<FeedDigestPayload>> {
    const items = (await this.listItems({ include_saved: true })).filter((item) => item.fetched_at.startsWith(date));
    const payload: FeedDigestPayload = {
      date,
      item_count: items.length,
      headline: items.length ? `${items.length} feed item(s) fetched` : 'No feed items fetched',
      highlights: items.slice(0, 8).map((item) => ({ title: item.title, url: item.url, summary: item.summary }))
    };
    const artifact = (await createSynthesisStore(this.vaultPath).writeFresh({
      kind: 'feed.digest',
      scope_key: `feed.digest:${date}`,
      sources: items.map((item) => ({ kind: 'feed', ref: item.id, title: item.title, excerpt: item.summary })),
      provenance: localFeedProvenance('feed.digest.v1'),
      payload
    })) as FeedSynthesisResult<FeedDigestPayload>['artifact'];
    return { artifact };
  }

  async cluster(scope = 'all'): Promise<FeedSynthesisResult<FeedClusterPayload>> {
    const items = await this.listItems();
    const buckets = new Map<string, FeedItem[]>();
    for (const item of items) {
      const label = item.title.split(/\s+/).find((part) => part.length > 4)?.toLowerCase() ?? 'general';
      buckets.set(label, [...(buckets.get(label) ?? []), item]);
    }
    const payload: FeedClusterPayload = {
      scope,
      clusters: [...buckets.entries()].slice(0, 8).map(([label, bucket]) => ({
        label,
        item_ids: bucket.map((item) => item.id),
        rationale: `Grouped ${bucket.length} item(s) by visible title terms.`
      }))
    };
    const artifact = (await createSynthesisStore(this.vaultPath).writeFresh({
      kind: 'feed.cluster',
      scope_key: `feed.cluster:${scope}`,
      sources: items.map((item) => ({ kind: 'feed', ref: item.id, title: item.title, excerpt: item.summary })),
      provenance: localFeedProvenance('feed.cluster.v1'),
      payload
    })) as FeedSynthesisResult<FeedClusterPayload>['artifact'];
    return { artifact };
  }

  private async fetchOne(source: FeedSource): Promise<FeedFetchResult> {
    try {
      const xml = await this.fetchText(source.url);
      const parsed = parseRss(xml, source.url, this.now);
      const existingIds = new Set((await this.readItemsForSource(source.id)).map((item) => item.id));
      let created = 0;
      for (const parsedItem of parsed.items) {
        const id = stableId('feed-item', `${source.id}:${parsedItem.guid ?? parsedItem.url}`);
        if (existingIds.has(id)) continue;
        const item: FeedItem = {
          id,
          source_id: source.id,
          title: parsedItem.title,
          url: parsedItem.url,
          published_at: parsedItem.publishedAt,
          fetched_at: this.now().toISOString(),
          summary: parsedItem.excerpt,
          image_url: parsedItem.imageUrl,
          status: 'new'
        };
        await this.writeItem(item);
        existingIds.add(id);
        created += 1;
      }
      await this.updateSourceAfterFetch(source, {
        title: parsed.title || source.title,
        last_fetched_at: this.now().toISOString(),
        last_fetch_error: undefined
      });
      return { source_id: source.id, fetched: parsed.items.length, created, skipped: parsed.items.length - created };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.updateSourceAfterFetch(source, {
        last_fetched_at: this.now().toISOString(),
        last_fetch_error: message
      });
      return { source_id: source.id, fetched: 0, created: 0, skipped: 0, error: message };
    }
  }

  private async updateSourceAfterFetch(source: FeedSource, patch: Partial<FeedSource>): Promise<void> {
    const sources = await this.listSources();
    await this.writeSources(sources.map((item) => (item.id === source.id ? { ...item, ...patch } : item)));
  }

  private async requireItem(id: string): Promise<FeedItem> {
    const item = await this.getItem(id);
    if (!item) throw new Error(`feed_item_not_found:${id}`);
    return item;
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
        .map((file) => fs.readFile(path.join(dir, file), 'utf8').then((raw) => normalizeFeedItem(JSON.parse(raw))))
    );
    return items;
  }

  private async writeItem(item: FeedItem): Promise<FeedItem> {
    await fs.mkdir(this.sourceDir(item.source_id), { recursive: true });
    await fs.writeFile(path.join(this.sourceDir(item.source_id), `${item.id}.json`), `${JSON.stringify(item, null, 2)}\n`, 'utf8');
    return item;
  }

  private sourcesPath(): string {
    return path.join(this.vaultPath, FEEDS_ROOT, SOURCES_FILE);
  }

  private sourceDir(sourceId: string): string {
    return path.join(this.vaultPath, FEEDS_ROOT, sourceId);
  }

  private async writeSources(sources: FeedSource[]): Promise<void> {
    await fs.mkdir(path.dirname(this.sourcesPath()), { recursive: true });
    await fs.writeFile(this.sourcesPath(), `${JSON.stringify(sources, null, 2)}\n`, 'utf8');
  }
}

export function createFeedStore(vaultPath: string, options?: FeedStoreOptions): FeedStore {
  return new FeedStore(vaultPath, options);
}

function normalizeFeedItem(value: FeedItem): FeedItem {
  if (!value.id || !value.source_id || !value.title || !value.url) throw new Error('invalid_feed_item');
  return value;
}

function isFeedSource(value: unknown): value is FeedSource {
  const record = value as FeedSource;
  return Boolean(record?.id && record.title && record.url && record.kind);
}

function normalizeUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('feed URL must be http(s)');
  return url.toString();
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

async function defaultFetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { accept: 'application/rss+xml, application/atom+xml, text/xml, */*;q=0.5' } });
  if (!response.ok) throw new Error(`failed to fetch feed (${response.status})`);
  return response.text();
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT';
}
