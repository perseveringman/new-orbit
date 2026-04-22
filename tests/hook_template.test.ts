import { describe, it, expect } from 'vitest';
import {
  renderNotifyShTemplate,
  renderClaudeSettingsJson
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
