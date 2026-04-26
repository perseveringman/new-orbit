import { describe, expect, it, vi } from 'vitest';
import type { TaskRecord } from '../src/shared/schemas';
import { OrchestrationEventBridge } from '../src/main/orchestration/event_bridge';

function task(): TaskRecord {
  return {
    id: 'file:task_1',
    uid: 'task_1',
    source: 'file',
    status: 'todo',
    title: 'Research agent usage',
    filePath: '/vault/task.md',
    relPath: 'task.md',
    project_uid: 'project_1',
    created_by: 'user',
    approved_by: 'user',
    depends_on: []
  };
}

describe('OrchestrationEventBridge', () => {
  it('creates a B1 Inbox help request for blocked clarification runs', async () => {
    const emitMessage = vi.fn(async (input) => input);
    const bridge = new OrchestrationEventBridge({
      inboxForVault: () => ({ emitMessage })
    });

    await bridge.dispatchNeedsAttention({
      vaultPath: '/vault',
      task: task(),
      runId: 'run_1',
      summary: 'Need product clarification before proceeding.',
      failed: false
    });

    expect(emitMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        subtype: 'B1',
        title: 'Agent needs input: Research agent usage',
        summary: 'Need product clarification before proceeding.',
        context: expect.objectContaining({
          task_uid: 'task_1',
          project_uid: 'project_1',
          run_id: 'run_1'
        }),
        payload: expect.objectContaining({
          help: expect.stringContaining('Open the linked task conversation')
        })
      })
    );
  });

  it('creates a B3 Inbox failure message for crashed runs', async () => {
    const emitMessage = vi.fn(async (input) => input);
    const bridge = new OrchestrationEventBridge({
      inboxForVault: () => ({ emitMessage })
    });

    await bridge.dispatchNeedsAttention({
      vaultPath: '/vault',
      task: task(),
      runId: 'run_2',
      summary: 'Process exited with code 1',
      failed: true
    });

    expect(emitMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        subtype: 'B3',
        title: 'Agent run failed: Research agent usage',
        summary: 'Process exited with code 1',
        context: expect.objectContaining({
          task_uid: 'task_1',
          project_uid: 'project_1',
          run_id: 'run_2'
        })
      })
    );
  });
});
