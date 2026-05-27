import type { EvidenceContentView, EvidenceSource } from '@shared/evidence';
import { evidenceSourceId } from '@shared/evidence';
import { createConnectorStore } from './store';

const ORBIT_LOCAL_EVIDENCE_PROVIDER_ID = 'orbit.local';

export async function listConnectorEvidenceSources(vaultPath: string): Promise<EvidenceSource[]> {
  const store = createConnectorStore(vaultPath);
  const connections = (await store.list()).filter((connection) => connection.enabled && connection.status === 'connected');
  const docs = await Promise.all(connections.map((connection) => store.listDocuments(connection.id).catch(() => [])));
  const connectionById = new Map(connections.map((connection) => [connection.id, connection]));
  const now = new Date().toISOString();

  return docs.flat().map((doc) => {
    const connection = connectionById.get(doc.connection_id);
    const ref = connectorEvidenceRef(doc.connection_id, doc.doc_ref);
    return {
      id: evidenceSourceId('external_file', ref),
      kind: 'external_file',
      ownership: 'reference',
      title: doc.title,
      summary: doc.excerpt,
      provider_id: ORBIT_LOCAL_EVIDENCE_PROVIDER_ID,
      canonical_ref: doc.canonical_ref,
      created_at: connection?.connected_at,
      updated_at: doc.updated_at,
      observed_at: now,
      fingerprint: doc.fingerprint,
      availability: 'available',
      privacy: connection?.privacy ?? {
        index_level: 'safe_projection',
        allow_synthesis: true,
        allow_tool_outputs: false,
        redaction_profile: 'default'
      },
      metadata: {
        entity_ref: ref,
        connector_connection_id: doc.connection_id,
        connector_id: doc.connector_id,
        connector_name: connection?.display_name,
        doc_ref: doc.doc_ref,
        ...(doc.metadata ?? {})
      }
    } satisfies EvidenceSource;
  });
}

export async function readConnectorEvidenceText(
  vaultPath: string,
  source: EvidenceSource,
  contentView: EvidenceContentView
): Promise<string> {
  const connectionId = metadataString(source, 'connector_connection_id');
  const docRef = metadataString(source, 'doc_ref');
  if (!connectionId || !docRef) return '';
  const read = await createConnectorStore(vaultPath).read({
    connection_id: connectionId,
    doc_ref: docRef,
    content_view: contentView
  });
  return read?.content_markdown ?? '';
}

function connectorEvidenceRef(connectionId: string, docRef: string): string {
  return `connector:${connectionId}:${docRef}`;
}

function metadataString(source: EvidenceSource, key: string): string | null {
  const value = source.metadata?.[key];
  return typeof value === 'string' && value ? value : null;
}
