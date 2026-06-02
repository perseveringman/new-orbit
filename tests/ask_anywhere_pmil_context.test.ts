import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAskAnywhereContext, contextPacketToStageArtifact, renderPMILContextPacket } from '../src/main/ask-anywhere/orchestrator';
import { createConnectorStore } from '../src/main/connectors/store';
import { createEvidenceChunkIndexStore } from '../src/main/evidence';
import { updateExternalAISessionSettings } from '../src/main/evidence/external-ai-session-settings';
import { createNoteStore } from '../src/main/note/store';
import type { ContextPacket } from '../src/shared/context';

let vaultPath: string;
let aiSessionRoot: string;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-ask-pmil-'));
  aiSessionRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-ask-ai-sessions-'));
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
  await fs.rm(aiSessionRoot, { recursive: true, force: true });
});

describe('Ask Anywhere PMIL context', () => {
  it('renders context packets with evidence and synthesis references for prompt injection', () => {
    const packet = samplePacket();
    const rendered = renderPMILContextPacket(packet);
    const artifact = contextPacketToStageArtifact(packet);

    expect(rendered).toContain('<pmil_context_packet');
    expect(rendered).toContain('Evidence selectors: 1');
    expect(rendered).toContain('Citation handles for user-visible answers');
    expect(rendered).toContain('[[E1]] evidence:note:pmil#semantic_chunk');
    expect(rendered).toContain('Synthesis refs: synth-qa-1');
    expect(rendered).toContain('PMIL should use cited evidence.');
    expect(rendered).toContain('evidence:note:pmil#semantic_chunk');
    expect(artifact.kind).toBe('pmil.context_packet');
    expect(artifact.summary).toContain('1 section');
  });

  it('adds PMIL evidence context to the existing Ask scope context', async () => {
    await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'PMIL Ask context',
      body: '[[PMIL]] Ask Anywhere should recall evidence chunks, Personal QA, and graph neighbors for context injection.',
      resource_refs: ['pmil']
    });
    await createEvidenceChunkIndexStore(vaultPath).rebuild({ includeActivities: false });

    const context = await buildAskAnywhereContext(
      vaultPath,
      { kind: 'global' },
      'How should PMIL improve Ask Anywhere context?'
    );

    expect(context).toContain('<current_orbit_context>');
    expect(context).toContain('<connector_context>');
    expect(context).toContain('外部 AI 会话');
    expect(context).toContain('local-ai-sessions');
    expect(context).toContain('<pmil_context_packet');
    expect(context).toContain('Relevant Evidence');
    expect(context).toContain('Ask Anywhere');
  });

  it('injects live external AI session month counts when the connector is active', async () => {
    await writeSessionFile('may-a.jsonl', '2026-05-09T08:00:00.000Z');
    await writeSessionFile('may-b.jsonl', '2026-05-20T08:00:00.000Z');
    await writeSessionFile('june.jsonl', '2026-06-01T08:00:00.000Z');
    await updateExternalAISessionSettings(vaultPath, {
      roots: [{ agent: 'claude', source: 'test-claude', dir: aiSessionRoot }],
      limit: 10,
      includeToolOutputs: false
    });
    await createConnectorStore(vaultPath).connect({
      connector_id: 'local-ai-sessions',
      config: {}
    });

    const context = await buildAskAnywhereContext(
      vaultPath,
      { kind: 'global' },
      '外部 AI 会话 5月份有多少条会话？'
    );

    expect(context).toContain('Live 外部 AI 会话 inventory');
    expect(context).toContain('2026-05: 2');
    expect(context).toContain('2026-06: 1');
    expect(context).toContain('connector registry item_count');
  });
});

async function writeSessionFile(name: string, isoTime: string): Promise<void> {
  const file = path.join(aiSessionRoot, name);
  await fs.writeFile(
    file,
    [
      '{"role":"user","content":"Count external AI sessions for Ask Anywhere context injection."}',
      '{"role":"assistant","content":"This synthetic session is long enough to pass the session scanner size threshold."}'
    ].join('\n'),
    'utf8'
  );
  const date = new Date(isoTime);
  await fs.utimes(file, date, date);
}

function samplePacket(): ContextPacket {
  return {
    id: 'ctx-ask-1',
    purpose: 'ask',
    scope: { kind: 'global' },
    query: 'PMIL',
    generated_at: '2026-05-16T00:00:00.000Z',
    freshness: { evidence_until: '2026-05-16T00:00:00.000Z', stale_sources: [] },
    budget: { max_tokens: 2200, estimated_tokens: 40 },
    sections: [
      {
        kind: 'relevant_evidence',
        title: 'Relevant Evidence',
        content: 'PMIL should use cited evidence.',
        citations: [
          {
            source_id: 'evidence:note:pmil',
            kind: 'semantic_chunk',
            content_view: 'safe_projection'
          }
        ],
        priority: 20
      }
    ],
    evidence: [
      {
        source_id: 'evidence:note:pmil',
        kind: 'semantic_chunk',
        content_view: 'safe_projection'
      }
    ],
    synthesis_refs: ['synth-qa-1'],
    memory_refs: []
  };
}
