import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { createProject, readProjectConfig } from '../src/main/project';

describe('project config contract', () => {
  it('scaffolds setup and teardown arrays in .agent/config.json', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-project-config-'));
    try {
      await createVault(vault);
      const created = await createProject(vault, {
        slug: 'demo',
        template: 'blank',
        name: 'Demo'
      });

      const cfg = await readProjectConfig(created.projectPath);
      expect(cfg).toMatchObject({
        uid: expect.any(String),
        slug: 'demo',
        name: 'Demo'
      });
      expect(cfg).toHaveProperty('setup');
      expect(cfg).toHaveProperty('teardown');
      expect(Array.isArray(cfg?.setup)).toBe(true);
      expect(Array.isArray(cfg?.teardown)).toBe(true);
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});
