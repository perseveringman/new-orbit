import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FeedFetchResult, FeedSource } from '../src/shared/feed';
import { FeedTaskCenter } from '../src/main/feed/task-center';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await mkdtemp(path.join(os.tmpdir(), 'orbit-feed-task-center-'));
});

afterEach(async () => {
  await rm(vaultPath, { recursive: true, force: true });
});

describe('FeedTaskCenter', () => {
  it('runs the same platform serially while different platforms can run in parallel', async () => {
    const sources = [
      feedSource('x-1', 'X One', 'x:https://x.com/one', 'twitter'),
      feedSource('x-2', 'X Two', 'x:https://x.com/two', 'twitter'),
      feedSource('reddit-1', 'Reddit One', 'r/localfirst', 'reddit')
    ];
    let activeTotal = 0;
    let maxActiveTotal = 0;
    let activeX = 0;
    let maxActiveX = 0;
    const center = new FeedTaskCenter(vaultPath, {
      maxGlobalConcurrency: 3,
      maxAttempts: 1,
      feedStoreFactory: () => ({
        listSources: async () => sources,
        fetch: async (sourceId: string) => {
          activeTotal += 1;
          maxActiveTotal = Math.max(maxActiveTotal, activeTotal);
          if (sourceId.startsWith('x-')) {
            activeX += 1;
            maxActiveX = Math.max(maxActiveX, activeX);
          }
          await sleep(40);
          if (sourceId.startsWith('x-')) activeX -= 1;
          activeTotal -= 1;
          return [fetchResult(sourceId)];
        }
      })
    });

    const enqueued = await center.enqueueRefresh({ priority: 'manual' });
    const completed = await center.waitForJobs(enqueued.jobs.map((job) => job.id), 3_000);

    expect(completed.map((job) => job.status)).toEqual(['success', 'success', 'success']);
    expect(maxActiveX).toBe(1);
    expect(maxActiveTotal).toBeGreaterThan(1);
  });

  it('dedupes active refresh requests for the same source', async () => {
    const sources = [feedSource('rss-1', 'RSS One', 'https://example.com/rss.xml', 'rss')];
    let releaseFetch!: () => void;
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const center = new FeedTaskCenter(vaultPath, {
      maxAttempts: 1,
      feedStoreFactory: () => ({
        listSources: async () => sources,
        fetch: async (sourceId: string) => {
          await fetchGate;
          return [fetchResult(sourceId)];
        }
      })
    });

    const first = await center.enqueueRefresh({ source_id: 'rss-1', priority: 'manual' });
    const second = await center.enqueueRefresh({ source_id: 'rss-1', priority: 'manual' });

    expect(second.jobs[0]?.id).toBe(first.jobs[0]?.id);
    releaseFetch();
    const completed = await center.waitForJobs([first.jobs[0]!.id], 3_000);
    expect(completed[0]?.status).toBe('success');
  });
});

function feedSource(
  id: string,
  title: string,
  url: string,
  kind: FeedSource['kind']
): FeedSource {
  return {
    id,
    title,
    url,
    kind,
    areas: [],
    resource_refs: [],
    tags: [],
    enabled: true,
    added_at: '2026-05-19T00:00:00.000Z',
    updated_at: '2026-05-19T00:00:00.000Z'
  };
}

function fetchResult(sourceId: string): FeedFetchResult {
  return {
    run_id: `run-${sourceId}`,
    source_id: sourceId,
    fetched: 1,
    created: 1,
    skipped: 0
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
