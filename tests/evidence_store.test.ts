import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConversationStore } from '../src/main/conversation/store';
import {
  createEvidenceStore,
  createOrbitEvidenceProvider,
  syncOrbitEvidenceSources
} from '../src/main/evidence';
import { createLibraryStore } from '../src/main/library/store';
import { createNoteStore } from '../src/main/note/store';
import { createResourceStore } from '../src/main/resource/store';
import { evidenceSourceId, wholeSourceSelector, type EvidenceSource } from '../src/shared/evidence';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-evidence-'));
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('EvidenceStore', () => {
  it('syncs Orbit-owned Layer 1 entities into an evidence registry', async () => {
    const note = await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'Memory source',
      body: 'Orbit should treat direct user notes as evidence.',
      areas: [{ area_slug: 'learning', assigned_at: '2026-05-15T00:00:00.000Z', assigned_by: 'user' }],
      resource_refs: ['context-engine']
    });
    const libraryItem = await createLibraryStore(vaultPath).save({
      title: 'Reference article',
      url: 'https://example.com/memory',
      body: 'A saved library item is direct truth after the user saves it.'
    });
    const resource = await createResourceStore(vaultPath).create({
      title: 'Context Engine',
      slug: 'context-engine',
      body: 'A resource groups durable context.'
    });
    const conversations = new ConversationStore(vaultPath);
    const conversation = await conversations.create({
      id: 'conv-memory',
      anchors: [{ kind: 'ask_anywhere_session', refId: 'global', addedAt: '2026-05-15T00:00:00.000Z' }],
      title: 'Planning memory',
      scope: { kind: 'resource', resource_slug: 'context-engine' }
    });
    await conversations.appendTurn(conversation.id, {
      id: 'turn-1',
      at: '2026-05-15T00:01:00.000Z',
      role: 'user',
      content: 'We need evidence before synthesis.'
    });

    await syncOrbitEvidenceSources(vaultPath, { includeActivities: false });
    const store = createEvidenceStore(vaultPath);

    const noteSource = await store.get(evidenceSourceId('note', note.frontmatter.id));
    expect(noteSource?.kind).toBe('note');
    expect(noteSource?.ownership).toBe('orbit_owned');
    expect(noteSource?.privacy.index_level).toBe('safe_projection');
    expect(noteSource?.scope_refs).toContainEqual({ kind: 'area', ref: 'learning' });

    const resourceScoped = await store.list({ scope: { kind: 'resource', ref: 'context-engine' } });
    expect(resourceScoped.map((source) => source.id)).toEqual(
      expect.arrayContaining([
        evidenceSourceId('note', note.frontmatter.id),
        evidenceSourceId('resource', resource.frontmatter.slug),
        evidenceSourceId('conversation', conversation.id)
      ])
    );

    const librarySource = await store.get(evidenceSourceId('library_item', libraryItem.frontmatter.id));
    expect(librarySource?.summary).toContain('example.com');
  });

  it('marks changed and missing sources when provider snapshots move', async () => {
    const store = createEvidenceStore(vaultPath);
    const source = testSource({ fingerprint: 'first' });
    await store.replaceProviderSources('test.provider', [source]);

    await store.replaceProviderSources('test.provider', [
      testSource({ fingerprint: 'second', updatedAt: '2026-05-15T01:00:00.000Z' })
    ]);
    const changed = await store.get(source.id);
    expect(changed?.availability).toBe('changed');
    expect(changed?.metadata?.['previous_fingerprint']).toEqual({ algorithm: 'sha256', value: 'first' });

    await store.replaceProviderSources('test.provider', []);
    expect((await store.get(source.id))?.availability).toBe('missing');
  });

  it('reads safe projections through the Orbit source provider without tool payloads', async () => {
    const note = await createNoteStore(vaultPath).create({
      type: 'thought',
      title: 'Readable source',
      body: 'Visible context.\n\n```json\n{"secret":"tool payload"}\n```'
    });
    const sourceId = evidenceSourceId('note', note.frontmatter.id);
    const provider = createOrbitEvidenceProvider(vaultPath);

    const result = await provider.read(wholeSourceSelector(sourceId, 'safe_projection'));

    expect(result.source.id).toBe(sourceId);
    expect(result.excerpts[0]?.text).toContain('Visible context');
    expect(result.excerpts[0]?.text).not.toContain('tool payload');
  });
});

function testSource(input: { fingerprint: string; updatedAt?: string }): EvidenceSource {
  return {
    id: evidenceSourceId('note', 'test-note'),
    kind: 'note',
    ownership: 'orbit_owned',
    title: 'Test note',
    provider_id: 'test.provider',
    canonical_ref: 'notes/test.md',
    updated_at: input.updatedAt ?? '2026-05-15T00:00:00.000Z',
    observed_at: '2026-05-15T00:00:00.000Z',
    fingerprint: { algorithm: 'sha256', value: input.fingerprint },
    availability: 'available',
    privacy: {
      index_level: 'safe_projection',
      allow_synthesis: true,
      allow_tool_outputs: false,
      redaction_profile: 'default'
    }
  };
}
