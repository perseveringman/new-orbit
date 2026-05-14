import { promises as fs } from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { simpleGit, type SimpleGit, type SimpleGitFactory } from 'simple-git';
import {
  ORBIT_DIR,
  ORBIT_GHOST_BRANCH_PREFIX,
  ORBIT_WORKTREE_INDEX,
  ORBIT_WORKTREES_DIR
} from '@shared/constants';
import type { ResetAllResult, WorktreeRecord } from '@shared/git';
import { getGitQueue, type GitQueue } from './queue';
import { appendGitLog } from './log';
import { runProjectLifecycle } from '../project_lifecycle';
import { runPhases } from '../util/phase';

/**
 * Pure policy check: a ghost branch is one we created ourselves under the
 * `orbit/ghost/` prefix. The IPC layer uses this to reject
 * `git.ghostCommit` and unintended auto-branch deletes when the worktree
 * happens to track a user-owned branch.
 */
export function isGhostBranch(branch: string): boolean {
  return branch.startsWith(ORBIT_GHOST_BRANCH_PREFIX);
}

export interface WorktreeManagerDeps {
  /** Legacy root; also used as repo root when repoRoot is omitted. */
  vault: string;
  /** Git repository root. */
  repoRoot?: string;
  /** Root directory that stores Orbit-created git worktrees. */
  worktreeRoot?: string;
  /** Vault root for logs and global Orbit state. */
  vaultPath?: string;
  /** Project coordination directory used for lifecycle config. */
  projectPath?: string;
  /** Override simple-git factory (tests). */
  gitFactory?: SimpleGitFactory;
  /** Override short-id generator (tests). */
  shortId?: () => string;
  /** Shared queue. Defaults to the global one. */
  queue?: GitQueue;
}

interface IndexFile {
  version: 1;
  worktrees: WorktreeRecord[];
}

function worktreesDir(vault: string): string {
  return path.join(vault, ORBIT_DIR, ORBIT_WORKTREES_DIR);
}

function indexFile(root: string): string {
  return path.join(root, ORBIT_WORKTREE_INDEX);
}

async function readIndex(root: string): Promise<IndexFile> {
  try {
    const raw = await fs.readFile(indexFile(root), 'utf8');
    const parsed = JSON.parse(raw) as Partial<IndexFile>;
    if (parsed && Array.isArray(parsed.worktrees)) {
      return { version: 1, worktrees: parsed.worktrees as WorktreeRecord[] };
    }
  } catch {
    // fall through
  }
  return { version: 1, worktrees: [] };
}

async function writeIndex(root: string, data: IndexFile): Promise<void> {
  const p = indexFile(root);
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, p);
}

export interface CreateOpts {
  name?: string;
  baseRef?: string;
  taskId?: string;
}

export interface RemoveOpts {
  force?: boolean;
}

/**
 * Manages `<vault>/.orbit/worktrees/` — one git worktree per ghost branch.
 *
 * All filesystem + `git worktree` operations are serialized through the
 * shared `GitQueue` under scope `'global'` to avoid races on the git index.
 * Per-worktree commit ops run under `cwd:<abs-path>`.
 */
export class WorktreeManager {
  private readonly vault: string;
  private readonly repoRoot: string;
  private readonly worktreeRoot: string;
  private readonly vaultPath: string;
  private readonly projectPath: string;
  private readonly gitFactory: SimpleGitFactory;
  private readonly shortId: () => string;
  private readonly queue: GitQueue;

  constructor(deps: WorktreeManagerDeps) {
    this.vault = deps.vault;
    this.repoRoot = deps.repoRoot ?? deps.vault;
    this.worktreeRoot = deps.worktreeRoot ?? worktreesDir(deps.vault);
    this.vaultPath = deps.vaultPath ?? deps.vault;
    this.projectPath = deps.projectPath ?? deps.vault;
    this.gitFactory = deps.gitFactory ?? simpleGit;
    this.shortId = deps.shortId ?? ((): string => nanoid(8));
    this.queue = deps.queue ?? getGitQueue();
  }

