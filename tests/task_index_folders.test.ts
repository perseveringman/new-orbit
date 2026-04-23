import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { createProject, createTask } from '../src/main/project';
import { listAreas } from '../src/main/area';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() }
}));

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-taskidx-folders-'));
  await createVault(d);
  return d;
}

describe('TaskIndex reads .orbit/agent/tasks/*.md (R1)', () => {
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

  it('task.create writes a four-section file and TaskIndex picks it up', async () => {
    const proj = await createProject(vault, {
      slug: 'tasks-home',
      template: 'blank',
      name: 'Tasks Home'
    });
    const t = await createTask(vault, {
      project_uid: proj.uid,
      title: 'Implement feature X',
      description: 'Do the thing'
    });
    expect(t.taskPath).toContain('/.orbit/agent/tasks/');
    const content = await fs.readFile(t.taskPath, 'utf8');
    expect(content).toContain('# Description');
    expect(content).toContain('# Agent Thinking');
    expect(content).toContain('# Execution Log');
    expect(content).toContain('# Summary');
    expect(content).toContain(`uid: ${t.uid}`);
    expect(content).toContain(`project_uid: ${proj.uid}`);

    const { openFsSession, closeFsSession, registerFsIpc, currentSession } = await import(
      '../src/main/fs'
    );
    registerFsIpc();
    await openFsSession(vault);
    const sess = currentSession()!;

    const all = sess.tasks.allTasks();
    const mine = all.find((x) => x.uid === t.uid);
    expect(mine).toBeTruthy();
    expect(mine!.source).toBe('file');
    expect(mine!.project_uid).toBe(proj.uid);
    expect(mine!.status).toBe('inbox');

    await closeFsSession();
  });

  it('listTasks marks task as lost when project_uid no longer resolves', async () => {
    const proj = await createProject(vault, {
      slug: 'soon-gone',
      template: 'blank',
      name: 'Soon Gone'
    });
    const t = await createTask(vault, {
      project_uid: proj.uid,
      title: 'Dangling soon'
    });
    // Simulate the project vanishing by removing the project folder from disk
    // (preserve the task file somewhere else to exercise the rescue path).
    const stray = path.join(vault, '02_Areas', path.basename(t.taskPath));
    await fs.mkdir(path.dirname(stray), { recursive: true });
    await fs.rename(t.taskPath, stray);
    await fs.rm(proj.projectPath, { recursive: true, force: true });

    const { openFsSession, closeFsSession, registerFsIpc, currentSession } = await import(
      '../src/main/fs'
    );
    registerFsIpc();
    await openFsSession(vault);
    const sess = currentSession()!;

    const all = sess.tasks.allTasks();
    const orphan = all.find((x) => x.uid === t.uid);
    expect(orphan).toBeTruthy();
    const electron = await import('electron');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = (electron as any).ipcMain.handle as ReturnType<typeof vi.fn>;
    const call = handle.mock.calls.find((c) => c[0] === 'para:listTasks');
    expect(call).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = call![1] as (e: unknown, filter?: unknown) => Promise<any[]>;
    const list = await handler({}, undefined);
    const rec = list.find((x) => x.uid === t.uid);
    expect(rec?.lost).toBe(true);

    await closeFsSession();
    void sess;
  });

  it('task.create can target an area-owned tasks directory', async () => {
    const vision = (await listAreas(vault)).find((area) => area.slug === 'vision');
    expect(vision).toBeTruthy();

    const task = await createTask(vault, {
      area_uid: vision!.uid,
      title: 'Revisit life principles',
      description: 'Update the north-star milestones'
    });

    expect(task.relPath).toContain('02_Areas/vision/.orbit/agent/tasks/');
    const content = await fs.readFile(task.taskPath, 'utf8');
    expect(content).toContain(`area_uid: ${vision!.uid}`);
    expect(content).not.toContain('project_uid:');

    const { openFsSession, closeFsSession, registerFsIpc, currentSession } = await import(
      '../src/main/fs'
    );
    registerFsIpc();
    await openFsSession(vault);
    const sess = currentSession()!;
    const indexed = sess.tasks.allTasks().find((item) => item.uid === task.uid);
    expect(indexed?.area_uid).toBe(vision!.uid);
    expect(indexed?.project_uid).toBeUndefined();
    await closeFsSession();
  });
});
