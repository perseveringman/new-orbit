import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPersona } from '../src/main/agent/persona';
import { writeVision, ensureVision } from '../src/main/vision';

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'orbit-persona-vision-'));
}

describe('loadPersona + Vision', () => {
  it('appends North Star section when Vision.md exists', async () => {
    const dir = await tmp();
    try {
      await fs.writeFile(path.join(dir, 'AGENT.md'), 'You are Orbit.', 'utf8');
      await writeVision(
        dir,
        '---\nuid: v1\ntype: vision\n---\n# Vision\n\nBuild the best tool.\n'
      );
      const p = await loadPersona(dir);
      expect(p).toContain('You are Orbit.');
      expect(p).toContain('## 北极星 / North Star');
      expect(p).toContain('Build the best tool');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('is idempotent: does not duplicate North Star if already present in AGENT.md', async () => {
    const dir = await tmp();
    try {
      await fs.writeFile(
        path.join(dir, 'AGENT.md'),
        'You are Orbit.\n\n## 北极星 / North Star\n\nalready here',
        'utf8'
      );
      await writeVision(dir, '---\nuid: v1\ntype: vision\n---\n# Vision\n\nFresh vision.\n');
      const p = await loadPersona(dir);
      const matches = p.match(/## 北极星 \/ North Star/g) ?? [];
      expect(matches.length).toBe(1);
      expect(p).toContain('already here');
      expect(p).not.toContain('Fresh vision');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('returns AGENT.md body unchanged when Vision.md is missing', async () => {
    const dir = await tmp();
    try {
      await fs.writeFile(path.join(dir, 'AGENT.md'), 'Persona only.', 'utf8');
      const p = await loadPersona(dir);
      expect(p).toContain('Persona only');
      expect(p).not.toContain('North Star');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('works when vault has only Vision.md and no AGENT.md (default persona + north star)', async () => {
    const dir = await tmp();
    try {
      await ensureVision(dir);
      const p = await loadPersona(dir);
      expect(p).toContain('## 北极星 / North Star');
      expect(p).toContain('我的愿景');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
