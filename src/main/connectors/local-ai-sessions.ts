import { shell } from 'electron';
import type {
  ConnectConnectorInput,
  ConnectorConnection,
  ConnectorDocument,
  ConnectorDocumentContent,
  ConnectorOpenInput,
  ConnectorSearchHit
} from '@shared/connectors';
import type { EvidenceContentView, EvidencePrivacy, EvidenceSource } from '@shared/evidence';
import {
  EXTERNAL_AI_SESSION_PROVIDER_ID,
  listExternalAISessionSources,
  readExternalAISessionSourceText,
  summarizeExternalAISessionSources
} from '../evidence/external-ai-sessions';
import { resolveExternalAISessionScanOptions } from '../evidence/external-ai-session-settings';
import type { ConnectorPlugin } from './plugin';

const CONNECTOR_ID = 'local-ai-sessions';
const SCANNER_ID = 'orbit.external-ai-sessions';
export const LOCAL_AI_SESSIONS_CONNECTOR_DISPLAY_NAME = '外部 AI 会话';
export const LOCAL_AI_SESSIONS_CONNECTOR_ALIASES = [
  'AI 本地会话连接器',
  '外部 AI 会话库',
  '本地 AI 会话',
  '本地 AI 会话库',
  'Runtime 会话库',
  'Runtime 全量会话库',
  '本地 Agent 会话源',
  'local-ai-sessions'
] as const;

interface ParsedDocRef {
  agent: string;
  source?: string;
  relPath: string;
}

export function createLocalAISessionsConnectorPlugin(vaultPath: string): ConnectorPlugin {
  return {
    definition: {
      id: CONNECTOR_ID,
      display_name: LOCAL_AI_SESSIONS_CONNECTOR_DISPLAY_NAME,
      description: '聚合 Claude、Codex、Amp 等外部 AI 工具保存的历史会话，让随处问和 Orbit AI 可检索、引用与沉淀。',
      category: 'knowledge',
      capabilities: ['list', 'read', 'search', 'index', 'open_original'],
      evidence_kind: 'external_ai_session',
      built_in: true,
      config_schema: []
    },

    async normalizeConfig(_input: ConnectConnectorInput['config']): Promise<Record<string, unknown>> {
      const options = await resolveExternalAISessionScanOptions(vaultPath);
      const inventory = await summarizeExternalAISessionSources(options);
      return {
        scanner: SCANNER_ID,
        provider_id: EXTERNAL_AI_SESSION_PROVIDER_ID,
        limit: options.limit ?? 300,
        total_count: inventory.matched_count,
        total_candidates: inventory.total_candidates,
        root_count: options.roots?.length ?? 0,
        roots: (options.roots ?? []).map((root) => ({
          agent: root.agent,
          source: root.source ?? root.agent,
          dir: root.dir,
          enabled: root.enabled !== false
        })),
        index_level: options.indexLevel,
        include_tool_outputs: options.includeToolOutputs
      };
    },

    listDocuments: (connection) => listLocalAISessionDocuments(vaultPath, connection),

    async readDocument(
      connection: ConnectorConnection,
      docRef: string,
      contentView: EvidenceContentView = 'safe_projection'
    ): Promise<ConnectorDocumentContent | null> {
      const source = await findSource(vaultPath, connection, docRef);
      if (!source) return null;
      const document = documentForSource(connection, source);
      if (contentView === 'metadata') {
        return {
          document,
          content_markdown: [source.title, source.summary, source.canonical_ref].filter(Boolean).join('\n')
        };
      }
      const contentSource = withConnectionPrivacy(source, connection.privacy);
      const markdown = await readExternalAISessionSourceText(contentSource, contentView);
      return {
        document,
        content_markdown: markdown
      };
    },

    async search(connection: ConnectorConnection, query: string, limit: number): Promise<ConnectorSearchHit[]> {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const docs = await listLocalAISessionDocuments(vaultPath, connection);
      const hits: ConnectorSearchHit[] = [];
      for (const doc of docs) {
        const haystack = [
          doc.title,
          doc.excerpt,
          stringMetadata(doc.metadata, 'agent'),
          stringMetadata(doc.metadata, 'project_name'),
          stringMetadata(doc.metadata, 'source'),
          stringMetadata(doc.metadata, 'path'),
          doc.doc_ref
        ].filter(Boolean).join('\n').toLowerCase();
        if (!haystack.includes(q)) continue;
        hits.push({
          connection_id: doc.connection_id,
          connector_id: doc.connector_id,
          doc_ref: doc.doc_ref,
          title: doc.title,
          excerpt: doc.excerpt ?? '',
          score: doc.title.toLowerCase().includes(q) ? 3 : doc.excerpt?.toLowerCase().includes(q) ? 2 : 1,
          updated_at: doc.updated_at,
          ...(doc.metadata ? { metadata: doc.metadata } : {})
        });
      }
      return hits.sort((a, b) => b.score - a.score || b.updated_at.localeCompare(a.updated_at)).slice(0, limit);
    },

    async openDocument(connection: ConnectorConnection, input: ConnectorOpenInput): Promise<void> {
      const source = await findSource(vaultPath, connection, input.doc_ref);
      const file = metadataString(source, 'path') ?? source?.canonical_ref;
      if (!file) throw new Error('local_ai_session_original_path_unavailable');
      await shell.openPath(file);
    }
  };
}

