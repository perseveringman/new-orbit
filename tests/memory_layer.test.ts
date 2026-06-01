import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractMemoryCandidates } from '../src/main/memory/extractor';
import { getMemoryBackendStatus, updateActiveMemoryBackendConfig } from '../src/main/memory/backend-registry';
import { generateMemoryDigest } from '../src/main/memory/digest-synthesis';
import { HyMemoryBackend } from '../src/main/memory/hy-memory-backend';
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
    expect(stats.recent[0].reasons?.join(' ')).toContain('matched terms');
  });

  it('builds memory graph relations and applies feedback to confidence', async () => {
    const store = createMemoryStore(vaultPath);
    const first = await store.create({
      kind: 'entity_memory',
      title: 'Orbit memory graph',
      summary: 'resource:memory connects graph-based personal context.',
      confidence: 0.6,
      related_entities: ['resource:memory']
    });
    const second = await store.create({
      kind: 'interest',
      title: 'Memory graph interest',
      summary: 'User is interested in resource:memory graph context.',
      confidence: 0.6,
      related_entities: ['resource:memory']
    });

    const graph = await store.graph();
    const feedback = await store.recordFeedback(first.id, true);

    expect(graph.relations.some((relation) => new Set([relation.from_id, relation.to_id]).has(first.id) && new Set([relation.from_id, relation.to_id]).has(second.id) && relation.kind === 'shared_entity')).toBe(true);
    expect(feedback.confidence).toBeGreaterThan(first.confidence);
    expect((await store.getRecallStats(first.id)).recent[0].was_helpful).toBe(true);
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

  it('switches the active memory backend through vault-level config', async () => {
    const pluginPath = path.join(vaultPath, 'hy-plugin');
    await fs.mkdir(pluginPath, { recursive: true });
    await fs.writeFile(
      path.join(pluginPath, 'openclaw.plugin.json'),
      JSON.stringify({ id: 'openclaw-hy-memory', name: 'HY Memory', version: '0.1.0', kind: 'memory' }),
      'utf8'
    );

    const initial = await getMemoryBackendStatus(vaultPath);
    expect(initial.active).toBe('orbit');
    expect(initial.backends.find((backend) => backend.id === 'orbit')?.configured).toBe(true);

    const updated = await updateActiveMemoryBackendConfig(vaultPath, {
      active: 'hy-memory',
      hyMemory: {
        pluginPath,
        serverUrl: 'http://127.0.0.1:1',
        userId: 'orbit-test',
        agentId: 'orbit',
        sessionId: 'test-session'
      }
    });

    expect(updated.active).toBe('hy-memory');
    const hy = updated.backends.find((backend) => backend.id === 'hy-memory');
    expect(hy?.active).toBe(true);
    expect(hy?.configured).toBe(true);
    expect(hy?.plugin?.id).toBe('openclaw-hy-memory');
  });

  it('falls back to synced HY memories for broad recall probes', async () => {
    await fs.mkdir(path.join(vaultPath, '.orbit', 'memory'), { recursive: true });
    await fs.writeFile(
      path.join(vaultPath, '.orbit', 'memory', 'source-sync.json'),
      JSON.stringify({
        version: 1,
        records: {
          'hy-memory:evidence:external_ai_session:session-1': {
            backend: 'hy-memory',
            source_id: 'evidence:external_ai_session:session-1',
            source_kind: 'external_ai_session',
            source_title: 'HY Memory 接入',
            fingerprint: 'sha256:test',
            memory_ids: ['hy:mem-1'],
            updated_at: '2026-06-01T00:00:00.000Z'
          }
        }
      }),
      'utf8'
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/healthz')) return Response.json({ status: 'ok' });
      if (url.endsWith('/api/v1/search')) return Response.json({ memories: { profile: [], proactive: [], normal: [] } });
      if (url.endsWith('/api/v1/memories/mem-1')) {
        return Response.json({
          memory_id: 'mem-1',
          content: '本地 AI 会话：Orbit 记忆架构\n最近在推进 HY Memory 接入、召回测试和来源同步。',
          confidence: 0.92,
          gmt_created: 1780305530
        });
      }
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
    }) as typeof fetch;

    try {
      const backend = new HyMemoryBackend(vaultPath, {
        pluginPath: vaultPath,
        serverUrl: 'http://hy.test',
        userId: 'orbit-test',
        agentId: 'orbit',
        sessionId: 'test-session',
        topK: 5,
        searchThreshold: 0.3,
        autoStartServer: false,
        autoInstallRuntime: false,
        pythonPath: 'python3',
        serverPort: 1,
        installDirectory: path.join(vaultPath, 'venv'),
        sdkPackage: 'hy-mem-internal',
        pipIndexUrl: 'https://example.test/simple',
        embeddingProxyPort: 2,
        logLevel: 'INFO'
      });
      const result = await backend.recall('我最近在推进什么？', { max_memories: 3, min_confidence: 0.01 });

      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].summary).toContain('HY Memory 接入');
      expect(result.matches[0].score).toBeGreaterThan(0);
      expect(result.explanation).toContain('source-backed fallback');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
