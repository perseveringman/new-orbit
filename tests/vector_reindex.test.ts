import { describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VectorStore } from '../src/main/vector/index';
import { createIndexer } from '../src/main/vector/indexer';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() }
}));

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-reindex-'));
  await fs.mkdir(path.join(d, '.orbit/logs'), { recursive: true });
  await fs.mkdir(path.join(d, '01_Projects'), { recursive: true });
  await fs.mkdir(path.join(d, '02_Areas'), { recursive: true });
  await fs.mkdir(path.join(d, '03_Resources/sub'), { recursive: true });
  await fs.mkdir(path.join(d, '04_Archives/2024'), { recursive: true });
  return d;
}

describe('vector reindex', () => {
  it('enumerates only indexable prefixes and respects ignore list', async () => {
    const vault = await tmpVault();
    try {
      // Indexed:
      await fs.writeFile(
        path.join(vault, '03_Resources', 'r1.md'),
        '---\nuid: U1\ntype: resource\ntitle: R1\n---\nbody r1\n'
      );
      await fs.writeFile(
        path.join(vault, '03_Resources/sub', 'r2.md'),
        '---\nuid: U2\ntype: resource\ntitle: R2\n---\nbody r2\n'
      );
      await fs.writeFile(
        path.join(vault, '04_Archives/2024', 'a1.md'),
        '---\nuid: U3\ntype: archive\ntitle: A1\narchived_at: 2024-01-01\noriginal_type: project\n---\nbody a1\n'
      );
      await fs.writeFile(
        path.join(vault, '01_Projects', 'p1.md'),
        '---\nuid: U4\ntype: project\ntitle: P1\nstatus: active\n---\nbody p1\n'
      );
      // Not indexed (areas):
      await fs.writeFile(
        path.join(vault, '02_Areas', 'area.md'),
        '---\nuid: U5\ntype: area\ntitle: Area\n---\narea body\n'
      );
      // Not a markdown file:
      await fs.writeFile(path.join(vault, '03_Resources', 'note.txt'), 'plain text\n');
      // In .orbit (ignored dir):
      await fs.writeFile(path.join(vault, '.orbit/logs', 'x.md'), 'should not appear\n');

      const store = new VectorStore(vault);
      await store.load();
      const idx = createIndexer(vault, store, { batchSize: 10 });
      await idx.rebuildAll();
      await idx.dispose();

      const ids = store.list().map((r) => r.id).sort();
      expect(ids).toEqual(
        ['01_Projects/p1.md', '03_Resources/r1.md', '03_Resources/sub/r2.md', '04_Archives/2024/a1.md'].sort()
      );
      // Areas + non-md must not be present
      for (const r of store.list()) {
        expect(r.relPath.startsWith('02_Areas/')).toBe(false);
        expect(r.relPath.endsWith('.md')).toBe(true);
      }
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});
