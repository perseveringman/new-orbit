import { describe, expect, it } from 'vitest';
import {
  appendClaudeBypassPermissionsArgs,
  buildClaudeResumeCommand,
  ensureClaudeBypassPermissionsCommand
} from '../src/shared/claude_cli';

describe('claude cli helpers', () => {
  it('adds bypass permissions to plain Claude commands', () => {
    expect(ensureClaudeBypassPermissionsCommand('claude --resume sess-1')).toBe(
      'claude --resume sess-1 --dangerously-skip-permissions'
    );
  });

  it('leaves non-Claude commands untouched', () => {
    expect(ensureClaudeBypassPermissionsCommand('codex exec')).toBe('codex exec');
  });

  it('builds resumable Claude commands with bypass permissions', () => {
    expect(buildClaudeResumeCommand('sess-1')).toBe(
      'claude --dangerously-skip-permissions --resume sess-1'
    );
  });

  it('appends bypass permissions to Claude argv once', () => {
    expect(appendClaudeBypassPermissionsArgs(['-p', 'hello'])).toEqual([
      '-p',
      'hello',
      '--dangerously-skip-permissions'
    ]);
    expect(
      appendClaudeBypassPermissionsArgs(['-p', 'hello', '--dangerously-skip-permissions'])
    ).toEqual(['-p', 'hello', '--dangerously-skip-permissions']);
  });
});
