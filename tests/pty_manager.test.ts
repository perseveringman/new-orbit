import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  canLoadNodePty,
  kill,
  killAll,
  list,
  openSession,
  resize,
  setVaultRoot,
  write,
  _logPathForTest
} from '../src/main/terminal/pty_manager';

const PTY_OK = canLoadNodePty() && process.platform !== 'win32';

async function waitUntil(fn: () => boolean, timeoutMs = 3000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return fn();
}

function mkVault(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-pty-vault-'));
  fs.mkdirSync(path.join(root, '.orbit', 'logs'), { recursive: true });
  return root;
}

describe.skipIf(!PTY_OK || !!process.env['CI_SKIP_PTY'])('pty_manager', () => {
  let vault: string;

  beforeEach(() => {
    vault = mkVault();
    setVaultRoot(vault);
  });

  afterEach(async () => {
    await killAll();
    setVaultRoot(null);
    try {
      fs.rmSync(vault, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('opens a session, echoes data, and writes it to the log file', async () => {
    const collected: string[] = [];
    const info = await openSession({
      cwd: vault,
      shell: '/bin/sh',
      cols: 80,
      rows: 24
    });
    expect(info.id).toBeTruthy();
    expect(info.pid).toBeGreaterThan(0);
    expect(list().some((s) => s.id === info.id)).toBe(true);

    // Drain data by registering a listener directly.
    const { on } = await import('../src/main/terminal/pty_manager');
    const off = on('data', (id, payload) => {
      if (id === info.id) collected.push(payload);
    });

    write(info.id, "echo hello\n");
    const ok = await waitUntil(() => collected.join('').includes('hello'), 4000);
    expect(ok).toBe(true);

    off();

    const lp = _logPathForTest(info.id);
    expect(lp).toBeTruthy();
    await waitUntil(() => fs.existsSync(lp!) && fs.readFileSync(lp!, 'utf8').includes('hello'), 2000);
    expect(fs.readFileSync(lp!, 'utf8')).toMatch(/hello/);
  });

  it('resize does not throw and kill removes the session', async () => {
    const info = await openSession({ cwd: vault, shell: '/bin/sh' });
    expect(() => resize(info.id, 120, 40)).not.toThrow();
    await kill(info.id);
    expect(list().some((s) => s.id === info.id)).toBe(false);
  });

  it('rejects cwd outside the vault', async () => {
    await expect(
      openSession({ cwd: path.join(os.tmpdir(), 'definitely-not-the-vault-xyz'), shell: '/bin/sh' })
    ).rejects.toThrow();
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-outside-'));
    try {
      await expect(openSession({ cwd: other, shell: '/bin/sh' })).rejects.toThrow(/escapes vault/);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it('broadcasts exit when the shell completes', async () => {
    const info = await openSession({ cwd: vault, shell: '/bin/sh' });
    const { on } = await import('../src/main/terminal/pty_manager');
    let seen: { code: number } | null = null;
    const off = on('exit', (id, p) => {
      if (id === info.id) seen = { code: p.exitCode };
    });
    write(info.id, 'exit 0\n');
    const got = await waitUntil(() => seen !== null, 4000);
    off();
    expect(got).toBe(true);
    expect(list().some((s) => s.id === info.id)).toBe(false);
  });

  it('runs initialCommand after shell-ready output arrives', async () => {
    const collected: string[] = [];
    const info = await openSession({
      cwd: vault,
      shell: '/bin/bash',
      env: { PS1: '\u001b]133;A\u0007$ ' },
      initialCommand: 'echo gated-ready'
    });
    const { on } = await import('../src/main/terminal/pty_manager');
    const off = on('data', (id, payload) => {
      if (id === info.id) collected.push(payload);
    });

    const ok = await waitUntil(() => collected.join('').includes('gated-ready'), 4000);
    off();
    expect(ok).toBe(true);
  });
});

describe('pty_manager gating', () => {
  it('exposes canLoadNodePty()', () => {
    expect(typeof canLoadNodePty()).toBe('boolean');
  });
});
