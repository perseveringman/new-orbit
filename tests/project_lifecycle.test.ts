import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { createProject } from '../src/main/project';
import {
  readProjectLifecycleConfig,
  runProjectLifecycle
} from '../src/main/project_lifecycle';

describe('project lifecycle hooks', () => {
  it('reads setup/teardown arrays from project config', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-lifecycle-'));
    try {
      await createVault(vault);
      const created = await createProject(vault, {
        slug: 'demo',
        template: 'blank',
        name: 'Demo'
      });
      const cfgPath = path.join(created.projectPath, '.agent', 'config.json');
      await fs.writeFile(
        cfgPath,
        JSON.stringify(
          {
            uid: created.uid,
            slug: 'demo',
            name: 'Demo',
            template: 'blank',
            created_at: new Date().toISOString(),
            setup: ['echo setup'],
            teardown: ['echo teardown']
          },
          null,
          2
        ),
        'utf8'
      );

      const cfg = await readProjectLifecycleConfig(created.projectPath);
      expect(cfg.setup).toEqual(['echo setup']);
      expect(cfg.teardown).toEqual(['echo teardown']);
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('runs lifecycle commands with Orbit env vars', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-lifecycle-run-'));
    try {
      await createVault(vault);
      const created = await createProject(vault, {
        slug: 'demo',
        template: 'blank',
        name: 'Demo'
      });
      const marker = path.join(created.projectPath, 'marker.txt');
      const cfgPath = path.join(created.projectPath, '.agent', 'config.json');
      await fs.writeFile(
        cfgPath,
        JSON.stringify(
          {
            uid: created.uid,
            slug: 'demo',
            name: 'Demo',
            template: 'blank',
            created_at: new Date().toISOString(),
            setup: [`printf "%s:%s" "$ORBIT_PROJECT_UID" "$ORBIT_WORKTREE_ID" > "${marker}"`],
            teardown: []
          },
          null,
          2
        ),
        'utf8'
      );

      await runProjectLifecycle('setup', {
        projectPath: created.projectPath,
        vaultPath: vault,
        projectUid: created.uid,
        worktreeId: 'wt-1'
      });

      expect(await fs.readFile(marker, 'utf8')).toBe(`${created.uid}:wt-1`);
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});
