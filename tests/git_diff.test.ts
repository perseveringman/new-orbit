import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { computeMergeBaseDiff, parseNumstat, getStagedFileSummary } from '../src/main/git/diff';

describe('parseNumstat', () => {
  it('parses happy path', () => {
    const raw = '3\t1\tsrc/a.ts\n10\t0\tsrc/b.ts\n';
    expect(parseNumstat(raw)).toEqual([
      { path: 'src/a.ts', oldPath: undefined, additions: 3, deletions: 1 },
      { path: 'src/b.ts', oldPath: undefined, additions: 10, deletions: 0 }
    ]);
  });

  it('marks binary files with null counts', () => {
    const raw = '-\t-\tassets/logo.png\n';
    const [entry] = parseNumstat(raw);
    expect(entry.additions).toBeNull();
    expect(entry.deletions).toBeNull();
    expect(entry.path).toBe('assets/logo.png');
  });

  it('extracts rename pairs in brace form', () => {
    const raw = '2\t3\tsrc/{old => new}/file.ts\n';
    const [entry] = parseNumstat(raw);
    expect(entry.path).toBe('src/new/file.ts');
    expect(entry.oldPath).toBe('src/old/file.ts');
  });

  it('extracts rename pairs in plain form', () => {
    const raw = '1\t1\told.md => new.md\n';
    const [entry] = parseNumstat(raw);
    expect(entry.path).toBe('new.md');
    expect(entry.oldPath).toBe('old.md');
  });

  it('tolerates blank lines', () => {
    expect(parseNumstat('\n\n')).toEqual([]);
  });
});

async function initRepo(dir: string): Promise<ReturnType<typeof simpleGit>> {
  const g = simpleGit(dir);
  await g.init();
  await g.addConfig('user.email', 'a@b');
  await g.addConfig('user.name', 't');
  await g.addConfig('commit.gpgsign', 'false');
  // Ensure the initial branch is deterministic
  await g.raw(['checkout', '-b', 'main']).catch(() => undefined);
  return g;
}

describe('computeMergeBaseDiff', () => {
  it('returns file diffs vs merge-base', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-diff-'));
    try {
      const g = await initRepo(dir);
      const file = path.join(dir, 'hello.txt');
      await fs.writeFile(file, 'one\ntwo\nthree\n');
      await g.add('.');
      await g.commit('initial');

      await g.raw(['checkout', '-b', 'feature']);
      await fs.writeFile(file, 'one\ntwo\nthree\nfour\nfive\n');
      await g.add('.');
      await g.commit('add lines');

      const result = await computeMergeBaseDiff({ worktreePath: dir, base: 'main' });
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('hello.txt');
      expect(result.files[0].status).toBe('modified');
      expect(result.totalAdditions).toBeGreaterThan(0);
      expect(result.base).toBe('main');
      expect(result.head).toMatch(/^[0-9a-f]{40}$/);
      expect(result.mergeBase).toMatch(/^[0-9a-f]{40}$/);
      expect(result.files[0].patch).toContain('four');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('throws no_base_ref when neither main nor master exists', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-diff-nobase-'));
    try {
      const g = simpleGit(dir);
      await g.init();
      await g.addConfig('user.email', 'a@b');
      await g.addConfig('user.name', 't');
      await g.addConfig('commit.gpgsign', 'false');
      await g.raw(['checkout', '-b', 'develop']);
      const f = path.join(dir, 'x.txt');
      await fs.writeFile(f, 'x');
      await g.add('.');
      await g.commit('init');

      await expect(computeMergeBaseDiff({ worktreePath: dir })).rejects.toThrow('no_base_ref');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('getStagedFileSummary', () => {
  it('returns numstat entries for currently staged changes', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-staged-'));
    try {
      const g = await initRepo(dir);

      // Initial commit
      await fs.writeFile(path.join(dir, 'a.ts'), 'line1\n');
      await g.add('.');
      await g.commit('init');

      // Stage a modification and a new file
      await fs.writeFile(path.join(dir, 'a.ts'), 'line1\nline2\n');
      await fs.writeFile(path.join(dir, 'b.ts'), 'new\n');
      await g.add(['a.ts', 'b.ts']);

      const entries = await getStagedFileSummary(dir);

      expect(entries.length).toBe(2);
      const aEntry = entries.find((e) => e.path === 'a.ts');
      const bEntry = entries.find((e) => e.path === 'b.ts');
      expect(aEntry?.additions).toBeGreaterThan(0);
      expect(bEntry?.additions).toBeGreaterThan(0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('returns empty array when nothing is staged', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-staged-empty-'));
    try {
      const g = await initRepo(dir);
      await fs.writeFile(path.join(dir, 'a.ts'), 'v1\n');
      await g.add('.');
      await g.commit('init');

      // Modify but do not stage
      await fs.writeFile(path.join(dir, 'a.ts'), 'v2\n');

      const entries = await getStagedFileSummary(dir);
      expect(entries).toEqual([]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('getWorkingTreeDiff', () => {
  it('returns current tracked working-tree diffs relative to HEAD', async () => {
    const mod = (await import('../src/main/git/diff')) as Record<string, unknown>;
    const getWorkingTreeDiff = mod['getWorkingTreeDiff'] as
      | ((cwd: string, pathspec?: string[]) => Promise<Array<{ path: string; patch: string }>>)
      | undefined;

    expect(getWorkingTreeDiff).toBeTypeOf('function');

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-working-tree-diff-'));
    try {
      const g = await initRepo(dir);
      await fs.writeFile(path.join(dir, 'a.ts'), 'line1\n');
      await g.add('.');
      await g.commit('init');

      await fs.writeFile(path.join(dir, 'a.ts'), 'line1\nline2\n');

      const files = await getWorkingTreeDiff?.(dir);
      expect(files?.map((file) => file.path)).toContain('a.ts');
      expect(files?.[0]?.patch).toContain('+line2');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
