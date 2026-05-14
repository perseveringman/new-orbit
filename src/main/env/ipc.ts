import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { EnvQueueStatus, InstallResult } from '@shared/git';
import type { WorktreeRecord } from '@shared/git';
import { currentSession } from '../fs';
import { getInstallLock, type PackageManager } from './install_lock';
import { WorktreeManager } from '../git/worktree';
import { createExecutionContextForProject } from '../execution';
import { listProjects } from '../project';

let wired = false;

export function resetEnvIpcForTesting(): void {
  wired = false;
}

export function registerEnvIpc(): void {
  if (wired) return;
  wired = true;

  // Bridge install-lock status events to renderer windows.
  getInstallLock().on('status', (s: EnvQueueStatus) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.env.event, s);
    }
  });

  ipcMain.handle(IPC.env.status, (): EnvQueueStatus => getInstallLock().status());

  ipcMain.handle(
    IPC.agent.installInWorktree,
    async (
      _e,
      args: { worktreeId: string; manager: PackageManager; args?: string[] }
    ): Promise<InstallResult> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      const rec = await findInstallWorktreeRecord(sess.vault, args.worktreeId);
      if (!rec) throw new Error(`worktree not found: ${args.worktreeId}`);
      const installArgs = {
        vaultPath: sess.vault,
        worktreeId: args.worktreeId,
        cwd: rec.path,
        manager: args.manager,
        ...(args.args ? { args: args.args } : {})
      };
      return getInstallLock().enqueue(installArgs);
    }
  );
}

export async function findInstallWorktreeRecord(
  vault: string,
  worktreeId: string
): Promise<WorktreeRecord | null> {
  const vaultManager = new WorktreeManager({ vault });
  const legacyRecord = await vaultManager.get(worktreeId);
  if (legacyRecord) return legacyRecord;

  const projects = await listProjects(vault);
  for (const project of projects) {
    if (project.legacy) continue;
    const context = await createExecutionContextForProject(project.coordinationPath, {
      vaultPath: vault
    });
    const record = await context.get(worktreeId);
    if (record) return record;
  }
  return null;
}
