import { describe, it, expect } from 'vitest';
import {
  renderNotifyShTemplate,
  renderClaudeSettingsJson,
  renderTerminalNotifyShTemplate,
  mergeClaudeHooks
} from '../src/main/agent/hooks/template';

describe('renderNotifyShTemplate', () => {
  it('contains curl, host/port, bearer token', () => {
    const script = renderNotifyShTemplate({
      hookPort: 54321,
      hookToken: 'abc123',
      hookVersion: 1,
      runId: 'run-xyz',
      worktreeId: 'wt-1',
      vendor: 'claude'
    });
    expect(script).toContain('#!/usr/bin/env bash');
    expect(script).toContain('set -eu');
    expect(script).toContain('curl');
    expect(script).toContain('127.0.0.1:${ORBIT_HOOK_PORT}');
    expect(script).toContain('54321');
    expect(script).toContain('"abc123"');
    expect(script).toContain('Bearer ${ORBIT_HOOK_TOKEN}');
    expect(script).toContain('ORBIT_HOOK_EVENT_TYPE:-Stop');
  });

  it('escapes a token containing a double quote via JSON.stringify', () => {
    const tricky = 'tok"en\\with';
    const script = renderNotifyShTemplate({
      hookPort: 1,
      hookToken: tricky,
      hookVersion: 1,
      runId: 'r',
      vendor: 'generic'
    });
    expect(script).toContain(JSON.stringify(tricky));
    expect(script).not.toContain(`"${tricky}"`);
  });
});

describe('renderClaudeSettingsJson', () => {
  it('wires Stop and PreToolUse hooks to the script path', () => {
    const out = renderClaudeSettingsJson({
      hookPort: 1,
      hookToken: 't',
      hookVersion: 1,
      runId: 'r',
      scriptPath: '/tmp/orbit/notify.sh'
    });
    const parsed = JSON.parse(out);
    expect(parsed.hooks.Stop).toBeDefined();
    expect(parsed.hooks.PreToolUse).toBeDefined();
    expect(JSON.stringify(parsed)).toContain('/tmp/orbit/notify.sh');
    expect(JSON.stringify(parsed)).toContain('ORBIT_HOOK_EVENT_TYPE');
  });
});

describe('renderTerminalNotifyShTemplate', () => {
  it('uses terminal env identity and GET /hook/event without bearer token', () => {
    const script = renderTerminalNotifyShTemplate();
    expect(script).toContain('HOOK_PORT="${ORBIT_HOOK_PORT:-}"');
    expect(script).toContain('PANE_ID="${ORBIT_PANE_ID:-}"');
    expect(script).toContain('PROJECT_UID="${ORBIT_PROJECT_UID:-}"');
    expect(script).toContain('hook_event_name');
    expect(script).toContain('/hook/event?eventType=');
    expect(script).toContain('&payload=');
    expect(script).not.toContain('Authorization: Bearer');
    expect(script).not.toContain('ORBIT_RUN_ID');
  });
});

describe('mergeClaudeHooks', () => {
  it('keeps user hooks and replaces only Orbit-managed entries for the same script path', () => {
    const merged = mergeClaudeHooks(
      {
        hooks: {
          Stop: [
            {
              hooks: [{ type: 'command', command: '/tmp/user-stop.sh' }]
            },
            {
              hooks: [{ type: 'command', command: '/vault/.orbit/hooks/notify.sh' }]
            }
          ]
        },
        theme: 'dark'
      },
      '/vault/.orbit/hooks/notify.sh'
    ) as {
      theme: string;
      hooks: { Stop: Array<{ hooks: Array<{ command: string }> }>; UserPromptSubmit: unknown[] };
    };

    expect(merged.theme).toBe('dark');
    expect(merged.hooks.Stop).toHaveLength(2);
    expect(merged.hooks.Stop[0]!.hooks[0]!.command).toBe('/tmp/user-stop.sh');
    expect(JSON.stringify(merged.hooks.UserPromptSubmit)).toContain('/vault/.orbit/hooks/notify.sh');
    expect(JSON.stringify(merged.hooks.Stop)).toContain('/vault/.orbit/hooks/notify.sh');
  });
});
