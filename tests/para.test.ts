import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() }
}));

async function tmpVault(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-para-'));
  await fs.mkdir(path.join(dir, '.orbit'), { recursive: true });
  await fs.mkdir(path.join(dir, '01_Projects'), { recursive: true });
  await fs.mkdir(path.join(dir, '02_Areas'), { recursive: true });
  await fs.writeFile(path.join(dir, '.orbit', 'refmap.json'), '{}\n', 'utf8');
  await fs.writeFile(
    path.join(dir, '.orbit', 'config.json'),
    JSON.stringify({ version: '0.1.0', createdAt: new Date().toISOString(), name: 't' }),
    'utf8'
  );
  return dir;
}

type Handler = (e: unknown, ...args: unknown[]) => Promise<unknown>;

async function getHandlers(): Promise<Map<string, Handler>> {
  const electron = await import('electron');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handle = (electron as any).ipcMain.handle as ReturnType<typeof vi.fn>;
  const out = new Map<string, Handler>();
  for (const call of handle.mock.calls) out.set(call[0] as string, call[1] as Handler);
  return out;
}

describe('para IPC: updateTaskStatus, closeProject', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
    // Reset mock between tests so handlers from prior runs don't leak in.
    const electron = await import('electron');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (electron as any).ipcMain.handle.mockClear();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('toggles an inline task checkbox on disk', async () => {
    const projPath = path.join(vault, '01_Projects', 'Foo.md');
    await fs.writeFile(
      projPath,
      '---\nuid: ABCDEFGH1234\ntype: project\ntitle: Foo\nstatus: active\n---\n- [ ] a\n- [ ] b\n',
      'utf8'
    );

    const { openFsSession, closeFsSession, registerFsIpc } = await import('../src/main/fs');
    registerFsIpc();
    await openFsSession(vault);

    const handlers = await getHandlers();
    const update = handlers.get('para:updateTaskStatus')!;
    const list = handlers.get('para:listTasks')!;

    const tasks = (await list({})) as { id: string; status: string; title: string }[];
    const a = tasks.find((t) => t.title === 'a')!;
    expect(a.status).toBe('backlog');

    await update({}, a.id, 'doing');
    const content = await fs.readFile(projPath, 'utf8');
    expect(content).toContain('- [ ] a <!-- orbit:status=doing -->');
    expect(content).toContain('- [ ] b\n');

    await update({}, a.id, 'done');
    const content2 = await fs.readFile(projPath, 'utf8');
    expect(content2).toContain('- [x] a');
    expect(content2).not.toContain('orbit:status=doing');

    await closeFsSession();
  });

  it('updates a file task frontmatter status', async () => {
    const taskPath = path.join(vault, '01_Projects', 'Task1.md');
    await fs.writeFile(
      taskPath,
       '---\nuid: TASK12345678\ntype: task\ntitle: Buy beans\nstatus: backlog\n---\n',
      'utf8'
    );

    const { openFsSession, closeFsSession, registerFsIpc } = await import('../src/main/fs');
    registerFsIpc();
    await openFsSession(vault);

    const handlers = await getHandlers();
    const update = handlers.get('para:updateTaskStatus')!;

    await update({}, 'file:01_Projects/Task1.md', 'todo');
    const content = await fs.readFile(taskPath, 'utf8');
    expect(content).toMatch(/status:\s*todo/);

    await closeFsSession();
  });

  it('closeProject archives a project, preserves uid, sets archived_at/original_type', async () => {
    const projPath = path.join(vault, '01_Projects', 'P1.md');
    await fs.writeFile(
      projPath,
      '---\nuid: PROJUID123456\ntype: project\ntitle: P1\nstatus: active\n---\nbody\n',
      'utf8'
    );
    // A linker file in resources.
    await fs.mkdir(path.join(vault, '03_Resources'), { recursive: true });
    await fs.writeFile(
      path.join(vault, '03_Resources', 'Ref.md'),
      '# Ref\nSee [[P1]].\n',
      'utf8'
    );

    const { openFsSession, closeFsSession, registerFsIpc } = await import('../src/main/fs');
    registerFsIpc();
    await openFsSession(vault);

    const handlers = await getHandlers();
    const close = handlers.get('para:closeProject')!;
    const res = (await close({}, projPath)) as {
      newPath: string;
      newRelPath: string;
      uid: string;
    };

    expect(res.uid).toBe('PROJUID123456');
    const year = new Date().getUTCFullYear().toString();
    expect(res.newRelPath.startsWith(`04_Archives/${year}/`)).toBe(true);
    const moved = await fs.readFile(res.newPath, 'utf8');
    expect(moved).toMatch(/type:\s*archive/);
    expect(moved).toMatch(/archived_at:/);
    expect(moved).toMatch(/original_type:\s*project/);
    expect(moved).toMatch(/uid:\s*PROJUID123456/);
    // Year folder was created.
    const yearStat = await fs.stat(path.join(vault, '04_Archives', year));
    expect(yearStat.isDirectory()).toBe(true);

    await closeFsSession();
  });
});
