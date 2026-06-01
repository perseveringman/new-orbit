import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildContextPacket,
  ensureExternalSessionDistillation
} from '../src/main/context';
import {
  EXTERNAL_AI_SESSION_PROVIDER_ID,
  createEvidenceChunkIndexStore,
  createOrbitEvidenceProvider,
  defaultExternalAISessionRoots,
  syncExternalAISessionEvidenceSources,
  updateExternalAISessionSettings
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
  it('defaults to runtime-wide session stores, not Orbit-owned sessions only', () => {
    const roots = defaultExternalAISessionRoots();
    const rootKeys = roots.map((root) => `${root.agent}:${root.source}`);

    expect(rootKeys).toEqual(expect.arrayContaining([
      'claude:claude-transcripts',
      'claude:claude-projects',
      'claude-internal:claude-internal-projects',
      'codex:codex',
      'amp:amp',
      'copilot:copilot',
      'codebuddy:codebuddy-projects',
      'codebuddy:codebuddy-history',
      'box:box-history'
    ]));
  });

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
    expect(results[0].chunk.selector.kind).toBe('message_range');
    expect(results[0].chunk.selector.range?.from).toBe(0);
    expect(results[0].chunk.selector.range?.to).toBe(1);
    const rangedRead = await provider.read(results[0].chunk.selector);
    expect(rangedRead.excerpts[0].text).toContain('PMIL external agent session truth layer');
    expect(rangedRead.excerpts[0].text).not.toContain('large hidden tool output');
  });

  it('reads Copilot runtime event logs through nested data payloads', async () => {
    const sessionDir = path.join(sessionsRoot, 'copilot-session-1');
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionDir, 'events.jsonl'),
      [
        JSON.stringify({
          type: 'session.start',
          timestamp: '2026-05-16T08:59:00.000Z',
          data: {
            startTime: '2026-05-16T08:59:00.000Z',
            context: { repository: 'ryan/new-orbit', branch: 'pmil-runtime-sessions' }
          }
        }),
        JSON.stringify({
          type: 'user.message',
          timestamp: '2026-05-16T09:00:00.000Z',
          data: { content: 'Copilot runtime archive should be readable as PMIL evidence.' }
        }),
        JSON.stringify({
          type: 'assistant.message',
          timestamp: '2026-05-16T09:01:00.000Z',
          data: { content: 'Nested event payloads should become safe projections.' }
        }),
        JSON.stringify({
          type: 'tool.execution_complete',
          timestamp: '2026-05-16T09:02:00.000Z',
          data: { result: { content: 'tool output should stay hidden by default' } }
        })
      ].join('\n'),
      'utf8'
    );

    const [source] = await syncExternalAISessionEvidenceSources(vaultPath, {
      externalAISessionRoots: [{ agent: 'copilot', source: 'copilot', dir: sessionsRoot }]
    });
    const provider = createOrbitEvidenceProvider(vaultPath);
    const read = await provider.read(wholeSourceSelector(source.id, 'safe_projection'));

    expect(source.metadata?.agent).toBe('copilot');
    expect(source.scope_refs).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'project', ref: 'new-orbit' })]));
    expect(read.excerpts[0].text).toContain('Copilot runtime archive should be readable');
    expect(read.excerpts[0].text).toContain('Nested event payloads should become safe projections');
    expect(read.excerpts[0].text).not.toContain('tool output should stay hidden');
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

  it('applies user-facing external session filters before registry sync', async () => {
    const claudeDir = path.join(sessionsRoot, 'claude', '-Users-ryan-Developer-new-orbit');
    const codexDir = path.join(sessionsRoot, 'codex', '2026');
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(path.join(claudeDir, 'session.jsonl'), sessionLines('Claude session should be filtered out by agent settings.'), 'utf8');
    await fs.writeFile(path.join(codexDir, 'session.jsonl'), sessionLines('Codex session should stay visible as metadata-only evidence.'), 'utf8');
    await updateExternalAISessionSettings(vaultPath, {
      includeAgents: ['codex'],
      indexLevel: 'metadata_only',
      includeToolOutputs: true
    });

    const sources = await syncExternalAISessionEvidenceSources(vaultPath, {
      externalAISessionRoots: [
        { agent: 'claude', source: 'claude-code', dir: path.join(sessionsRoot, 'claude') },
        { agent: 'codex', source: 'codex', dir: path.join(sessionsRoot, 'codex') }
      ]
    });

    expect(sources).toHaveLength(1);
    expect(sources[0].metadata?.agent).toBe('codex');
    expect(sources[0].privacy.index_level).toBe('metadata_only');
    expect(sources[0].privacy.allow_tool_outputs).toBe(true);
  });

  it('distills external sessions into cited synthesis for context packets', async () => {
    const projectDir = path.join(sessionsRoot, '-Users-ryan-Developer-new-orbit');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'session.jsonl'),
      [
        JSON.stringify({
          type: 'user',
          timestamp: '2026-05-15T10:00:00.000Z',
          message: { role: 'user', content: 'Decide the PMIL session-specific synthesis strategy.' }
        }),
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-05-15T10:01:00.000Z',
          message: { role: 'assistant', content: 'Next, summarize each external agent session with evidence selectors and open loops.' }
        })
      ].join('\n'),
      'utf8'
    );
    const [source] = await syncExternalAISessionEvidenceSources(vaultPath, {
      externalAISessionRoots: [{ agent: 'claude', source: 'claude-code', dir: sessionsRoot }]
    });
    const artifact = await ensureExternalSessionDistillation(vaultPath, source.id);
    await createEvidenceChunkIndexStore(vaultPath).rebuild({ includeActivities: false });
    const packet = await buildContextPacket(vaultPath, {
      purpose: 'ask',
      query: 'What is the PMIL session-specific synthesis strategy?',
      synthesis_mode: 'ensure'
    });

    expect(artifact?.kind).toBe('distill.external_session');
    expect(artifact?.payload.source_id).toBe(source.id);
    expect(artifact?.payload.evidence[0]?.source_id).toBe(source.id);
    expect(packet.sections.find((section) => section.title === 'Agent Session Summaries')?.content).toContain('session-specific synthesis');
    expect(packet.synthesis_refs).toContain(artifact!.id);
  });
});

function sessionLines(text: string): string {
  return [
    JSON.stringify({
      type: 'user',
      timestamp: '2026-05-15T08:00:00.000Z',
      message: { role: 'user', content: text }
    }),
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-05-15T08:01:00.000Z',
      message: { role: 'assistant', content: `${text} Follow up with indexed evidence selectors.` }
    })
  ].join('\n');
}
