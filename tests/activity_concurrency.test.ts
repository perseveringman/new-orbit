import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createActivityStore, type ActivityEvent } from '../src/main/activity';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'activity-tests', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('activity store concurrency', () => {
  it('serializes concurrent writes to the same daily file without losing events', async () => {
    const store = createActivityStore(vaultPath);
    const events = Array.from({ length: 50 }, (_, index): ActivityEvent => ({
      id: `evt_${index.toString().padStart(2, '0')}`,
      at: `2026-04-26T10:00:${index.toString().padStart(2, '0')}.000Z`,
      actor: index % 2 === 0 ? 'user' : 'agent',
      action: index % 2 === 0 ? 'task.updated' : 'agent.run_completed',
      context: { project_uid: 'proj_concurrent', task_uid: `task_${index}` },
      summary: `event ${index}`
    }));

    await Promise.all(events.map((event) => store.append(event)));

    const raw = await fs.readFile(
      path.join(vaultPath, '.orbit', 'activity', '2026-04-26.ndjson'),
      'utf8'
    );
    const parsed = raw.trim().split('\n').map((line) => JSON.parse(line) as ActivityEvent);
    expect(parsed).toHaveLength(events.length);
    expect(new Set(parsed.map((event) => event.id)).size).toBe(events.length);
    expect(parsed.map((event) => event.id)).toEqual(events.map((event) => event.id));
  });

  it('keeps independent daily files when concurrent events span dates', async () => {
    const store = createActivityStore(vaultPath);
    await Promise.all([
      store.append(event('evt_a', '2026-04-26T10:00:00.000Z')),
      store.append(event('evt_b', '2026-04-27T10:00:00.000Z'))
    ]);

    const first = await fs.readFile(
      path.join(vaultPath, '.orbit', 'activity', '2026-04-26.ndjson'),
      'utf8'
    );
    const second = await fs.readFile(
      path.join(vaultPath, '.orbit', 'activity', '2026-04-27.ndjson'),
      'utf8'
    );
    expect(JSON.parse(first).id).toBe('evt_a');
    expect(JSON.parse(second).id).toBe('evt_b');
  });
});

function event(id: string, at: string): ActivityEvent {
  return {
    id,
    at,
    actor: 'system',
    action: 'settings.changed',
    context: {},
    summary: id
  };
}
