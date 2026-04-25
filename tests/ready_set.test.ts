import { describe, expect, it } from 'vitest';
import type { TaskRecord } from '../src/shared/schemas';
import { buildReadySet, taskReadyState } from '../src/main/auto_runner/ready_set';

function task(overrides: Partial<TaskRecord>): TaskRecord {
  return {
    id: `file:${overrides.uid ?? 'task'}`,
    source: 'file',
    status: 'todo',
    title: overrides.uid ?? 'Task',
    filePath: `/vault/${overrides.uid ?? 'task'}.md`,
    relPath: `${overrides.uid ?? 'task'}.md`,
    created_by: 'user',
    approved_by: 'user',
    depends_on: [],
    ...overrides
  };
}

describe('auto-runner ready set', () => {
  it('marks user todo tasks with satisfied dependencies as ready', () => {
    const tasks = [task({ uid: 'dep', status: 'done' }), task({ uid: 'main', depends_on: ['dep'] })];
    const index = new Map(tasks.map((entry) => [entry.uid!, entry]));

    expect(taskReadyState(tasks[1]!, index)).toMatchObject({ ready: true, reason: 'ready' });
  });

  it('blocks non-todo tasks, unapproved agent-created tasks, and unmet dependencies', () => {
    const tasks = [
      task({ uid: 'doing', status: 'doing' }),
      task({ uid: 'agent', created_by: 'agent_run:run_1', approved_by: null }),
      task({ uid: 'dep', status: 'blocked' }),
      task({ uid: 'main', depends_on: ['dep'] }),
      task({ uid: 'missing-main', depends_on: ['missing'] })
    ];
    const index = new Map(tasks.map((entry) => [entry.uid!, entry]));

    expect(taskReadyState(tasks[0]!, index).reason).toBe('status_not_todo');
    expect(taskReadyState(tasks[1]!, index).reason).toBe('awaiting_approval');
    expect(taskReadyState(tasks[3]!, index).reason).toBe('dependency_not_done');
    expect(taskReadyState(tasks[4]!, index).reason).toBe('dependency_missing');
  });

  it('partitions ready and blocked candidates', () => {
    const set = buildReadySet([
      task({ uid: 'ready' }),
      task({ uid: 'done', status: 'done' }),
      task({ uid: 'waiting', depends_on: ['done'] })
    ]);

    expect(set.ready.map((entry) => entry.task.uid)).toEqual(['ready', 'waiting']);
    expect(set.blocked.map((entry) => entry.task.uid)).toEqual(['done']);
  });
});
