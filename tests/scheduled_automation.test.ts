import { promises as fs } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFeedStore } from '../src/main/feed/store';
import { createScheduledTaskStore } from '../src/main/scheduled-task/store';

let vaultPath: string;
let server: Server | null = null;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-scheduled-'));
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server?.close((error) => (error ? reject(error) : resolve())));
    server = null;
  }
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('Scheduled Automation', () => {
  it('seeds the seven required Phase 8 system tasks', async () => {
    const tasks = await createScheduledTaskStore(vaultPath).list({ source: 'system' });

    expect(tasks.map((task) => task.name).sort()).toEqual([
      'Daily Summary',
      'Feed Daily Digest',
      'Memory Weekly Digest',
      'Monthly Review',
      'Resource Health Scan',
      'Vision Quarterly Review',
      'Weekly Review'
    ]);
    expect(tasks).toHaveLength(7);
  });

  it('supports flexible weekly schedules and synthesis action execution output', async () => {
    const store = createScheduledTaskStore(vaultPath);
    const task = await store.create({
      name: 'Essay digest',
      schedule: { kind: 'weekly', days: [2, 4], time: '10:30', timezone: 'local' },
      action: { kind: 'synthesis', synthesis_kind: 'summary.weekly', scope: 'area:writing' },
      retry: { max_attempts: 3, backoff_minutes: 15 },
      notify_channels: ['in-app']
    });
    const execution = await store.triggerNow(task.id);

    expect(task.next_run_at).toBeDefined();
    expect(task.retry?.max_attempts).toBe(3);
    expect(execution).toMatchObject({
      status: 'success',
      output: { artifact_kind: 'summary.weekly', scope: 'area:writing', message: 'Synthesis task queued.' }
    });
  });

  it('disables tasks when the run budget is exceeded', async () => {
    const store = createScheduledTaskStore(vaultPath);
    const task = await store.create({
      name: 'No budget digest',
      schedule: { kind: 'daily', time: '08:00' },
      action: { kind: 'memory_digest' },
      budget_usd: 0
    });

    const execution = await store.triggerNow(task.id);
    const updated = await store.get(task.id);

    expect(execution.status).toBe('failure');
    expect(execution.error).toBe('scheduled_task_budget_exceeded');
    expect(updated?.status).toBe('disabled');
    expect(updated?.disabled_reason).toBe('budget_exceeded');
  });

  it('runs feed refresh actions and writes digest/report artifacts', async () => {
    server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/rss+xml');
      response.end(`<?xml version="1.0"?>
        <rss><channel>
          <title>Scheduled Feed</title>
          <item>
            <guid>scheduled-1</guid>
            <title>Scheduled signal</title>
            <link>https://example.com/scheduled</link>
            <description>Scheduled refresh body.</description>
            <pubDate>Thu, 14 May 2026 09:00:00 GMT</pubDate>
          </item>
        </channel></rss>`);
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const feedUrl = `http://127.0.0.1:${address.port}/rss.xml`;
    const source = await createFeedStore(vaultPath).createSource({ url: feedUrl, title: 'Scheduled Feed' });
    const store = createScheduledTaskStore(vaultPath);
    const task = await store.create({
      name: 'Refresh subscriptions',
      schedule: { kind: 'daily', time: '07:00' },
      action: { kind: 'feed_refresh', source_id: source.id, generate_digest: true, generate_report: true }
    });

    const execution = await store.triggerNow(task.id);
    const output = execution.output as {
      results: Array<{ created: number }>;
      digest_artifact_id?: string;
      report_artifact_id?: string;
    };

    expect(execution.status).toBe('success');
    expect(output.results[0]?.created).toBe(1);
    expect(output.digest_artifact_id).toBeDefined();
    expect(output.report_artifact_id).toBeDefined();
    expect(execution.artifacts?.some((artifact) => artifact.kind === 'synthesis')).toBe(true);
    expect(await createFeedStore(vaultPath).listItems({ include_saved: true })).toHaveLength(1);
  });
});
