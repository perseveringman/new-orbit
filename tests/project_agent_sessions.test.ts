import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ingestTerminalHookEvent,
  listTerminalAgentSessions
} from '../src/main/agent/terminal_sessions';

describe('project agent sessions', () => {
  let vault: string;

  beforeEach(async () => {
    vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-project-agent-sessions-'));
    await fs.mkdir(path.join(vault, '.orbit'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('splits a new orbit session when the same pane starts a different vendor session', async () => {
    await ingestTerminalHookEvent(vault, {
      eventType: 'Start',
      rawEventType: 'UserPromptSubmit',
      paneId: 'pane-1',
      projectUid: 'proj-1',
      ts: '2026-04-23T12:00:00Z',
      payload: {
        session_id: 'claude-session-1',
        title: 'Plan terminal awareness',
        summary: 'Worked on terminal awareness fixes'
      }
    });

    await ingestTerminalHookEvent(vault, {
      eventType: 'Stop',
      rawEventType: 'Stop',
      paneId: 'pane-1',
      projectUid: 'proj-1',
      ts: '2026-04-23T12:05:00Z',
      payload: {
        session_id: 'claude-session-1'
      }
    });

    await ingestTerminalHookEvent(vault, {
      eventType: 'Start',
      rawEventType: 'SessionStart',
      paneId: 'pane-1',
      projectUid: 'proj-1',
      ts: '2026-04-23T12:06:00Z',
      payload: {
        session_id: 'codex-session-9',
        title: 'Continue with Copilot CLI',
        summary: 'Switched vendors in the same pane',
        resume_command: 'codex resume codex-session-9'
      }
    });

    const sessions = await listTerminalAgentSessions(vault, 'proj-1');
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({
      paneId: 'pane-1',
      projectUid: 'proj-1',
      agentType: 'codex',
      status: 'active',
      vendorSessionId: 'codex-session-9',
      title: 'Continue with Copilot CLI',
      summary: 'Switched vendors in the same pane',
      resumeCommand: 'codex resume codex-session-9'
    });
    expect(sessions[1]).toMatchObject({
      paneId: 'pane-1',
      projectUid: 'proj-1',
      agentType: 'claude',
      status: 'completed',
      vendorSessionId: 'claude-session-1',
      title: 'Plan terminal awareness',
      summary: 'Worked on terminal awareness fixes',
      endedAt: '2026-04-23T12:06:00Z'
    });
  });

  it('keeps updating the same orbit session while vendor session identity is unchanged', async () => {
    await ingestTerminalHookEvent(vault, {
      eventType: 'Start',
      rawEventType: 'UserPromptSubmit',
      paneId: 'pane-2',
      projectUid: 'proj-2',
      ts: '2026-04-23T13:00:00Z',
      payload: {
        session_id: 'claude-session-2',
        title: 'Refactor session model'
      }
    });

    await ingestTerminalHookEvent(vault, {
      eventType: 'PermissionRequest',
      rawEventType: 'PreToolUse',
      paneId: 'pane-2',
      projectUid: 'proj-2',
      ts: '2026-04-23T13:01:00Z',
      payload: {
        session_id: 'claude-session-2',
        summary: 'Waiting for apply_patch approval'
      }
    });

    await ingestTerminalHookEvent(vault, {
      eventType: 'Start',
      rawEventType: 'PostToolUse',
      paneId: 'pane-2',
      projectUid: 'proj-2',
      ts: '2026-04-23T13:02:00Z',
      payload: {
        session_id: 'claude-session-2'
      }
    });

    const sessions = await listTerminalAgentSessions(vault, 'proj-2');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      paneId: 'pane-2',
      projectUid: 'proj-2',
      agentType: 'claude',
      status: 'active',
      vendorSessionId: 'claude-session-2',
      title: 'Refactor session model',
      summary: 'Waiting for apply_patch approval',
      stats: {
        promptCount: 2,
        permissionCount: 1
      }
    });
  });
});
