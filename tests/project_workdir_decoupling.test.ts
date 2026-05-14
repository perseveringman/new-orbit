import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import {
  createProject,
  listProjects,
  migrateProjectWorkdir,
  readProjectConfig,
  relinkProjectWorkdir
} from '../src/main/project';

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-workdir-decouple-'));
  await createVault(d);
  return d;
}

describe('project workdir decoupling', () => {
  let vault: string;
  let extraRoots: string[] = [];

  beforeEach(async () => {
    vault = await tmpVault();
    extraRoots = [];
  });

  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
    for (const root of extraRoots) {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('migrates a legacy in-vault workdir into an external code directory', async () => {
    const created = await createProject(vault, {
      slug: 'legacy-web',
      template: 'web-app',
      name: 'Legacy Web'
    });
    await fs.writeFile(
      path.join(created.projectPath, 'src', 'custom.ts'),
      'export const answer = 42;\n',
      'utf8'
    );

    const externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-workdir-target-'));
    extraRoots.push(externalRoot);
    const targetDir = path.join(externalRoot, 'legacy-web-workdir');
    const result = await migrateProjectWorkdir(vault, {
      uid: created.uid,
      targetDir,
      removeCopiedFiles: true,
      initializeGit: true
    });

    expect(result.workdirPath).toBe(targetDir);
    await expect(fs.readFile(path.join(targetDir, 'src', 'custom.ts'), 'utf8')).resolves.toContain(
      'answer = 42'
    );
    await expect(fs.stat(path.join(targetDir, '.git'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(created.projectPath, 'README.md'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(created.projectPath, 'src', 'custom.ts'))).rejects.toThrow();

    const config = await readProjectConfig(created.projectPath);
    expect(config?.workdir).toMatchObject({
      path: targetDir,
      linked_via: 'migrated-from-vault'
    });
    expect(config?.execution_context.kind).toBe('worktree');

    const project = (await listProjects(vault)).find((entry) => entry.uid === created.uid);
    expect(project?.workdirPath).toBe(targetDir);
    expect(project?.workdir?.linked_via).toBe('migrated-from-vault');
    expect(result.copiedFiles).toContain('src/custom.ts');
    expect(result.removedFiles).toContain('src/custom.ts');
    expect(result.skippedFiles).toContain('README.md');
  });

  it('relinks an existing project to a different workdir and refreshes config', async () => {
    const created = await createProject(vault, {
      slug: 'relink-me',
      template: 'blank',
      name: 'Relink Me'
    });
    const externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-workdir-relink-'));
    extraRoots.push(externalRoot);
    const externalDir = path.join(externalRoot, 'relink-me-code');
    await fs.mkdir(externalDir, { recursive: true });
    await fs.writeFile(path.join(externalDir, 'package.json'), '{"name":"relink-me"}\n', 'utf8');

    const result = await relinkProjectWorkdir(vault, {
      uid: created.uid,
      workdirPath: externalDir,
      execution_context: 'direct'
    });

    expect(result.workdirPath).toBe(externalDir);
    const config = await readProjectConfig(created.projectPath);
    expect(config?.workdir).toMatchObject({
      path: externalDir,
      linked_via: 'link-existing'
    });
    expect(config?.execution_context.kind).toBe('direct');
    await expect(fs.readFile(path.join(created.projectPath, 'README.md'), 'utf8')).resolves.toContain(
      `- Path: \`${externalDir}\``
    );
  });
});