  private root(): SimpleGit {
    return this.gitFactory(this.repoRoot);
  }

  /** Create a ghost worktree at `<vault>/.orbit/worktrees/<shortId>`. */
  async create(opts: CreateOpts = {}): Promise<WorktreeRecord> {
    return this.queue.run('global', async () => {
      const id = this.shortId();
      const branch = `${ORBIT_GHOST_BRANCH_PREFIX}${id}`;
      const absPath = path.join(this.worktreeRoot, id);
      await fs.mkdir(path.dirname(absPath), { recursive: true });

      const base = opts.baseRef ?? (await this.defaultBranch());
      const g = this.root();
      try {
        // `git worktree add -b <branch> <path> <base>` creates branch + checkout.
        await g.raw(['worktree', 'add', '-b', branch, absPath, base]);
        await runProjectLifecycle('setup', {
          projectPath: this.projectPath,
          vaultPath: this.vaultPath,
          worktreeId: id,
          cwd: absPath
        });
      } catch (e) {
        // cleanup partial directory
        try {
          await fs.rm(absPath, { recursive: true, force: true });
        } catch {
          // ignore
        }
        await appendGitLog(this.vaultPath, {
          op: 'worktree.create.error',
          id,
          branch,
          error: (e as Error).message
        });
        throw e;
      }
      const rec: WorktreeRecord = {
        id,
        branch,
        path: absPath,
        createdAt: new Date().toISOString(),
        status: 'active'
      };
      if (opts.taskId) rec.taskId = opts.taskId;

      const idx = await readIndex(this.worktreeRoot);
      idx.worktrees.push(rec);
      await writeIndex(this.worktreeRoot, idx);

      await appendGitLog(this.vaultPath, {
        op: 'worktree.create',
        id,
        branch,
        path: absPath,
        taskId: opts.taskId ?? null
      });
      return rec;
    });
  }

  async list(): Promise<WorktreeRecord[]> {
    return this.queue.run('global', async () => {
      const idx = await readIndex(this.worktreeRoot);
      // Reconcile with `git worktree list --porcelain` — drop records whose
      // path no longer exists, keep git-reported ones that we recorded.
      let live = new Set<string>();
      try {
        const out = await this.root().raw(['worktree', 'list', '--porcelain']);
        live = parseWorktreeList(out);
      } catch {
        // if git fails, just trust our index
        return idx.worktrees;
      }
      const reconciled = idx.worktrees.map((w) => {
        if (!live.has(path.resolve(w.path))) {
          return { ...w, status: w.status === 'active' ? 'aborted' : w.status };
        }
        return w;
      });
      return reconciled;
    });
  }

  async remove(id: string, opts: RemoveOpts = {}): Promise<void> {
    return this.queue.run('global', async () => {
      const idx = await readIndex(this.worktreeRoot);
      const rec = idx.worktrees.find((w) => w.id === id);
      if (!rec) throw new Error(`worktree not found: ${id}`);
      const g = this.root();
      const result = await runPhases(
        { id, rec, g, idx },
        [
          {
            name: 'preflight',
            run: async () => undefined
          },
          {
            name: 'teardown',
            run: async () => {
              await runProjectLifecycle('teardown', {
                projectPath: this.projectPath,
                vaultPath: this.vaultPath,
                worktreeId: id,
                cwd: rec.path
              });
            }
          },
          {
            name: 'commit',
            run: async () => {
              try {
                await g.raw(['worktree', 'remove', rec.path]);
              } catch (e) {
                if (opts.force) {
                  await g.raw(['worktree', 'remove', '--force', rec.path]);
                } else {
                  throw e;
                }
              }
              if (opts.force && rec.branch.startsWith(ORBIT_GHOST_BRANCH_PREFIX)) {
                try {
                  await g.raw(['branch', '-D', rec.branch]);
                } catch {
                  // ignore — branch may already be gone
                }
              }
            }
          },
          {
            name: 'cleanup',
            run: async () => {
              idx.worktrees = idx.worktrees.filter((w) => w.id !== id);
              await writeIndex(this.worktreeRoot, idx);
              await appendGitLog(this.vaultPath, { op: 'worktree.remove', id, force: !!opts.force });
            }
          }
        ],
        (phase, status) => {
          if (status === 'fail') {
            void appendGitLog(this.vaultPath, {
              op: 'worktree.remove.phase',
              id,
              phase,
              force: !!opts.force
            });
          }
        }
      );
      if (!result.committed && result.error) {
        await appendGitLog(this.vaultPath, {
          op: 'worktree.remove.error',
          id,
          error: result.error.message
        });
        throw result.error;
      }
    });
  }

