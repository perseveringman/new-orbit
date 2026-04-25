import { describe, expect, it } from 'vitest';
import {
  generateCatHelp,
  generateAutoRunnerHelp,
  generateSearchHelp,
  generateTaskHelp,
  generateTopLevelHelp,
  generateInboxHelp,
  generateActivityHelp,
  generateApprovalHelp,
  generateFeedHelp
} from '../../src/cli/help/generate';

describe('CLI help', () => {
  it('prints stable top-level command discovery', () => {
    const help = generateTopLevelHelp();
    expect(help).toContain('Usage: orbit <command> [args]');
    expect(help).toContain('search       Search the open vault');
    expect(help).toContain('cat          Read a vault file or UID');
    expect(help).toContain('task        Task commands: list, get, update, propose');
    expect(help).toContain('auto-runner Auto-runner controls: status, start, stop');
    expect(help).toContain('feed        Feed capture commands');
    expect(help).toContain('Global flags: --json');
  });

  it('prints command help for Phase 0 commands', () => {
    expect(generateSearchHelp()).toContain('Usage: orbit search <query>');
    expect(generateCatHelp()).toContain('Usage: orbit cat <path-or-uid>');
    expect(generateTaskHelp()).toContain('orbit task list --status todo');
    expect(generateTaskHelp()).toContain('orbit task deps task_uid');
    expect(generateAutoRunnerHelp()).toContain('Usage: orbit auto-runner <subcommand>');
    expect(generateInboxHelp()).toContain('emit-message --type B1');
    expect(generateActivityHelp()).toContain('Usage: orbit activity <subcommand>');
    expect(generateApprovalHelp()).toContain('Usage: orbit approval <subcommand>');
  });

  it('documents capture surfaces as backend-unavailable in this worktree', () => {
    expect(generateFeedHelp()).toContain('Capture backend is unavailable');
  });
});
