import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { createVault } from '../src/main/vault';
import { createProject } from '../src/main/project';
import { WorktreeManager } from '../src/main/git/worktree';

describe('worktree lifecycle hooks', () => {
  it('runs setup on create and teardown on remove', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-worktree-hooks-'));
    try {
      await createVault(vault);
      const created = await createProject(vault, {
        slug: 'demo',
        template: 'blank',
        name: 'Demo'
      });
      const cfgPath = path.join(created.projectPath, '.agent', 'config.json');
      const setupMarker = path.join(created.projectPath, 'setup.marker');
      const teardownMarker = path.join(created.projectPath, 'teardown.marker');
      await fs.writeFile(
        cfgPath,
        JSON.stringify(
          {
            uid: created.uid,
            slug: 'demo',
            name: 'Demo',
            template: 'blank',
            created_at: new Date().toISOString(),
            setup: [`touch "${setupMarker}"`],
            teardown: [`touch "${teardownMarker}"`]
          },
          null,
          2
        ),
        'utf8'
      );

      const git = simpleGit(created.projectPath);
      await git.branch(['-M', 'main']);

      const manager = new WorktreeManager({ vault: created.projectPath });
      const rec = await manager.create();
      expect(await fs.stat(setupMarker)).toBeTruthy();

      await manager.remove(rec.id, { force: true });
      expect(await fs.stat(teardownMarker)).toBeTruthy();
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});
