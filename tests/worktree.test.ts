import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SimpleGit } from 'simple-git';
import { WorktreeManager } from '../src/main/git/worktree';
import { GitQueue } from '../src/main/git/queue';

/**
 * A fake SimpleGit that records every `.raw()` call and simulates a
 * tiny subset of behavior: worktree add/remove/list, branchLocal, and
 * symbolic-ref/rev-parse.
 */
function fakeGitFactory(state: FakeState) {
  return ((cwd?: string): SimpleGit => {
    const used = cwd ?? '.';
    state.lastCwd = used;
    return {
      raw: async (args: string[]): Promise<string> => {
        state.calls.push({ cwd: used, args: [...args] });
        // `worktree add -b <branch> <path> <base>`
        if (args[0] === 'worktree' && args[1] === 'add') {
          const pathIdx = args[2] === '-b' ? 4 : 2;
          const p = args[pathIdx];
          if (p) {
            await fs.mkdir(p, { recursive: true });
            state.liveWorktrees.add(path.resolve(p));
          }
          return '';
        }
        if (args[0] === 'worktree' && args[1] === 'remove') {
          const p = args[args.length - 1];
          if (p) {
            state.liveWorktrees.delete(path.resolve(p));
            await fs.rm(p, { recursive: true, force: true }).catch(() => undefined);
          }
          return '';
        }
        if (args[0] === 'worktree' && args[1] === 'list') {
          const lines: string[] = [];
          for (const p of state.liveWorktrees) {
            lines.push(`worktree ${p}`);
            lines.push('HEAD 0000000000000000000000000000000000000000');
            lines.push('');
          }
          return lines.join('\n');
        }
        if (args[0] === 'worktree' && args[1] === 'prune') return '';
        if (args[0] === 'branch' && args[1] === '-D') return '';
        if (args[0] === 'symbolic-ref') return 'main\n';
        if (args[0] === 'rev-parse') return 'deadbeef\n';
        return '';
      },
      branchLocal: async () => ({ all: ['main'], current: 'main' })
    } as unknown as SimpleGit;
  }) as unknown as import('simple-git').SimpleGitFactory;
}

interface FakeState {
  calls: Array<{ cwd: string; args: string[] }>;
  liveWorktrees: Set<string>;
  lastCwd: string | null;
}

function newState(): FakeState {
  return { calls: [], liveWorktrees: new Set(), lastCwd: null };
}

describe('WorktreeManager', () => {
  it('create() places a worktree under .orbit/worktrees and records it', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-wt-'));
    try {
      const state = newState();
      let n = 0;
      const mgr = new WorktreeManager({
        vault,
        gitFactory: fakeGitFactory(state),
        shortId: () => `id${n++}`
      });
      const r = await mgr.create({ taskId: 'file:foo' });
      expect(r.id).toBe('id0');
      expect(r.branch).toBe('orbit/ghost/id0');
      expect(r.path).toBe(
        path.join(vault, '.orbit', 'worktrees', 'id0')
      );
      expect(r.status).toBe('active');
      // index.json was written
      const idxRaw = await fs.readFile(
        path.join(vault, '.orbit', 'worktrees', 'index.json'),
        'utf8'
      );
      expect(JSON.parse(idxRaw).worktrees).toHaveLength(1);
      // used git worktree add
      expect(
        state.calls.some((c) => c.args[0] === 'worktree' && c.args[1] === 'add')
      ).toBe(true);
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('two concurrent create()s produce distinct worktrees in FIFO order', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-wt-'));
    try {
      const state = newState();
      let n = 0;
      const queue = new GitQueue();
      const mgr = new WorktreeManager({
        vault,
        gitFactory: fakeGitFactory(state),
        shortId: () => `id${n++}`,
        queue
      });
      const [a, b] = await Promise.all([mgr.create(), mgr.create()]);
      expect(a.id).not.toBe(b.id);
      expect(new Set([a.id, b.id]).size).toBe(2);
      const idxRaw = await fs.readFile(
        path.join(vault, '.orbit', 'worktrees', 'index.json'),
        'utf8'
      );
      expect(JSON.parse(idxRaw).worktrees).toHaveLength(2);
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('resetAll only removes worktrees under .orbit/worktrees with ghost branches', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-wt-'));
    try {
      const state = newState();
      const mgr = new WorktreeManager({
        vault,
        gitFactory: fakeGitFactory(state),
        shortId: (() => {
          let i = 0;
          return () => `id${i++}`;
        })()
      });
      // Create one legitimate ghost worktree.
      await mgr.create();

      // Hand-craft an index with an OUTSIDE worktree + a non-ghost branch
      // worktree. Both must be untouched by resetAll().
      const indexPath = path.join(vault, '.orbit', 'worktrees', 'index.json');
      const idx = JSON.parse(await fs.readFile(indexPath, 'utf8'));
      idx.worktrees.push({
        id: 'outside',
        branch: 'orbit/ghost/outside',
        path: '/tmp/elsewhere',
        createdAt: new Date().toISOString(),
        status: 'active'
      });
      idx.worktrees.push({
        id: 'notghost',
        branch: 'feature/nope',
        path: path.join(vault, '.orbit', 'worktrees', 'notghost'),
        createdAt: new Date().toISOString(),
        status: 'active'
      });
      await fs.writeFile(indexPath, JSON.stringify(idx), 'utf8');

      const r = await mgr.resetAll();
      expect(r.removed).toBe(1);
      const afterRaw = await fs.readFile(indexPath, 'utf8');
      const after = JSON.parse(afterRaw).worktrees as Array<{ id: string }>;
      const ids = after.map((w) => w.id).sort();
      // Ghost worktree `id0` is removed. Outside + non-ghost remain.
      expect(ids).toEqual(['notghost', 'outside']);
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});
