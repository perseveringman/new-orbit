import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLibraryStore } from '../src/main/library/store';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-library-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('LibraryStore Phase 6.2 workstation', () => {
  it('saves URL material as Layer 1 LibraryItem with refs and searchable filters', async () => {
    const library = createLibraryStore(tmp);
    const item = await library.save({
      kind: 'article',
      url: 'https://example.com/deep-work',
      title: 'Deep Work',
      body: 'Focus blocks compound.',
      tags: ['productivity'],
      areas: [{ area_slug: 'work', primary: true, assigned_at: '2026-04-28T00:00:00Z', assigned_by: 'user' }],
      resource_refs: ['resources/focus']
    });

    expect(item.path).toBe('library/articles/deep-work.md');
    expect(item.frontmatter.status).toBe('saved');
    expect(item.frontmatter.source).toMatchObject({ kind: 'url', url: 'https://example.com/deep-work' });
    expect((await library.list({ area_slug: 'work' })).map((entry) => entry.frontmatter.id)).toEqual([
      item.frontmatter.id
    ]);
    expect((await library.list({ resource_ref: 'resources/focus' })).map((entry) => entry.frontmatter.id)).toEqual([
      item.frontmatter.id
    ]);
  });

  it('updates reading state, annotations, distillation artifact, accepted note, and archive state', async () => {
    const library = createLibraryStore(tmp);
    const item = await library.save({
      url: 'https://example.com/orbit-library',
      title: 'Orbit Library',
      body: '# Orbit Library\n\nLibrary distillation should create artifacts first.\n\nSecond point.',
      tags: ['orbit']
    });

    const annotated = await library.annotate(item.frontmatter.id, {
      text: 'Library distillation should create artifacts first.',
      comment: 'Important boundary'
    });
    expect(annotated.frontmatter.annotations).toHaveLength(1);

    const read = await library.markRead(item.frontmatter.id, { markRead: true, readingSecondsDelta: 30 });
    expect(read.frontmatter.status).toBe('read');
    expect(read.frontmatter.reading_progress).toBe(1);
    expect(read.frontmatter.total_reading_seconds).toBe(30);

    const distilled = await library.distill(item.frontmatter.id);
    expect(distilled.artifact.kind).toBe('distill.library');
    expect(distilled.artifact.scope_key).toBe(`library:${item.frontmatter.id}`);
    expect(distilled.item.frontmatter.distillation_artifact_ids).toContain(distilled.artifact.id);

    const accepted = await library.acceptDistillation({ artifact_id: distilled.artifact.id });
    expect(accepted.note_path).toMatch(/^notes\/longforms\//);
    const noteRaw = await readFile(path.join(tmp, accepted.note_path), 'utf8');
    expect(noteRaw).toContain(`synthesis_ref: ${distilled.artifact.id}`);
    expect(accepted.item.frontmatter.status).toBe('distilled');
    expect(accepted.item.frontmatter.distilled_note_ids).toContain(accepted.note_id);

    const archived = await library.archive(item.frontmatter.id);
    expect(archived.path).toContain('04_Archives/library/articles/');
    expect(await library.list()).toEqual([]);
    expect((await library.get(item.frontmatter.id))?.frontmatter.status).toBe('archived');
  });
});
