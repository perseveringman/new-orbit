import { describe, expect, it, vi } from 'vitest';
import type { TaskRecord } from '../src/shared/schemas';
import { AutoRunnerEventBridge } from '../src/main/auto_runner/event_bridge';

function task(): TaskRecord {
  return {
    id: 'file:task_1',
    uid: 'task_1',
    source: 'file',
    status: 'todo',
    title: 'Implement feature',
    filePath: '/vault/task.md',
    relPath: 'task.md',
    project_uid: 'project_1',
    created_by: 'user',
    approved_by: 'user',
    depends_on: []
  };
}

describe('AutoRunnerEventBridge', () => {
  it('emits Activity Log events for run lifecycle', () => {
    const emitActivity = vi.fn();
    const bridge = new AutoRunnerEventBridge({ emitActivity });
    const entry = task();

    bridge.runStarted({ vaultPath: '/vault', task: entry, runId: 'run_1' });
    bridge.runCompleted({ vaultPath: '/vault', task: entry, runId: 'run_1' });

    expect(emitActivity).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: 'agent.run_started',
        actor_id: 'run_1',
        context: expect.objectContaining({ task_uid: 'task_1', run_id: 'run_1' })
      })
    );
    expect(emitActivity).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ action: 'agent.run_completed' })
    );
  });

  it('creates B3 failure and B1 sandbox help inbox messages', async () => {
    const emitActivity = vi.fn();
    const emitMessage = vi.fn(async (input) => input);
    const bridge = new AutoRunnerEventBridge({
      emitActivity,
      inboxForVault: () => ({ emitMessage })
    });
    const entry = task();

    await bridge.runFailed({
      vaultPath: '/vault',
      task: entry,
      runId: 'run_1',
      message: 'Process exited with code 1'
    });
    await bridge.sandboxUnsupported({
      vaultPath: '/vault',
      task: entry,
      message: 'Sandbox ExecutionContext is not implemented yet.'
    });

    expect(emitMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ subtype: 'B3', title: expect.stringContaining('Auto-runner failed') })
    );
    expect(emitMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        subtype: 'B1',
        title: expect.stringContaining('Sandbox Auto-runner unsupported'),
        payload: expect.objectContaining({ help: expect.stringContaining('Sandbox ExecutionContext') })
      })
    );
    expect(emitActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.run_failed' })
    );
  });
});