async function listLocalAISessionDocuments(vaultPath: string, connection: ConnectorConnection): Promise<ConnectorDocument[]> {
  const sources = await listSourcesForConnection(vaultPath, connection);
  return sources
    .map((source) => documentForSource(connection, source))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.title.localeCompare(b.title));
}

async function listSourcesForConnection(vaultPath: string, connection: ConnectorConnection): Promise<EvidenceSource[]> {
  const options = await resolveExternalAISessionScanOptions(vaultPath);
  return listExternalAISessionSources({
    ...options,
    indexLevel: connection.privacy.index_level,
    includeToolOutputs: connection.privacy.allow_tool_outputs
  });
}

function documentForSource(connection: ConnectorConnection, source: EvidenceSource): ConnectorDocument {
  const agent = metadataString(source, 'agent') ?? 'unknown';
  const sourceName = metadataString(source, 'source') ?? agent;
  const relPath = metadataString(source, 'rel_path') ?? source.canonical_ref;
  const projectName = projectNameForSource(source);
  return {
    connection_id: connection.id,
    connector_id: connection.connector_id,
    doc_ref: makeDocRef(agent, sourceName, relPath),
    title: source.title,
    canonical_ref: source.canonical_ref,
    updated_at: source.updated_at,
    evidence_kind: 'external_ai_session',
    fingerprint: source.fingerprint,
    excerpt: excerpt(source.summary ?? source.title),
    metadata: compactMetadata({
      ...(source.metadata ?? {}),
      external_source_id: source.id,
      agent,
      session_id: relPath,
      source: sourceName,
      rel_path: relPath,
      path: metadataString(source, 'path') ?? source.canonical_ref,
      project_name: projectName,
      time_from: source.time_range?.from,
      time_to: source.time_range?.to
    })
  };
}

async function findSource(
  vaultPath: string,
  connection: ConnectorConnection,
  docRef: string
): Promise<EvidenceSource | null> {
  const parsed = parseDocRef(docRef);
  if (!parsed) return null;
  const sources = await listSourcesForConnection(vaultPath, connection);
  return sources.find((source) => sourceMatchesDocRef(source, parsed)) ?? null;
}

function sourceMatchesDocRef(source: EvidenceSource, parsed: ParsedDocRef): boolean {
  const agent = metadataString(source, 'agent') ?? 'unknown';
  const sourceName = metadataString(source, 'source') ?? agent;
  const relPath = metadataString(source, 'rel_path') ?? source.canonical_ref;
  if (agent !== parsed.agent) return false;
  if (parsed.source && sourceName !== parsed.source) return false;
  return relPath === parsed.relPath || source.canonical_ref === parsed.relPath;
}

function makeDocRef(agent: string, source: string, relPath: string): string {
  return [agent, source, relPath].map((part) => encodeURIComponent(part)).join(':');
}

function parseDocRef(docRef: string): ParsedDocRef | null {
  const parts = docRef.split(':');
  if (parts.length < 2) return null;
  if (parts.length === 2) {
    return {
      agent: safeDecode(parts[0]),
      relPath: safeDecode(parts[1])
    };
  }
  return {
    agent: safeDecode(parts[0]),
    source: safeDecode(parts[1]),
    relPath: safeDecode(parts.slice(2).join(':'))
  };
}

function withConnectionPrivacy(source: EvidenceSource, privacy: EvidencePrivacy): EvidenceSource {
  return {
    ...source,
    privacy: {
      ...source.privacy,
      index_level: privacy.index_level,
      allow_synthesis: privacy.allow_synthesis,
      allow_tool_outputs: privacy.allow_tool_outputs,
      redaction_profile: privacy.redaction_profile ?? source.privacy.redaction_profile
    }
  };
}

function projectNameForSource(source: EvidenceSource): string | undefined {
  const project = metadataString(source, 'project_name');
  if (project) return project;
  return source.scope_refs?.find((scope) => scope.kind === 'project')?.ref;
}

function metadataString(source: EvidenceSource | null | undefined, key: string): string | null {
  return stringMetadata(source?.metadata, key);
}

function stringMetadata(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function compactMetadata(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function excerpt(raw: string, limit = 240): string {
  return raw.replace(/\s+/gu, ' ').trim().slice(0, limit);
}
