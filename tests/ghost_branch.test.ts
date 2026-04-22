import { describe, expect, it } from 'vitest';
import { isGhostBranch } from '../src/main/git/worktree';

describe('ghost branch policy', () => {
  it('accepts orbit/ghost/* branches (what git.ghostCommit commits on)', () => {
    expect(isGhostBranch('orbit/ghost/abc12345')).toBe(true);
  });

  it('rejects every other branch (ghostCommit raises not_a_ghost_branch)', () => {
    expect(isGhostBranch('main')).toBe(false);
    expect(isGhostBranch('master')).toBe(false);
    expect(isGhostBranch('feature/foo')).toBe(false);
    expect(isGhostBranch('orbit/other/x')).toBe(false);
    expect(isGhostBranch('')).toBe(false);
  });
});
