import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VectorStore, VECTOR_STORE_FILE } from '../src/main/vector/index';
import { hashEmbed } from '../src/main/vector/embed';

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-vec-'));
  await fs.mkdir(path.join(d, '.orbit'), { recursive: true });
  return d;
}

function rec(id: string, kind: 'resource' | 'archive' | 'project', text: string) {
  return {
    id,
    uid: id,
    kind,
    relPath: id,
    title: id,
    excerpt: text.slice(0, 40),
    embedding: hashEmbed(text)
  };
}

describe('VectorStore (pure-JS fallback)', () => {
  it('upsert + search returns the nearest id', async () => {
    const vault = await tmpVault();
    try {
      const s = new VectorStore(vault);
      await s.load();
      s.upsert(rec('a.md', 'resource', 'distillation orbit vision project'));
      s.upsert(rec('b.md', 'archive', 'banana recipe fried rice'));
      s.upsert(rec('c.md', 'resource', 'orbit distilled summary'));
      const q = hashEmbed('orbit distillation summary');
      const hits = s.search(q, 3);
      expect(hits[0]).toBeDefined();
      expect(['a.md', 'c.md']).toContain(hits[0]!.id);
      // banana should not come first
      expect(hits[0]!.id).not.toBe('b.md');
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('remove drops the record', async () => {
    const vault = await tmpVault();
    try {
      const s = new VectorStore(vault);
      await s.load();
      s.upsert(rec('x.md', 'resource', 'foo bar baz'));
      expect(s.has('x.md')).toBe(true);
      expect(s.remove('x.md')).toBe(true);
      expect(s.has('x.md')).toBe(false);
      expect(s.remove('x.md')).toBe(false);
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('filter by kind works', async () => {
    const vault = await tmpVault();
    try {
      const s = new VectorStore(vault);
      await s.load();
      s.upsert(rec('r.md', 'resource', 'alpha beta gamma'));
      s.upsert(rec('a.md', 'archive', 'alpha beta gamma'));
      s.upsert(rec('p.md', 'project', 'alpha beta gamma'));
      const q = hashEmbed('alpha beta gamma');
      const onlyRes = s.search(q, 5, { kind: 'resource' });
      expect(onlyRes.map((h) => h.id)).toEqual(['r.md']);
      const resOrArch = s
        .search(q, 5, { kind: ['resource', 'archive'] })
        .map((h) => h.id)
        .sort();
      expect(resOrArch).toEqual(['a.md', 'r.md']);
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('persistence round-trips through JSON', async () => {
    const vault = await tmpVault();
    try {
      const s1 = new VectorStore(vault);
      await s1.load();
      s1.upsert(rec('p.md', 'resource', 'seed text for persistence'));
      await s1.flush();
      const raw = await fs.readFile(
        path.join(vault, '.orbit', VECTOR_STORE_FILE),
        'utf8'
      );
      expect(raw).toContain('"id":"p.md"');

      const s2 = new VectorStore(vault);
      await s2.load();
      expect(s2.size()).toBe(1);
      const hits = s2.search(hashEmbed('seed text'), 1);
      expect(hits[0]?.id).toBe('p.md');
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('search is deterministic: equal-score ties break by id ascending', async () => {
    const vault = await tmpVault();
    try {
      const s = new VectorStore(vault);
      await s.load();
      // same text -> identical score to a query matching it
      s.upsert(rec('z.md', 'resource', 'alpha beta'));
      s.upsert(rec('a.md', 'resource', 'alpha beta'));
      const hits = s.search(hashEmbed('alpha beta'), 2);
      expect(hits.map((h) => h.id)).toEqual(['a.md', 'z.md']);
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});
