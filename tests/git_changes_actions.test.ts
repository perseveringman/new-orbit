/**
 * Task 5: staged-aware git actions backend tests.
 *
 * Tests cover:
 *  - parsePorcelainStatus (extracted from mcp/tools.ts)
 *  - getChanges IPC handler
 *  - stagePaths / unstagePaths / discardPaths IPC handlers
 *  - commitSelection safe commit (no implicit add -A)
 */

import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { parsePorcelainStatus } from '../src/main/git/status';
import {
  getChanges,
  stagePaths,
  unstagePaths,
  discardPaths,
  commitSelection
} from '../src/main/git/status';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function initRepo(dir: string): Promise<ReturnType<typeof simpleGit>> {
  const g = simpleGit(dir);
  await g.init();
  await g.addConfig('user.email', 'a@b');
  await g.addConfig('user.name', 't');
  await g.addConfig('commit.gpgsign', 'false');
  await g.raw(['checkout', '-b', 'main']).catch(() => undefined);
  return g;
}

async function makeTmpRepo(): Promise<{ dir: string; g: ReturnType<typeof simpleGit> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-changes-'));
  const g = await initRepo(dir);
  return { dir, g };
}

// ---------------------------------------------------------------------------
// parsePorcelainStatus unit tests
// ---------------------------------------------------------------------------

