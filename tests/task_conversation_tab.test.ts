import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../src/shared/agent';
import type { TaskConversation } from '../src/shared/orchestration';
import type { TaskRecord } from '../src/shared/schemas';
import {
  buildConversationTimelineEntries,
  buildLiveStatus,
  CONVERSATION_AUTOSCROLL_THRESHOLD_PX,
  dedupeAgentDisplayEvents,
  getConversationInputPlaceholder,
  isConversationNearBottom,
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
      events: [
        {
          idx: 1,
          at: '2026-04-25T12:00:05.000Z',
          kind: 'tool_use',
          toolName: 'read_file',
          data: {
            name: 'read_file',
            input: { path: '/tmp/task.md', start_line: 1, end_line: 40 }
          }
        },
        {
          idx: 2,
          at: '2026-04-25T12:00:06.000Z',
          kind: 'message',
          text: '我先梳理相关模块。'
        }
      ],
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

    expect(html).toContain('自动 · executor-binding · 已完成');
    expect(html).toContain('手动 · 运行中');
    expect(html).toContain('工具调用');
    expect(html).toContain('task.md');
    expect(html).toContain('Agent');
    expect(html).toContain('再补上对话输入框');
    expect(html).toContain('inline-flex max-w-[85%]');
    expect(html).toContain('text-[13px] leading-5');
    expect(html).toContain('活动');
    expect(html).toContain('Agent 正在工作…');
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

  it('deduplicates adjacent live agent text cards', () => {
    const events: AgentEvent[] = [
      {
        idx: 1,
        at: '2026-04-25T12:06:06.000Z',
        kind: 'message',
        text: 'Let me inspect the task.'
      },
      {
        idx: 2,
        at: '2026-04-25T12:06:07.000Z',
        kind: 'text',
        text: 'Let me inspect the task.'
      },
      {
        idx: 3,
        at: '2026-04-25T12:06:08.000Z',
        kind: 'message',
        text: 'Next I will read the project plan.'
      }
    ];

    expect(dedupeAgentDisplayEvents(events).map((event) => event.text)).toEqual([
      'Let me inspect the task.',
      'Next I will read the project plan.'
    ]);
  });

  it('uses state-aware input placeholders for waiting and running sessions', () => {
    expect(getConversationInputPlaceholder(task.title, 'idle')).toBe(
      '发送消息启动 "Implement task chat"'
    );
    expect(getConversationInputPlaceholder(task.title, 'waiting')).toBe('继续对话');
    expect(getConversationInputPlaceholder(task.title, 'running')).toBe(
      '追加消息给正在运行的 agent'
    );
  });

  it('prefers detailed segment events over synthetic assistant summary turns', () => {
    const entries = buildConversationTimelineEntries(conversation, {});
    expect(
      entries.some((entry) => entry.kind === 'event' && entry.event?.kind === 'tool_use')
    ).toBe(true);
    expect(entries.some((entry) => entry.kind === 'turn' && entry.turn?.role === 'assistant')).toBe(
      false
    );
  });

  it('summarizes the latest running activity for the footer status bar', () => {
    expect(
      buildLiveStatus(conversation, {
        'run-2': {
          summary: {
            runId: 'run-2',
            taskId: 'task-1',
            status: 'running',
            startedAt: '2026-04-25T12:06:00.000Z',
            cwd: '/tmp'
          },
          events: [
            {
              idx: 1,
              at: '2026-04-25T12:06:07.000Z',
              kind: 'tool_use',
              toolName: 'grep',
              data: {
                name: 'grep',
                input: { path: '/tmp/task.md' }
              }
            }
          ]
        }
      })
    ).toContain('工作中 · Grep task.md');
  });

  it('treats near-bottom scroll positions as auto-follow eligible', () => {
    expect(
      isConversationNearBottom({
        scrollTop: 452,
        scrollHeight: 1000,
        clientHeight: 500
      })
    ).toBe(true);
    expect(
      isConversationNearBottom({
        scrollTop: 400,
        scrollHeight: 1000,
        clientHeight: 500
      })
    ).toBe(false);
    expect(CONVERSATION_AUTOSCROLL_THRESHOLD_PX).toBe(48);
  });
});
