import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault, isVault, openVault } from '../src/main/vault';
import { PARA_DIRS, ORBIT_DIR, ORBIT_CONFIG, ORBIT_REFMAP } from '../src/shared/constants';

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'orbit-test-'));
}

describe('vault bootstrap', () => {
  it('creates PARA folders, AGENT.md, .orbit config and a git repo', async () => {
    const dir = await tmpDir();
    try {
      const vault = await createVault(dir);
      expect(vault.path).toBe(dir);

      for (const p of PARA_DIRS) {
        const stat = await fs.stat(path.join(dir, p));
        expect(stat.isDirectory()).toBe(true);
      }

      const agent = await fs.readFile(path.join(dir, 'AGENT.md'), 'utf8');
      expect(agent).toMatch(/Orbit Agent Persona/);

      const cfg = JSON.parse(
        await fs.readFile(path.join(dir, ORBIT_DIR, ORBIT_CONFIG), 'utf8')
      ) as { version: string };
      expect(cfg.version).toBeTruthy();

      const refmap = await fs.readFile(path.join(dir, ORBIT_DIR, ORBIT_REFMAP), 'utf8');
      expect(JSON.parse(refmap)).toEqual({});

      const gitDir = await fs.stat(path.join(dir, '.git'));
      expect(gitDir.isDirectory()).toBe(true);

      const visionAreaAgents = await fs.readFile(
        path.join(dir, '02_Areas', 'vision', '.orbit', 'agent', 'AGENTS.md'),
        'utf8'
      );
      expect(visionAreaAgents).toContain('Personal Vision Agent');

      expect(await isVault(dir)).toBe(true);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('re-opening a vault returns the same config', async () => {
    const dir = await tmpDir();
    try {
      const a = await createVault(dir);
      const b = await openVault(dir);
      expect(b.createdAt).toBe(a.createdAt);
      expect(b.orbitVersion).toBe(a.orbitVersion);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('isVault returns false for a non-orbit directory', async () => {
    const dir = await tmpDir();
    try {
      expect(await isVault(dir)).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
