import { describe, expect, it } from 'vitest';
import * as TerminalPaneModule from '../src/renderer/src/components/Terminal/TerminalPane';

describe('terminal pane launch key', () => {
  it('stays stable when launch options have the same content', () => {
    const getTerminalLaunchKey = (
      TerminalPaneModule as unknown as {
        getTerminalLaunchKey?: (args: {
          cwd: string;
          dark?: boolean;
          env?: Record<string, string>;
          initialCommand?: string;
        }) => string;
      }
    ).getTerminalLaunchKey;

    expect(typeof getTerminalLaunchKey).toBe('function');

    const first = getTerminalLaunchKey!({
      cwd: '/vault/project',
      dark: true,
      env: {
        ORBIT_PROJECT_UID: 'project-1',
        ORBIT_PANE_ID: 'pane-a'
      },
      initialCommand: 'claude'
    });
    const second = getTerminalLaunchKey!({
      cwd: '/vault/project',
      dark: true,
      env: {
        ORBIT_PANE_ID: 'pane-a',
        ORBIT_PROJECT_UID: 'project-1'
      },
      initialCommand: 'claude'
    });

    expect(second).toBe(first);
  });

  it('changes when launch options meaningfully change', () => {
    const getTerminalLaunchKey = (
      TerminalPaneModule as unknown as {
        getTerminalLaunchKey?: (args: {
          cwd: string;
          dark?: boolean;
          env?: Record<string, string>;
          initialCommand?: string;
        }) => string;
      }
    ).getTerminalLaunchKey;

    expect(typeof getTerminalLaunchKey).toBe('function');

    const base = getTerminalLaunchKey!({
      cwd: '/vault/project',
      env: { ORBIT_PANE_ID: 'pane-a' }
    });

    expect(
      getTerminalLaunchKey!({
        cwd: '/vault/project',
        env: { ORBIT_PANE_ID: 'pane-b' }
      })
    ).not.toBe(base);
    expect(
      getTerminalLaunchKey!({
        cwd: '/vault/project-2',
        env: { ORBIT_PANE_ID: 'pane-a' }
      })
    ).not.toBe(base);
    expect(
      getTerminalLaunchKey!({
        cwd: '/vault/project',
        env: { ORBIT_PANE_ID: 'pane-a' },
        initialCommand: 'claude'
      })
    ).not.toBe(base);
  });
});
