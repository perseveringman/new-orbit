import { spawn, type spawn as nodeSpawn } from 'node:child_process';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { ORBIT_DIR, ORBIT_LOGS_DIR } from '@shared/constants';
import type { EnvQueueStatus, InstallResult } from '@shared/git';

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

export type PackageManager = 'npm' | 'pnpm' | 'yarn';

export interface InstallArgs {
  vaultPath: string;
  worktreeId: string;
  cwd: string;
  manager: PackageManager;
  args?: string[];
  timeoutMs?: number;
  spawner?: typeof nodeSpawn;
}

interface Job {
  args: InstallArgs;
  resolve: (r: InstallResult) => void;
  reject: (e: Error) => void;
}

/**
 * Global FIFO lock across the app: only one `npm/pnpm/yarn install`
 * can run at a time. Prevents two runners from clobbering a shared
 * package cache / network concurrency limit.
 *
 * Emits `status` events after every state change so the renderer can
 * show a queue indicator.
 */
export class InstallLock extends EventEmitter {
  private readonly queue: Job[] = [];
  private active: Job | null = null;

  status(): EnvQueueStatus {
    return {
      queued: this.queue.length + (this.active ? 1 : 0),
      active: this.active?.args.worktreeId ?? null
    };
  }

  enqueue(args: InstallArgs): Promise<InstallResult> {
    return new Promise<InstallResult>((resolve, reject) => {
      this.queue.push({ args, resolve, reject });
      this.emit('status', this.status());
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.active) return;
    const job = this.queue.shift();
    if (!job) {
      this.emit('status', this.status());
      return;
    }
    this.active = job;
    this.emit('status', this.status());
    try {
      const r = await runInstall(job.args);
      job.resolve(r);
    } catch (e) {
      job.reject(e as Error);
    } finally {
      this.active = null;
      this.emit('status', this.status());
      // Continue the queue even on failure.
      void this.drain();
    }
  }
}

async function runInstall(args: InstallArgs): Promise<InstallResult> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const logDir = path.join(args.vaultPath, ORBIT_DIR, ORBIT_LOGS_DIR);
  await fs.mkdir(logDir, { recursive: true });
  const logPath = path.join(logDir, `install-${args.worktreeId}-${ts}.log`);
  const out = createWriteStream(logPath, { flags: 'a' });
  const extra = args.args ?? [];
  const spawner = args.spawner ?? spawn;
  const cmd = args.manager;
  const argv = cmd === 'npm' ? (extra.length ? extra : ['install']) :
               cmd === 'pnpm' ? (extra.length ? extra : ['install']) :
               (extra.length ? extra : ['install']);
  out.write(`# orbit install ${cmd} ${argv.join(' ')} cwd=${args.cwd}\n`);
  return new Promise<InstallResult>((resolve, reject) => {
    let child;
    try {
      child = spawner(cmd, argv, {
        cwd: args.cwd,
        env: { ...process.env, CI: '1' },
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (e) {
      out.end();
      reject(e as Error);
      return;
    }
    child.stdout?.on('data', (c) => out.write(c));
    child.stderr?.on('data', (c) => out.write(c));
    const timer = setTimeout(() => {
      try {
        child?.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    timer.unref?.();
    child.on('error', (e) => {
      clearTimeout(timer);
      out.write(`\n# orbit install error: ${e.message}\n`);
      out.end();
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      out.write(`\n# orbit install exit ${code}\n`);
      out.end();
      if (code === 0) resolve({ logPath });
      else reject(new Error(`install exited ${code}`));
    });
  });
}

let singleton: InstallLock | null = null;
export function getInstallLock(): InstallLock {
  if (!singleton) singleton = new InstallLock();
  return singleton;
}

export function resetInstallLockForTesting(): void {
  singleton = null;
}
