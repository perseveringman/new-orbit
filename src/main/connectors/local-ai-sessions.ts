import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { shell } from 'electron';
import type {
  ConnectConnectorInput,
  ConnectorConnection,
  ConnectorDocument,
  ConnectorDocumentContent,
  ConnectorOpenInput,
  ConnectorSearchHit
} from '@shared/connectors';
import type { EvidenceContentView } from '@shared/evidence';
import type { RuntimeSessionDisplaySettings, RuntimeSessionGroups, RuntimeSessionListItem } from '@shared/runtime-sessions';
import type { ConnectorPlugin } from './plugin';
import {
  getRuntimeSessionMarkdown,
  listRuntimeSessions,
  runtimeSessionBridgeStatus
} from '../runtime-sessions/bridge';

const CONNECTOR_ID = 'local-ai-sessions';
const AGENT_KEYS = ['claude', 'claude-internal', 'amp', 'copilot', 'codebuddy', 'box', 'codex'] as const;

type AgentKey = (typeof AGENT_KEYS)[number];

export function createLocalAISessionsConnectorPlugin(): ConnectorPlugin {
  return {
    definition: {
      id: CONNECTOR_ID,
      display_name: '本地 AI 会话',
      description: '聚合 Claude、Codex、Amp 等本机 agent 保存的历史会话，让 Orbit AI 可检索与引用。',
      category: 'knowledge',
      capabilities: ['list', 'read', 'search', 'index', 'open_original'],
      evidence_kind: 'external_ai_session',
      built_in: true,
      config_schema: []
    },

    async normalizeConfig(_input: ConnectConnectorInput['config']): Promise<Record<string, unknown>> {
      const status = await runtimeSessionBridgeStatus();
      if (!status.available) throw new Error(status.message ?? 'local_ai_sessions_bridge_unavailable');
      return {
        bridge_root: status.root,
        module_path: status.modulePath
      };
    },

    listDocuments: listLocalAISessionDocuments,

    async readDocument(
      connection: ConnectorConnection,
      docRef: string,
      contentView: EvidenceContentView = 'safe_projection'
    ): Promise<ConnectorDocumentContent | null> {
      const parsed = parseDocRef(docRef);
      if (!parsed) return null;
      const document = await findDocument(connection, docRef);
      if (!document) return null;
      if (contentView === 'metadata') {
        return {
          document,
          content_markdown: [document.title, document.excerpt, document.canonical_ref].filter(Boolean).join('\n')
        };
      }
      const markdown = await getRuntimeSessionMarkdown(
        parsed.agent,
        parsed.id,
        displaySettingsForContentView(contentView)
      );
      return {
        document,
        content_markdown: markdown.text
      };
    },

    async search(connection: ConnectorConnection, query: string, limit: number): Promise<ConnectorSearchHit[]> {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const docs = await listLocalAISessionDocuments(connection);
      const hits: ConnectorSearchHit[] = [];
      for (const doc of docs) {
        const haystack = [
          doc.title,
          doc.excerpt,
          stringMetadata(doc, 'agent'),
          stringMetadata(doc, 'project_name'),
          stringMetadata(doc, 'model'),
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
      const document = await findDocument(connection, input.doc_ref);
      const file = stringMetadata(document, 'path');
      if (!file) throw new Error('local_ai_session_original_path_unavailable');
      await shell.openPath(file);
    }
  };
}

async function listLocalAISessionDocuments(connection: ConnectorConnection): Promise<ConnectorDocument[]> {
  const groups = await listRuntimeSessions(false);
  const rows = flattenGroups(groups);
  const documents = await Promise.all(rows.map(({ agent, session }) => documentForSession(connection, agent, session)));
  return documents.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.title.localeCompare(b.title));
}

async function documentForSession(
  connection: ConnectorConnection,
  agent: AgentKey,
  session: RuntimeSessionListItem
): Promise<ConnectorDocument> {
  const file = stringValue(session.path);
  const stat = file ? await fs.stat(file).catch(() => null) : null;
  const updatedAt = stat?.mtime.toISOString() ?? isoDate(session.sortTimestamp || session.timestamp) ?? new Date(0).toISOString();
  const size = stat?.size ?? session.size;
  const docRef = makeDocRef(agent, session.id);
  const title = session.title || session.summary || session.id.split('/').at(-1) || `${agent} 会话`;

  return {
    connection_id: connection.id,
    connector_id: connection.connector_id,
    doc_ref: docRef,
    title,
    canonical_ref: `local-ai-session:${agent}:${session.id}`,
    updated_at: updatedAt,
    evidence_kind: 'external_ai_session',
    fingerprint: stat
      ? {
          algorithm: 'mtime-size',
          value: `${stat.mtimeMs}:${stat.size}`,
          size_bytes: stat.size,
          mtime: stat.mtime.toISOString()
        }
      : {
          algorithm: 'provider-version',
          value: hash([agent, session.id, session.timestamp, session.sortTimestamp, title, session.summary, size, session.model].join('\n')),
          ...(size !== undefined ? { size_bytes: size } : {})
        },
    excerpt: excerpt(session.summary || title),
    metadata: {
      agent,
      session_id: session.id,
      ...(session.projectName ? { project_name: session.projectName } : {}),
      ...(session.source ? { source: session.source } : {}),
      ...(file ? { path: file } : {}),
      ...(session.model ? { model: session.model } : {}),
      ...(session.timestamp ? { timestamp: session.timestamp } : {})
    }
  };
}

async function findDocument(connection: ConnectorConnection, docRef: string): Promise<ConnectorDocument | null> {
  const docs = await listLocalAISessionDocuments(connection);
  return docs.find((doc) => doc.doc_ref === docRef) ?? null;
}

function flattenGroups(groups: RuntimeSessionGroups): Array<{ agent: AgentKey; session: RuntimeSessionListItem }> {
  return AGENT_KEYS.flatMap((agent) => groups[agent].map((session) => ({ agent, session })));
}

function makeDocRef(agent: AgentKey, id: string): string {
  return `${agent}:${encodeURIComponent(id)}`;
}

function parseDocRef(docRef: string): { agent: AgentKey; id: string } | null {
  const splitAt = docRef.indexOf(':');
  if (splitAt <= 0) return null;
  const agent = docRef.slice(0, splitAt);
  if (!(AGENT_KEYS as readonly string[]).includes(agent)) return null;
  return {
    agent: agent as AgentKey,
    id: decodeURIComponent(docRef.slice(splitAt + 1))
  };
}

function displaySettingsForContentView(contentView: EvidenceContentView): Partial<RuntimeSessionDisplaySettings> {
  if (contentView === 'full') {
    return {
      showUser: true,
      showAssistant: true,
      showThinking: true,
      showToolCalls: true,
      showToolResults: true
    };
  }
  return {
    showUser: true,
    showAssistant: true,
    showThinking: false,
    showToolCalls: false,
    showToolResults: false
  };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function stringMetadata(doc: ConnectorDocument | null, key: string): string {
  const value = doc?.metadata?.[key];
  return typeof value === 'string' ? value : '';
}

function isoDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function excerpt(raw: string, limit = 240): string {
  return raw.replace(/\s+/gu, ' ').trim().slice(0, limit);
}
