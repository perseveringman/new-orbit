import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { archiveProjectByUid, createProject, listProjects } from '../src/main/project';

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-proj-archive-'));
  await createVault(d);
  return d;
}

describe('project.archive (R1)', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('moves the whole project folder into 04_Archives/YYYY/<slug>', async () => {
    const res = await createProject(vault, {
      slug: 'to-archive',
      template: 'blank',
      name: 'To Archive'
    });
    // Leave a task file so we can assert history of sub-files move with it.
    await fs.writeFile(
      path.join(res.projectPath, '.agent', 'tasks', 'T1.md'),
      '---\nuid: TASKUID000001\ntype: task\ntitle: T1\nstatus: inbox\nproject_uid: ' +
        res.uid +
        '\n---\nbody\n',
      'utf8'
    );

    const r = await archiveProjectByUid(vault, res.uid);
    const year = r.archivedAt.slice(0, 4);
    expect(r.newPath).toBe(path.join(vault, '04_Archives', year, 'to-archive'));

    // Old path should be gone.
    await expect(fs.stat(res.projectPath)).rejects.toThrow();

    // New path exists and carries the task file.
    const stat = await fs.stat(r.newPath);
    expect(stat.isDirectory()).toBe(true);
    const movedTask = await fs.readFile(
      path.join(r.newPath, '.agent', 'tasks', 'T1.md'),
      'utf8'
    );
    expect(movedTask).toContain('TASKUID000001');

    // README frontmatter updated with status: archived and archived_at.
    const readme = await fs.readFile(path.join(r.newPath, 'README.md'), 'utf8');
    expect(readme).toMatch(/status:\s*archived/);
    expect(readme).toMatch(/archived_at:/);
    expect(readme).toMatch(/original_type:\s*project/);
    expect(readme).toContain(`uid: ${res.uid}`);
  });

  it('refuses to archive legacy single-file projects', async () => {
    await fs.writeFile(
      path.join(vault, '01_Projects', 'legacy.md'),
      '---\nuid: LEGUID1234\ntype: project\ntitle: Legacy\nstatus: active\n---\n',
      'utf8'
    );
    await expect(archiveProjectByUid(vault, 'LEGUID1234')).rejects.toThrow(
      /legacy single-file/
    );
  });

  it('rejects archive when a target of the same slug already exists', async () => {
    const res = await createProject(vault, {
      slug: 'conflict',
      template: 'blank',
      name: 'C'
    });
    const year = new Date().getUTCFullYear().toString();
    const target = path.join(vault, '04_Archives', year, 'conflict');
    await fs.mkdir(target, { recursive: true });
    await expect(archiveProjectByUid(vault, res.uid)).rejects.toThrow(/already exists/);
  });

  it('listProjects no longer returns the archived project', async () => {
    const res = await createProject(vault, {
      slug: 'gone',
      template: 'blank',
      name: 'Gone'
    });
    await archiveProjectByUid(vault, res.uid);
    const list = await listProjects(vault);
    expect(list.find((p) => p.uid === res.uid)).toBeUndefined();
  });
});
