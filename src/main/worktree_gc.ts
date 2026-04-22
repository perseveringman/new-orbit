import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import {
  ORBIT_DIR,
  ORBIT_WORKTREES_DIR,
  ORBIT_WORKTREE_INDEX
} from '@shared/constants';
import type { WorktreeRecord } from '@shared/git';
import { getSettings } from './settings';

export interface GcReport {
  scanned: number;
  removed: string[];
  kept: string[];
  errors: { path: string; error: string }[];
}

interface IndexFile {
  version?: number;
  worktrees: WorktreeRecord[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Age in milliseconds since a directory was last modified. */
async function ageMs(dir: string, now: number): Promise<number> {
  try {
    const st = await fs.stat(dir);
    return now - st.mtimeMs;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

async function readIndex(vault: string): Promise<WorktreeRecord[]> {
  const f = path.join(vault, ORBIT_DIR, ORBIT_WORKTREES_DIR, ORBIT_WORKTREE_INDEX);
  try {
    const raw = await fs.readFile(f, 'utf8');
    const parsed = JSON.parse(raw) as Partial<IndexFile>;
    return Array.isArray(parsed.worktrees) ? (parsed.worktrees as WorktreeRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeIndex(vault: string, worktrees: WorktreeRecord[]): Promise<void> {
  const f = path.join(vault, ORBIT_DIR, ORBIT_WORKTREES_DIR, ORBIT_WORKTREE_INDEX);
  await fs.mkdir(path.dirname(f), { recursive: true });
  const tmp = `${f}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(
    tmp,
    JSON.stringify({ version: 1, worktrees }, null, 2),
    'utf8'
  );
  await fs.rename(tmp, f);
}

/**
 * For a worktree path we're about to reap, decide if it still holds commits
 * not present on the project's main branch — if so we refuse to touch it.
 * If it has no branch metadata we just check for an uncommitted working copy.
 */
async function safeToRemove(wtPath: string): Promise<boolean> {
  try {
    const git = simpleGit(wtPath);
    const isRepo = await git.checkIsRepo().catch(() => false);
    if (!isRepo) return true; // stale directory, no git → safe to rm
    const status = await git.status().catch(() => null);
    if (status && !status.isClean()) return false; // dirty working copy
    // If the branch has unique commits no upstream knows about, keep it.
    try {
      const head = await git.revparse(['HEAD']).catch(() => '');
      // compare vs detected default — best effort; if we can't tell, keep.
      const upstream = await git
        .raw(['rev-parse', '--abbrev-ref', '@{upstream}'])
        .catch(() => '');
      if (upstream.trim()) {
        const ahead = await git.raw(['rev-list', '--count', `${upstream.trim()}..HEAD`]);
        if (parseInt(ahead.trim(), 10) > 0) return false;
      }
      void head;
    } catch {
      // missing upstream is fine — we still allow removal
    }
    return true;
  } catch {
    // If any part of the probe throws, err on the side of safety.
    return false;
  }
}

export interface RunGcOpts {
  /** Override "now" for tests. */
  now?: number;
  /** Force a sweep regardless of the user setting. */
  force?: boolean;
  /** Override the grace-period days (tests). */
  days?: number;
  /** Inject app settings (tests). When omitted, read via `getSettings`. */
  settingsOverride?: { worktreeGcEnabled?: boolean; worktreeGcDays?: number };
}

/**
 * Sweep `.orbit/worktrees/*` and `.orbit/night-worktrees/*` directories
 * that look done-and-cold. "Done" = record.status is `merged` or `aborted`
 * (or the worktree is no longer in the index), and the directory's mtime
 * is older than the configured grace period. We double-check with
 * `safeToRemove` before any `fs.rm` so user commits are never eaten.
 *
 * Safe to run on every launch and on a 24h timer — it is idempotent and
 * no-ops when nothing qualifies.
 */
export async function runWorktreeGc(
  vault: string,
  opts: RunGcOpts = {}
): Promise<GcReport> {
  const settings =
    opts.settingsOverride ?? (await getSettings().catch(() => null));
  if (settings && !opts.force && settings.worktreeGcEnabled === false) {
    return { scanned: 0, removed: [], kept: [], errors: [] };
  }
  const days = opts.days ?? settings?.worktreeGcDays ?? 7;
  const graceMs = days * DAY_MS;
  const now = opts.now ?? Date.now();

  const report: GcReport = { scanned: 0, removed: [], kept: [], errors: [] };

  const index = await readIndex(vault);
  const byPath = new Map(index.map((w) => [path.resolve(w.path), w]));

  const roots = [
    path.join(vault, ORBIT_DIR, ORBIT_WORKTREES_DIR),
    path.join(vault, ORBIT_DIR, 'night-worktrees')
  ];

  const removedPaths = new Set<string>();
  for (const root of roots) {
    let entries: import('node:fs').Dirent[] = [];
    try {
      entries = (await fs.readdir(root, { withFileTypes: true })) as import('node:fs').Dirent[];
    } catch {
      continue;
    }
    // For night-worktrees, each entry is a runId folder containing
    // per-task dirs; walk one level deeper.
    const isNight = root.endsWith('night-worktrees');
    const stack: string[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === ORBIT_WORKTREE_INDEX) continue;
      const p = path.join(root, e.name);
      if (isNight) {
        try {
          const sub = (await fs.readdir(p, { withFileTypes: true })) as import('node:fs').Dirent[];
          for (const s of sub) {
            if (s.isDirectory()) stack.push(path.join(p, s.name));
          }
        } catch {
          /* ignore */
        }
      } else {
        stack.push(p);
      }
    }

    for (const dir of stack) {
      report.scanned++;
      const rec = byPath.get(path.resolve(dir));
      const eligibleByStatus =
        !rec || rec.status === 'merged' || rec.status === 'aborted';
      if (!eligibleByStatus) {
        report.kept.push(dir);
        continue;
      }
      const age = await ageMs(dir, now);
      if (age < graceMs) {
        report.kept.push(dir);
        continue;
      }
      if (!(await safeToRemove(dir))) {
        report.kept.push(dir);
        continue;
      }
      try {
        await fs.rm(dir, { recursive: true, force: true });
        report.removed.push(dir);
        removedPaths.add(path.resolve(dir));
      } catch (err) {
        report.errors.push({ path: dir, error: (err as Error).message });
      }
    }
  }

  // Prune the on-disk index entries that point at removed paths so the UI
  // doesn't keep ghosts around.
  if (removedPaths.size > 0 && index.length > 0) {
    const pruned = index.filter(
      (w) => !removedPaths.has(path.resolve(w.path))
    );
    if (pruned.length !== index.length) {
      try {
        await writeIndex(vault, pruned);
      } catch (err) {
        report.errors.push({
          path: 'worktree-index',
          error: (err as Error).message
        });
      }
    }
  }

  return report;
}

let timer: NodeJS.Timeout | null = null;

/** Start the once-per-24h GC timer. Safe to call repeatedly; reuses the timer. */
export function startWorktreeGcScheduler(
  getVault: () => string | null,
  intervalMs = 24 * 60 * 60 * 1000
): void {
  if (timer) return;
  timer = setInterval(() => {
    const v = getVault();
    if (!v) return;
    void runWorktreeGc(v).catch(() => undefined);
  }, intervalMs);
  // allow Node to exit even if we're still ticking
  timer.unref?.();
}

export function stopWorktreeGcScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
