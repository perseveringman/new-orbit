import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvidenceSelector, EvidenceSource } from '../src/shared/evidence';
import { evidenceSourceId } from '../src/shared/evidence';
import { resolveEvidenceNavigation } from '../src/main/evidence/navigation';
import { createEvidenceStore } from '../src/main/evidence/store';

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(async () => '')
  }
}));

const vaults: string[] = [];

afterEach(async () => {
  await Promise.all(vaults.splice(0).map((vault) => rm(vault, { recursive: true, force: true })));
});

describe('evidence navigation', () => {
  it('resolves vault-backed sources to an internal file target', async () => {
    const vault = await tempVault();
    await writeFile(path.join(vault, 'Notes', 'pmil.md'), '# PMIL\n', 'utf8');
    const source = sampleSource({
      kind: 'note',
      ref: 'pmil',
      title: 'PMIL note',
      canonical_ref: 'Notes/pmil.md',
      metadata: { entity_ref: 'pmil', path: 'Notes/pmil.md' }
    });
    await createEvidenceStore(vault).upsert(source);

    const target = await resolveEvidenceNavigation(vault, selectorFor(source));

    expect(target.kind).toBe('vault_file');
    expect(target.path).toBe(path.join(vault, 'Notes', 'pmil.md'));
    expect(target.rel_path).toBe('Notes/pmil.md');
    expect(target.label).toBe('PMIL note');
  });

  it('resolves app entities to workspace views', async () => {
    const vault = await tempVault();
    const source = sampleSource({
      kind: 'conversation',
      ref: 'conv-1',
      title: '随处问会话',
      canonical_ref: 'conversation:conv-1',
      metadata: { entity_ref: 'conv-1' }
    });
    await createEvidenceStore(vault).upsert(source);

    const target = await resolveEvidenceNavigation(vault, selectorFor(source));

    expect(target.kind).toBe('workspace_view');
    expect(target.view).toEqual({ kind: 'askAnywhere', activeId: 'conv-1' });
  });

  it('resolves external AI sessions to their original files', async () => {
    const vault = await tempVault();
    const externalRoot = await tempVault('orbit-evidence-ext-');
    const externalFile = path.join(externalRoot, 'session.jsonl');
    await writeFile(externalFile, '{"role":"user","content":"hello"}\n', 'utf8');
    const source = sampleSource({
      kind: 'external_ai_session',
      ref: 'codex:session',
      title: 'Codex session',
      provider_id: 'external.ai_sessions.local',
      ownership: 'reference',
      canonical_ref: externalFile,
      metadata: { agent: 'codex', path: externalFile }
    });
    await createEvidenceStore(vault).upsert(source);

    const target = await resolveEvidenceNavigation(vault, selectorFor(source));

    expect(target.kind).toBe('external_file');
    expect(target.path).toBe(path.resolve(externalFile));
    expect(target.reason).toBe('打开外部原始文件');
  });

  it('keeps connector-backed evidence attached to the connector document', async () => {
    const vault = await tempVault();
    const source = sampleSource({
      kind: 'external_file',
      ref: 'connector:conn-1:doc-1',
      title: 'Connector doc',
      ownership: 'reference',
      canonical_ref: 'doc-1.md',
      metadata: {
        connector_connection_id: 'conn-1',
        connector_id: 'obsidian',
        connector_name: 'Obsidian',
        doc_ref: 'doc-1.md'
      }
    });
    await createEvidenceStore(vault).upsert(source);

    const target = await resolveEvidenceNavigation(vault, selectorFor(source));

    expect(target.kind).toBe('connector_doc');
    expect(target.connection_id).toBe('conn-1');
    expect(target.doc_ref).toBe('doc-1.md');
    expect(target.reason).toBe('Obsidian');
  });
});

async function tempVault(prefix = 'orbit-evidence-nav-'): Promise<string> {
  const vault = await mkdtemp(path.join(os.tmpdir(), prefix));
  vaults.push(vault);
  await mkdir(path.join(vault, 'Notes'), { recursive: true });
  await writeFile(path.join(vault, '.gitkeep'), '', 'utf8');
  return vault;
}

function selectorFor(source: EvidenceSource): EvidenceSelector {
  return {
    source_id: source.id,
    kind: 'whole_source',
    content_view: 'safe_projection',
    reason: 'test'
  };
}

function sampleSource(input: {
  kind: EvidenceSource['kind'];
  ref: string;
  title: string;
  canonical_ref: string;
  provider_id?: string;
  ownership?: EvidenceSource['ownership'];
  metadata?: Record<string, unknown>;
}): EvidenceSource {
  return {
    id: evidenceSourceId(input.kind, input.ref),
    kind: input.kind,
    ownership: input.ownership ?? 'orbit_owned',
    title: input.title,
    provider_id: input.provider_id ?? 'orbit.local',
    canonical_ref: input.canonical_ref,
    updated_at: '2026-06-01T00:00:00.000Z',
    observed_at: '2026-06-01T00:00:00.000Z',
    fingerprint: { algorithm: 'sha256', value: input.ref },
    availability: 'available',
    privacy: {
      index_level: 'safe_projection',
      allow_synthesis: true,
      allow_tool_outputs: false
    },
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
}
