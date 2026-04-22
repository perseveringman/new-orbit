import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { spawn as nodeSpawn } from 'node:child_process';
import { InstallLock } from '../src/main/env/install_lock';

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  killed = false;
  pid = 12345;
  kill(): boolean {
    this.killed = true;
    this.emit('close', 137);
    return true;
  }
}

interface Controls {
  spawn: typeof nodeSpawn;
  pending: FakeChild[];
  closeNext(exitCode?: number): void;
}

function fakeSpawner(): Controls {
  const pending: FakeChild[] = [];
  const s = ((): FakeChild => {
    const c = new FakeChild();
    pending.push(c);
    return c;
  }) as unknown as typeof nodeSpawn;
  return {
    spawn: s,
    pending,
    closeNext(exitCode = 0) {
      const c = pending[0];
      if (!c) throw new Error('no pending child');
      c.emit('close', exitCode);
      pending.shift();
    }
  };
}

describe('InstallLock', () => {
  it('serializes installs: only one active at a time', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-install-'));
    try {
      await fs.mkdir(path.join(vault, '.orbit', 'logs'), { recursive: true });
      const lock = new InstallLock();
      const ctrl = fakeSpawner();

      const p1 = lock.enqueue({
        vaultPath: vault,
        worktreeId: 'w1',
        cwd: vault,
        manager: 'npm',
        spawner: ctrl.spawn
      });
      const p2 = lock.enqueue({
        vaultPath: vault,
        worktreeId: 'w2',
        cwd: vault,
        manager: 'npm',
        spawner: ctrl.spawn
      });

      // Give the queue a tick to start the first job.
      await new Promise((r) => setTimeout(r, 20));
      expect(ctrl.pending.length).toBe(1);
      let st = lock.status();
      expect(st.active).toBe('w1');
      expect(st.queued).toBe(2);

      ctrl.closeNext(0);
      const r1 = await p1;
      expect(r1.logPath).toContain('install-w1-');

      // Second job should now be running.
      await new Promise((r) => setTimeout(r, 20));
      expect(ctrl.pending.length).toBe(1);
      st = lock.status();
      expect(st.active).toBe('w2');

      ctrl.closeNext(0);
      const r2 = await p2;
      expect(r2.logPath).toContain('install-w2-');

      await new Promise((r) => setTimeout(r, 20));
      expect(lock.status().active).toBeNull();
      expect(lock.status().queued).toBe(0);
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('drains queue on failure', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-install-'));
    try {
      await fs.mkdir(path.join(vault, '.orbit', 'logs'), { recursive: true });
      const lock = new InstallLock();
      const ctrl = fakeSpawner();
      const p1 = lock.enqueue({
        vaultPath: vault,
        worktreeId: 'w1',
        cwd: vault,
        manager: 'npm',
        spawner: ctrl.spawn
      });
      const p2 = lock.enqueue({
        vaultPath: vault,
        worktreeId: 'w2',
        cwd: vault,
        manager: 'npm',
        spawner: ctrl.spawn
      });
      await new Promise((r) => setTimeout(r, 20));
      ctrl.closeNext(1); // fail
      await expect(p1).rejects.toThrow();
      await new Promise((r) => setTimeout(r, 20));
      expect(ctrl.pending.length).toBe(1);
      ctrl.closeNext(0);
      const r2 = await p2;
      expect(r2.logPath).toBeTruthy();
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});
