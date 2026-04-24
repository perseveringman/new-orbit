import { beforeEach, describe, expect, it } from 'vitest';
import type { TaskRecord } from '../src/shared/schemas';
import { useSidebar } from '../src/renderer/src/store/sidebar';

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

describe('sidebar store', () => {
  beforeEach(() => {
    useSidebar.getState().reset();
  });

  it('restores the remembered intent and panel when returning to a surface', () => {
    useSidebar.getState().setSurface('project.kanban');
    useSidebar.getState().selectIntent('execution');
    useSidebar.getState().selectPanel('diff');

    useSidebar.getState().setSurface('editor');
    expect(useSidebar.getState().surface).toBe('editor');
    expect(useSidebar.getState().intent).toBe('overview');
    expect(useSidebar.getState().panel).toBe('files');

    useSidebar.getState().setSurface('project.kanban');
    expect(useSidebar.getState().intent).toBe('execution');
    expect(useSidebar.getState().panel).toBe('diff');
  });

  it('keeps the selected panel when focus changes', () => {
    useSidebar.getState().setSurface('project.kanban');
    useSidebar.getState().selectIntent('focus');
    useSidebar.getState().selectPanel('task-detail');
    useSidebar.getState().setFocus({ task: makeTask() });

    expect(useSidebar.getState().intent).toBe('focus');
    expect(useSidebar.getState().panel).toBe('task-detail');
    expect(useSidebar.getState().focus.task?.title).toBe('Ship sidebar');
  });

  it('opens a panel through the matching intent and falls back when unavailable', () => {
    useSidebar.getState().setSurface('project.terminal');
    useSidebar.getState().openPanel({ panel: 'runlog', focus: { runId: 'run-7' } });

    expect(useSidebar.getState().intent).toBe('execution');
    expect(useSidebar.getState().panel).toBe('runlog');
    expect(useSidebar.getState().focus.runId).toBe('run-7');

    useSidebar.getState().setSurface('editor');
    useSidebar.getState().openPanel({ panel: 'sessions' });

    expect(useSidebar.getState().intent).toBe('overview');
    expect(useSidebar.getState().panel).toBe('files');
  });

  it('can open and remember the inspector panel', () => {
    useSidebar.getState().openPanel({ panel: 'inspector' });
    expect(useSidebar.getState().panel).toBe('inspector');
    useSidebar.getState().setSurface('project.kanban');
    useSidebar.getState().setSurface('editor');
    expect(useSidebar.getState().panel).toBe('inspector');
  });

  it('keeps the selected session in sidebar focus for the project sessions surface', () => {
    useSidebar.getState().setSurface('project.sessions');
    useSidebar
      .getState()
      .openPanel({
        panel: 'sessions',
        focus: { projectUid: 'project-1', sessionId: 'tas-9' } as unknown as never
      });

    expect(useSidebar.getState().intent).toBe('execution');
    expect(useSidebar.getState().panel).toBe('sessions');
    expect((useSidebar.getState().focus as unknown as Record<string, unknown>).sessionId).toBe(
      'tas-9'
    );
  });
});