  /**
   * One-click clear: remove every worktree currently under
   * `.orbit/worktrees/` whose branch is `orbit/ghost/*`. Uses `--force`
   * because these are by design throwaway branches.
   */
  async resetAll(): Promise<ResetAllResult> {
    return this.queue.run('global', async () => {
      const idx = await readIndex(this.worktreeRoot);
      const root = this.worktreeRoot;
      const targets = idx.worktrees.filter(
        (w) =>
          w.branch.startsWith(ORBIT_GHOST_BRANCH_PREFIX) &&
          path.resolve(w.path).startsWith(path.resolve(root) + path.sep)
      );
      const errors: ResetAllResult['errors'] = [];
      let removed = 0;
      for (const w of targets) {
        try {
          const g = this.root();
          try {
            await g.raw(['worktree', 'remove', '--force', w.path]);
          } catch {
            // orphaned directory — fall back to fs removal
            try {
              await fs.rm(w.path, { recursive: true, force: true });
            } catch {
              // ignore
            }
            try {
              await g.raw(['worktree', 'prune']);
            } catch {
              // ignore
            }
          }
          try {
            await g.raw(['branch', '-D', w.branch]);
          } catch {
            // ignore
          }
          removed += 1;
        } catch (e) {
          errors.push({ id: w.id, error: (e as Error).message });
        }
      }
      idx.worktrees = idx.worktrees.filter(
        (w) => !targets.some((t) => t.id === w.id)
      );
      await writeIndex(this.worktreeRoot, idx);
      await appendGitLog(this.vaultPath, {
        op: 'worktree.resetAll',
        removed,
        errors: errors.length
      });
      return { removed, errors };
    });
  }

  /** Look up a record by id (bypasses queue; read-only). */
  async get(id: string): Promise<WorktreeRecord | null> {
    const idx = await readIndex(this.worktreeRoot);
    return idx.worktrees.find((w) => w.id === id) ?? null;
  }

  /** Mark status in the index (used after merges). */
  async setStatus(id: string, status: WorktreeRecord['status']): Promise<void> {
    const idx = await readIndex(this.worktreeRoot);
    const rec = idx.worktrees.find((w) => w.id === id);
    if (!rec) return;
    rec.status = status;
    await writeIndex(this.worktreeRoot, idx);
  }

  private async defaultBranch(): Promise<string> {
    const g = this.root();
    try {
      const out = await g.raw(['symbolic-ref', '--quiet', '--short', 'HEAD']);
      const trimmed = out.trim();
      if (trimmed) return trimmed;
    } catch {
      // ignore
    }
    // Fallback to `main` then `master`.
    try {
      const branches = await g.branchLocal();
      if (branches.all.includes('main')) return 'main';
      if (branches.all.includes('master')) return 'master';
      if (branches.current) return branches.current;
    } catch {
      // ignore
    }
    return 'HEAD';
  }
}

function parseWorktreeList(out: string): Set<string> {
  const set = new Set<string>();
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      set.add(path.resolve(line.slice('worktree '.length).trim()));
    }
  }
  return set;
}
