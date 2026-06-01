import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createConnectorStore } from '../src/main/connectors/store';
import { createOrbitEvidenceProvider, syncOrbitEvidenceSources } from '../src/main/evidence';
import { updateExternalAISessionSettings } from '../src/main/evidence/external-ai-session-settings';
import { syncMemoryFromTruthLayer } from '../src/main/memory/source-sync';
import { createMemoryStore } from '../src/main/memory/store';
import { projectConnectorDocuments } from '../src/main/semantic/document-projectors';
import { ORBIT_DIR } from '../src/shared/constants';
import { defaultConnectorPrivacy, type ConnectorConnection } from '../src/shared/connectors';
import { evidenceSourceId, wholeSourceSelector } from '../src/shared/evidence';

let vaultPath: string;
let obsidianPath: string;
let aiSessionRoot: string;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-connectors-vault-'));
  obsidianPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-obsidian-'));
  aiSessionRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-ai-session-root-'));
  await fs.writeFile(
    path.join(obsidianPath, 'Ideas.md'),
    '# Product Notes\n\nAI-native connector context should stay reference-owned.'
  );
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
  await fs.rm(obsidianPath, { recursive: true, force: true });
  await fs.rm(aiSessionRoot, { recursive: true, force: true });
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
    expect(store.definitions().map((definition) => definition.id)).toEqual(expect.arrayContaining([
      'obsidian',
      'local-ai-sessions'
    ]));

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

    const memorySync = await syncMemoryFromTruthLayer(vaultPath, {
      sourceKinds: ['external_file'],
      force: true
    });
    expect(memorySync.created_count).toBeGreaterThanOrEqual(1);
    const memories = await createMemoryStore(vaultPath).list({ query: 'Product Notes' });
    expect(memories[0]?.sources[0]?.metadata?.['selector']).toMatchObject({
      source_id: sourceId,
      content_view: 'safe_projection'
    });
  });

  it('exposes local AI sessions as a connector-backed external session evidence source', async () => {
    const sessionFile = path.join(aiSessionRoot, 'claude-session.jsonl');
    await fs.writeFile(
      sessionFile,
      [
        '{"role":"user","content":"Connector evidence planning for local agent sessions"}',
        '{"role":"assistant","content":"Connect local agent sessions through connector-backed external_ai_session evidence."}',
        '{"role":"tool","content":"hidden tool output"}'
      ].join('\n'),
      'utf8'
    );
    await updateExternalAISessionSettings(vaultPath, {
      roots: [{ agent: 'claude', source: 'test-claude', dir: aiSessionRoot }],
      limit: 10,
      includeToolOutputs: false
    });

    const store = createConnectorStore(vaultPath);
    const connection = await store.connect({
      connector_id: 'local-ai-sessions',
      config: {}
    });

    expect(connection.status).toBe('connected');
    expect(connection.display_name).toBe('外部 AI 会话');
    expect(connection.item_count).toBe(1);

    const hits = await store.search('connector evidence', 5);
    expect(hits[0]?.title).toContain('Connector evidence planning');

    await syncOrbitEvidenceSources(vaultPath, { includeActivities: false, includeExternalAISessions: false });
    const [doc] = await store.listDocuments(connection.id);
    expect(doc).toBeDefined();
    const provider = createOrbitEvidenceProvider(vaultPath);
    const sourceId = evidenceSourceId('external_ai_session', `connector:${connection.id}:${doc!.doc_ref}`);
    const evidence = await provider.read(wholeSourceSelector(sourceId, 'safe_projection'));

    expect(evidence.source.kind).toBe('external_ai_session');
    expect(evidence.source.ownership).toBe('reference');
    expect(evidence.excerpts[0]?.text).toContain('Connect local agent sessions');
    expect(evidence.excerpts[0]?.text).not.toContain('hidden tool output');

    const memorySync = await syncMemoryFromTruthLayer(vaultPath, {
      sourceKinds: ['external_ai_session'],
      includeExternalAISessions: false,
      force: true
    });
    expect(memorySync.by_kind.external_ai_session).toBe(1);
    const memories = await createMemoryStore(vaultPath).list({ query: 'Connector evidence planning' });
    expect(memories[0]?.sources[0]?.metadata?.['selector']).toMatchObject({
      source_id: sourceId,
      content_view: 'safe_projection'
    });
  });

  it('keeps external AI sessions as a single reusable connection', async () => {
    const sessionFile = path.join(aiSessionRoot, 'claude-session.jsonl');
    await fs.writeFile(
      sessionFile,
      [
        '{"role":"user","content":"Reusable external AI session connector"}',
        '{"role":"assistant","content":"The connector should be a singleton."}'
      ].join('\n'),
      'utf8'
    );
    await updateExternalAISessionSettings(vaultPath, {
      roots: [{ agent: 'claude', source: 'test-claude', dir: aiSessionRoot }],
      limit: 10
    });

    const store = createConnectorStore(vaultPath);
    const first = await store.connect({ connector_id: 'local-ai-sessions', config: {} });
    const second = await store.connect({ connector_id: 'local-ai-sessions', config: {} });
    const third = await store.connect({ connector_id: 'local-ai-sessions', config: {} });

    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    const connections = (await store.list()).filter((connection) => connection.connector_id === 'local-ai-sessions');
    expect(connections).toHaveLength(1);
    expect(connections[0]?.item_count).toBe(1);
    expect(connections[0]?.config['total_count']).toBe(1);
    expect(connections[0]?.config['limit']).toBe(10);
  });

  it('collapses legacy duplicate external AI session connections when reading the registry', async () => {
    const registryPath = path.join(vaultPath, ORBIT_DIR, 'connectors', 'registry.json');
    await fs.mkdir(path.dirname(registryPath), { recursive: true });
    const older = makeConnectorConnection('conn-older', {
      display_name: '本地 AI 会话',
      status: 'error',
      item_count: 0,
      updated_at: '2026-06-01T10:00:00.000Z'
    });
    const newer = makeConnectorConnection('conn-newer', {
      display_name: '外部 AI 会话',
      status: 'connected',
      item_count: 300,
      updated_at: '2026-06-01T11:00:00.000Z',
      last_scanned_at: '2026-06-01T11:00:00.000Z'
    });
    await fs.writeFile(
      registryPath,
      `${JSON.stringify({ version: 1, connections: [older, newer] }, null, 2)}\n`,
      'utf8'
    );

    const connections = (await createConnectorStore(vaultPath).list()).filter((connection) => connection.connector_id === 'local-ai-sessions');

    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      id: 'conn-older',
      display_name: '外部 AI 会话',
      status: 'connected',
      item_count: 300
    });
    const persisted = JSON.parse(await fs.readFile(registryPath, 'utf8')) as { connections: ConnectorConnection[] };
    expect(persisted.connections).toHaveLength(1);
  });
});

function makeConnectorConnection(
  id: string,
  patch: Partial<ConnectorConnection> = {}
): ConnectorConnection {
  return {
    id,
    connector_id: 'local-ai-sessions',
    display_name: '外部 AI 会话',
    enabled: true,
    status: 'connected',
    connected_at: '2026-06-01T09:00:00.000Z',
    updated_at: '2026-06-01T09:00:00.000Z',
    item_count: 0,
    config: {
      scanner: 'orbit.external-ai-sessions',
      root_count: 9
    },
    privacy: defaultConnectorPrivacy(),
    ...patch
  };
}
