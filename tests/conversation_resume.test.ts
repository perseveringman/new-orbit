import { describe, expect, it } from 'vitest';
import type { TaskConversation } from '../src/shared/orchestration';
import { getLatestVendorSessionId } from '../src/main/orchestration/conversation';

describe('task conversation vendor session binding', () => {
  it('finds the newest non-cancelled vendor session id', () => {
    const conversation: Pick<TaskConversation, 'segments'> = {
      segments: [
        {
          id: 'old',
          taskId: 'task_1',
          runId: 'run_1',
          trigger: 'manual',
          status: 'completed',
          vendorSessionId: 'session-old',
          startedAt: '2026-04-27T00:00:00.000Z'
        },
        {
          id: 'cancelled',
          taskId: 'task_1',
          runId: 'run_2',
          trigger: 'manual',
          status: 'cancelled',
          vendorSessionId: 'session-cancelled',
          startedAt: '2026-04-27T00:01:00.000Z'
        },
        {
          id: 'latest',
          taskId: 'task_1',
          runId: 'run_3',
          trigger: 'dispatch',
          status: 'needs_attention',
          vendorSessionId: 'session-latest',
          startedAt: '2026-04-27T00:02:00.000Z'
        }
      ]
    };

    expect(getLatestVendorSessionId(conversation)).toBe('session-latest');
  });
});
