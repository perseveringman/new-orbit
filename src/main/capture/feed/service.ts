import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AddFeedSubscriptionInput, FeedRefreshResult, FeedSubscription, SaveFeedItemInput } from '@shared/capture';
import type { FeedItemPayload, InboxItem } from '@shared/inbox';
import { emitActivity, type ActivityEventInput } from '../../activity';
import { createInboxStore, monthKeyFromIso, readInboxNdjson } from '../../inbox';
import { stableId, truncateText } from '../common';
import { LibraryService } from '../library/service';
import { parseRss, type ParsedFeed } from './rss';
import { FeedSubscriptionStore } from './subscriptions';

export interface FeedServiceOptions {
  now?: () => Date;
  fetchText?: (url: string) => Promise<string>;
  emitActivity?: (input: ActivityEventInput) => unknown;
}

export class FeedService {
  private readonly now: () => Date;
  private readonly fetchText: (url: string) => Promise<string>;
  private readonly activity: (input: ActivityEventInput) => unknown;
  private readonly subscriptions: FeedSubscriptionStore;

  constructor(private readonly vaultPath: string, options: FeedServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.fetchText = options.fetchText ?? defaultFetchText;
    this.activity = options.emitActivity ?? emitActivity;
    this.subscriptions = new FeedSubscriptionStore(vaultPath);
  }

  async listSubscriptions(): Promise<FeedSubscription[]> {
    return this.subscriptions.list();
  }

  async addSubscription(input: AddFeedSubscriptionInput): Promise<FeedSubscription> {
    const normalizedUrl = new URL(input.url.trim()).toString();
    const alreadyExists = (await this.subscriptions.list()).some(
      (subscription) => subscription.url === normalizedUrl
    );
    const subscription = await this.subscriptions.add(input, this.now);
    if (!alreadyExists) {
      this.activity({
        actor: 'user',
        action: 'feed.subscription_added',
        context: { subscription_id: subscription.id },
        payload: { url: subscription.url, title: subscription.title },
        summary: `Added RSS subscription: ${subscription.title}`
      });
    }
    return subscription;
  }

  async removeSubscription(id: string): Promise<FeedSubscription | null> {
    const removed = await this.subscriptions.remove(id);
    if (removed) {
      this.activity({
        actor: 'user',
        action: 'feed.subscription_removed',
        context: { subscription_id: removed.id },
        payload: { url: removed.url, title: removed.title },
        summary: `Removed RSS subscription: ${removed.title}`
      });
    }
    return removed;
  }

  async refresh(subscriptionId?: string): Promise<FeedRefreshResult[]> {
    const subscriptions = await this.subscriptions.list();
    const targets = subscriptionId
      ? subscriptions.filter((subscription) => subscription.id === subscriptionId)
      : subscriptions;
    if (subscriptionId && targets.length === 0) throw new Error(`feed subscription not found: ${subscriptionId}`);
    const results: FeedRefreshResult[] = [];
    for (const subscription of targets) {
      results.push(await this.refreshOne(subscription));
    }
    return results;
  }

  async listPending(): Promise<InboxItem[]> {
    const result = await createInboxStore(this.vaultPath).list({ category: 'capture', subtype: 'feed_item', includeArchived: false });
    return result.items;
  }

  async fadeOut(id: string): Promise<InboxItem> {
    return createInboxStore(this.vaultPath).archive(id, this.now().toISOString());
  }

  async fadeOutOlderThan(cutoffIso: string): Promise<InboxItem[]> {
    const pending = await this.listPending();
    const faded: InboxItem[] = [];
    for (const item of pending) {
      if (item.created_at <= cutoffIso) faded.push(await this.fadeOut(item.id));
    }
    return faded;
  }

  async history(): Promise<InboxItem[]> {
    return readFeedHistory(this.vaultPath);
  }

