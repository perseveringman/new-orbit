import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInboxStore, monthKeyFromIso, readInboxNdjson } from '../src/main/inbox';
import type { InboxItem } from '../src/main/inbox';
import { summarizeInboxCounts } from '../src/shared/inbox';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'inbox-store', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('inbox store', () => {
  it('persists pending messages and archives resolved items by month', async () => {
    const store = createInboxStore(vaultPath);
    const item = messageItem('inbox_msg_1');

    await store.add(item);
    expect(await store.get(item.id)).toEqual(item);
    expect(await store.list({ category: 'message', includeArchived: false })).toEqual({
      items: [item],
      counts: {
        sidebarMessagesPending: 1,
        messagesPending: 1,
        captureLibraryUnread: 0,
        feedCount: 0
      }
    });

    const resolved = await store.resolve(item.id, {
      ...item,
      status: 'resolved',
      updated_at: '2026-04-26T11:00:00.000Z',
      resolved_at: '2026-04-26T11:00:00.000Z',
      resolved_by: 'user',
      resolution_source: 'inbox'
    });

    expect(resolved.status).toBe('resolved');
    expect((await store.list({ includeArchived: false })).items).toEqual([]);
    expect(await store.get(item.id)).toEqual(resolved);

    const archived = await readInboxNdjson(
      path.join(vaultPath, '.orbit', 'inbox', 'messages', 'archive', '2026-04.ndjson')
    );
    expect(archived).toEqual([resolved]);
    expect(monthKeyFromIso(resolved.resolved_at!)).toBe('2026-04');
  });

  it('keeps sidebar and Capture counts scoped to Messages and unread Library only', async () => {
    const store = createInboxStore(vaultPath);
    const message = messageItem('inbox_msg_count');
    const library = libraryItem('library_1');
    const feed = feedItem('feed_1');
    const thought = thoughtItem('thought_1');

    await store.add(message);
    await store.add(library);
    await store.add(feed);
    await store.add(thought);

    const { items, counts } = await store.list({ includeArchived: false });
    expect(counts).toEqual({
      sidebarMessagesPending: 1,
      messagesPending: 1,
      captureLibraryUnread: 1,
      feedCount: 0
    });
    expect(summarizeInboxCounts(items).feedCount).toBe(0);
  });
});

function messageItem(id: string): InboxItem {
  return {
    id,
    category: 'message',
    subtype: 'A2',
    title: 'Approve follow-up task',
    summary: 'Agent proposed a new task.',
    context: { proposal_id: 'prop_1', run_id: 'run_1' },
    payload: { proposal_id: 'prop_1' },
    status: 'pending',
    created_at: '2026-04-26T10:00:00.000Z',
    updated_at: '2026-04-26T10:00:00.000Z'
  };
}

function libraryItem(id: string): InboxItem {
  return {
    id,
    category: 'capture',
    subtype: 'library_article',
    title: 'Read later',
    summary: 'A saved article.',
    context: {},
    payload: {
      url: 'https://example.com/article',
      title: 'Read later',
      source: 'manual',
      estimated_reading_minutes: 5,
      total_reading_seconds: 0
    },
    status: 'unread',
    created_at: '2026-04-26T10:01:00.000Z',
    updated_at: '2026-04-26T10:01:00.000Z'
  };
}

function feedItem(id: string): InboxItem {
  return {
    id,
    category: 'capture',
    subtype: 'feed_item',
    title: 'Feed entry',
    summary: 'Low-signal feed entry.',
    context: { feed_subscription_id: 'sub_1' },
    payload: {
      subscription_id: 'sub_1',
      article_url: 'https://example.com/feed',
      article_title: 'Feed entry',
      article_excerpt: 'Excerpt',
      published_at: '2026-04-26T09:00:00.000Z',
      source: 'Example RSS'
    },
    status: 'pending',
    created_at: '2026-04-26T10:02:00.000Z',
    updated_at: '2026-04-26T10:02:00.000Z'
  };
}

function thoughtItem(id: string): InboxItem {
  return {
    id,
    category: 'capture',
    subtype: 'thought',
    title: 'Thought',
    summary: 'Captured thought.',
    context: {},
    payload: { content: 'Remember this idea', tags: ['idea'], created_from: 'manual' },
    status: 'pending',
    created_at: '2026-04-26T10:03:00.000Z',
    updated_at: '2026-04-26T10:03:00.000Z'
  };
}
