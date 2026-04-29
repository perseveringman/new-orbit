import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createScheduledTaskStore } from '../src/main/scheduled-task/store';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-scheduled-'));
});

afterEach(async () => {
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
});
