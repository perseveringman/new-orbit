import { describe, expect, it } from 'vitest';
import type { TerminalAgentSessionDTO } from '../src/shared/ipc';
import {
  filterTerminalSessions,
  getTerminalSessionAgentFilters,
  resolveTerminalSessionSelection
} from '../src/renderer/src/views/terminalSessionBrowserModel';

function makeSession(overrides: Partial<TerminalAgentSessionDTO> = {}): TerminalAgentSessionDTO {
  return {
    sessionId: 'tas-1',
    paneId: 'pane-1',
    projectUid: 'project-1',
    agentType: 'claude',
    status: 'active',
    startedAt: '2026-04-23T00:00:00.000Z',
    lastActivityAt: '2026-04-23T00:10:00.000Z',
    stats: {
      promptCount: 3,
      permissionCount: 1
    },
    ...overrides
  };
}

describe('terminal session browser model', () => {
  it('builds agent filters with all first and per-agent counts after it', () => {
    const sessions = [
      makeSession({ sessionId: 'tas-claude-a', agentType: 'claude' }),
      makeSession({ sessionId: 'tas-codex-a', agentType: 'codex' }),
      makeSession({ sessionId: 'tas-codex-b', agentType: 'codex' })
    ];

    expect(getTerminalSessionAgentFilters(sessions)).toEqual([
      { id: 'all', title: 'All', count: 3 },
      { id: 'claude', title: 'Claude Code', count: 1 },
      { id: 'codex', title: 'Codex', count: 2 }
    ]);
  });

  it('filters sessions by agent and search text while preserving newest-first order', () => {
    const sessions = [
      makeSession({
        sessionId: 'tas-older',
        agentType: 'claude',
        title: 'Old build fix',
        lastActivityAt: '2026-04-23T00:05:00.000Z'
      }),
      makeSession({
        sessionId: 'tas-newest',
        agentType: 'claude',
        title: 'Ship sidebar polish',
        summary: 'Right sidebar sessions redesign',
        lastActivityAt: '2026-04-23T00:20:00.000Z'
      }),
      makeSession({
        sessionId: 'tas-codex',
        agentType: 'codex',
        title: 'Codex follow-up',
        lastActivityAt: '2026-04-23T00:15:00.000Z'
      })
    ];

    expect(
      filterTerminalSessions(sessions, {
        activeAgent: 'claude',
        searchQuery: 'sidebar'
      }).map((session) => session.sessionId)
    ).toEqual(['tas-newest']);
  });

  it('falls back to the newest session when the previous selection disappears', () => {
    const sessions = [
      makeSession({
        sessionId: 'tas-older',
        lastActivityAt: '2026-04-23T00:05:00.000Z'
      }),
      makeSession({
        sessionId: 'tas-newest',
        lastActivityAt: '2026-04-23T00:20:00.000Z'
      })
    ];

    expect(resolveTerminalSessionSelection(sessions, 'missing')).toBe('tas-newest');
  });
});
