import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildContextPacket, ensurePersonalQA, generateWorkContextReport, listPersonalQAHits } from '../src/main/context';
import {
  createEvidenceChunkIndexStore,
  createEvidenceGraphStore,
  entityNodeId,
  sourceNodeId
} from '../src/main/evidence';
import { createMemoryStore } from '../src/main/memory/store';
import { createNoteStore } from '../src/main/note/store';
import { projectSynthesisArtifact } from '../src/main/semantic/document-projectors';
import { evidenceSourceId } from '../src/shared/evidence';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-pmil-recall-'));
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('PMIL recall foundation', () => {
  it('builds stable evidence chunks that can be searched below whole-document level', async () => {
    const note = await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'GraphRAG strategy',
      body: '[[GraphRAG]] should help [[Context Packet]] expand from [[Evidence Chunk]] hits.',
      resource_refs: ['pmil']
    });
    await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'Personal QA strategy',
      body: '[[Personal QA]] should be query-shaped synthesis for repeated questions.',
      resource_refs: ['pmil']
    });

    const store = createEvidenceChunkIndexStore(vaultPath);
    const index = await store.rebuild({ includeActivities: false });
    const results = await store.search({ query: 'GraphRAG Context Packet', limit: 5 });

    expect(Object.keys(index.chunks).length).toBeGreaterThan(0);
    expect(results[0].chunk.source_id).toBe(evidenceSourceId('note', note.frontmatter.id));
    expect(results[0].chunk.selector.kind).toBe('semantic_chunk');
    expect(results[0].chunk.entities).toEqual(expect.arrayContaining(['GraphRAG', 'Context Packet']));
  });

  it('projects chunks into a deterministic graph for entity navigation', async () => {
    const note = await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'GraphRAG strategy',
      body: '[[GraphRAG]] connects [[Evidence Chunk]] to [[Context Packet]].',
      resource_refs: ['pmil']
    });
    await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'GraphRAG and Personal QA',
      body: '[[GraphRAG]] can seed [[Personal QA]] and entity pages.',
      resource_refs: ['pmil']
    });

    const graph = await createEvidenceGraphStore(vaultPath).rebuild({ includeActivities: false });
    const graphRagNode = graph.nodes[entityNodeId('GraphRAG')];
    const noteNode = graph.nodes[sourceNodeId(evidenceSourceId('note', note.frontmatter.id))];
    const neighbors = await createEvidenceGraphStore(vaultPath).neighbors({ entity: 'GraphRAG', limit: 20 });

    expect(graphRagNode?.kind).toBe('entity');
    expect(noteNode?.kind).toBe('evidence_source');
    expect(neighbors.neighbors.map((neighbor) => neighbor.node.id)).toContain(noteNode?.id);
    expect(neighbors.neighbors.some((neighbor) => neighbor.edge.kind === 'co_occurs')).toBe(true);
  });

  it('assembles a cited context packet from evidence chunks and graph neighbors', async () => {
    await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'GraphRAG strategy',
      body: '[[GraphRAG]] should be a navigation layer, not the source of truth. It points from [[Evidence Chunk]] to [[Context Packet]].',
      resource_refs: ['pmil']
    });
    await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'Personal QA strategy',
      body: '[[Personal QA]] should be query-shaped synthesis, with citations back to evidence.',
      resource_refs: ['pmil']
    });

    await createEvidenceChunkIndexStore(vaultPath).rebuild({ includeActivities: false });
    await createEvidenceGraphStore(vaultPath).rebuild({ includeActivities: false });
    const packet = await buildContextPacket(vaultPath, {
      purpose: 'ask',
      scope: { kind: 'resource', ref: 'pmil' },
      query: 'How should GraphRAG improve PMIL recall?',
      max_tokens: 1200
    });

    expect(packet.scope).toEqual({ kind: 'resource', ref: 'pmil' });
    expect(packet.sections.map((section) => section.kind)).toEqual(
      expect.arrayContaining(['scope_summary', 'relevant_evidence', 'graph_neighbors'])
    );
    expect(packet.evidence.length).toBeGreaterThan(0);
    expect(packet.sections.find((section) => section.kind === 'relevant_evidence')?.content).toContain('GraphRAG');
    expect(packet.sections.find((section) => section.kind === 'graph_neighbors')?.content).toContain('GraphRAG');
  });

  it('generates query-shaped Personal QA artifacts and injects them into context packets', async () => {
    await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'GraphRAG recall strategy',
      body: '[[GraphRAG]] should turn [[Evidence Chunk]] hits into better navigation for [[Context Packet]].',
      resource_refs: ['pmil']
    });
    await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'Personal QA recall strategy',
      body: '[[Personal QA]] should become a query-shaped synthesis artifact that still cites evidence selectors.',
      resource_refs: ['pmil']
    });

    await createEvidenceChunkIndexStore(vaultPath).rebuild({ includeActivities: false });
    const artifacts = await ensurePersonalQA(vaultPath, {
      scope: { kind: 'resource', ref: 'pmil' },
      query: 'GraphRAG recall',
      limit: 2
    });
    const hits = await listPersonalQAHits(vaultPath, {
      scope: { kind: 'resource', ref: 'pmil' },
      query: 'GraphRAG recall',
      limit: 2
    });
    const projected = projectSynthesisArtifact(artifacts[0]);

    expect(artifacts[0].kind).toBe('qa.personal');
    expect(artifacts[0].payload.question).toContain('GraphRAG');
    expect(artifacts[0].payload.evidence.length).toBeGreaterThan(0);
    expect(hits.map((hit) => hit.artifact.id)).toContain(artifacts[0].id);
    expect(projected.title).toBe(artifacts[0].payload.question);
    expect(projected.content).toContain('Evidence Chunk');

    const packet = await buildContextPacket(vaultPath, {
      purpose: 'ask',
      scope: { kind: 'resource', ref: 'pmil' },
      query: 'GraphRAG recall',
      max_tokens: 1200
    });
    const synthesisSection = packet.sections.find((section) => section.kind === 'synthesis');

    expect(synthesisSection?.title).toBe('Personal QA');
    expect(synthesisSection?.content).toContain('GraphRAG');
    expect(packet.synthesis_refs.some((ref) => artifacts.some((artifact) => artifact.id === ref))).toBe(true);
    expect(packet.evidence.length).toBeGreaterThan(0);
  });

  it('injects recalled MemoryNode entries into context packets with source evidence', async () => {
    const note = await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'PMIL memory preference',
      body: 'User prefers PMIL answers that cite evidence before making recommendations.',
      resource_refs: ['pmil']
    });
    const memory = await createMemoryStore(vaultPath).create({
      kind: 'preference',
      title: 'PMIL answers should cite evidence',
      summary: 'User prefers PMIL recommendations to cite evidence before giving advice.',
      confidence: 0.72,
      user_confirmed: true,
      sources: [
        {
          kind: 'note',
          ref: note.frontmatter.id,
          title: note.frontmatter.title
        }
      ]
    });

    await createEvidenceChunkIndexStore(vaultPath).rebuild({ includeActivities: false });
    const packet = await buildContextPacket(vaultPath, {
      purpose: 'ask',
      scope: { kind: 'resource', ref: 'pmil' },
      query: 'How should PMIL recommendations use evidence?',
      max_tokens: 1200,
      synthesis_mode: 'lookup'
    });
    const memorySection = packet.sections.find((section) => section.kind === 'memories');

    expect(memorySection?.title).toBe('Memories');
    expect(memorySection?.content).toContain('PMIL answers should cite evidence');
    expect(memorySection?.citations[0]?.source_id).toBe(evidenceSourceId('note', note.frontmatter.id));
    expect(packet.memory_refs).toContain(memory.id);
  });

  it('derives work context and open loops from evidence chunks', async () => {
    await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'PMIL implementation loop',
      body: 'TODO: continue implementing PMIL Ask Anywhere context. Decision pending: whether open loops should become review findings. Blocker: evidence drill-down is missing.',
      resource_refs: ['pmil']
    });

    await createEvidenceChunkIndexStore(vaultPath).rebuild({ includeActivities: false });
    const report = await generateWorkContextReport(vaultPath, {
      scope: { kind: 'resource', ref: 'pmil' },
      period: { from: '2026-05-10T00:00:00.000Z', to: '2026-05-16T23:59:59.999Z' }
    });

    expect(report.work_context.current_focus).toContain('PMIL');
    expect(report.work_context.active_threads.length).toBeGreaterThan(0);
    expect(report.open_loops.loops.map((loop) => loop.kind)).toEqual(
      expect.arrayContaining(['task_candidate', 'decision_pending', 'stale_context'])
    );
    expect(report.open_loops.loops[0].evidence[0].kind).toBe('semantic_chunk');
  });
});
