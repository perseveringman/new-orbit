import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAskAnywhereContext, contextPacketToStageArtifact, renderPMILContextPacket } from '../src/main/ask-anywhere/orchestrator';
import { createEvidenceChunkIndexStore } from '../src/main/evidence';
import { createNoteStore } from '../src/main/note/store';
import type { ContextPacket } from '../src/shared/context';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-ask-pmil-'));
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('Ask Anywhere PMIL context', () => {
  it('renders context packets with evidence and synthesis references for prompt injection', () => {
    const packet = samplePacket();
    const rendered = renderPMILContextPacket(packet);
    const artifact = contextPacketToStageArtifact(packet);

    expect(rendered).toContain('<pmil_context_packet');
    expect(rendered).toContain('Evidence selectors: 1');
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
    expect(context).toContain('<pmil_context_packet');
    expect(context).toContain('Relevant Evidence');
    expect(context).toContain('Ask Anywhere');
  });
});

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
