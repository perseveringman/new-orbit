import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createFeedService } from '../src/main/capture';
import type { ActivityEventInput } from '../src/main/activity';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'feed-fetcher', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('feed fetcher', () => {
  it('refreshes RSS subscriptions and de-dupes items by guid or URL', async () => {
    const activities: ActivityEventInput[] = [];
    const service = createFeedService(vaultPath, {
      now: () => new Date('2026-04-26T10:00:00.000Z'),
      fetchText: async () => rssFixture,
      emitActivity: (event) => activities.push(event)
    });

    const subscription = await service.addSubscription({ url: 'https://example.com/rss.xml', title: 'Example' });
    const first = await service.refresh(subscription.id);
    const second = await service.refresh(subscription.id);
    const pending = await service.listPending();

    expect(first).toEqual([{ subscriptionId: subscription.id, fetched: 3, created: 2, skipped: 1 }]);
    expect(second).toEqual([{ subscriptionId: subscription.id, fetched: 3, created: 0, skipped: 3 }]);
    expect(pending.map((item) => item.title)).toEqual(['First item', 'Second item']);
    expect(activities.map((event) => event.action)).toEqual(['feed.subscription_added']);
  });
});

const rssFixture = `<?xml version="1.0"?>
<rss><channel>
<title>Example RSS</title>
<item><guid>g-1</guid><title>First item</title><link>https://example.com/one</link><description><![CDATA[<p>One excerpt</p>]]></description><pubDate>Sun, 26 Apr 2026 09:00:00 GMT</pubDate></item>
<item><guid>g-2</guid><title>Second item</title><link>https://example.com/two</link><description>Two excerpt</description><pubDate>Sun, 26 Apr 2026 09:05:00 GMT</pubDate></item>
<item><guid>g-2</guid><title>Second duplicate</title><link>https://example.com/two</link><description>Duplicate</description></item>
</channel></rss>`;
