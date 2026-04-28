import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TaskRecord } from '../src/shared/schemas';

const mockedState = vi.hoisted(() => ({
  open: true,
  task: {
    id: 'task-1',
    source: 'file',
    status: 'doing',
    title: '调研下数据抓取',
    filePath: '/tmp/task.md',
    relPath: '01_Projects/twitter/.orbit/agent/tasks/20260428_task.md',
    uid: 'task-uid-1',
    project_uid: 'project-1'
  } satisfies TaskRecord,
  projectUid: 'project-1',
  tab: 'chat' as const,
  openTask: vi.fn(),
  close: vi.fn(),
  setTab: vi.fn()
}));

vi.mock('../src/renderer/src/store/taskDetails', () => ({
  useTaskDetails: (selector: (state: typeof mockedState) => unknown) => selector(mockedState)
}));

vi.mock('../src/renderer/src/components/Tasks/TaskConversationTab', () => ({
  TaskConversationTab: ({ task }: { task: TaskRecord }) =>
    createElement('div', { 'data-testid': 'task-conversation-tab' }, `conversation:${task.title}`)
}));

vi.mock('../src/renderer/src/components/Tasks/TaskDetailSurface', () => ({
  TaskDetailSurface: ({ task }: { task: TaskRecord }) =>
    createElement('div', { 'data-testid': 'task-detail-surface' }, `detail:${task.title}`)
}));

import { TaskDetailsHost } from '../src/renderer/src/components/Tasks/TaskDetailsHost';

describe('TaskDetailsHost', () => {
  it('reuses the task conversation renderer for the activity tab', () => {
    const html = renderToStaticMarkup(createElement(TaskDetailsHost));

    expect(html).toContain('conversation:调研下数据抓取');
    expect(html).not.toContain('detail:调研下数据抓取');
    expect(html).toContain('Activity');
  });
});
