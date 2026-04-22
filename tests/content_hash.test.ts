import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { createProject, createTask } from '../src/main/project';
import { contentHash } from '../src/main/content_hash';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() }
}));

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-hash-'));
  await createVault(d);
  return d;
}

describe('content_hash (R1)', () => {
  it('is stable across frontmatter-only edits', () => {
    const a = '---\nuid: X\n---\nHello world\n';
    const b = '---\nuid: Y\ntitle: Different\n---\nHello world\n';
    expect(contentHash(a)).toBe(contentHash(b));
  });

  it('changes when the body changes', () => {
    const a = '---\nuid: X\n---\nHello world\n';
    const b = '---\nuid: X\n---\nHELLO world\n';
    expect(contentHash(a)).not.toBe(contentHash(b));
  });

  it('normalizes CRLF vs LF line endings', () => {
    const a = '---\nuid: X\n---\nLine one\nLine two\n';
    const b = '---\nuid: X\n---\r\nLine one\r\nLine two\r\n';
    expect(contentHash(a)).toBe(contentHash(b));
  });
});

describe('refmap content_hash indexing (R1)', () => {
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

  it('indexes task + project README hashes on reconcile; findByContentHash returns matching rel paths', async () => {
    const proj = await createProject(vault, {
      slug: 'hashy',
      template: 'blank',
      name: 'Hashy'
    });
    const t = await createTask(vault, {
      project_uid: proj.uid,
      title: 'Hashable task',
      description: 'tangible'
    });

    const { openFsSession, closeFsSession, registerFsIpc, currentSession } = await import(
      '../src/main/fs'
    );
    registerFsIpc();
    await openFsSession(vault);
    const sess = currentSession()!;

    const taskRaw = await fs.readFile(t.taskPath, 'utf8');
    const h = contentHash(taskRaw);
    const hits = sess.refmap.findByContentHash(h);
    expect(hits.some((r) => r.endsWith(path.basename(t.taskPath)))).toBe(true);

    // Rename does NOT change the content hash.
    const dst = path.join(path.dirname(t.taskPath), 'renamed.md');
    await fs.rename(t.taskPath, dst);
    await sess.refmap.reconcile();
    const hits2 = sess.refmap.findByContentHash(h);
    expect(hits2.some((r) => r.endsWith('renamed.md'))).toBe(true);

    await closeFsSession();
  });
});
