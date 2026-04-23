import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IPC } from '../src/shared/ipc';

const sendMock = vi.fn();

interface ElectronMockModule {
  ipcMain: {
    handle: ReturnType<typeof vi.fn>;
  };
}

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: {
          send: sendMock
        }
      }
    ]
  },
  ipcMain: { handle: vi.fn() }
}));

type Handler = (e: unknown, ...args: unknown[]) => Promise<unknown>;

async function getHandlers(): Promise<Map<string, Handler>> {
  const electron = (await import('electron')) as unknown as ElectronMockModule;
  const handle = electron.ipcMain.handle;
  const handlers = new Map<string, Handler>();
  for (const call of handle.mock.calls) handlers.set(call[0] as string, call[1] as Handler);
  return handlers;
}

async function tmpVault(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-task-ipc-'));
  await fs.mkdir(path.join(dir, '.orbit'), { recursive: true });
  await fs.mkdir(path.join(dir, '01_Projects'), { recursive: true });
  await fs.writeFile(path.join(dir, '.orbit', 'refmap.json'), '{}\n', 'utf8');
  await fs.writeFile(
    path.join(dir, '.orbit', 'config.json'),
    JSON.stringify({ version: '0.1.0', createdAt: new Date().toISOString(), name: 't' }),
    'utf8'
  );
  return dir;
}

describe('task IPC event bridge', () => {
  let vault: string;

  beforeEach(async () => {
    vault = await tmpVault();
    const electron = (await import('electron')) as unknown as ElectronMockModule;
    electron.ipcMain.handle.mockClear();
    sendMock.mockClear();
  });

  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('broadcasts an fs change event after task frontmatter updates', async () => {
    const taskPath = path.join(vault, '01_Projects', 'Task1.md');
    await fs.writeFile(
      taskPath,
      '---\nuid: TASK12345678\ntype: task\ntitle: Buy beans\nstatus: inbox\n---\n',
      'utf8'
    );

    const { openFsSession, closeFsSession, registerFsIpc } = await import('../src/main/fs');
    registerFsIpc();
    await openFsSession(vault);

    const handlers = await getHandlers();
    const update = handlers.get(IPC.task.updateFrontmatter)!;

    await update({}, taskPath, { status: 'doing' });

    expect(sendMock).toHaveBeenCalledWith(
      IPC.fs.event,
      expect.objectContaining({
        kind: 'change',
        path: taskPath,
        relPath: '01_Projects/Task1.md'
      })
    );

    await closeFsSession();
  });
});
