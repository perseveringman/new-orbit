import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { createProject, createTask } from '../src/main/project';
import { getOrCreateConversation, sendAndRun, startSegment } from '../src/main/orchestration/conversation';
import { createInboxServiceForVault } from '../src/main/inbox/service';
import { updateTaskFrontmatter } from '../src/main/task';
import { refreshTaskFileInSession } from '../src/main/orchestration/session';

const agentIpc = vi.hoisted(() => ({
  sendAgentMessage: vi.fn(),
  startTask: vi.fn()
}));

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() }
}));

vi.mock('../src/main/agent/ipc', () => ({
  sendAgentMessage: (runId: string, message: string) => agentIpc.sendAgentMessage(runId, message),
  startTask: (args: unknown) => agentIpc.startTask(args)
}));

describe('task conversation Inbox attention lifecycle', () => {
  let vault: string | null = null;

  afterEach(async () => {
    const { closeFsSession } = await import('../src/main/fs');
    await closeFsSession().catch(() => undefined);
    if (vault) await fs.rm(vault, { recursive: true, force: true });
    vault = null;
    agentIpc.sendAgentMessage.mockReset();
    agentIpc.startTask.mockReset();
  });

  it('resolves pending task attention when the user replies to a running agent', async () => {
    vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-conversation-inbox-lifecycle-'));
    await createVault(vault);
    const project = await createProject(vault, {
      slug: 'attention-reply',
      template: 'blank',
      name: 'Attention Reply'
    });
    const created = await createTask(vault, {
      project_uid: project.uid,
      title: 'Need clarification task',
      description: 'Ask for one missing input.'
    });
    const { openFsSession, currentSession } = await import('../src/main/fs');
    await openFsSession(vault);
    const initialTask = currentSession()!.tasks.allTasks().find((entry) => entry.uid === created.uid);
    if (!initialTask || initialTask.source !== 'file' || !initialTask.uid) throw new Error('task fixture missing');

    await updateTaskFrontmatter(initialTask.filePath, { status: 'doing', active_run_id: 'run_active' });
    await refreshTaskFileInSession(initialTask.filePath);
    const task = currentSession()!.tasks.allTasks().find((entry) => entry.uid === created.uid);
    if (!task || task.source !== 'file' || !task.uid) throw new Error('updated task fixture missing');

    await getOrCreateConversation(vault, task);
    await startSegment(vault, task.uid, {
      taskId: task.id,
      runId: 'run_active',
      trigger: 'manual',
      status: 'running',
      sessionStatus: 'awaiting_user'
    });
    const inbox = createInboxServiceForVault(vault);
    const item = await inbox.emitMessage({
      subtype: 'B1',
      title: 'Agent needs input: Need clarification task',
      summary: 'Please clarify the scope.',
      context: { project_uid: project.uid, task_uid: task.uid, run_id: 'run_active' },
      payload: {}
    });
    agentIpc.sendAgentMessage.mockReturnValue({ accepted: true });

    await sendAndRun(vault, task, 'Use the short version.');

    expect(agentIpc.sendAgentMessage).toHaveBeenCalledWith('run_active', 'Use the short version.');
    const resolved = await inbox.get(item.id);
    expect(resolved).toMatchObject({
      status: 'resolved',
      resolution_source: 'chat',
      resolved_by: 'user',
      resolution_note: 'User replied in the task conversation.'
    });
    expect((await inbox.list({ category: 'message', status: 'pending', includeArchived: false })).items).toEqual([]);
  });
});
