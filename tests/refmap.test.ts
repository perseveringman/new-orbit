import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ORBIT_DIR, ORBIT_REFMAP } from '../src/shared/constants';
import { RefmapStore } from '../src/main/refmap';

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-refmap-'));
  await fs.mkdir(path.join(d, ORBIT_DIR), { recursive: true });
  await fs.writeFile(path.join(d, ORBIT_DIR, ORBIT_REFMAP), '{}\n', 'utf8');
  return d;
}

describe('refmap reconcile', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('injects uids into files missing them and records their paths', async () => {
    await fs.writeFile(path.join(vault, 'a.md'), '# a\n', 'utf8');
    await fs.mkdir(path.join(vault, 'sub'), { recursive: true });
    await fs.writeFile(path.join(vault, 'sub', 'b.md'), '---\ntitle: B\n---\n body\n', 'utf8');

    const rm = new RefmapStore(vault);
    await rm.load();
    await rm.reconcile();

    const aContent = await fs.readFile(path.join(vault, 'a.md'), 'utf8');
    const bContent = await fs.readFile(path.join(vault, 'sub', 'b.md'), 'utf8');
    expect(aContent).toMatch(/uid: [A-Za-z0-9_-]{12}/);
    expect(bContent).toMatch(/uid: [A-Za-z0-9_-]{12}/);

    const snap = rm.snapshot();
    expect(new Set(Object.values(snap))).toEqual(new Set(['a.md', 'sub/b.md']));
  });

  it('prunes stale entries whose files no longer exist, keeps live ones', async () => {
    await fs.writeFile(path.join(vault, 'live.md'), '# live\n', 'utf8');
    const rm1 = new RefmapStore(vault);
    await rm1.load();
    await rm1.reconcile();

    // Seed a stale entry into the refmap.
    await fs.writeFile(
      path.join(vault, ORBIT_DIR, ORBIT_REFMAP),
      JSON.stringify({ ...rm1.snapshot(), ghost123456X: 'ghost.md' }, null, 2),
      'utf8'
    );

    const rm2 = new RefmapStore(vault);
    await rm2.load();
    await rm2.reconcile();
    const snap = rm2.snapshot();
    expect(snap['ghost123456X']).toBeUndefined();
    expect(Object.values(snap)).toContain('live.md');
  });

  it('picks up newly-added files on re-reconcile', async () => {
    const rm = new RefmapStore(vault);
    await rm.load();
    await rm.reconcile();
    expect(Object.keys(rm.snapshot()).length).toBe(0);

    await fs.writeFile(path.join(vault, 'fresh.md'), '# fresh\n', 'utf8');
    await rm.reconcile();
    expect(Object.values(rm.snapshot())).toContain('fresh.md');
  });
});
