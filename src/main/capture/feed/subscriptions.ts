import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AddFeedSubscriptionInput, FeedSubscription } from '@shared/capture';
import { stableId } from '../common';

const DEFAULT_FETCH_INTERVAL_SECONDS = 1800;

export class FeedSubscriptionStore {
  constructor(private readonly vaultPath: string) {}

  subscriptionsPath(): string {
    return path.join(this.vaultPath, '.orbit', 'inbox', 'capture', 'feed', 'subscriptions.json');
  }

  async list(): Promise<FeedSubscription[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.subscriptionsPath(), 'utf8');
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => (isSubscription(value) ? [value] : []));
  }

  async add(input: AddFeedSubscriptionInput, now: () => Date): Promise<FeedSubscription> {
    const existing = await this.list();
    const url = normalizeUrl(input.url);
    const duplicate = existing.find((subscription) => subscription.url === url);
    if (duplicate) return duplicate;
    const subscription: FeedSubscription = {
      id: stableId('feed_sub', url),
      kind: 'rss',
      url,
      title: input.title?.trim() || new URL(url).hostname,
      added_at: now().toISOString(),
      fetch_interval_seconds: input.fetchIntervalSeconds ?? DEFAULT_FETCH_INTERVAL_SECONDS,
      ...(input.category ? { category: input.category } : {})
    };
    await this.write([...existing, subscription]);
    return subscription;
  }

  async remove(id: string): Promise<FeedSubscription | null> {
    const existing = await this.list();
    const removed = existing.find((subscription) => subscription.id === id) ?? null;
    if (!removed) return null;
    await this.write(existing.filter((subscription) => subscription.id !== id));
    return removed;
  }

  async update(updated: FeedSubscription): Promise<FeedSubscription> {
    const existing = await this.list();
    const index = existing.findIndex((subscription) => subscription.id === updated.id);
    if (index === -1) throw new Error(`feed subscription not found: ${updated.id}`);
    const next = [...existing];
    next[index] = updated;
    await this.write(next);
    return updated;
  }

  private async write(subscriptions: FeedSubscription[]): Promise<void> {
    await fs.mkdir(path.dirname(this.subscriptionsPath()), { recursive: true });
    await fs.writeFile(this.subscriptionsPath(), `${JSON.stringify(subscriptions, null, 2)}\n`, 'utf8');
  }
}

function normalizeUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('feed URL must be http(s)');
  }
  return url.toString();
}

function isSubscription(value: unknown): value is FeedSubscription {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    record.kind === 'rss' &&
    typeof record.url === 'string' &&
    typeof record.title === 'string' &&
    typeof record.added_at === 'string' &&
    typeof record.fetch_interval_seconds === 'number'
  );
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT';
}
