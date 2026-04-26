/**
 * Staged-aware git status primitives for the Workspace Inspector.
 *
 * Provides:
 *  - parsePorcelainStatus   — pure parser for git porcelain status
 *  - getChanges             — read current working-tree status
 *  - stagePaths             — `git add <paths>`
 *  - unstagePaths           — `git restore --staged <paths>`
 *  - discardPaths           — restore tracked files / delete untracked files
 *  - commitSelection        — commit only already-staged changes (no add -A)
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PorcelainFileEntry {
  /** Two-character short-status index column (space = unmodified, '?' = untracked). */
  indexStatus: string;
  /** Two-character short-status worktree column. */
  workTreeStatus: string;
  path: string;
  origPath?: string;
}

export interface PorcelainStatusResult {
  dirty: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  files: PorcelainFileEntry[];
}

export interface GetChangesArgs {
  cwd: string;
}

export interface PathsArgs {
  cwd: string;
  paths: string[];
}

export interface CommitSelectionArgs {
  cwd: string;
  message: string;
  /** Optional author in `Name <email>` format. */
  author?: string;
}

// ---------------------------------------------------------------------------
// Porcelain parser
// ---------------------------------------------------------------------------

/**
 * Parse `git status --short` / `git status --porcelain` output lines into a
 * structured summary.
 *
 * Each line has the form `XY path` where:
 *   X = index (staged) column  — space means unmodified
 *   Y = worktree column        — space means unmodified
 *   For untracked: `?? path`
 *   For renames:   `XY old -> new`
 *
 * Shared porcelain parser for git status summaries.
 */
export function parsePorcelainStatus(lines: string[]): PorcelainStatusResult {
  let stagedCount = 0;
  let unstagedCount = 0;
  let untrackedCount = 0;
  const files: PorcelainFileEntry[] = [];

  for (const line of lines) {
    if (!line || line.startsWith('##')) continue;

    const xy = line.slice(0, 2);
    const X = xy[0] ?? ' ';
    const Y = xy[1] ?? ' ';

    // Untracked
    if (X === '?' && Y === '?') {
      untrackedCount++;
      files.push({ indexStatus: '?', workTreeStatus: '?', path: line.slice(3).trim() });
      continue;
    }

    // Rename detection: `XY old -> new` or `XY new\0old` (porcelain v1 uses space-separated)
    let filePath = line.slice(3).trim();
    let origPath: string | undefined;
    const arrowIdx = filePath.indexOf(' -> ');
    if (arrowIdx !== -1) {
      origPath = filePath.slice(0, arrowIdx);
      filePath = filePath.slice(arrowIdx + 4);
    }

    if (X !== ' ') stagedCount++;
    if (Y !== ' ') unstagedCount++;

    files.push({ indexStatus: X, workTreeStatus: Y, path: filePath, origPath });
  }

  const dirty = stagedCount > 0 || unstagedCount > 0 || untrackedCount > 0;
  return { dirty, stagedCount, unstagedCount, untrackedCount, files };
}

// ---------------------------------------------------------------------------
// IPC action implementations
// ---------------------------------------------------------------------------

/** Return the current working-tree status for `cwd`. */
export async function getChanges(args: GetChangesArgs): Promise<PorcelainStatusResult> {
  const g = simpleGit(args.cwd);
  const raw = await g.raw(['status', '--short']);
  const lines = raw.split(/\r?\n/).filter(Boolean);
  return parsePorcelainStatus(lines);
}

/** Stage the specified paths (`git add -- <paths>`). */
export async function stagePaths(args: PathsArgs): Promise<void> {
  if (args.paths.length === 0) return;
  const g = simpleGit(args.cwd);
  await g.add(['--', ...args.paths]);
}

/**
 * Unstage the specified paths (`git restore --staged -- <paths>`).
 *
 * Falls back to `git reset HEAD -- <paths>` for older git versions that do
 * not support `restore`.
 */
export async function unstagePaths(args: PathsArgs): Promise<void> {
  if (args.paths.length === 0) return;
  const g = simpleGit(args.cwd);
  try {
    await g.raw(['restore', '--staged', '--', ...args.paths]);
  } catch {
    await g.raw(['reset', 'HEAD', '--', ...args.paths]);
  }
}

