import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { SafetyGate, MAX_PROMPT_CHARS } from '../src/main/agent/tokens';

describe('SafetyGate', () => {
  const vault = path.resolve('/tmp/orbit-fake-vault');

  it('allows vault root as cwd', () => {
    const r = SafetyGate.check({ cwd: vault, prompt: 'hi', vaultPath: vault });
    expect(r.ok).toBe(true);
  });

  it('allows a subdir under .orbit/worktrees', () => {
    const r = SafetyGate.check({
      cwd: path.join(vault, '.orbit', 'worktrees', 'abc12345'),
      prompt: 'hi',
      vaultPath: vault
    });
    expect(r.ok).toBe(true);
  });

  it('blocks cwd outside the vault', () => {
    const r = SafetyGate.check({
      cwd: '/tmp/somewhere-else',
      prompt: 'hi',
      vaultPath: vault
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/cwd outside vault/);
  });

  it('blocks oversized prompts', () => {
    const r = SafetyGate.check({
      cwd: vault,
      prompt: 'a'.repeat(MAX_PROMPT_CHARS + 1),
      vaultPath: vault
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/prompt exceeds/);
  });
});
