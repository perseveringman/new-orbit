import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TaskConversation } from '../src/shared/orchestration';
import type { TaskRecord } from '../src/shared/schemas';
import { TaskConversationTimeline } from '../src/renderer/src/components/Tasks/TaskConversationTab';

const task: TaskRecord = {
  id: 'task-1',
  source: 'file',
  status: 'doing',
  title: 'Implement task chat',
  filePath: '/tmp/task.md',
  relPath: '01_Projects/demo/.tasks/implement-task-chat.md',
  uid: 'task-chat-1',
  project_uid: 'project-1'
};

const conversation: TaskConversation = {
  taskId: 'task-1',
  taskUid: 'task-chat-1',
  projectUid: 'project-1',
  createdAt: '2026-04-25T12:00:00.000Z',
  updatedAt: '2026-04-25T12:10:00.000Z',
  segments: [
    {
      id: 'segment-1',
      taskId: 'task-1',
      runId: 'run-1',
      bindingId: 'executor-binding',
      trigger: 'dispatch',
      status: 'completed',
      summary: 'Done',
      startedAt: '2026-04-25T12:00:00.000Z',
      endedAt: '2026-04-25T12:05:00.000Z'
    },
    {
      id: 'segment-2',
      taskId: 'task-1',
      runId: 'run-2',
      trigger: 'manual',
      status: 'running',
      startedAt: '2026-04-25T12:06:00.000Z'
    }
  ],
  turns: [
    {
      id: 'turn-1',
      role: 'system',
      content: '🤖 executor-binding 认领了任务，开始执行...',
      segmentId: 'segment-1',
      createdAt: '2026-04-25T12:00:01.000Z'
    },
    {
      id: 'turn-2',
      role: 'assistant',
      content: '我先梳理相关模块。',
      segmentId: 'segment-1',
      createdAt: '2026-04-25T12:00:10.000Z'
    },
    {
      id: 'turn-3',
      role: 'user',
      content: '再补上对话输入框。',
      segmentId: 'segment-2',
      createdAt: '2026-04-25T12:06:05.000Z'
    }
  ]
};

describe('TaskConversationTimeline', () => {
  it('renders segment dividers and role-specific bubbles', () => {
    const html = renderToStaticMarkup(
      createElement(TaskConversationTimeline, {
        task,
        conversation
      })
    );

    expect(html).toContain('Auto · executor-binding · Completed');
    expect(html).toContain('Manual · Running');
    expect(html).toContain('Agent');
    expect(html).toContain('再补上对话输入框');
    expect(html).toContain('Task Chat');
    expect(html).toContain('Agent is starting');
  });
});
