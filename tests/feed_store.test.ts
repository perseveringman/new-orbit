import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFeedStore } from '../src/main/feed/store';
import { createLibraryStore } from '../src/main/library/store';

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

    expect(first[0]).toMatchObject({ fetched: 2, created: 2, skipped: 0 });
    expect(second[0]).toMatchObject({ fetched: 2, created: 0, skipped: 2 });
    expect(items).toHaveLength(2);
    expect(await createLibraryStore(tmp).list({ include_archived: true })).toEqual([]);

    const raw = await readFile(path.join(tmp, 'feeds', source.id, `${items[0].id}.json`), 'utf8');
    expect(raw).toContain('"status": "new"');
  });

  it('supports seen/ignore state and Save to Library promotion gate', async () => {
    const feed = createFeedStore(tmp, {
      now: () => new Date('2026-04-28T12:00:00.000Z'),
      fetchText: async () => rss
    });
    const source = await feed.createSource({ url: 'https://example.com/rss.xml' });
    await feed.fetch(source.id);
    const [first, second] = await feed.listItems();

    expect((await feed.markSeen(first.id)).status).toBe('seen');
    expect((await feed.ignore(second.id)).status).toBe('ignored');

    const promoted = await feed.saveToLibrary(first.id, { tags: ['signal'] });
    expect(promoted.feed_item.status).toBe('saved');
    expect(promoted.feed_item.saved_library_item_id).toBe(promoted.library_item.frontmatter.id);
    expect(promoted.library_item.frontmatter.source).toMatchObject({
      kind: 'feed',
      feed_item_id: first.id,
      feed_source_id: source.id
    });
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

    expect(digest.artifact.kind).toBe('feed.digest');
    expect(digest.artifact.scope_key).toBe('feed.digest:2026-04-28');
    expect(cluster.artifact.kind).toBe('feed.cluster');
    expect(cluster.artifact.scope_key).toBe(`feed.cluster:${source.id}`);
    expect(await createLibraryStore(tmp).list()).toEqual([]);
  });
});
