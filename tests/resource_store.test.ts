import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createNoteStore } from '../src/main/note/store';
import { createResourceStore } from '../src/main/resource/store';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-resource-'));
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('ResourceStore', () => {
  it('creates a topic workstation with structured sections', async () => {
    const store = createResourceStore(vaultPath);

    const resource = await store.create({
      title: 'Personal Knowledge Management',
      tags: ['pkm'],
      body: '# Personal Knowledge Management\n'
    });

    expect(resource.frontmatter.slug).toBe('personal-knowledge-management');
    expect(resource.frontmatter.type).toBe('resource');
    expect(resource.path).toBe('resources/personal-knowledge-management/index.md');
    await expect(fs.stat(path.join(vaultPath, 'resources', resource.frontmatter.slug, '_canonical'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(vaultPath, 'resources', resource.frontmatter.slug, '_distilled'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(vaultPath, 'resources', resource.frontmatter.slug, '_related'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(vaultPath, 'resources', resource.frontmatter.slug, '_people'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(vaultPath, 'resources', resource.frontmatter.slug, '_projects-touched'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(vaultPath, 'resources', resource.frontmatter.slug, '_timeline'))).resolves.toBeDefined();
  });

  it('links references and records engagement timeline entries', async () => {
    const store = createResourceStore(vaultPath);
    const resource = await store.create({ title: 'LLM Workflows' });

    const linked = await store.linkRef(resource.frontmatter.slug, {
      kind: 'url',
      ref: 'https://example.com/llm-workflows',
      title: 'Reference article',
      section: 'canonical'
    });
    const engagement = await store.engage(resource.frontmatter.slug, {
      title: 'Applied in weekly review',
      summary: 'Used the workflow while reviewing notes.'
    });

    expect(linked.refs).toHaveLength(1);
    expect(linked.counts.canonical).toBe(1);
    expect(engagement.resource.frontmatter.engagement_count).toBe(2);
    expect(engagement.resource.timeline.map((entry) => entry.kind)).toEqual([
      'created',
      'linked',
      'engaged'
    ]);
  });

  it('suggests resources from repeated note tags and creates one from samples', async () => {
    const notes = createNoteStore(vaultPath);
    await notes.create({ type: 'thought', title: 'First pkm note', body: 'Zettelkasten capture', tags: ['pkm'] });
    await notes.create({ type: 'longform', title: 'Second pkm note', body: 'Evergreen notes', tags: ['pkm'] });
    await notes.create({ type: 'capture', title: 'Solo note', body: 'One-off', tags: ['misc'] });

    const store = createResourceStore(vaultPath);
    const suggestions = await store.suggestFromNotes({ minNotes: 2, limit: 5 });
    const pkm = suggestions.find((suggestion) => suggestion.tag === 'pkm');

    expect(pkm?.note_count).toBe(2);
    expect(pkm?.sample_notes).toHaveLength(2);

    const resource = await store.createFromSuggestion({ suggestion: pkm! });
    expect(resource.frontmatter.title).toBe('Pkm');
    expect(resource.counts.distilled).toBe(2);
    expect(resource.frontmatter.tags).toContain('pkm');
  });
});
