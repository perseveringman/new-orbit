import { describe, expect, it } from 'vitest';
import type { TaskConversation } from '../src/shared/orchestration';
import {
  getLatestVendorSessionId,
  resolveFollowupSegment
} from '../src/main/orchestration/conversation';
import type { TaskRecord } from '../src/shared/schemas';

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

  it('can scope the latest vendor session to a specific runtime', () => {
    const conversation: Pick<TaskConversation, 'segments'> = {
      segments: [
        {
          id: 'claude',
          taskId: 'task_1',
          runId: 'run_1',
          runtimeId: 'claude:/bin/claude',
          trigger: 'dispatch',
          status: 'completed',
          vendorSessionId: 'claude-session',
          startedAt: '2026-04-27T00:00:00.000Z'
        },
        {
          id: 'codex',
          taskId: 'task_1',
          runId: 'run_2',
          runtimeId: 'codex:/bin/codex',
          trigger: 'dispatch',
          status: 'completed',
          vendorSessionId: 'codex-session',
          startedAt: '2026-04-27T00:01:00.000Z'
        }
      ]
    };

    expect(getLatestVendorSessionId(conversation, 'claude:/bin/claude')).toBe('claude-session');
    expect(getLatestVendorSessionId(conversation, 'gemini:/bin/gemini')).toBeUndefined();
  });

  it('keeps binding-owned follow-up runs on the existing auto session', () => {
    const task: Pick<TaskRecord, 'id' | 'owner_type' | 'owner_id' | 'role_binding_id'> = {
      id: 'task_1',
      owner_type: 'binding',
      owner_id: 'binding-1777092922614',
      role_binding_id: 'binding-1777092922614'
    };
    const conversation: Pick<TaskConversation, 'segments'> = {
      segments: [
        {
          id: 'latest',
          taskId: 'task_1',
          runId: 'run_3',
          trigger: 'dispatch',
          bindingId: 'binding-1777092922614',
          status: 'needs_attention',
          vendorSessionId: 'session-latest',
          startedAt: '2026-04-27T00:02:00.000Z'
        }
      ]
    };

    expect(resolveFollowupSegment(task, conversation)).toMatchObject({
      taskId: 'task_1',
      runId: '',
      trigger: 'dispatch',
      bindingId: 'binding-1777092922614',
      status: 'running',
      vendorSessionId: 'session-latest'
    });
  });
});
