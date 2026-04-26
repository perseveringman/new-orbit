import { describe, expect, it } from 'vitest';
import {
  clearPendingTerminalNavigation,
  consumePendingTerminalNavigation,
  queueTerminalNavigation
} from '../src/renderer/src/components/Terminal/terminalNavigationIntent';

describe('terminal navigation intent', () => {
  it('consumes queued navigation only for the matching project', () => {
    clearPendingTerminalNavigation();
    queueTerminalNavigation({
      projectUid: 'project-1',
      paneId: 'pane-a'
    });

    expect(consumePendingTerminalNavigation('project-2')).toBeNull();
    expect(consumePendingTerminalNavigation('project-1')).toEqual({
      projectUid: 'project-1',
      paneId: 'pane-a'
    });
    expect(consumePendingTerminalNavigation('project-1')).toBeNull();
  });

  it('replaces older navigation requests with the latest one', () => {
    clearPendingTerminalNavigation();
    queueTerminalNavigation({
      projectUid: 'project-1',
      paneId: 'pane-a'
    });
    queueTerminalNavigation({
      projectUid: 'project-1',
      initialCommand: 'claude --dangerously-skip-permissions --resume sess-9'
    });

    expect(consumePendingTerminalNavigation('project-1')).toEqual({
      projectUid: 'project-1',
      initialCommand: 'claude --dangerously-skip-permissions --resume sess-9'
    });
  });

  it('preserves session-oriented navigation metadata for history actions', () => {
    clearPendingTerminalNavigation();
    const intent = {
      projectUid: 'project-1',
      orbitSessionId: 'orbit-session-1',
      openMode: 'reopen-session' as const
    };
    queueTerminalNavigation(intent);

    expect(consumePendingTerminalNavigation('project-1')).toEqual(intent);
  });
});
