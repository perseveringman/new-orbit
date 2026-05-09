import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readVisionForSystemPrompt } from '../src/main/agent-tools/vision-reader';

describe('readVisionForSystemPrompt', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await mkdtemp(path.join(os.tmpdir(), 'orbit-vision-'));
  });
  afterEach(async () => {
    await rm(vault, { recursive: true, force: true });
  });

  it('returns empty string when vault is null', async () => {
    const out = await readVisionForSystemPrompt(null);
    expect(out).toBe('');
  });

  it('returns empty string when Vision.md is missing', async () => {
    const out = await readVisionForSystemPrompt(vault);
    expect(out).toBe('');
  });

  it('strips frontmatter and wraps body under North Star heading', async () => {
    await writeFile(
      path.join(vault, 'Vision.md'),
      '---\ntitle: My Vision\n---\n\n# Mission\nBuild a calm AI workbench.\n',
      'utf8'
    );
    const out = await readVisionForSystemPrompt(vault);
    expect(out.startsWith('## North Star\n')).toBe(true);
    expect(out).toContain('Build a calm AI workbench.');
    expect(out).not.toContain('title: My Vision');
  });

  it('clips body when exceeding maxChars and adds ellipsis', async () => {
    const big = 'x'.repeat(8000);
    await writeFile(path.join(vault, 'Vision.md'), big, 'utf8');
    const out = await readVisionForSystemPrompt(vault, { maxChars: 100 });
    expect(out.length).toBeLessThan(200);
    expect(out).toContain('…');
  });
});
