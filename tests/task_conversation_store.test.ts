import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskConversation } from '../src/shared/orchestration';

const mockGet = vi.fn();
const mockSend = vi.fn();
const mockOnEvent = vi.fn(() => () => {});

(globalThis as unknown as { window: Record<string, unknown> }).window = {
  orbit: {
    conversation: {
      get: mockGet,
      send: mockSend,
      onEvent: mockOnEvent
    }
  }
} as Record<string, unknown>;

const { useTaskConversation } = await import('../src/renderer/src/store/taskConversation');

const conversation: TaskConversation = {
  taskId: 'task-1',
  taskUid: 'task-uid-1',
  projectUid: 'project-1',
  createdAt: '2026-04-25T12:00:00.000Z',
  updatedAt: '2026-04-25T12:01:00.000Z',
  segments: [
    {
      id: 'segment-1',
      taskId: 'task-1',
      runId: 'run-1',
      trigger: 'manual',
      status: 'running',
      startedAt: '2026-04-25T12:00:10.000Z'
    }
  ],
  turns: [
    {
      id: 'turn-1',
      role: 'user',
      content: 'Please start the task.',
      createdAt: '2026-04-25T12:00:11.000Z'
    }
  ]
};

describe('task conversation store', () => {
  beforeEach(() => {
    useTaskConversation.setState({
      conversations: {},
      loading: {},
      sending: {},
      unsubscribe: null
    });
    mockGet.mockReset();
    mockSend.mockReset();
    mockOnEvent.mockClear();
  });

  it('hydrates a newly created conversation after the first send', async () => {
    mockSend.mockResolvedValue({
      turnId: 'turn-1',
      runId: 'run-1',
      segmentId: 'segment-1'
    });
    mockGet.mockResolvedValue(conversation);

    await useTaskConversation.getState().send('task-1', 'Please start the task.');

    expect(mockSend).toHaveBeenCalledWith('task-1', 'Please start the task.');
    expect(mockGet).toHaveBeenCalledWith('task-1');
    expect(useTaskConversation.getState().conversations['task-1']).toEqual(conversation);
    expect(useTaskConversation.getState().sending['task-1']).toBe(false);
  });
});
