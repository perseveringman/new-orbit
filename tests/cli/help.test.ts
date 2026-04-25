import { describe, expect, it } from 'vitest';
import {
  generateCatHelp,
  generateSearchHelp,
  generateTaskHelp,
  generateTopLevelHelp,
  generateUnavailableHelp
} from '../../src/cli/help/generate';

describe('CLI help', () => {
  it('prints stable top-level command discovery', () => {
    const help = generateTopLevelHelp();
    expect(help).toContain('Usage: orbit <command> [args]');
    expect(help).toContain('search       Search the open vault (Phase 0)');
    expect(help).toContain('cat          Read a vault file or UID (Phase 0)');
    expect(help).toContain('task         Task commands: list (Phase 0)');
    expect(help).toContain('Phase 5 unavailable');
    expect(help).toContain('Global flags: --json');
  });

  it('prints command help for Phase 0 commands', () => {
    expect(generateSearchHelp()).toContain('Usage: orbit search <query>');
    expect(generateCatHelp()).toContain('Usage: orbit cat <path-or-uid>');
    expect(generateTaskHelp()).toContain('orbit task list --status todo');
  });

  it('marks future domains unavailable', () => {
    expect(generateUnavailableHelp('inbox')).toContain('not implemented in Phase 0');
  });
});
