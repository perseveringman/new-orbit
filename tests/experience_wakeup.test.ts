import { describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VectorStore } from '../src/main/vector/index';
import { createIndexer } from '../src/main/vector/indexer';
import { hashEmbed } from '../src/main/vector/embed';
import { suggestExperience, WAKEUP_THRESHOLD } from '../src/main/distill/wakeup';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() }
}));

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-wake-'));
  await fs.mkdir(path.join(d, '.orbit'), { recursive: true });
  await fs.mkdir(path.join(d, '01_Projects'), { recursive: true });
  await fs.mkdir(path.join(d, '03_Resources'), { recursive: true });
  await fs.mkdir(path.join(d, '04_Archives/2024'), { recursive: true });
  await fs.writeFile(path.join(d, '.orbit', 'refmap.json'), '{}\n', 'utf8');
  await fs.writeFile(
    path.join(d, '.orbit', 'config.json'),
    JSON.stringify({ version: '0.1.0', createdAt: new Date().toISOString(), name: 't' }),
    'utf8'
  );
  return d;
}

describe('experience wake-up', () => {
  it('suggestExperience returns top-k above threshold in deterministic order', async () => {
    const vault = await tmpVault();
    try {
      // Resource + archive + random
      await fs.writeFile(
        path.join(vault, '03_Resources', 'agent-wakeup.md'),
        '---\nuid: R1\ntype: resource\ntitle: Agent wake-up patterns\n---\nwake up agent past experience distillation orbit\n',
        'utf8'
      );
      await fs.writeFile(
        path.join(vault, '04_Archives', '2024', 'Prior-project.md'),
        '---\nuid: A1\ntype: archive\ntitle: Prior project\narchived_at: 2024-01-01\noriginal_type: project\n---\nprior project body with orbit and distillation keywords\n',
        'utf8'
      );
      await fs.writeFile(
        path.join(vault, '03_Resources', 'banana.md'),
        '---\nuid: R2\ntype: resource\ntitle: Banana recipe\n---\nbanana flour butter sugar eggs\n',
        'utf8'
      );
      // Current task inside a project.
      await fs.writeFile(
        path.join(vault, '01_Projects', 'Live.md'),
        '---\nuid: PLIVE\ntype: project\ntitle: Live orbit wake-up\nstatus: active\n---\n- [ ] wire the distillation orbit experience\n',
        'utf8'
      );

      const { openFsSession, closeFsSession, registerFsIpc, currentSession } =
        await import('../src/main/fs');
      registerFsIpc();
      await openFsSession(vault);
      const sess = currentSession()!;

      const store = new VectorStore(vault);
      await store.load();
      const idx = createIndexer(vault, store, { batchSize: 10 });
      await idx.rebuildAll();
      await idx.dispose();

      // Pick the inline task
      const task = sess.tasks
        .allTasks()
        .find((t) => t.title.includes('distillation'))!;
      expect(task).toBeDefined();

      const hits = suggestExperience(sess, store, task, 3);
      expect(hits.length).toBeGreaterThan(0);
      for (const h of hits) expect(h.score).toBeGreaterThanOrEqual(WAKEUP_THRESHOLD);
      // Banana shouldn't make the cut.
      expect(hits.find((h) => h.meta.relPath.includes('banana'))).toBeUndefined();
      // Deterministic: top hit is stable across two calls.
      const hits2 = suggestExperience(sess, store, task, 3);
      expect(hits2.map((h) => h.id)).toEqual(hits.map((h) => h.id));

      await closeFsSession();
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('empty store returns no hits (does not throw)', async () => {
    const vault = await tmpVault();
    try {
      const { openFsSession, closeFsSession, registerFsIpc, currentSession } =
        await import('../src/main/fs');
      registerFsIpc();
      await openFsSession(vault);
      const sess = currentSession()!;
      const store = new VectorStore(vault);
      await store.load();
      const fakeTask = {
        id: 'inline:x.md:1',
        source: 'inline' as const,
        status: 'inbox' as const,
        title: 'orbit distill',
        filePath: '/x',
        relPath: 'x.md'
      };
      const hits = suggestExperience(sess, store, fakeTask);
      expect(hits).toEqual([]);
      // sanity: embedding still works
      const e = hashEmbed('orbit distill');
      expect(e.length).toBe(512);
      await closeFsSession();
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});
