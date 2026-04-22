import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ingestTerminalHookEvent,
  listTerminalAgentSessions,
  markTerminalPaneExited,
  reconcileTerminalAgentSessionsOnStart
} from '../src/main/agent/terminal_sessions';

describe('terminal agent session registry', () => {
  let vault: string;

  beforeEach(async () => {
    vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-terminal-sessions-'));
    await fs.mkdir(path.join(vault, '.orbit'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('creates and updates an active session from hook events, then completes on pane exit', async () => {
    await ingestTerminalHookEvent(vault, {
      eventType: 'Start',
      rawEventType: 'UserPromptSubmit',
      paneId: 'pane-1',
      projectUid: 'proj-1',
      ts: '2026-04-22T10:00:00Z'
    });
    await ingestTerminalHookEvent(vault, {
      eventType: 'PermissionRequest',
      rawEventType: 'PreToolUse',
      paneId: 'pane-1',
      projectUid: 'proj-1',
      ts: '2026-04-22T10:01:00Z'
    });
    await ingestTerminalHookEvent(vault, {
      eventType: 'Stop',
      rawEventType: 'Stop',
      paneId: 'pane-1',
      projectUid: 'proj-1',
      ts: '2026-04-22T10:02:00Z'
    });

    let sessions = await listTerminalAgentSessions(vault, 'proj-1');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      paneId: 'pane-1',
      projectUid: 'proj-1',
      agentType: 'claude',
      status: 'active',
      stats: { promptCount: 1, permissionCount: 1 }
    });

    await markTerminalPaneExited(vault, 'pane-1', '2026-04-22T10:03:00Z');
    sessions = await listTerminalAgentSessions(vault, 'proj-1');
    expect(sessions[0]).toMatchObject({
      status: 'completed',
      endedAt: '2026-04-22T10:03:00Z'
    });
  });

  it('marks leftover active sessions as interrupted on startup reconciliation', async () => {
    await ingestTerminalHookEvent(vault, {
      eventType: 'Start',
      rawEventType: 'UserPromptSubmit',
      paneId: 'pane-2',
      projectUid: 'proj-2',
      ts: '2026-04-22T11:00:00Z'
    });

    await reconcileTerminalAgentSessionsOnStart(vault, '2026-04-22T12:00:00Z');
    const sessions = await listTerminalAgentSessions(vault, 'proj-2');
    expect(sessions[0]).toMatchObject({
      status: 'interrupted',
      endedAt: '2026-04-22T12:00:00Z'
    });
  });
});
