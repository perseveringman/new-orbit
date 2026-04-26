import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../src/shared/agent';
import type { TaskConversation } from '../src/shared/orchestration';
import type { TaskRecord } from '../src/shared/schemas';
import {
  getConversationInputPlaceholder,
  TaskConversationTimeline
} from '../src/renderer/src/components/Tasks/TaskConversationTab';
import { buildAgentEventKey } from '../src/renderer/src/lib/agentEventKeys';

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
    expect(html).toContain('Activity');
    expect(html).toContain('Agent is starting');
  });

  it('builds unique live event keys when events share the same idx', () => {
    const events: AgentEvent[] = [
      {
        idx: 5,
        at: '2026-04-25T12:06:06.000Z',
        kind: 'text',
        text: '先检查任务上下文。'
      },
      {
        idx: 5,
        at: '2026-04-25T12:06:07.000Z',
        kind: 'message',
        text: '再补一条流式输出。'
      }
    ];
    const keys = events.map((event, order) => buildAgentEventKey('segment-2', event, order));

    expect(keys).toEqual([
      'segment-2:text:5:2026-04-25T12:06:06.000Z:0',
      'segment-2:message:5:2026-04-25T12:06:07.000Z:1'
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses state-aware input placeholders for waiting and running sessions', () => {
    expect(getConversationInputPlaceholder(task.title, 'idle')).toBe('发送消息启动 "Implement task chat"');
    expect(getConversationInputPlaceholder(task.title, 'waiting')).toBe('继续对话');
    expect(getConversationInputPlaceholder(task.title, 'running')).toBe(
      '追加消息给正在运行的 agent'
    );
  });
});
