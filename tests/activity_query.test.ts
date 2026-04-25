import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createActivityStore,
  queryActivities,
  type ActivityAction,
  type ActivityActor,
  type ActivityEvent
} from '../src/main/activity';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'activity-tests', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('activity query', () => {
  it('filters by date range, actor, action, context and limit', async () => {
    const store = createActivityStore(vaultPath);
    const events = [
      event('evt_1', '2026-04-25T23:59:59.000Z', 'user', 'task.created', 'proj_a', 'task_a'),
      event('evt_2', '2026-04-26T09:00:00.000Z', 'agent', 'agent.run_started', 'proj_a', 'task_a'),
      event('evt_3', '2026-04-26T10:00:00.000Z', 'user', 'task.status_changed', 'proj_a', 'task_a'),
      event('evt_4', '2026-04-27T08:00:00.000Z', 'user', 'thought.created', 'proj_b', 'task_b')
    ];
    await Promise.all(events.map((item) => store.append(item)));

    await expect(queryActivities(vaultPath, { from: 'bad-date' })).rejects.toThrow(
      /invalid activity from date/
    );

    expect(
      (await queryActivities(vaultPath, { from: '2026-04-26', to: '2026-04-26' })).map(
        (item) => item.id
      )
    ).toEqual(['evt_2', 'evt_3']);

    expect((await queryActivities(vaultPath, { actor: 'agent' })).map((item) => item.id)).toEqual([
      'evt_2'
    ]);

    expect(
      (
        await queryActivities(vaultPath, {
          actions: ['task.created', 'task.status_changed'],
          project_uid: 'proj_a'
        })
      ).map((item) => item.id)
    ).toEqual(['evt_1', 'evt_3']);

    expect((await queryActivities(vaultPath, { task_uid: 'task_b' })).map((item) => item.id)).toEqual([
      'evt_4'
    ]);

    expect((await queryActivities(vaultPath, { limit: 2 })).map((item) => item.id)).toEqual([
      'evt_1',
      'evt_2'
    ]);
  });

  it('skips malformed lines while reading matching files', async () => {
    const activityDir = path.join(vaultPath, '.orbit', 'activity');
    await fs.mkdir(activityDir, { recursive: true });
    const good = event(
      'evt_good',
      '2026-04-26T10:00:00.000Z',
      'user',
      'library.article_saved',
      'proj_a',
      'task_a'
    );
    await fs.writeFile(
      path.join(activityDir, '2026-04-26.ndjson'),
      `not-json\n${JSON.stringify(good)}\n`,
      'utf8'
    );

    expect((await queryActivities(vaultPath, { action: 'library.article_saved' })).map((item) => item.id)).toEqual([
      'evt_good'
    ]);
  });
});

function event(
  id: string,
  at: string,
  actor: ActivityActor,
  action: ActivityAction,
  projectUid: string,
  taskUid: string
): ActivityEvent {
  return {
    id,
    at,
    actor,
    action,
    context: { project_uid: projectUid, task_uid: taskUid },
    summary: `${action} ${id}`
  };
}
