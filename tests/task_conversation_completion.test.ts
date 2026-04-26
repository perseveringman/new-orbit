import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { createProject, createTask } from '../src/main/project';
import {
  collectAssistantContent,
  getConversation,
  getOrCreateConversation,
  recordRunCompletion,
  resolveConversationCompletion,
  startSegment
} from '../src/main/orchestration/conversation';
import { createInboxServiceForVault } from '../src/main/inbox/service';
import { updateTaskFrontmatter } from '../src/main/task';
import { refreshTaskFileInSession } from '../src/main/orchestration/session';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() }
}));

describe('task conversation completion resolution', () => {
  let vault: string | null = null;

  afterEach(async () => {
    const { closeFsSession } = await import('../src/main/fs');
    await closeFsSession().catch(() => undefined);
    if (vault) await fs.rm(vault, { recursive: true, force: true });
    vault = null;
  });

  it('downgrades completed runs when the task was not marked done', () => {
    const result = resolveConversationCompletion({
      resultStatus: 'completed',
      taskStatus: 'doing',
      summary: 'exit 0'
    });

    expect(result.status).toBe('needs_attention');
    expect(result.sessionStatus).toBe('awaiting_user');
    expect(result.summary).toBe('Run exited before the task was marked done.');
  });

  it('uses blocked reasons for clarification runs', () => {
    const result = resolveConversationCompletion({
      resultStatus: 'completed',
      taskStatus: 'blocked',
      blockedReason: 'Need product confirmation for the rollout scope.',
      summary: 'exit 0'
    });

    expect(result.status).toBe('needs_attention');
    expect(result.sessionStatus).toBe('awaiting_user');
    expect(result.summary).toBe('Need product confirmation for the rollout scope.');
  });

  it('keeps completed when the task is explicitly done', () => {
    const result = resolveConversationCompletion({
      resultStatus: 'completed',
      taskStatus: 'done',
      summary: 'Implemented the requested feature.'
    });

    expect(result.status).toBe('completed');
    expect(result.sessionStatus).toBe('completed');
    expect(result.summary).toBe('Implemented the requested feature.');
  });

  it('deduplicates repeated assistant text when persisting completion turns', () => {
    expect(
      collectAssistantContent([
        {
          idx: 1,
          at: '2026-04-26T10:00:00.000Z',
          kind: 'message',
          text: 'Let me read the task file.'
        },
        {
          idx: 2,
          at: '2026-04-26T10:00:01.000Z',
          kind: 'text',
          text: 'Let me read the task file.'
        },
        {
          idx: 3,
          at: '2026-04-26T10:00:02.000Z',
          kind: 'message',
          text: 'I need the API key before continuing.'
        }
      ])
    ).toBe('Let me read the task file.\n\nI need the API key before continuing.');
  });

  it('creates an Inbox message when a manual task run exits awaiting user input', async () => {
    vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-conversation-inbox-'));
    await createVault(vault);
    const project = await createProject(vault, {
      slug: 'manual-awaiting',
      template: 'blank',
      name: 'Manual Awaiting'
    });
    const created = await createTask(vault, {
      project_uid: project.uid,
      title: 'Need clarification task',
      description: 'Ask for one missing input.'
    });
    const { openFsSession, currentSession } = await import('../src/main/fs');
    await openFsSession(vault);
    const task = currentSession()!.tasks.allTasks().find((entry) => entry.uid === created.uid);
    expect(task?.source).toBe('file');
    if (!task || task.source !== 'file' || !task.uid) throw new Error('task fixture missing');

    await updateTaskFrontmatter(task.filePath, { status: 'doing', active_run_id: 'run_waiting' });
    await refreshTaskFileInSession(task.filePath);
    await getOrCreateConversation(vault, task);
    await startSegment(vault, task.uid, {
      taskId: task.id,
      runId: 'run_waiting',
      trigger: 'manual',
      status: 'running',
      sessionStatus: 'running'
    });

    await recordRunCompletion(vault, 'run_waiting', {
      status: 'completed',
      summary: 'Please provide the production API key.',
      events: [
        {
          idx: 1,
          at: '2026-04-26T10:00:00.000Z',
          kind: 'message',
          text: 'Please provide the production API key.'
        }
      ]
    });

    const inbox = await createInboxServiceForVault(vault).list({ includeArchived: true });
    expect(inbox.items).toEqual([
      expect.objectContaining({
        category: 'message',
        subtype: 'B1',
        status: 'pending',
        title: 'Agent needs input: Need clarification task',
        summary: 'Please provide the production API key.',
        context: expect.objectContaining({
          project_uid: project.uid,
          task_uid: task.uid,
          run_id: 'run_waiting'
        })
      })
    ]);
    const conversation = await getConversation(vault, task.uid);
    expect(conversation?.segments[0]).toEqual(
      expect.objectContaining({
        status: 'needs_attention',
        sessionStatus: 'awaiting_user',
        events: [
          expect.objectContaining({
            kind: 'message',
            text: 'Please provide the production API key.'
          })
        ]
      })
    );
  });
});
