import { describe, expect, it } from 'vitest';
import {
  acknowledgeTerminalPaneStatus,
  applyTerminalPaneEvent,
  clearTerminalPaneStatus
} from '../src/renderer/src/components/Terminal/terminalAgentStatus';

describe('terminalAgentStatus', () => {
  it('moves idle -> working -> permission on hook events', () => {
    expect(applyTerminalPaneEvent('idle', 'Start', false)).toBe('working');
    expect(applyTerminalPaneEvent('working', 'PermissionRequest', false)).toBe(
      'permission'
    );
  });

  it('goes to review when stop happens offscreen and clears when acknowledged', () => {
    const reviewed = applyTerminalPaneEvent('working', 'Stop', false);
    expect(reviewed).toBe('review');
    expect(acknowledgeTerminalPaneStatus(reviewed, true)).toBe('review');
  });

  it('returns to idle immediately when stop happens while visible or terminal exits', () => {
    expect(applyTerminalPaneEvent('permission', 'Stop', true)).toBe('idle');
    expect(clearTerminalPaneStatus()).toBe('idle');
  });
});
