import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  LibraryReadingUpdateInput,
  PromoteLibraryArticleInput,
  PromoteResult,
  SaveLibraryArticleInput
} from '@shared/capture';
import type { InboxItem, LibraryArticlePayload } from '@shared/inbox';
import { emitActivity, type ActivityEventInput } from '../../activity';
import { createInboxStore } from '../../inbox';
import { captureId, escapeMarkdown, estimateReadingMinutes, safeVaultRelativePath, slugify, truncateText, writeTextFile } from '../common';

export interface LibraryServiceOptions {
  now?: () => Date;
  fetchText?: (url: string) => Promise<string>;
  emitActivity?: (input: ActivityEventInput) => unknown;
}

export class LibraryService {
  private readonly now: () => Date;
  private readonly fetchText: (url: string) => Promise<string>;
  private readonly activity: (input: ActivityEventInput) => unknown;

  constructor(private readonly vaultPath: string, options: LibraryServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.fetchText = options.fetchText ?? defaultFetchText;
    this.activity = options.emitActivity ?? emitActivity;
  }

  async saveArticle(input: SaveLibraryArticleInput): Promise<InboxItem> {
    const id = captureId('library');
    const title = input.title?.trim() || titleFromUrl(input.url);
    const content = input.content ?? (await this.extractMarkdown(input.url, title));
    const contentPath = path.posix.join('articles', `${id}.md`);
    await writeTextFile(path.join(this.libraryDir(), contentPath), content);
    const at = this.now().toISOString();
    const item: InboxItem = {
      id,
      category: 'capture',
      subtype: 'library_article',
      title,
      summary: input.sourceNote ?? truncateText(content.replace(/^# .+$/m, ''), 180),
      context: {
        library_id: id,
        ...(input.originFeedSubscriptionId ? { feed_subscription_id: input.originFeedSubscriptionId } : {})
      },
      payload: {
        url: input.url,
        title,
        ...(input.author ? { author: input.author } : {}),
        ...(input.publishedAt ? { published_at: input.publishedAt } : {}),
        source: input.source ?? 'manual',
        ...(input.sourceNote ? { source_note: input.sourceNote } : {}),
        ...(input.originFeedSubscriptionId ? { origin_feed_subscription_id: input.originFeedSubscriptionId } : {}),
        ...(input.originFeedItemId ? { origin_feed_item_id: input.originFeedItemId } : {}),
        content_path: contentPath,
        estimated_reading_minutes: estimateReadingMinutes(content),
        total_reading_seconds: 0
      },
      status: 'unread',
      created_at: at,
      updated_at: at
    };
    const stored = await createInboxStore(this.vaultPath).add(item);
    this.activity({
      actor: input.actor ?? 'user',
      action: 'library.article_saved',
      context: { inbox_item_id: stored.id, library_id: stored.id },
      payload: { url: input.url, title, source: input.source ?? 'manual' },
      summary: `Saved article to Library: ${title}`
    });
    return stored;
  }

  async list(status?: InboxItem['status']): Promise<InboxItem[]> {
    const result = await createInboxStore(this.vaultPath).list({ category: 'capture', subtype: 'library_article' });
    return status ? result.items.filter((item) => item.status === status) : result.items;
  }

  async get(id: string): Promise<InboxItem | null> {
    const item = await createInboxStore(this.vaultPath).get(id);
    return item?.subtype === 'library_article' ? item : null;
  }

  async readContent(id: string): Promise<string> {
    const item = await this.requireArticle(id);
    const payload = item.payload as LibraryArticlePayload;
    if (!payload.content_path) return '';
    return fs.readFile(path.join(this.libraryDir(), payload.content_path), 'utf8');
  }

  async updateReading(id: string, input: LibraryReadingUpdateInput): Promise<InboxItem> {
    const store = createInboxStore(this.vaultPath);
    const item = await this.requireArticle(id);
    const payload = item.payload as LibraryArticlePayload;
    const at = this.now().toISOString();
    const nextStatus = input.markRead || input.scrollPosition >= 0.99 ? 'read' : 'reading';
    const next: InboxItem = {
      ...item,
      status: item.status === 'processed' || item.status === 'dismissed' || item.status === 'archived' ? item.status : nextStatus,
      updated_at: at,
      payload: {
        ...payload,
        scroll_position: Math.max(0, Math.min(1, input.scrollPosition)),
        reading_started_at: payload.reading_started_at ?? at,
        last_read_at: at,
        total_reading_seconds: (payload.total_reading_seconds ?? 0) + Math.max(0, input.readingSecondsDelta ?? 0)
      }
    };
    const stored = await store.update(id, next);
    if (item.status !== 'read' && stored.status === 'read') {
      this.activity({
        actor: 'user',
        action: 'library.article_read',
        context: { inbox_item_id: stored.id, library_id: stored.id },
        payload: { title: stored.title },
        summary: `Marked Library article read: ${stored.title}`
      });
    }
    return stored;
  }

  async promote(id: string, input: PromoteLibraryArticleInput = {}): Promise<PromoteResult> {
    const store = createInboxStore(this.vaultPath);
    const item = await this.requireArticle(id);
    const payload = item.payload as LibraryArticlePayload;
    const content = await this.readContent(id);
    const relPath = safeVaultRelativePath(
      input.targetPath ?? '',
      '03_Resources',
      `${slugify(payload.title)}.md`
    );
    const resourcePath = path.join(this.vaultPath, relPath);
    const at = this.now().toISOString();
    const resource = resourceMarkdown({ item, payload, content, promotedAt: at, includeAiSummary: !input.noAiSummary });
    await writeTextFile(resourcePath, resource);
    const processed: InboxItem = {
      ...item,
      status: 'processed',
      updated_at: at,
      resolved_at: at,
      resolved_by: input.actor ?? 'user',
      resolution_source: 'inbox'
    };
    const stored = await store.resolve(id, processed);
    this.activity({
      actor: input.actor ?? 'user',
      action: 'library.article_promoted',
      context: { inbox_item_id: stored.id, library_id: stored.id, resource_uid: relPath },
      payload: { title: stored.title, resourcePath: relPath },
      summary: `Promoted Library article to Resource: ${stored.title}`
    });
    return { item: stored, resourcePath };
  }

  async dismiss(id: string, actor: 'user' | 'agent' = 'user'): Promise<InboxItem> {
    const store = createInboxStore(this.vaultPath);
    const item = await this.requireArticle(id);
    const at = this.now().toISOString();
    const dismissed: InboxItem = {
      ...item,
      status: 'dismissed',
      updated_at: at,
      resolved_at: at,
      resolved_by: actor,
      resolution_source: 'inbox'
    };
    const stored = await store.dismiss(id, dismissed);
    this.activity({
      actor,
      action: 'library.article_dismissed',
      context: { inbox_item_id: stored.id, library_id: stored.id },
      payload: { title: stored.title },
      summary: `Dismissed Library article: ${stored.title}`
    });
    return stored;
  }

  private async requireArticle(id: string): Promise<InboxItem> {
    const item = await this.get(id);
    if (!item) throw new Error(`library article not found: ${id}`);
    return item;
  }

  private libraryDir(): string {
    return path.join(this.vaultPath, '.orbit', 'inbox', 'capture', 'library');
  }

  private async extractMarkdown(url: string, title: string): Promise<string> {
    try {
      const html = await this.fetchText(url);
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return `# ${title}\n\n${text || `Source: ${url}`}\n\nSource: ${url}\n`;
    } catch {
      return `# ${title}\n\nContent fetch failed. You can paste article Markdown here manually.\n\nSource: ${url}\n`;
    }
  }
}

export function createLibraryService(vaultPath: string, options?: LibraryServiceOptions): LibraryService {
  return new LibraryService(vaultPath, options);
}

function resourceMarkdown(input: {
  item: InboxItem;
  payload: LibraryArticlePayload;
  content: string;
  promotedAt: string;
  includeAiSummary: boolean;
}): string {
  const summary = input.includeAiSummary
    ? 'AI summary is unavailable in this fallback promotion. Distill this resource later if needed.'
    : 'AI summary intentionally skipped.';
  return `---\ntype: resource\ntitle: ${JSON.stringify(input.payload.title)}\nsource_library_id: ${input.item.id}\nsource_url: ${JSON.stringify(input.payload.url)}\npromoted_at: ${input.promotedAt}\n---\n\n# ${escapeMarkdown(input.payload.title)}\n\n## Summary\n\n${summary}\n\n## Source\n\n${input.payload.url}\n\n## Captured Content\n\n${input.content.trim()}\n`;
}

function titleFromUrl(value: string): string {
  try {
    const url = new URL(value);
    const lastSegment = url.pathname.replace(/\/$/, '').split('/').pop()?.replace(/[-_]+/g, ' ').trim();
    return lastSegment ? `${url.hostname} — ${lastSegment}` : url.hostname;
  } catch {
    return 'Saved article';
  }
}

async function defaultFetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { accept: 'text/html, text/plain;q=0.9, */*;q=0.5' } });
  if (!response.ok) throw new Error(`failed to fetch article (${response.status})`);
  return response.text();
}
