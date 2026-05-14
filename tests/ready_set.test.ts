import { describe, expect, it } from 'vitest';
import type { TaskRecord } from '../src/shared/schemas';
import { buildClaimableReadySet, buildReadySet, taskReadyState } from '../src/main/auto_runner/ready_set';

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

  it('keeps human-led tasks out of the agent claim queue', () => {
    const set = buildClaimableReadySet([
      task({ uid: 'human', execution_mode: 'human' }),
      task({ uid: 'assisted', execution_mode: 'assisted' }),
      task({ uid: 'scheduled', execution_mode: 'scheduled' }),
      task({ uid: 'agent', execution_mode: 'agent' })
    ]);

    expect(set.ready.map((entry) => entry.task.uid)).toEqual(['agent']);
    expect(set.blocked.map((entry) => [entry.task.uid, entry.readiness.reason])).toEqual([
      ['human', 'not_agent_claimable'],
      ['assisted', 'not_agent_claimable'],
      ['scheduled', 'not_agent_claimable']
    ]);
  });
});
