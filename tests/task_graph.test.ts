import { describe, expect, it } from 'vitest';
import type { TaskRecord } from '../src/shared/schemas';
import { materializeTaskGraph } from '../src/main/orchestration/task_graph';

function task(overrides: Partial<TaskRecord>): TaskRecord {
  return {
    id: overrides.id ?? `file:${overrides.uid ?? 'task'}`,
    source: 'file',
    status: overrides.status ?? 'todo',
    title: overrides.title ?? 'Task',
    filePath: overrides.filePath ?? '/vault/task.md',
    relPath: overrides.relPath ?? 'task.md',
    ...overrides
  };
}

describe('materializeTaskGraph', () => {
  it('moves dependency-blocked tasks into waiting', () => {
    const rows = materializeTaskGraph([
      task({ uid: 'task-a', status: 'todo', title: 'A' }),
      task({
        uid: 'task-b',
        status: 'todo',
        title: 'B',
        pre_conditions: ['task-a']
      })
    ]);
    expect(rows.find((entry) => entry.uid === 'task-a')?.status).toBe('todo');
    expect(rows.find((entry) => entry.uid === 'task-b')?.status).toBe('waiting');
  });

  it('keeps backlog tasks in backlog even when dependencies are satisfied', () => {
    const rows = materializeTaskGraph([
      task({ uid: 'task-a', status: 'done' }),
      task({
        uid: 'task-b',
        status: 'backlog',
        pre_conditions: ['task-a']
      })
    ]);
    expect(rows.find((entry) => entry.uid === 'task-b')?.status).toBe('backlog');
  });

  it('promotes ready tasks to todo after upstream completion', () => {
    const rows = materializeTaskGraph([
      task({ uid: 'task-a', status: 'done' }),
      task({
        uid: 'task-b',
        status: 'waiting',
        pre_conditions: ['task-a']
      })
    ]);
    const candidate = rows.find((entry) => entry.uid === 'task-b');
    expect(candidate?.status).toBe('todo');
    expect(candidate?.ready).toBe(true);
  });
});