/**
 * Discard changes in the specified paths.
 *
 * Behaviour by file state:
 *  - Staged (index modified): first unstage via `git restore --staged`, then
 *    restore worktree via `git restore --worktree --source=HEAD`.
 *  - Tracked & modified in worktree only: `git restore --worktree --source=HEAD`.
 *  - Untracked (??): delete the file from disk.
 *
 * The caller is responsible for obtaining user confirmation before calling this
 * for untracked files (the renderer confirmation flow is a UI concern; the
 * backend primitive deletes unconditionally when asked).
 */
export async function discardPaths(args: PathsArgs): Promise<void> {
  if (args.paths.length === 0) return;
  const g = simpleGit(args.cwd);

  // Read current status to classify each path
  const raw = await g.raw(['status', '--short', '--', ...args.paths]);
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const status = parsePorcelainStatus(lines);

  // Newly staged files (indexStatus='A') have no HEAD version — they must be
  // deleted after unstage rather than restored from HEAD.
  const stagedAddedPaths: string[] = [];
  // Staged files that exist in HEAD — safe to restore after unstage.
  const stagedModifiedPaths: string[] = [];
  const trackedDirtyPaths: string[] = [];
  const untrackedPaths: string[] = [];

  for (const entry of status.files) {
    if (entry.indexStatus === '?' && entry.workTreeStatus === '?') {
      untrackedPaths.push(entry.path);
    } else if (entry.indexStatus === 'A') {
      // New file staged for addition — no HEAD revision exists.
      stagedAddedPaths.push(entry.path);
    } else {
      if (entry.indexStatus !== ' ') stagedModifiedPaths.push(entry.path);
      // Worktree needs restore if it differs from index/HEAD
      if (entry.workTreeStatus !== ' ') trackedDirtyPaths.push(entry.path);
    }
  }

  // Paths requested but not appearing in status (already clean): skip silently.

  // 1. Unstage all staged paths
  const allStagedPaths = [...stagedAddedPaths, ...stagedModifiedPaths];
  if (allStagedPaths.length > 0) {
    try {
      await g.raw(['restore', '--staged', '--', ...allStagedPaths]);
    } catch {
      await g.raw(['reset', 'HEAD', '--', ...allStagedPaths]);
    }
  }

  // 2. Delete newly-added files — they have no HEAD version to restore from.
  for (const p of stagedAddedPaths) {
    const abs = path.resolve(args.cwd, p);
    await fs.rm(abs, { recursive: true, force: true });
  }

  // 3. Restore tracked worktree files to HEAD (excludes staged-added paths).
  const toRestoreWorktree = Array.from(
    new Set([...stagedModifiedPaths, ...trackedDirtyPaths])
  );
  if (toRestoreWorktree.length > 0) {
    try {
      await g.raw(['restore', '--worktree', '--source=HEAD', '--', ...toRestoreWorktree]);
    } catch {
      await g.raw(['checkout', 'HEAD', '--', ...toRestoreWorktree]);
    }
  }

  // 4. Delete untracked files
  for (const p of untrackedPaths) {
    const abs = path.resolve(args.cwd, p);
    await fs.rm(abs, { recursive: true, force: true });
  }
}

/**
 * Commit whatever is currently staged in `cwd` without any implicit `git add`.
 * Throws `Error('nothing_staged')` if the index is clean.
 */
export async function commitSelection(args: CommitSelectionArgs): Promise<{ sha: string }> {
  const g = simpleGit(args.cwd);

  // Verify something is actually staged
  const raw = await g.raw(['status', '--short']);
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const { stagedCount } = parsePorcelainStatus(lines);
  if (stagedCount === 0) {
    const err = new Error('nothing_staged') as Error & { code?: string };
    err.code = 'nothing_staged';
    throw err;
  }

  const commitArgs: string[] = ['commit', '-m', args.message];
  if (args.author) commitArgs.push('--author', args.author);
  await g.raw(commitArgs);
  const sha = (await g.raw(['rev-parse', 'HEAD'])).trim();
  return { sha };
}