describe('parsePorcelainStatus', () => {
  it('counts staged, unstaged, and untracked files', () => {
    const lines = [
      'M  src/app.ts',   // staged modified (index has change, worktree clean)
      ' M src/b.ts',     // unstaged modified only
      '?? tmp.txt',      // untracked
      'A  new.ts',       // staged added
    ];
    const result = parsePorcelainStatus(lines);
    expect(result.stagedCount).toBe(2);    // M (index) + A
    expect(result.unstagedCount).toBe(1);  // ' M' worktree
    expect(result.untrackedCount).toBe(1); // ??
    expect(result.dirty).toBe(true);
  });

  it('returns zero counts for empty input', () => {
    const result = parsePorcelainStatus([]);
    expect(result.stagedCount).toBe(0);
    expect(result.unstagedCount).toBe(0);
    expect(result.untrackedCount).toBe(0);
    expect(result.dirty).toBe(false);
  });

  it('ignores branch header lines', () => {
    const lines = ['## main...origin/main'];
    const result = parsePorcelainStatus(lines);
    expect(result.dirty).toBe(false);
  });

  it('produces file entries with correct paths and status', () => {
    const lines = ['M  src/app.ts', '?? untracked.ts'];
    const result = parsePorcelainStatus(lines);
    const stagedEntry = result.files.find((f) => f.path === 'src/app.ts');
    expect(stagedEntry).toBeDefined();
    expect(stagedEntry?.indexStatus).toBe('M');
    expect(stagedEntry?.workTreeStatus).toBe(' ');

    const untrackedEntry = result.files.find((f) => f.path === 'untracked.ts');
    expect(untrackedEntry).toBeDefined();
    expect(untrackedEntry?.indexStatus).toBe('?');
    expect(untrackedEntry?.workTreeStatus).toBe('?');
  });

  it('handles both modified in index and worktree (MM)', () => {
    const lines = ['MM src/conflict.ts'];
    const result = parsePorcelainStatus(lines);
    expect(result.stagedCount).toBe(1);
    expect(result.unstagedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Integration tests using real git repos
// ---------------------------------------------------------------------------

describe('getChanges', () => {
  it('returns staged, unstaged and untracked counts', async () => {
    const { dir, g } = await makeTmpRepo();
    try {
      // Initial commit with both a.ts and b.ts
      await fs.writeFile(path.join(dir, 'a.ts'), 'v1\n');
      await fs.writeFile(path.join(dir, 'b.ts'), 'b1\n');
      await g.add('.');
      await g.commit('init');

      // Stage a change to a.ts (stagedCount=1)
      await fs.writeFile(path.join(dir, 'a.ts'), 'v2\n');
      await g.add('a.ts');

      // Unstaged modification to b.ts (unstagedCount=1)
      await fs.writeFile(path.join(dir, 'b.ts'), 'b2\n');

      // Untracked file (untrackedCount=1)
      await fs.writeFile(path.join(dir, 'untracked.txt'), 'hello\n');

      const summary = await getChanges({ cwd: dir });
      expect(summary.stagedCount).toBe(1);
      expect(summary.unstagedCount).toBe(1);
      expect(summary.untrackedCount).toBe(1);
      expect(summary.dirty).toBe(true);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('stagePaths', () => {
  it('stages specific paths', async () => {
    const { dir, g } = await makeTmpRepo();
    try {
      await fs.writeFile(path.join(dir, 'a.ts'), 'v1\n');
      await g.add('.');
      await g.commit('init');

      await fs.writeFile(path.join(dir, 'a.ts'), 'v2\n');
      await fs.writeFile(path.join(dir, 'b.ts'), 'new\n');

      // Stage only a.ts
      await stagePaths({ cwd: dir, paths: ['a.ts'] });

      const before = await getChanges({ cwd: dir });
      expect(before.stagedCount).toBe(1);
      // b.ts is untracked (not staged)
      const bEntry = before.files.find((f) => f.path === 'b.ts');
      expect(bEntry?.indexStatus).toBe('?');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('unstagePaths', () => {
  it('unstages a previously staged path', async () => {
    const { dir, g } = await makeTmpRepo();
    try {
      await fs.writeFile(path.join(dir, 'a.ts'), 'v1\n');
      await g.add('.');
      await g.commit('init');

      await fs.writeFile(path.join(dir, 'a.ts'), 'v2\n');
      await g.add('a.ts');

      // Verify staged
      const beforeUnstage = await getChanges({ cwd: dir });
      expect(beforeUnstage.stagedCount).toBe(1);

      await unstagePaths({ cwd: dir, paths: ['a.ts'] });

      const after = await getChanges({ cwd: dir });
      expect(after.stagedCount).toBe(0);
      // Still shows as unstaged/worktree modified
      expect(after.unstagedCount).toBe(1);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('discardPaths', () => {
  it('restores tracked file to HEAD state', async () => {
    const { dir, g } = await makeTmpRepo();
    try {
      const filePath = path.join(dir, 'a.ts');
      await fs.writeFile(filePath, 'original\n');
      await g.add('.');
      await g.commit('init');

      await fs.writeFile(filePath, 'modified\n');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('modified\n');

      await discardPaths({ cwd: dir, paths: ['a.ts'] });

      const restored = await fs.readFile(filePath, 'utf-8');
      expect(restored).toBe('original\n');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('deletes untracked files', async () => {
    const { dir } = await makeTmpRepo();
    try {
      // Need at least one commit so HEAD exists
      await fs.writeFile(path.join(dir, 'init.ts'), 'x\n');
      const g = simpleGit(dir);
      await g.add('.');
      await g.commit('init');

      const untrackedPath = path.join(dir, 'tmp.txt');
      await fs.writeFile(untrackedPath, 'hello\n');

      await discardPaths({ cwd: dir, paths: ['tmp.txt'] });

      await expect(fs.access(untrackedPath)).rejects.toThrow();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('unstages and then restores staged file', async () => {
    const { dir, g } = await makeTmpRepo();
    try {
      const filePath = path.join(dir, 'a.ts');
      await fs.writeFile(filePath, 'original\n');
      await g.add('.');
      await g.commit('init');

      await fs.writeFile(filePath, 'modified\n');
      await g.add('a.ts');

      // File is staged; discard should unstage + restore worktree
      await discardPaths({ cwd: dir, paths: ['a.ts'] });

      const restored = await fs.readFile(filePath, 'utf-8');
      expect(restored).toBe('original\n');

      const summary = await getChanges({ cwd: dir });
      expect(summary.stagedCount).toBe(0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('commitSelection', () => {
  it('commits only explicitly staged files (no implicit add -A)', async () => {
    const { dir, g } = await makeTmpRepo();
    try {
      // Setup: initial commit
      await fs.writeFile(path.join(dir, 'a.ts'), 'v1\n');
      await fs.writeFile(path.join(dir, 'b.ts'), 'b1\n');
      await g.add('.');
      await g.commit('init');

      // Modify both, stage only a.ts
      await fs.writeFile(path.join(dir, 'a.ts'), 'v2\n');
      await fs.writeFile(path.join(dir, 'b.ts'), 'b2\n');
      await g.add('a.ts');

      await commitSelection({ cwd: dir, message: 'update a only' });

      // After commit, a.ts should be at v2 in HEAD, b.ts still dirty
      const log = await g.log({ n: 1 });
      expect(log.latest?.message).toBe('update a only');

      // b.ts should still be modified (not committed)
      const status = await getChanges({ cwd: dir });
      const bEntry = status.files.find((f) => f.path === 'b.ts');
      expect(bEntry).toBeDefined();
      // b.ts is unstaged modified
      expect(bEntry?.workTreeStatus).toBe('M');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('throws when nothing is staged', async () => {
    const { dir, g } = await makeTmpRepo();
    try {
      await fs.writeFile(path.join(dir, 'a.ts'), 'v1\n');
      await g.add('.');
      await g.commit('init');

      // No staging
      await fs.writeFile(path.join(dir, 'a.ts'), 'v2\n');

      await expect(commitSelection({ cwd: dir, message: 'nothing staged' })).rejects.toThrow(
        'nothing_staged'
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
