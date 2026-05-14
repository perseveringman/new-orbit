import { BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { IPC } from '@shared/ipc';
import {
  ORBIT_DIR,
  ORBIT_WORKTREES_DIR
} from '@shared/constants';
import type {
  ChangesSummary,
  CheckReport,
  CommitSelectionArgs,
  GitStatusSummary,
  MergeResult,
  MergeStrategy,
  ResetAllResult,
  StagePathsArgs,
  WorktreeRecord
} from '@shared/git';
import { currentSession, blockTask } from '../fs';
import { WorktreeManager, isGhostBranch } from './worktree';
import { appendGitLog } from './log';
import { runPreMergeCheck } from './checks';
import { getGitQueue } from './queue';
import { getInstallLock } from '../env/install_lock';
import { CheckCache } from './check_cache';
import { computeMergeBaseDiff } from './diff';
import { getWorkingTreeDiff } from './diff';
import { createExecutionContext, createExecutionContextForProject } from '../execution/factory';
import type { ExecutionContext } from '../execution/types';
import { listProjects } from '../project';
import {
  getChanges as gitGetChanges,
  stagePaths as gitStagePaths,
  unstagePaths as gitUnstagePaths,
  discardPaths as gitDiscardPaths,
  commitSelection as gitCommitSelection
} from './status';

let wired = false;
let manager: WorktreeManager | null = null;

/** Reset in tests between vault open cycles. */
export function resetGitIpcForTesting(): void {
  wired = false;
  manager = null;
}

function requireManager(vault: string): WorktreeManager {
  if (!manager || (manager as unknown as { _vault?: string })._vault !== vault) {
    manager = new WorktreeManager({ vault });
    // stash vault on the instance for the (cheap) equality check above.
    (manager as unknown as { _vault?: string })._vault = vault;
  }
  return manager;
}

function defaultExecutionContext(vault: string): ExecutionContext {
  return createExecutionContext('worktree', { worktreeManager: requireManager(vault) });
}

async function executionContextForTask(
  vault: string,
  taskId: string
): Promise<ExecutionContext | null> {
  const sess = currentSession();
  if (!sess) return null;
  const task = sess.tasks.allTasks().find((entry) => entry.id === taskId || entry.uid === taskId);
  if (!task?.project_uid) return null;
  const project = (await listProjects(vault)).find((entry) => entry.uid === task.project_uid);
  if (!project || project.legacy) return null;
  return createExecutionContextForProject(project.coordinationPath, { vaultPath: vault });
}

async function findWorktreeContext(
  vault: string,
  id: string
): Promise<{ context: ExecutionContext; rec: WorktreeRecord } | null> {
  const fallback = defaultExecutionContext(vault);
  const fallbackRec = await fallback.get(id);
  if (fallbackRec) return { context: fallback, rec: fallbackRec };
  for (const project of await listProjects(vault)) {
    if (project.legacy) continue;
    const context = await createExecutionContextForProject(project.coordinationPath, {
      vaultPath: vault
    });
    const rec = await context.get(id);
    if (rec) return { context, rec };
  }
  return null;
}

const checkCache = new CheckCache();

export function registerGitIpc(): void {
  if (wired) return;
  wired = true;

  ipcMain.handle(
    IPC.git.status,
    async (_e, opts?: { cwd?: string }): Promise<GitStatusSummary> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      const cwd = opts?.cwd ?? sess.vault;
      // Allow either vault root or any subpath; pathGuard is conservative,
      // but worktrees live under vault/.orbit/worktrees so are still inside.
      const g = simpleGit(cwd);
      const s = await g.status();
      const branch = s.current ?? '';
      const summary: GitStatusSummary = {
        branch,
        ahead: s.ahead ?? 0,
        behind: s.behind ?? 0,
        clean: s.isClean(),
        changed: [...s.modified, ...s.created, ...s.deleted, ...s.renamed.map((r) => r.to)],
        untracked: [...s.not_added]
      };
      await appendGitLog(sess.vault, { op: 'status', cwd, branch });
      return summary;
    }
  );

  ipcMain.handle(
    IPC.git.createWorktree,
    async (_e, opts?: { taskId?: string }): Promise<WorktreeRecord> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      if (opts?.taskId) {
        const context = await executionContextForTask(sess.vault, opts.taskId);
        if (context) {
          const rec = await context.create(opts);
          broadcastEnv();
          return rec;
        }
      }
      const mgr = requireManager(sess.vault);
      const rec = await mgr.create(opts ?? {});
      broadcastEnv();
      return rec;
    }
  );

  ipcMain.handle(IPC.git.listWorktrees, async (): Promise<WorktreeRecord[]> => {
    const sess = currentSession();
    if (!sess) return [];
    const records = await defaultExecutionContext(sess.vault).list();
    for (const project of await listProjects(sess.vault)) {
      if (project.legacy) continue;
      const context = await createExecutionContextForProject(project.coordinationPath, {
        vaultPath: sess.vault
      });
      records.push(...(await context.list()));
    }
    const byId = new Map(records.map((record) => [record.id, record]));
    return [...byId.values()];
  });

  ipcMain.handle(
    IPC.git.getDiff,
    async (_e, args: { worktreeId: string; base?: string }) => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      const found = await findWorktreeContext(sess.vault, args.worktreeId);
      if (!found) throw new Error(`worktree not found: ${args.worktreeId}`);
      return computeMergeBaseDiff({
        worktreePath: found.rec.path,
        base: args.base
      });
    }
  );

  ipcMain.handle(
    IPC.git.getWorkingTreeDiff,
    async (_e, args: { cwd: string; pathspec?: string[] }) => {
      return getWorkingTreeDiff(args.cwd, args.pathspec);
    }
  );

  ipcMain.handle(
    IPC.git.removeWorktree,
    async (_e, id: string, opts?: { force?: boolean }): Promise<void> => {
      const sess = currentSession();
      if (!sess) return;
      const found = await findWorktreeContext(sess.vault, id);
      if (!found) return;
      await found.context.remove(id, opts ?? {});
      checkCache.delete(id);
    }
  );

  ipcMain.handle(IPC.git.resetAll, async (): Promise<ResetAllResult> => {
    const sess = currentSession();
    if (!sess) return { removed: 0, errors: [] };
    const contexts: ExecutionContext[] = [defaultExecutionContext(sess.vault)];
    for (const project of await listProjects(sess.vault)) {
      if (project.legacy) continue;
      contexts.push(
        await createExecutionContextForProject(project.coordinationPath, {
          vaultPath: sess.vault
        })
      );
    }
    const results = await Promise.all(contexts.map((context) => context.resetAll()));
    const r = {
      removed: results.reduce((sum, result) => sum + result.removed, 0),
      errors: results.flatMap((result) => result.errors)
    };
    checkCache.clear();
    return r;
  });

  ipcMain.handle(
    IPC.git.ghostCommit,
    async (
      _e,
      args: { worktreeId: string; message: string; author?: string }
    ): Promise<{ sha: string }> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      const found = await findWorktreeContext(sess.vault, args.worktreeId);
      if (!found) throw new Error(`worktree not found: ${args.worktreeId}`);
      const rec = found.rec;
      if (!isGhostBranch(rec.branch)) {
        const err = new Error('not_a_ghost_branch') as Error & { code?: string };
        err.code = 'not_a_ghost_branch';
        throw err;
      }
      return getGitQueue().run(`cwd:${rec.path}`, async () => {
        const g = simpleGit(rec.path);
        await g.add(['-A']);
        const commitArgs: string[] = ['commit', '-m', args.message];
        if (args.author) commitArgs.push('--author', args.author);
        await g.raw(commitArgs);
        const sha = (await g.raw(['rev-parse', 'HEAD'])).trim();
        checkCache.delete(args.worktreeId);
        await appendGitLog(sess.vault, {
          op: 'ghostCommit',
          worktreeId: args.worktreeId,
          sha
        });
        return { sha };
      });
    }
  );

  ipcMain.handle(
    IPC.git.preMergeCheck,
    async (_e, worktreeId: string): Promise<CheckReport> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      const found = await findWorktreeContext(sess.vault, worktreeId);
      if (!found) throw new Error(`worktree not found: ${worktreeId}`);
      const rec = found.rec;
      const base = await defaultBranchOf(rec.path);
      const report = await runPreMergeCheck(rec.path, base);
      checkCache.set(worktreeId, report);
      await appendGitLog(sess.vault, {
        op: 'preMergeCheck',
        worktreeId,
        buildOk: report.build.ok,
        secretsOk: report.secrets.ok,
        findings: report.secrets.findings.length
      });
      if ((!report.build.ok || !report.secrets.ok) && rec.taskId) {
        const parts: string[] = [];
        if (!report.build.ok) parts.push('build failed');
        if (!report.secrets.ok) {
          parts.push(`secret scan: ${report.secrets.findings.length} finding(s)`);
        }
        const reason = `pre-merge: ${parts.join(', ')}`;
        await blockTask(rec.taskId, reason).catch(() => null);
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed()) {
            w.webContents.send(IPC.agent.event, {
              runId: 'system',
              event: {
                idx: 0,
                at: new Date().toISOString(),
                kind: 'error',
                text: reason
              }
            });
          }
        }
      }
      return report;
    }
  );

  ipcMain.handle(
    IPC.git.mergeGhost,
    async (
      _e,
      worktreeId: string,
      opts: { strategy: MergeStrategy }
    ): Promise<MergeResult> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      const found = await findWorktreeContext(sess.vault, worktreeId);
      if (!found) throw new Error(`worktree not found: ${worktreeId}`);
      const rec = found.rec;

      // Cache gate: require a successful, fresh (≤60s) check with matching HEAD.
      const wtGit = simpleGit(rec.path);
      const currentHead = (await wtGit.raw(['rev-parse', 'HEAD'])).trim();
      const gate = checkCache.gateMerge(worktreeId, currentHead);
      if (gate) {
        const err = new Error(gate.code) as Error & { code?: string };
        err.code = gate.code;
        throw err;
      }

      return getGitQueue().run('global', async () => {
        const base = await defaultBranchOf(rec.path);
        const rootPath = (await primaryWorktreeForBranch(rec.path, base)) ?? sess.vault;
        const rootGit = simpleGit(rootPath);
        // Ensure we're on base, not on the ghost branch (avoid self-merge).
        await rootGit.raw(['checkout', base]);
        let mergedSha: string | undefined;
        let ok = false;
        let message: string | undefined;
        const conflicts: string[] = [];
        try {
          if (opts.strategy === 'fast-forward') {
            await rootGit.raw(['merge', '--ff-only', rec.branch]);
          } else {
            await rootGit.raw(['merge', '--squash', rec.branch]);
            await rootGit.raw([
              'commit',
              '-m',
              `orbit: squash merge ${rec.branch}`
            ]);
          }
          mergedSha = (await rootGit.raw(['rev-parse', 'HEAD'])).trim();
          ok = true;
          await found.context.setStatus(worktreeId, 'merged');
        } catch (e) {
          message = (e as Error).message;
          try {
            const s = await rootGit.status();
            conflicts.push(...s.conflicted);
          } catch {
            // ignore
          }
        }
        await appendGitLog(sess.vault, {
          op: 'mergeGhost',
          worktreeId,
          strategy: opts.strategy,
          ok,
          mergedSha: mergedSha ?? null
        });
        const result: MergeResult = { ok, strategy: opts.strategy };
        if (mergedSha) result.mergedSha = mergedSha;
        if (message) result.message = message;
        if (conflicts.length) result.conflicts = conflicts;
        return result;
      });
    }
  );

  // Keep the legacy `git:commit` channel wired but safe: it's only a manual
  // commit at the vault root. No push.
  ipcMain.handle(IPC.git.commit, async (_e, message: string): Promise<unknown> => {
    const sess = currentSession();
    if (!sess) throw new Error('no vault');
    const g = simpleGit(sess.vault);
    await g.add(['-A']);
    await g.raw(['commit', '-m', message]);
    await appendGitLog(sess.vault, { op: 'commit', cwd: sess.vault });
    return { ok: true };
  });

  // --- Inspector: staged-aware change actions --------------------------------

  ipcMain.handle(
    IPC.git.getChanges,
    async (_e, args: { cwd: string }): Promise<ChangesSummary> => {
      return gitGetChanges({ cwd: args.cwd });
    }
  );

  ipcMain.handle(
    IPC.git.stagePaths,
    async (_e, args: StagePathsArgs): Promise<void> => {
      return gitStagePaths(args);
    }
  );

  ipcMain.handle(
    IPC.git.unstagePaths,
    async (_e, args: StagePathsArgs): Promise<void> => {
      return gitUnstagePaths(args);
    }
  );

  ipcMain.handle(
    IPC.git.discardPaths,
    async (_e, args: StagePathsArgs): Promise<void> => {
      return gitDiscardPaths(args);
    }
  );

  ipcMain.handle(
    IPC.git.commitSelection,
    async (_e, args: CommitSelectionArgs): Promise<{ sha: string }> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      const result = await gitCommitSelection(args);
      await appendGitLog(sess.vault, {
        op: 'commitSelection',
        cwd: args.cwd,
        sha: result.sha
      });
      return result;
    }
  );
}

async function defaultBranchOf(vault: string): Promise<string> {
  const g = simpleGit(vault);
  try {
    const branches = await g.branchLocal();
    if (branches.all.includes('main')) return 'main';
    if (branches.all.includes('master')) return 'master';
    if (branches.current) return branches.current;
  } catch {
    // ignore
  }
  return 'main';
}

async function primaryWorktreeForBranch(cwd: string, branch: string): Promise<string | null> {
  const raw = await simpleGit(cwd).raw(['worktree', 'list', '--porcelain']).catch(() => '');
  if (!raw.trim()) return null;
  const blocks = raw.split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const worktree = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length);
    const branchRef = lines.find((line) => line.startsWith('branch '))?.slice('branch '.length);
    const branchName = branchRef?.replace(/^refs\/heads\//, '');
    if (worktree && branchName === branch) return worktree;
  }
  return null;
}

function broadcastEnv(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IPC.env.event, getInstallLock().status());
  }
}

// Silence unused path import in the compiled bundle (path is used implicitly
// via constants, but keep the import available for future extensions).
void path;
void ORBIT_WORKTREES_DIR;
void ORBIT_DIR;
