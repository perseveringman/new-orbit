import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { createProject, createTask } from '../src/main/project';
import { relinkTask } from '../src/main/task_relink';
import * as frontmatter from '../src/main/frontmatter';

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-relink-'));
  await createVault(d);
  return d;
}

describe('task.relink (R7)', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('rewrites project_uid on a task that already lives in the target project', async () => {
    const alpha = await createProject(vault, {
      slug: 'alpha',
      template: 'blank',
      name: 'Alpha'
    });
    const task = await createTask(vault, {
      project_uid: alpha.uid,
      title: 'first',
      description: 'body'
    });
    const result = await relinkTask(vault, task.taskPath, alpha.uid);
    expect(result.moved).toBe(false);
    expect(result.projectUid).toBe(alpha.uid);
    const raw = await fs.readFile(result.taskPath, 'utf8');
    expect(frontmatter.read(raw).data['project_uid']).toBe(alpha.uid);
  });

  it('moves the task file into the target project .agent/tasks/ and updates project_uid', async () => {
    const alpha = await createProject(vault, {
      slug: 'alpha2',
      template: 'blank',
      name: 'Alpha2'
    });
    const beta = await createProject(vault, {
      slug: 'beta2',
      template: 'blank',
      name: 'Beta2'
    });
    const task = await createTask(vault, {
      project_uid: alpha.uid,
      title: 'moving target'
    });
    const result = await relinkTask(vault, task.taskPath, beta.uid);
    expect(result.moved).toBe(true);
    expect(result.projectUid).toBe(beta.uid);
    expect(result.taskPath).toContain(path.join('01_Projects', 'beta2', '.agent', 'tasks'));
    expect(
      await fs
        .access(result.taskPath)
        .then(() => true)
        .catch(() => false)
    ).toBe(true);
    // Old path is gone.
    expect(
      await fs
        .access(task.taskPath)
        .then(() => true)
        .catch(() => false)
    ).toBe(false);
    const raw = await fs.readFile(result.taskPath, 'utf8');
    expect(frontmatter.read(raw).data['project_uid']).toBe(beta.uid);
  });

  it('throws on an unknown project_uid', async () => {
    const alpha = await createProject(vault, {
      slug: 'alpha3',
      template: 'blank',
      name: 'Alpha3'
    });
    const task = await createTask(vault, {
      project_uid: alpha.uid,
      title: 'stay'
    });
    await expect(
      relinkTask(vault, task.taskPath, 'DOES-NOT-EXIST')
    ).rejects.toThrow(/project_uid not found/);
  });

  it('refuses to clobber an existing task at the target path', async () => {
    const alpha = await createProject(vault, {
      slug: 'alpha4',
      template: 'blank',
      name: 'Alpha4'
    });
    const beta = await createProject(vault, {
      slug: 'beta4',
      template: 'blank',
      name: 'Beta4'
    });
    const t1 = await createTask(vault, {
      project_uid: alpha.uid,
      title: 'dup'
    });
    // Plant a collision at the target with the same basename.
    const collisionPath = path.join(
      beta.projectPath,
      '.agent',
      'tasks',
      path.basename(t1.taskPath)
    );
    await fs.writeFile(collisionPath, 'sentinel', 'utf8');
    await expect(relinkTask(vault, t1.taskPath, beta.uid)).rejects.toThrow(
      /collision/
    );
  });
});
