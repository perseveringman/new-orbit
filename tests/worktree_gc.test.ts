import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { runWorktreeGc } from '../src/main/worktree_gc';

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-wt-gc-'));
  await createVault(d);
  return d;
}

async function touchOld(dir: string, daysOld: number): Promise<void> {
  const t = (Date.now() - daysOld * 24 * 60 * 60 * 1000) / 1000;
  await fs.utimes(dir, t, t);
}

describe('worktree_gc (R7)', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('leaves fresh directories alone even when they are in a terminal state', async () => {
    const wtDir = path.join(vault, '.orbit', 'worktrees', 'wt-1');
    await fs.mkdir(wtDir, { recursive: true });
    const indexPath = path.join(vault, '.orbit', 'worktrees', 'index.json');
    await fs.writeFile(
      indexPath,
      JSON.stringify({
        version: 1,
        worktrees: [
          {
            id: 'wt-1',
            branch: 'orbit/ghost/wt-1',
            path: wtDir,
            createdAt: new Date().toISOString(),
            status: 'merged'
          }
        ]
      })
    );

    const report = await runWorktreeGc(vault, { days: 7, force: true });
    expect(report.removed).toEqual([]);
    expect(report.kept).toContain(wtDir);
    expect(
      await fs
        .access(wtDir)
        .then(() => true)
        .catch(() => false)
    ).toBe(true);
  });

  it('removes merged worktrees older than the grace period', async () => {
    const wtDir = path.join(vault, '.orbit', 'worktrees', 'wt-old');
    await fs.mkdir(wtDir, { recursive: true });
    await touchOld(wtDir, 30);
    const indexPath = path.join(vault, '.orbit', 'worktrees', 'index.json');
    await fs.writeFile(
      indexPath,
      JSON.stringify({
        version: 1,
        worktrees: [
          {
            id: 'wt-old',
            branch: 'orbit/ghost/wt-old',
            path: wtDir,
            createdAt: new Date().toISOString(),
            status: 'merged'
          }
        ]
      })
    );

    const report = await runWorktreeGc(vault, { days: 7, force: true });
    expect(report.removed).toContain(wtDir);
    expect(
      await fs
        .access(wtDir)
        .then(() => true)
        .catch(() => false)
    ).toBe(false);

    // Index entry is pruned.
    const afterRaw = JSON.parse(await fs.readFile(indexPath, 'utf8')) as {
      worktrees: { id: string }[];
    };
    expect(afterRaw.worktrees.find((w) => w.id === 'wt-old')).toBeUndefined();
  });

  it('cleans night-worktree run folders beyond grace', async () => {
    const runDir = path.join(
      vault,
      '.orbit',
      'night-worktrees',
      'run-123',
      'task-abc'
    );
    await fs.mkdir(runDir, { recursive: true });
    await touchOld(runDir, 14);

    const report = await runWorktreeGc(vault, { days: 7, force: true });
    expect(report.removed).toContain(runDir);
  });

  it('skips when the feature is disabled via settings', async () => {
    const wtDir = path.join(vault, '.orbit', 'worktrees', 'wt-disabled');
    await fs.mkdir(wtDir, { recursive: true });
    await touchOld(wtDir, 30);

    const report = await runWorktreeGc(vault, {
      days: 7,
      settingsOverride: { worktreeGcEnabled: false, worktreeGcDays: 7 }
    });
    expect(report.removed).toEqual([]);
    expect(
      await fs
        .access(wtDir)
        .then(() => true)
        .catch(() => false)
    ).toBe(true);
  });
});
