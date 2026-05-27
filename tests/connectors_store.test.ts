import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createConnectorStore } from '../src/main/connectors/store';
import { createOrbitEvidenceProvider, syncOrbitEvidenceSources } from '../src/main/evidence';
import { projectConnectorDocuments } from '../src/main/semantic/document-projectors';
import { evidenceSourceId, wholeSourceSelector } from '../src/shared/evidence';

let vaultPath: string;
let obsidianPath: string;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-connectors-vault-'));
  obsidianPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-obsidian-'));
  await fs.writeFile(
    path.join(obsidianPath, 'Ideas.md'),
    '# Product Notes\n\nAI-native connector context should stay reference-owned.'
  );
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
  await fs.rm(obsidianPath, { recursive: true, force: true });
});

describe('ConnectorStore', () => {
  it('connects an Obsidian directory and exposes it to evidence and semantic projections', async () => {
    const store = createConnectorStore(vaultPath);
    const connection = await store.connect({
      connector_id: 'obsidian',
      config: { root_path: obsidianPath }
    });

    expect(connection.status).toBe('connected');
    expect(connection.item_count).toBe(1);
    expect(store.definitions().map((definition) => definition.id)).toContain('obsidian');

    const hits = await store.search('AI-native connector', 5);
    expect(hits[0]?.title).toBe('Product Notes');

    await syncOrbitEvidenceSources(vaultPath, { includeActivities: false });
    const provider = createOrbitEvidenceProvider(vaultPath);
    const sourceId = evidenceSourceId('external_file', `connector:${connection.id}:Ideas.md`);
    const evidence = await provider.read(wholeSourceSelector(sourceId, 'safe_projection'));
    expect(evidence.source.ownership).toBe('reference');
    expect(evidence.excerpts[0]?.text).toContain('reference-owned');

    const docs = await projectConnectorDocuments(vaultPath);
    expect(docs[0]).toMatchObject({
      entity_kind: 'external_file',
      layer: 1,
      layer_label: 'reference',
      title: 'Product Notes'
    });
    expect(docs[0]?.content).toContain('AI native connector context');
  });
});
