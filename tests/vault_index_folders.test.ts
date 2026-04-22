import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { createProject } from '../src/main/project';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() }
}));

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-vault-idx-folders-'));
  await createVault(d);
  return d;
}

describe('VaultIndex + TaskIndex recognize folder-backed projects (R1)', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
    const electron = await import('electron');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (electron as any).ipcMain.handle.mockClear();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('indexes README.md as a project entity and leaves legacy md flagged as legacy', async () => {
    const proj = await createProject(vault, {
      slug: 'folder-proj',
      template: 'blank',
      name: 'Folder Proj'
    });
    // legacy single-file project
    await fs.writeFile(
      path.join(vault, '01_Projects', 'legacy-proj.md'),
      '---\nuid: LEG00001\ntype: project\ntitle: Legacy\nstatus: active\n---\nbody\n',
      'utf8'
    );

    const { openFsSession, closeFsSession, registerFsIpc, currentSession } = await import(
      '../src/main/fs'
    );
    registerFsIpc();
    await openFsSession(vault);
    const sess = currentSession()!;

    // VaultIndex: README path should appear as a project entity.
    const ents = sess.tasks.allEntities();
    const byUid = new Map(ents.map((e) => [e.uid, e]));
    const folderProj = byUid.get(proj.uid);
    expect(folderProj).toBeTruthy();
    expect(folderProj!.type).toBe('project');
    expect(folderProj!.relPath.endsWith('/README.md')).toBe(true);
    // Legacy is still indexed as project but relPath is the .md file.
    const legacy = byUid.get('LEG00001');
    expect(legacy).toBeTruthy();
    expect(legacy!.relPath.endsWith('legacy-proj.md')).toBe(true);

    await closeFsSession();
  });
});
