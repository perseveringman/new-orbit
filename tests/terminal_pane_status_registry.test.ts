import { describe, expect, it } from 'vitest';
import { upsertTerminalPaneStatus } from '../src/renderer/src/components/Terminal/terminalPaneStatusRegistry';

describe('upsertTerminalPaneStatus', () => {
  it('does not report a change when the pane status is unchanged', () => {
    const statuses = new Map<string, 'idle' | 'working' | 'permission' | 'review'>([
      ['pane-a', 'idle']
    ]);

    const changed = upsertTerminalPaneStatus(statuses, 'pane-a', 'idle');

    expect(changed).toBe(false);
    expect(statuses.get('pane-a')).toBe('idle');
    expect(statuses.size).toBe(1);
  });

  it('reports a change when the pane status changes', () => {
    const statuses = new Map<string, 'idle' | 'working' | 'permission' | 'review'>([
      ['pane-a', 'idle']
    ]);

    const changed = upsertTerminalPaneStatus(statuses, 'pane-a', 'working');

    expect(changed).toBe(true);
    expect(statuses.get('pane-a')).toBe('working');
  });
});
