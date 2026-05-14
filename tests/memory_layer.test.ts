import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractMemoryCandidates } from '../src/main/memory/extractor';
import { generateMemoryDigest } from '../src/main/memory/digest-synthesis';
import { recallContext } from '../src/main/memory/recall-service';
import { createMemoryStore } from '../src/main/memory/store';
import { deriveMemoryLayer, deriveMemoryStability } from '../src/shared/memory';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-memory-'));
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('Memory Layer', () => {
  it('validates schema and evolves stability from volatile to stable/core', () => {
    expect(deriveMemoryStability({ evidence_count: 1, confidence: 0.55, recall_count: 0 })).toBe('volatile');
    expect(deriveMemoryStability({ evidence_count: 3, confidence: 0.7, recall_count: 0 })).toBe('stable');
    expect(deriveMemoryStability({ evidence_count: 10, confidence: 0.8, recall_count: 5, user_confirmed: true })).toBe('core');
    expect(deriveMemoryLayer('preference')).toBe('semantic');
    expect(deriveMemoryLayer('lesson')).toBe('episodic');
    expect(deriveMemoryLayer('pattern')).toBe('procedural');
  });

  it('creates, updates, merges, archives, and filters memories', async () => {
    const store = createMemoryStore(vaultPath);
    const first = await store.create({ kind: 'preference', title: 'Read source first', summary: 'User prefers reading source before docs.', confidence: 0.7, user_confirmed: true });
    const second = await store.create({ kind: 'preference', title: 'Read source first', summary: 'Same preference reinforced.', confidence: 0.8 });

    expect(first.id).toBe(second.id);
    expect(second.layer).toBe('semantic');
    expect(second.evidence_count).toBe(2);

    const lesson = await store.create({ kind: 'lesson', title: 'Specify branch', summary: 'Next time specify target branch before worktree.', confidence: 0.6 });
    const merged = await store.merge(lesson.id, first.id);
    expect(merged.evidence_count).toBeGreaterThanOrEqual(3);
    expect(await store.list({ kind: 'lesson' })).toHaveLength(0);
    expect(await store.list({ layer: 'semantic' })).toHaveLength(1);
    expect(await store.list({ include_archived: true })).toHaveLength(2);
  });

  it('extracts memory candidates from conversation-like text', () => {
    const candidates = extractMemoryCandidates({
      source_kind: 'conversation',
      source_ref: 'conv-1',
      content: 'user: I prefer reading source before docs. assistant: Lesson learned: next time specify branch.'
    });

    expect(candidates.map((candidate) => candidate.kind)).toContain('preference');
    expect(candidates[0].sources?.[0].kind).toBe('conversation');
  });

  it('recalls relevant memories and records recall stats', async () => {
    const store = createMemoryStore(vaultPath);
    const memory = await store.create({ kind: 'interest', title: 'MCP protocol', summary: 'User is interested in MCP protocol design.', confidence: 0.75 });

    const result = await recallContext(vaultPath, 'MCP protocol', { triggered_by: { kind: 'ask', ref: 'conv-1' }, used_in: 'context_injection' });
    const stats = await store.getRecallStats(memory.id);

    expect(result.memories[0].id).toBe(memory.id);
    expect(result.matches[0].memory_id).toBe(memory.id);
    expect(result.matches[0].reasons.join(' ')).toContain('matched terms');
    expect(stats.total).toBe(1);
    expect(stats.by_kind.ask).toBe(1);
  });

  it('promotes memories to Resource and Project truth only through explicit calls', async () => {
    const store = createMemoryStore(vaultPath);
    const memory = await store.create({ kind: 'goal', title: 'Write quarterly essay', summary: 'User wants to finish a quarterly essay.', confidence: 0.7, user_confirmed: true });

    const resource = await store.promoteToResource(memory.id);
    const project = await store.promoteToProject(memory.id);

    expect(resource.resource.frontmatter.tags).toContain('memory');
    expect(project.project.name).toBe('Write quarterly essay');
    expect((await store.get(memory.id))?.related_entities).toEqual(expect.arrayContaining([
      `resource:${resource.resource.frontmatter.slug}`,
      `project:${project.project.uid}`
    ]));
  });

  it('generates memory.digest synthesis artifacts with provenance', async () => {
    await createMemoryStore(vaultPath).create({ kind: 'pattern', title: 'Weekend review', summary: 'User usually reviews notes on weekends.', confidence: 0.65 });

    const digest = await generateMemoryDigest(vaultPath);

    expect(digest.artifact.kind).toBe('memory.digest');
    expect(digest.artifact.provenance.prompt_version).toBe('memory.digest.v1');
    expect(digest.artifact.payload.layer_counts.procedural.total).toBe(1);
    expect(digest.clusters[0].theme).toBe('pattern');
  });
});
