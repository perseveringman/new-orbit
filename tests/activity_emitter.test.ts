import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createActivityEmitter, createActivityStore, type ActivityEvent } from '../src/main/activity';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'activity-tests', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('activity emitter', () => {
  it('builds events and writes them to daily NDJSON with schema metadata', async () => {
    const store = createActivityStore(vaultPath);
    const emitter = createActivityEmitter(store, {
      now: () => new Date('2026-04-26T10:11:12.000Z'),
      id: () => 'evt_test'
    });

    const event = emitter.emit({
      actor: 'user',
      action: 'task.created',
      context: { project_uid: 'proj_1', task_uid: 'task_1' },
      payload: { title: 'Implement Activity Log' },
      summary: 'Created task "Implement Activity Log"'
    });
    await store.drain();

    expect(event).toEqual({
      id: 'evt_test',
      at: '2026-04-26T10:11:12.000Z',
      actor: 'user',
      action: 'task.created',
      context: { project_uid: 'proj_1', task_uid: 'task_1' },
      payload: { title: 'Implement Activity Log' },
      summary: 'Created task "Implement Activity Log"'
    });

    const raw = await fs.readFile(
      path.join(vaultPath, '.orbit', 'activity', '2026-04-26.ndjson'),
      'utf8'
    );
    expect(raw.trim().split('\n').map((line) => JSON.parse(line))).toEqual([event]);

    const schema = JSON.parse(
      await fs.readFile(path.join(vaultPath, '.orbit', 'activity', 'schema.json'), 'utf8')
    );
    expect(schema.version).toBe(1);
    expect(schema.storage).toBe('daily-ndjson');
    expect(schema.actions).toContain('task.created');
  });

  it('does not throw when persistence fails and surfaces the error', async () => {
    const errors: unknown[] = [];
    const append = vi.fn(async (_event: ActivityEvent): Promise<void> => {
      throw new Error('disk full');
    });
    const emitter = createActivityEmitter(
      { append },
      {
        now: () => new Date('2026-04-26T10:11:12.000Z'),
        id: () => 'evt_fail',
        onError: (error) => errors.push(error)
      }
    );

    expect(() =>
      emitter.emit({
        actor: 'system',
        action: 'settings.changed',
        summary: 'Changed settings'
      })
    ).not.toThrow();

    await flushMicrotasks();
    expect(append).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });
});

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
  await Promise.resolve();
}
