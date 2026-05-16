import { describe, expect, it } from 'vitest';
import type { TerminalAgentSessionDTO } from '../src/shared/ipc';
import { getTerminalSessionAction } from '../src/renderer/src/components/Sidebar/terminalSessionAction';

function makeSession(
  overrides: Partial<TerminalAgentSessionDTO> = {}
): TerminalAgentSessionDTO {
  return {
    sessionId: 'orbit-session-1',
    paneId: 'pane-1',
    projectUid: 'project-1',
    agentType: 'claude',
    status: 'active',
    startedAt: '2026-04-23T00:00:00Z',
    lastActivityAt: '2026-04-23T00:05:00Z',
    stats: { promptCount: 1, permissionCount: 0 },
    resumeSessionId: 'resume-1',
    resumeCommand: 'claude --dangerously-skip-permissions --resume resume-1',
    ...overrides
  };
}

describe('project session action', () => {
  it('focuses the existing pane for active sessions', () => {
    expect(getTerminalSessionAction(makeSession())).toEqual({
      disabled: false,
      hint: '跳转到活跃终端',
      navigation: {
        projectUid: 'project-1',
        roomKind: 'project',
        paneId: 'pane-1',
        orbitSessionId: 'orbit-session-1',
        openMode: 'focus-pane'
      }
    });
  });

  it('opens a new terminal in resume mode for resumable inactive sessions', () => {
    expect(getTerminalSessionAction(makeSession({ status: 'completed' }))).toEqual({
      disabled: false,
      hint: '在新标签页继续',
      navigation: {
        projectUid: 'project-1',
        roomKind: 'project',
        orbitSessionId: 'orbit-session-1',
        openMode: 'resume-session',
        initialCommand: 'claude --dangerously-skip-permissions --resume resume-1'
      }
    });
  });

  it('reopens a fresh terminal instead of routing to a stale pane when resume is unavailable', () => {
    expect(
      getTerminalSessionAction(
        makeSession({
          status: 'interrupted',
          resumeSessionId: null,
          resumeCommand: null
        })
      )
    ).toEqual({
      disabled: false,
      hint: '带会话上下文打开新终端',
      navigation: {
        projectUid: 'project-1',
        roomKind: 'project',
        orbitSessionId: 'orbit-session-1',
        openMode: 'reopen-session'
      }
    });
  });
});
