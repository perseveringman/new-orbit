import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EXTERNAL_AI_SESSION_PROVIDER_ID,
  createEvidenceChunkIndexStore,
  createOrbitEvidenceProvider,
  syncExternalAISessionEvidenceSources
} from '../src/main/evidence';
import { wholeSourceSelector } from '../src/shared/evidence';

let vaultPath: string;
let sessionsRoot: string;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-external-ai-vault-'));
  sessionsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-external-ai-sessions-'));
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
  await fs.rm(sessionsRoot, { recursive: true, force: true });
});

describe('external AI session evidence source', () => {
  it('registers local agent sessions as reference-truth evidence and indexes safe projections', async () => {
    const projectDir = path.join(sessionsRoot, '-Users-ryan-Developer-new-orbit');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'session.jsonl'),
      [
        JSON.stringify({
          type: 'user',
          timestamp: '2026-05-15T08:00:00.000Z',
          message: { role: 'user', content: 'Design PMIL external agent session truth layer.' }
        }),
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-05-15T08:01:00.000Z',
          message: { role: 'assistant', content: 'Use EvidenceSource selectors so summaries never replace raw sessions.' }
        }),
        JSON.stringify({
          type: 'tool_result',
          timestamp: '2026-05-15T08:02:00.000Z',
          content: 'large hidden tool output'
        })
      ].join('\n'),
      'utf8'
    );

    const roots = [{ agent: 'claude', source: 'claude-code', dir: sessionsRoot }];
    const sources = await syncExternalAISessionEvidenceSources(vaultPath, {
      externalAISessionRoots: roots
    });
    const source = sources[0];
    const provider = createOrbitEvidenceProvider(vaultPath);
    const read = await provider.read(wholeSourceSelector(source.id, 'safe_projection'));
    const indexStore = createEvidenceChunkIndexStore(vaultPath, {
      includeExternalAISessions: true,
      externalAISessionRoots: roots
    });
    await indexStore.rebuild({ includeActivities: false });
    const results = await indexStore.search({ query: 'PMIL truth layer selectors', limit: 5 });

    expect(source.kind).toBe('external_ai_session');
    expect(source.provider_id).toBe(EXTERNAL_AI_SESSION_PROVIDER_ID);
    expect(source.ownership).toBe('reference');
    expect(source.scope_refs).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'project', ref: 'orbit' })]));
    expect(read.excerpts[0].text).toContain('PMIL external agent session truth layer');
    expect(read.excerpts[0].text).not.toContain('large hidden tool output');
    expect(results[0].chunk.source_id).toBe(source.id);
  });

  it('keeps registered external sessions in the default chunk index', async () => {
    const projectDir = path.join(sessionsRoot, '-Users-ryan-Developer-new-orbit');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'session.jsonl'),
      [
        JSON.stringify({
          type: 'user',
          timestamp: '2026-05-15T09:00:00.000Z',
          message: { role: 'user', content: 'PMIL should retrieve local agent sessions as raw evidence.' }
        }),
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-05-15T09:01:00.000Z',
          message: { role: 'assistant', content: 'Context packets can cite registered session evidence selectors.' }
        })
      ].join('\n'),
      'utf8'
    );

    const sources = await syncExternalAISessionEvidenceSources(vaultPath, {
      externalAISessionRoots: [{ agent: 'claude', source: 'claude-code', dir: sessionsRoot }]
    });
    const indexStore = createEvidenceChunkIndexStore(vaultPath);
    const results = await indexStore.search({ query: 'raw evidence context packets selectors', limit: 5 });

    expect(results[0].chunk.source_id).toBe(sources[0].id);
    expect(results[0].chunk.text).toContain('local agent sessions as raw evidence');
  });
});
