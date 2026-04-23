import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IPC } from '../src/shared/ipc';
import { getClaudeProjectDirName } from '../src/main/agent/claude_sessions';

vi.mock('electron', () => ({
  app: { on: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() }
}));

type Handler = (e: unknown, ...args: unknown[]) => Promise<unknown>;

async function getHandlers(): Promise<Map<string, Handler>> {
  const electron = await import('electron');
  const handle = (
    electron as unknown as { ipcMain: { handle: ReturnType<typeof vi.fn> } }
  ).ipcMain.handle;
  const handlers = new Map<string, Handler>();
  for (const call of handle.mock.calls) handlers.set(call[0] as string, call[1] as Handler);
  return handlers;
}

describe('terminalAgent detail transcript import', () => {
  let vault: string;
  let fakeHome: string;

  beforeEach(async () => {
    vi.resetModules();
    vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-terminal-detail-vault-'));
    fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-terminal-detail-home-'));

    const electron = await import('electron');
    (
      electron as unknown as { ipcMain: { handle: ReturnType<typeof vi.fn> } }
    ).ipcMain.handle.mockClear();
    vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(vault, { recursive: true, force: true });
    await fs.rm(fakeHome, { recursive: true, force: true });
  });

  it('returns imported codex transcript messages for a project session detail request', async () => {
    const { createVault } = await import('../src/main/vault');
    const { createProject } = await import('../src/main/project');
    const { openFsSession, closeFsSession } = await import('../src/main/fs');
    const { ingestTerminalHookEvent } = await import('../src/main/agent/terminal_sessions');
    const { registerAgentIpc } = await import('../src/main/agent/ipc');

    await createVault(vault);
    const project = await createProject(vault, {
      slug: 'transcript-test',
      template: 'blank',
      name: 'Transcript Test'
    });

    const codexDir = path.join(fakeHome, '.codex', 'sessions', '2026', '04', '23');
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      path.join(codexDir, 'rollout-2026-04-23T13-00-00-codex-session-9.jsonl'),
      [
        JSON.stringify({
          timestamp: '2026-04-23T13:00:00.000Z',
          type: 'session_meta',
          payload: {
            id: 'codex-session-9',
            cwd: project.projectPath,
            timestamp: '2026-04-23T13:00:00.000Z'
          }
        }),
        JSON.stringify({
          timestamp: '2026-04-23T13:00:01.000Z',
          type: 'event_msg',
          payload: {
            type: 'user_message',
            message: 'Please wire transcript import.'
          }
        }),
        JSON.stringify({
          timestamp: '2026-04-23T13:00:03.000Z',
          type: 'event_msg',
          payload: {
            type: 'agent_message',
            message: 'I found the missing import path and will patch it now.',
            phase: 'commentary'
          }
        })
      ].join('\n') + '\n',
      'utf8'
    );

    const recorded = await ingestTerminalHookEvent(vault, {
      eventType: 'Start',
      rawEventType: 'SessionStart',
      paneId: 'pane-1',
      projectUid: project.uid,
      ts: '2026-04-23T13:00:01.000Z',
      payload: {
        session_id: 'codex-session-9',
        title: 'Transcript import',
        summary: 'Session detail should show Codex messages',
        resume_command: 'codex resume codex-session-9'
      }
    });

    registerAgentIpc();
    await openFsSession(vault);

    const handlers = await getHandlers();
    const detail = handlers.get(IPC.terminalAgent.detail)!;

    const result = await detail({}, project.uid, recorded!.sessionId);

    expect(result).toMatchObject({
      sessionId: recorded!.sessionId,
      resumeCommand: 'codex resume codex-session-9',
      messages: [
        {
          role: 'user',
          text: 'Please wire transcript import.',
          at: '2026-04-23T13:00:01.000Z'
        },
        {
          role: 'assistant',
          text: 'I found the missing import path and will patch it now.',
          at: '2026-04-23T13:00:03.000Z'
        }
      ]
    });

    await closeFsSession();
  });

  it(
    'returns imported claude transcript messages using the session cwd instead of the Orbit project path',
    async () => {
    const { createVault } = await import('../src/main/vault');
    const { createProject } = await import('../src/main/project');
    const { openFsSession, closeFsSession } = await import('../src/main/fs');
    const { ingestTerminalHookEvent } = await import('../src/main/agent/terminal_sessions');
    const { registerAgentIpc } = await import('../src/main/agent/ipc');

    await createVault(vault);
    const project = await createProject(vault, {
      slug: 'claude-transcript-test',
      template: 'blank',
      name: 'Claude Transcript Test'
    });

    const externalCwd = '/Users/ryanbzhou/ryanbvault/01_Projects/twitter';
    const claudeProjectDir = path.join(
      fakeHome,
      '.claude',
      'projects',
      getClaudeProjectDirName(externalCwd)
    );
    await fs.mkdir(claudeProjectDir, { recursive: true });
    await fs.writeFile(
      path.join(claudeProjectDir, 'sessions-index.json'),
      JSON.stringify({ version: 1, originalPath: externalCwd, entries: [] }, null, 2),
      'utf8'
    );
    await fs.writeFile(
      path.join(claudeProjectDir, 'claude-session-7.jsonl'),
      [
        JSON.stringify({
          type: 'permission-mode',
          permissionMode: 'default',
          sessionId: 'claude-session-7'
        }),
        JSON.stringify({
          sessionId: 'claude-session-7',
          cwd: externalCwd,
          timestamp: '2026-04-23T13:00:01.000Z',
          type: 'user',
          message: {
            role: 'user',
            content: '项目能做什么'
          }
        }),
        JSON.stringify({
          sessionId: 'claude-session-7',
          cwd: externalCwd,
          timestamp: '2026-04-23T13:00:03.000Z',
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: '我先检查项目文档，确认它当前支持的能力。' }]
          }
        })
      ].join('\n') + '\n',
      'utf8'
    );

    const recorded = await ingestTerminalHookEvent(vault, {
      eventType: 'Start',
      rawEventType: 'UserPromptSubmit',
      paneId: 'pane-claude-1',
      projectUid: project.uid,
      ts: '2026-04-23T13:00:01.000Z',
      payload: {
        session_id: 'claude-session-7',
        cwd: externalCwd
      }
    });

    registerAgentIpc();
    await openFsSession(vault);

    const handlers = await getHandlers();
    const detail = handlers.get(IPC.terminalAgent.detail)!;

    const result = await detail({}, project.uid, recorded!.sessionId);

    expect(result).toMatchObject({
      sessionId: recorded!.sessionId,
      resumeSessionId: 'claude-session-7',
      resumeCommand: 'claude --resume claude-session-7',
      messages: [
        {
          role: 'user',
          text: '项目能做什么',
          at: '2026-04-23T13:00:01.000Z'
        },
        {
          role: 'assistant',
          text: '我先检查项目文档，确认它当前支持的能力。',
          at: '2026-04-23T13:00:03.000Z'
        }
      ]
    });

    await closeFsSession();
    },
    10000
  );
});
