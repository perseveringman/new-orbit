import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// fs.ts pulls in electron; mock its surface just enough.
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() }
}));

async function tmpVault(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-rename-'));
  await fs.mkdir(path.join(dir, '.orbit'), { recursive: true });
  await fs.writeFile(path.join(dir, '.orbit', 'refmap.json'), '{}\n', 'utf8');
  return dir;
}

describe('rename rewrites wikilinks across the vault', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('updates [[Old]] → [[New]] in linking files', async () => {
    // Two linking files + the target.
    await fs.writeFile(path.join(vault, 'Old.md'), '# Old\n', 'utf8');
    await fs.writeFile(
      path.join(vault, 'one.md'),
      '# one\nsee [[Old]] please\n',
      'utf8'
    );
    await fs.mkdir(path.join(vault, 'sub'));
    await fs.writeFile(
      path.join(vault, 'sub', 'two.md'),
      '# two\nalias [[Old|shorthand]] and [[Other]]\n',
      'utf8'
    );

    // Isolate module state: dynamic import after mock.
    const { openFsSession, closeFsSession, registerFsIpc } = await import('../src/main/fs');
    registerFsIpc();
    await openFsSession(vault);

    // Perform rename via IPC handler internals: use the exposed API.
    // We register via ipcMain.handle mock; call the stored handler directly.
    // Simplest: call fs.rename via window-less path — replicate the logic
    // by moving the file then re-invoking openFsSession rewriting via public
    // `rename` handler. Since we mocked ipcMain.handle we can't get the handler
    // easily, so do the filesystem rename + reopen, and assert backlink
    // rewrite via a second invocation of the real API. To keep the test
    // surgical, we call the main.rename handler by re-importing and calling
    // the exported util directly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fsMod: any = await import('../src/main/fs');
    // The fs module registers handlers via ipcMain.handle which is mocked; we
    // can grab the captured handler from the mock.
    const electron = await import('electron');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (electron as any).ipcMain.handle as ReturnType<typeof vi.fn>;
    const call = handle.mock.calls.find((c) => c[0] === 'fs:rename');
    expect(call, 'fs:rename handler registered').toBeTruthy();
    const renameHandler = call![1] as (
      e: unknown,
      o: string,
      n: string
    ) => Promise<{ linksUpdated: number }>;

    const oldPath = path.join(vault, 'Old.md');
    const newPath = path.join(vault, 'New.md');
    const result = await renameHandler({}, oldPath, newPath);
    expect(result.linksUpdated).toBe(2);

    const one = await fs.readFile(path.join(vault, 'one.md'), 'utf8');
    const two = await fs.readFile(path.join(vault, 'sub', 'two.md'), 'utf8');
    expect(one).toContain('[[New]]');
    expect(one).not.toContain('[[Old]]');
    expect(two).toContain('[[New|shorthand]]');
    expect(two).toContain('[[Other]]');

    await closeFsSession();
    void fsMod;
  });
});
