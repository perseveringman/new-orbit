import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createFeedService, readFeedHistory } from '../src/main/capture';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'feed-fade-out', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('feed fade out', () => {
  it('moves pending feed items into Feed History without adding them to main Archive', async () => {
    const service = createFeedService(vaultPath, {
      now: () => new Date('2026-04-26T10:00:00.000Z'),
      fetchText: async () => rssFixture,
      emitActivity: () => undefined
    });
    const subscription = await service.addSubscription({ url: 'https://example.com/rss.xml' });
    await service.refresh(subscription.id);
    const pending = await service.listPending();

    const archived = await service.fadeOut(pending[0]!.id);
    const remaining = await service.listPending();
    const history = await readFeedHistory(vaultPath);

    expect(archived.status).toBe('archived');
    expect(remaining).toHaveLength(0);
    expect(history.map((item) => item.id)).toEqual([archived.id]);
    await expect(fs.stat(path.join(vaultPath, '.orbit', 'inbox', 'capture', 'feed', 'history', '2026-04.ndjson'))).resolves.toBeTruthy();
  });
});

const rssFixture = `<rss><channel><title>Example</title><item><guid>g-1</guid><title>Fade me</title><link>https://example.com/fade</link><description>Fade excerpt</description></item></channel></rss>`;
