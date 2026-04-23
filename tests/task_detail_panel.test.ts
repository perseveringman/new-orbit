import { describe, expect, it } from 'vitest';
import type { TaskRecord } from '../src/shared/schemas';
import { shouldHydrateFocusedTask } from '../src/renderer/src/components/Sidebar/TaskDetailPanel';

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-1',
    source: 'file',
    status: 'doing',
    title: 'Ship sidebar',
    filePath: '/tmp/task-1.md',
    relPath: '01_Projects/sidebar/.agent/tasks/task-1.md',
    uid: 'task-uid-1',
    project_uid: 'project-1',
    ...overrides
  };
}

describe('task detail panel hydration guard', () => {
  it('skips focus hydration when the fetched task matches the current snapshot', () => {
    expect(shouldHydrateFocusedTask(makeTask(), makeTask())).toBe(false);
  });

  it('hydrates focus when the same task id has updated fields', () => {
    expect(
      shouldHydrateFocusedTask(makeTask(), makeTask({ status: 'done' }))
    ).toBe(true);
  });
});
