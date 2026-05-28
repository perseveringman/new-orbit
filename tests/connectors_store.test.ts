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
let aiBridgeRoot: string;
let previousAISessionToMdRoot: string | undefined;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-connectors-vault-'));
  obsidianPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-obsidian-'));
  aiBridgeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-ai-session-bridge-'));
  previousAISessionToMdRoot = process.env['AI_SESSION_TO_MD_ROOT'];
  await fs.writeFile(
    path.join(obsidianPath, 'Ideas.md'),
    '# Product Notes\n\nAI-native connector context should stay reference-owned.'
  );
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
  await fs.rm(obsidianPath, { recursive: true, force: true });
  await fs.rm(aiBridgeRoot, { recursive: true, force: true });
  if (previousAISessionToMdRoot === undefined) delete process.env['AI_SESSION_TO_MD_ROOT'];
  else process.env['AI_SESSION_TO_MD_ROOT'] = previousAISessionToMdRoot;
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
  });

  it('exposes local AI sessions as a connector-backed external session evidence source', async () => {
    const sessionFile = path.join(aiBridgeRoot, 'claude-session.jsonl');
    await fs.writeFile(sessionFile, '{"role":"user","content":"Connect local agent sessions"}\n', 'utf8');
    await writeAISessionBridge(aiBridgeRoot, sessionFile);
    process.env['AI_SESSION_TO_MD_ROOT'] = aiBridgeRoot;

    const store = createConnectorStore(vaultPath);
    const connection = await store.connect({
      connector_id: 'local-ai-sessions',
      config: {}
    });

    expect(connection.status).toBe('connected');
    expect(connection.item_count).toBe(1);

    const hits = await store.search('connector evidence', 5);
    expect(hits[0]?.title).toBe('Connector evidence planning');

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
  });
});

async function writeAISessionBridge(root: string, sessionFile: string): Promise<void> {
  const libDir = path.join(root, 'lib');
  await fs.mkdir(libDir, { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
  await fs.writeFile(
    path.join(libDir, 'sessions.js'),
    `
const sessions = {
  claude: [{
    id: 'claude-session-1',
    agent: 'claude',
    title: 'Connector evidence planning',
    summary: 'Plan connector evidence for local agent sessions.',
    timestamp: '2026-05-18T08:00:00.000Z',
    path: ${JSON.stringify(sessionFile)}
  }]
};

export function getCachedSessions(agent) {
  return null;
}

export function setCachedSessions(agent, data) {
  sessions[agent] = data;
}

export function invalidateCache() {}
export async function listClaudeSessions() { return sessions.claude; }
export async function listClaudeInternalSessions() { return []; }
export async function listAmpSessions() { return []; }
export async function listCopilotSessions() { return []; }
export async function listCodebuddySessions() { return []; }
export async function listBoxSessions() { return []; }
export async function listCodexSessions() { return []; }

export async function getSession(agent, id) {
  if (agent !== 'claude' || id !== 'claude-session-1') return null;
  return {
    id,
    agent,
    title: 'Connector evidence planning',
    messages: [
      { role: 'user', content: 'Connect local agent sessions through connectors.' },
      { role: 'assistant', content: 'Use external_ai_session evidence for connector-backed sessions.' },
      { role: 'tool', content: 'hidden tool output' }
    ]
  };
}

export function sessionToMarkdown(session, options = {}) {
  return session.messages
    .filter((message) => message.role !== 'tool' || options.showToolResults)
    .map((message) => message.role + ': ' + message.content)
    .join('\\n\\n');
}
`,
    'utf8'
  );
}
