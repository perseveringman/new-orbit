import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNoteStore } from '../src/main/note/store';
import { projectNote } from '../src/main/semantic/document-projectors';
import { embedText, LOCAL_EMBEDDING_DIMENSIONS } from '../src/main/semantic/embedder';
import { hybridSearch } from '../src/main/semantic/hybrid-search';
import { createSemanticIndexStore, type IndexedSemanticDocument } from '../src/main/semantic/index-store';
import { searchAndAnswer } from '../src/main/semantic/search-answer';
import { searchWithContext } from '../src/main/semantic/search-context';
import { searchAnswerPrompt } from '../src/main/synthesis/prompts/search.answer.v1';
import { evidenceSourceId } from '../src/shared/evidence';
import type { SemanticDocument } from '../src/shared/semantic';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-semantic-'));
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('Semantic Search', () => {
  it('projects notes into Layer 1 semantic documents with area and resource refs', async () => {
    const note = await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'Local-first memory',
      body: '# Memory\nOrbit should recall stable facts.',
      tags: ['memory'],
      areas: [{ area_slug: 'learning', assigned_at: '2026-04-30T00:00:00.000Z', assigned_by: 'user' }],
      resource_refs: ['second-brain']
    });

    const doc = projectNote(note);

    expect(doc.id).toBe(`note:${note.frontmatter.id}`);
    expect(doc.layer).toBe(1);
    expect(doc.layer_label).toBe('truth');
    expect(doc.source_id).toBe(evidenceSourceId('note', note.frontmatter.id));
    expect(doc.evidence_selectors).toEqual([
      {
        source_id: evidenceSourceId('note', note.frontmatter.id),
        kind: 'whole_source',
        content_view: 'safe_projection',
        reason: 'semantic projection'
      }
    ]);
    expect(doc.areas).toEqual(['learning']);
    expect(doc.resource_refs).toEqual(['second-brain']);
    expect(doc.content).toContain('Orbit should recall stable facts');
  });

  it('produces deterministic local embeddings with the expected dimension', async () => {
    const first = await embedText('semantic search memory');
    const second = await embedText('semantic search memory');

    expect(first.dimensions).toBe(LOCAL_EMBEDDING_DIMENSIONS);
    expect(first.vector.length).toBe(LOCAL_EMBEDDING_DIMENSIONS);
    expect(Array.from(first.vector)).toEqual(Array.from(second.vector));
  });

  it('ranks hybrid search by keyword and semantic score while deduping by document', async () => {
    const docs = await Promise.all([
      indexedDoc({ id: 'note:1', title: 'Memory recall', content: 'stable memory recall for conversations' }),
      indexedDoc({ id: 'resource:1', title: 'Garden planning', content: 'plant schedule and soil health' })
    ]);

    const results = await hybridSearch(docs, { text: 'memory recall', match_mode: 'hybrid', top_k: 5 });

    expect(results[0].doc.id).toBe('note:1');
    expect(results.map((result) => result.doc.id)).toEqual(['note:1', 'resource:1']);
  });

  it('rebuilds the on-disk index and refreshes changed note content', async () => {
    const notes = createNoteStore(vaultPath);
    const note = await notes.create({ type: 'capture', title: 'Searchable note', body: 'first body' });
    const store = createSemanticIndexStore(vaultPath);

    let status = await store.rebuildIndex();
    expect(status.total_docs).toBe(1);

    await notes.update(note.frontmatter.id, { body: 'second body with semantic memory' });
    status = await store.rebuildIndex();
    expect(status.indexed_docs).toBe(1);
    const result = await store.search({ text: 'semantic memory', match_mode: 'hybrid', top_k: 5 });
    expect(result.results[0].doc.content).toContain('second body');
  });

  it('generates a search.answer synthesis artifact with provenance', async () => {
    await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'Search answer source',
      body: 'Semantic search answers cite result documents.'
    });
    await createSemanticIndexStore(vaultPath).rebuildIndex();

    const response = await searchAndAnswer(vaultPath, { text: 'search answers', match_mode: 'hybrid', top_k: 3 });

    expect(response.answer?.kind).toBe('search.answer');
    expect(response.answer?.sources[0].ref).toMatch(/^note:/);
    expect(response.answer?.sources.some((source) => source.title?.startsWith('Context Packet'))).toBe(true);
    expect(response.context_packet?.sections.length).toBeGreaterThan(0);
    expect(response.answer?.provenance.prompt_version).toBe('search.answer.v1');
  });

  it('instructs search answers to stay user-facing instead of exposing retrieval internals', () => {
    const rendered = searchAnswerPrompt.render({
      scope_key: 'search.answer:test',
      sources: [{ ref: 'note:1', title: 'Answer source', excerpt: 'Plain evidence.' }]
    });

    expect(rendered.system).toContain('Give the user a useful answer first');
    expect(rendered.system).toContain('Do not expose internal implementation terms');
    expect(rendered.system).toContain('If the provided documents are insufficient');
    expect(rendered.user).toContain('Return JSON');
  });

  it('attaches a PMIL context packet with Personal QA to search responses', async () => {
    await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'GraphRAG recall',
      body: '[[GraphRAG]] improves recall by connecting [[Evidence Chunk]] hits, [[Personal QA]], and graph neighbors.',
      resource_refs: ['pmil']
    });
    await createSemanticIndexStore(vaultPath).rebuildIndex();

    const response = await searchWithContext(
      vaultPath,
      {
        text: 'GraphRAG recall',
        match_mode: 'hybrid',
        resources: ['pmil'],
        top_k: 5
      },
      { synthesisMode: 'ensure' }
    );

    expect(response.results[0].doc.title).toBe('GraphRAG recall');
    expect(response.context_packet?.scope).toEqual({ kind: 'resource', ref: 'pmil' });
    expect(response.context_packet?.sections.map((section) => section.kind)).toEqual(
      expect.arrayContaining(['relevant_evidence', 'synthesis'])
    );
    expect(response.context_packet?.sections.find((section) => section.kind === 'synthesis')?.content).toContain('GraphRAG');
    expect(response.context_packet?.synthesis_refs.length).toBeGreaterThan(0);
    expect(response.context_packet?.evidence.length).toBeGreaterThan(0);
  });

  it('returns an empty result set for unmatched filters', async () => {
    await createNoteStore(vaultPath).create({ type: 'thought', title: 'Learning note', body: 'Area scoped search' });
    const store = createSemanticIndexStore(vaultPath);
    await store.rebuildIndex();

    const response = await store.search({ text: 'Area scoped search', match_mode: 'keyword', areas: ['health'], top_k: 5 });

    expect(response.results).toEqual([]);
    expect(response.total).toBe(0);
  });
});

async function indexedDoc(input: { id: string; title: string; content: string }): Promise<IndexedSemanticDocument> {
  const doc: SemanticDocument = {
    id: input.id,
    entity_kind: input.id.startsWith('resource') ? 'resource' : 'note',
    entity_ref: input.id.split(':')[1],
    title: input.title,
    content: input.content,
    layer: 1,
    layer_label: 'truth',
    updated_at: '2026-04-30T00:00:00.000Z'
  };
  const embedding = await embedText(`${input.title}\n${input.content}`);
  return {
    doc,
    embedding: {
      doc_id: doc.id,
      model: embedding.model,
      dimensions: embedding.dimensions,
      vector_file: `${doc.id}.bin`,
      content_hash: doc.id,
      embedded_at: '2026-04-30T00:00:00.000Z'
    },
    vector: embedding.vector
  };
}
