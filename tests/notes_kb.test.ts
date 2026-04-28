import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNoteStore } from '../src/main/note/store';
import { createKnowledgeBaseStore } from '../src/main/knowledge-base/store';
import { TRACEABLE_EVENT_KINDS } from '../src/shared/events/kinds';

let tmp: string;
let source: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-notes-kb-'));
  source = await mkdtemp(path.join(os.tmpdir(), 'orbit-kb-source-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
  await rm(source, { recursive: true, force: true });
});

describe('NoteStore Phase 6.1 contracts', () => {
  it('creates, updates, searches, filters, and archives notes with Layer 1 refs', async () => {
    const notes = createNoteStore(tmp);
    const note = await notes.create({
      type: 'thought',
      title: 'Resource thinking',
      body: 'A note about [[Orbit]] and second brain.',
      tags: ['pkm'],
      areas: [
        {
          area_slug: 'engineering',
          primary: true,
          assigned_at: '2026-04-28T00:00:00Z',
          assigned_by: 'user'
        }
      ],
      resource_refs: ['resources/orbit'],
      synthesis_ref: 'artifact-1'
    });

    expect(note.path).toMatch(/^notes\/thoughts\//);
    expect(note.frontmatter.links_out).toEqual(['Orbit']);
    expect(note.frontmatter.areas?.[0].area_slug).toBe('engineering');
    expect(note.frontmatter.resource_refs).toEqual(['resources/orbit']);
    expect(note.frontmatter.synthesis_ref).toBe('artifact-1');

    await notes.update(note.frontmatter.id, {
      body: 'Updated note about Orbit.',
      tags: ['pkm', 'orbit'],
      resource_refs: ['resources/orbit', 'resources/basb']
    });

    expect((await notes.search('updated'))[0]?.frontmatter.id).toBe(note.frontmatter.id);
    expect((await notes.list({ area_slug: 'engineering' })).map((item) => item.frontmatter.id)).toEqual([
      note.frontmatter.id
    ]);
    expect((await notes.list({ resource_ref: 'resources/basb' })).map((item) => item.frontmatter.id)).toEqual([
      note.frontmatter.id
    ]);

    const archived = await notes.archive(note.frontmatter.id);
    expect(archived.path).toContain('04_Archives/notes/thoughts/');
    expect(await notes.list()).toEqual([]);
    expect(await notes.get(note.frontmatter.id)).not.toBeNull();
  });
});

describe('KnowledgeBaseStore Phase 6.1 activation gate', () => {
  it('imports markdown folders and activates docs into notes with origin metadata', async () => {
    await mkdir(path.join(source, 'folder'), { recursive: true });
    await writeFile(
      path.join(source, 'folder', 'idea.md'),
      '# Existing Idea\n\nProgressive summarization should stay traceable.',
      'utf8'
    );
    const kbStore = createKnowledgeBaseStore(tmp);

    const kb = await kbStore.import({
      name: 'Old Obsidian',
      sourcePath: source,
      sourceType: 'obsidian'
    });
    expect(kb.path).toBe('knowledge-base/old-obsidian');
    expect(kb.item_count).toBe(1);

    const hits = await kbStore.search(kb.id, 'summarization');
    expect(hits[0]?.path).toBe('knowledge-base/old-obsidian/folder/idea.md');

    const note = await kbStore.activate({
      kbId: kb.id,
      sourceFile: hits[0].path,
      excerpt: hits[0].excerpt,
      targetType: 'capture',
      userText: 'Activated because it matters to Orbit.'
    });
    expect(note.frontmatter.type).toBe('capture');
    expect(note.frontmatter.source).toMatchObject({
      kind: 'kb',
      ref: `${kb.id}/folder/idea.md`
    });

    const annotationDir = path.join(tmp, 'knowledge-base', '.orbit-kb-meta', 'annotations', kb.id);
    const files = await readdir(annotationDir);
    const annotation = JSON.parse(await readFile(path.join(annotationDir, files[0]), 'utf8')) as {
      activations: Array<{ note_id: string; source_ref: string }>;
    };
    expect(annotation.activations[0]).toMatchObject({
      note_id: note.frontmatter.id,
      source_ref: `${kb.id}/folder/idea.md`
    });
  });

  it('declares the Phase 6.1 activation event kind', () => {
    expect(TRACEABLE_EVENT_KINDS).toContain('kb.doc.activated');
  });
});
