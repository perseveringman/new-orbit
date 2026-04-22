import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureVision, readVision, writeVision, excerptFromBody } from '../src/main/vision';
import { createVault } from '../src/main/vault';

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'orbit-vision-'));
}

describe('Vision.md', () => {
  it('createVault seeds Vision.md with default frontmatter + body', async () => {
    const dir = await tmpDir();
    try {
      await createVault(dir);
      const v = await readVision(dir);
      expect(v.exists).toBe(true);
      expect(v.data['type']).toBe('vision');
      expect(typeof v.data['uid']).toBe('string');
      expect(v.body).toMatch(/# 我的愿景/);
      expect(v.body).toMatch(/三年目标/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('ensureVision is idempotent and never overwrites existing content', async () => {
    const dir = await tmpDir();
    try {
      await ensureVision(dir);
      const original = await fs.readFile(path.join(dir, 'Vision.md'), 'utf8');
      const res = await ensureVision(dir);
      expect(res.created).toBe(false);
      const again = await fs.readFile(path.join(dir, 'Vision.md'), 'utf8');
      expect(again).toBe(original);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('writeVision overwrites raw and readVision returns parsed frontmatter', async () => {
    const dir = await tmpDir();
    try {
      await ensureVision(dir);
      const raw = '---\nuid: xyz\ntype: vision\n---\n# New\n\nFocus on orbit.\n';
      await writeVision(dir, raw);
      const v = await readVision(dir);
      expect(v.data['uid']).toBe('xyz');
      expect(v.body).toContain('Focus on orbit');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('excerptFromBody trims to the first N non-trimmed lines', () => {
    const body = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const ex = excerptFromBody(body, 5);
    expect(ex.split(/\n/).length).toBe(5);
    expect(ex).toContain('line 0');
    expect(ex).not.toContain('line 10');
  });
});