  async saveToLibrary(id: string, input: SaveFeedItemInput = {}): Promise<InboxItem> {
    const item = await createInboxStore(this.vaultPath).get(id);
    if (!item || item.subtype !== 'feed_item') throw new Error(`feed item not found: ${id}`);
    const payload = item.payload as FeedItemPayload;
    const library = new LibraryService(this.vaultPath, { now: this.now, emitActivity: this.activity });
    const saved = await library.saveArticle({
      url: payload.article_url,
      title: payload.article_title,
      publishedAt: payload.published_at,
      source: 'feed_upgrade',
      sourceNote: input.note,
      originFeedSubscriptionId: payload.subscription_id,
      originFeedItemId: item.id,
      content: `# ${payload.article_title}\n\n${payload.article_excerpt}\n\nSource: ${payload.article_url}\n`,
      actor: input.actor ?? 'user'
    });
    await this.fadeOut(id);
    return saved;
  }

  private async refreshOne(subscription: FeedSubscription): Promise<FeedRefreshResult> {
    try {
      const xml = await this.fetchText(subscription.url);
      const parsed = parseRss(xml, subscription.url, this.now);
      const updated: FeedSubscription = {
        ...subscription,
        title: parsed.title || subscription.title,
        last_fetched_at: this.now().toISOString(),
        last_fetch_error: undefined
      };
      await this.subscriptions.update(updated);
      const created = await this.createItems(updated, parsed);
      return {
        subscriptionId: subscription.id,
        fetched: parsed.items.length,
        created,
        skipped: parsed.items.length - created
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.subscriptions.update({
        ...subscription,
        last_fetched_at: this.now().toISOString(),
        last_fetch_error: message
      });
      return { subscriptionId: subscription.id, fetched: 0, created: 0, skipped: 0, error: message };
    }
  }

  private async createItems(subscription: FeedSubscription, parsed: ParsedFeed): Promise<number> {
    const store = createInboxStore(this.vaultPath);
    const existing = new Set((await this.feedIdentities()).map((value) => value.toLowerCase()));
    let created = 0;
    for (const item of parsed.items) {
      const identity = item.guid || item.url;
      const dedupeKey = `${subscription.id}:${identity}`;
      if (existing.has(dedupeKey.toLowerCase()) || existing.has(item.url.toLowerCase())) continue;
      const id = stableId('feed_item', dedupeKey);
      const inboxItem: InboxItem = {
        id,
        category: 'capture',
        subtype: 'feed_item',
        title: item.title,
        summary: truncateText(item.excerpt || item.url, 160),
        context: {
          feed_subscription_id: subscription.id,
          feed_item_key: dedupeKey
        },
        payload: {
          subscription_id: subscription.id,
          article_url: item.url,
          article_title: item.title,
          article_excerpt: item.excerpt,
          published_at: item.publishedAt,
          source: subscription.title,
          ...(item.guid ? { guid: item.guid } : {}),
          ...(item.imageUrl ? { image_url: item.imageUrl } : {})
        },
        status: 'pending',
        created_at: this.now().toISOString(),
        updated_at: this.now().toISOString()
      };
      await store.add(inboxItem);
      existing.add(dedupeKey.toLowerCase());
      existing.add(item.url.toLowerCase());
      created += 1;
    }
    return created;
  }

  private async feedIdentities(): Promise<string[]> {
    const pending = await this.listPending();
    const history = await this.history();
    return [...pending, ...history].flatMap((item) => identitiesForItem(item));
  }
}

export function createFeedService(vaultPath: string, options?: FeedServiceOptions): FeedService {
  return new FeedService(vaultPath, options);
}

export async function readFeedHistory(vaultPath: string): Promise<InboxItem[]> {
  const dir = path.join(vaultPath, '.orbit', 'inbox', 'capture', 'feed', 'history');
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  const files = entries
    .filter((entry) => /^\d{4}-\d{2}\.ndjson$/.test(entry))
    .sort()
    .map((entry) => path.join(dir, entry));
  const chunks = await Promise.all(files.map((file) => readInboxNdjson(file)));
  return chunks.flat();
}

export function feedHistoryPath(vaultPath: string, at: string): string {
  return path.join(vaultPath, '.orbit', 'inbox', 'capture', 'feed', 'history', `${monthKeyFromIso(at)}.ndjson`);
}

function identitiesForItem(item: InboxItem): string[] {
  if (item.subtype !== 'feed_item') return [];
  const payload = item.payload as FeedItemPayload & { guid?: string };
  return [item.context.feed_item_key, payload.guid, payload.article_url].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );
}

async function defaultFetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' }
  });
  if (!response.ok) throw new Error(`failed to fetch RSS (${response.status})`);
  return response.text();
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT';
}
