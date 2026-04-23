import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { createProject, createTask, archiveProjectByUid } from '../src/main/project';
import {
  updateTaskSection,
  updateTaskFrontmatter,
  appendExecutionLog,
  readTaskFile
} from '../src/main/task';
import { migrateProjectsToFolders } from '../src/main/migrations';

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-e2e-'));
  await createVault(d);
  return d;
}

describe('R7 end-to-end (IPC layer): vault → project → task → archive + migration', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('drives the full happy path through the backend modules', async () => {
    // 1) Vision.md exists after createVault (M2 bootstrapper).
    // 2) Create a project.
    const proj = await createProject(vault, {
      slug: 'e2e-proj',
      template: 'blank',
      name: 'E2E',
      description: 'smoke'
    });
    expect(proj.slug).toBe('e2e-proj');

    // 3) Create a task inside it.
    const task = await createTask(vault, {
      project_uid: proj.uid,
      title: 'first-task',
      description: 'initial description'
    });
    expect(task.taskPath).toContain(
      path.join('01_Projects', 'e2e-proj', '.orbit', 'agent', 'tasks')
    );

    // 4) Update all four sections via the task module.
    await updateTaskSection(task.taskPath, 'description', 'D body');
    await updateTaskSection(task.taskPath, 'thinking', 'T body');
    await appendExecutionLog(task.taskPath, 'agent did a thing', '2030-01-01T00:00:00.000Z');
    await updateTaskSection(task.taskPath, 'summary', 'S body');
    await updateTaskFrontmatter(task.taskPath, { status: 'today' });

    const view = await readTaskFile(task.taskPath);
    expect(view.sections.description.trim()).toBe('D body');
    expect(view.sections.thinking.trim()).toBe('T body');
    expect(view.sections.executionLog).toContain('agent did a thing');
    expect(view.sections.summary.trim()).toBe('S body');
    expect(view.frontmatter['status']).toBe('today');

    // 5) Archive the project.
    const arch = await archiveProjectByUid(vault, proj.uid);
    expect(arch.newPath).toContain(path.join('04_Archives'));
    expect(
      await fs
        .access(path.join(vault, '01_Projects', 'e2e-proj'))
        .then(() => true)
        .catch(() => false)
    ).toBe(false);
  });

  it('migrates a legacy single-file project to folder form', async () => {
    await fs.writeFile(
      path.join(vault, '01_Projects', 'legacy-e2e.md'),
      '---\nuid: LEGACYE2E0\ntype: project\ntitle: Legacy E2E\nstatus: active\n---\n# Heading\n\n## Agent\nPersona text.\n\n## Plan\nsteps\n',
      'utf8'
    );
    const report = await migrateProjectsToFolders(vault, {
      deps: {
        initGit: async () => undefined,
        commitVaultRoot: async () => 'snapshotsha'
      }
    });
    expect(report.migrated).toContain('legacy-e2e');
    expect(report.snapshotSha).toBe('snapshotsha');

    const cfg = JSON.parse(
      await fs.readFile(
        path.join(vault, '01_Projects', 'legacy-e2e', '.orbit', 'config.json'),
        'utf8'
      )
    ) as { slug: string };
    expect(cfg.slug).toBe('legacy-e2e');
  });
});
