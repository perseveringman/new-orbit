import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import type {
  ConnectorConnection,
  ConnectorDocument,
  ConnectorDocumentContent,
  ConnectorSearchHit
} from '@shared/connectors';
import type { EvidenceContentView } from '@shared/evidence';

const CATALOG_VERSION = 1;
const MAX_SEARCHABLE_PROJECTION_CHARS = 1200;

interface ConnectorCatalogProjection {
  ref: string;
  content_view: EvidenceContentView;
  fingerprint_value: string;
  updated_at: string;
}

interface ConnectorCatalogEntry {
  document: ConnectorDocument;
  observed_at: string;
  availability: 'available' | 'missing';
  search_text?: string;
  projection?: ConnectorCatalogProjection;
}

interface ConnectorCatalogConnection {
  connection_id: string;
  connector_id: string;
  updated_at: string;
  documents: Record<string, ConnectorCatalogEntry>;
}

interface ConnectorCatalogFile {
  version: typeof CATALOG_VERSION;
  connections: Record<string, ConnectorCatalogConnection>;
  updated_at?: string;
}

export class ConnectorCatalogStore {
  constructor(private readonly vaultPath: string) {}

  async listDocuments(connectionIds?: string[]): Promise<ConnectorDocument[]> {
    const wanted = connectionIds?.length ? new Set(connectionIds) : null;
    const catalog = await this.readCatalog();
    const docs: ConnectorDocument[] = [];
    for (const connection of Object.values(catalog.connections)) {
      if (wanted && !wanted.has(connection.connection_id)) continue;
      for (const entry of Object.values(connection.documents)) {
        if (entry.availability !== 'available') continue;
        docs.push(entry.document);
      }
    }
    return docs.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.title.localeCompare(b.title));
  }

  async getDocument(connectionId: string, docRef: string): Promise<ConnectorDocument | null> {
    const entry = await this.getEntry(connectionId, docRef);
    return entry?.availability === 'available' ? entry.document : null;
  }

  async readCachedContent(
    connectionId: string,
    docRef: string,
    contentView: EvidenceContentView = 'safe_projection'
  ): Promise<ConnectorDocumentContent | null> {
    const entry = await this.getEntry(connectionId, docRef);
    if (!entry || entry.availability !== 'available') return null;
    if (contentView === 'metadata') {
      return {
        document: entry.document,
        content_markdown: metadataText(entry.document)
      };
    }
    const projection = entry.projection;
    if (contentView === 'safe_projection' && projection?.fingerprint_value === entry.document.fingerprint.value) {
      const content = await fs.readFile(this.projectionPath(projection.ref), 'utf8').catch(() => null);
      if (content !== null) {
        return {
          document: entry.document,
          content_markdown: content
        };
      }
    }
    return {
      document: entry.document,
      content_markdown: [entry.document.excerpt, metadataText(entry.document)].filter(Boolean).join('\n\n')
    };
  }

  async search(query: string, connectionIds?: string[], limit = 20): Promise<ConnectorSearchHit[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const wanted = connectionIds?.length ? new Set(connectionIds) : null;
    const catalog = await this.readCatalog();
    const hits: ConnectorSearchHit[] = [];
    for (const connection of Object.values(catalog.connections)) {
      if (wanted && !wanted.has(connection.connection_id)) continue;
      for (const entry of Object.values(connection.documents)) {
        if (entry.availability !== 'available') continue;
        const projectionText = entry.search_text ?? '';
        const haystack = [
          entry.document.title,
          entry.document.excerpt,
          projectionText,
          entry.document.doc_ref,
          stringMetadata(entry.document.metadata, 'path'),
          stringMetadata(entry.document.metadata, 'project_name'),
          stringMetadata(entry.document.metadata, 'agent'),
          stringMetadata(entry.document.metadata, 'source')
        ].filter(Boolean).join('\n').toLowerCase();
        if (!haystack.includes(q)) continue;
        hits.push({
          connection_id: entry.document.connection_id,
          connector_id: entry.document.connector_id,
          doc_ref: entry.document.doc_ref,
          title: entry.document.title,
          excerpt: excerptAround(haystack, q) || entry.document.excerpt || '',
          score: scoreDocument(entry.document, projectionText, q),
          updated_at: entry.document.updated_at,
          ...(entry.document.metadata ? { metadata: entry.document.metadata } : {})
        });
      }
    }
    return hits.sort((a, b) => b.score - a.score || b.updated_at.localeCompare(a.updated_at)).slice(0, limit);
  }

  async replaceConnectionDocuments(
    connection: ConnectorConnection,
    documents: ConnectorDocument[],
    readProjection?: (doc: ConnectorDocument) => Promise<string | null>
  ): Promise<void> {
    const catalog = await this.readCatalog();
    const now = new Date().toISOString();
    const entries: Record<string, ConnectorCatalogEntry> = {};
    const previous = catalog.connections[connection.id];

    for (const doc of documents) {
      const normalized: ConnectorDocument = {
        ...doc,
        connection_id: connection.id,
        connector_id: connection.connector_id
      };
      const previousEntry = previous?.documents[normalized.doc_ref];
      if (
        previousEntry?.availability === 'available' &&
        previousEntry.document.fingerprint.value === normalized.fingerprint.value &&
        previousEntry.projection?.fingerprint_value === normalized.fingerprint.value
      ) {
        entries[normalized.doc_ref] = {
          ...previousEntry,
          document: normalized,
          observed_at: now,
          availability: 'available'
        };
        continue;
      }
      const projectionText = await readProjection?.(normalized).catch(() => null);
      const projection = projectionText !== null && projectionText !== undefined
        ? await this.writeProjection(connection.id, normalized, projectionText)
        : undefined;
      entries[normalized.doc_ref] = {
        document: normalized,
        observed_at: now,
        availability: 'available',
        search_text: projectionText?.slice(0, MAX_SEARCHABLE_PROJECTION_CHARS),
        ...(projection ? { projection } : {})
      };
    }

    if (previous) {
      for (const [docRef, entry] of Object.entries(previous.documents)) {
        if (entries[docRef]) continue;
        entries[docRef] = {
          ...entry,
          availability: 'missing',
          observed_at: now
        };
      }
    }

    catalog.connections[connection.id] = {
      connection_id: connection.id,
      connector_id: connection.connector_id,
      updated_at: now,
      documents: entries
    };
    catalog.updated_at = now;
    await this.writeCatalog(catalog);
  }

  async removeConnection(connectionId: string): Promise<void> {
    const catalog = await this.readCatalog();
    delete catalog.connections[connectionId];
    catalog.updated_at = new Date().toISOString();
    await this.writeCatalog(catalog);
    await fs.rm(path.join(this.projectionsDir(), connectionId), { recursive: true, force: true }).catch(() => undefined);
  }

  private async getEntry(connectionId: string, docRef: string): Promise<ConnectorCatalogEntry | null> {
    const catalog = await this.readCatalog();
    return catalog.connections[connectionId]?.documents[docRef] ?? null;
  }

  private async writeProjection(
    connectionId: string,
    document: ConnectorDocument,
    content: string
  ): Promise<ConnectorCatalogProjection> {
    const ref = path.join(connectionId, `${safeName(document.doc_ref)}.md`);
    const file = this.projectionPath(ref);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
    return {
      ref,
      content_view: 'safe_projection',
      fingerprint_value: document.fingerprint.value,
      updated_at: new Date().toISOString()
    };
  }

  private catalogPath(): string {
    return path.join(this.connectorsDir(), 'catalog.json');
  }

  private connectorsDir(): string {
    return path.join(this.vaultPath, ORBIT_DIR, 'connectors');
  }

  private projectionsDir(): string {
    return path.join(this.connectorsDir(), 'projections');
  }

  private projectionPath(ref: string): string {
    return path.join(this.projectionsDir(), ref);
  }

  private async readCatalog(): Promise<ConnectorCatalogFile> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.catalogPath(), 'utf8')) as Partial<ConnectorCatalogFile>;
      return {
        version: CATALOG_VERSION,
        connections: parsed.connections && typeof parsed.connections === 'object'
          ? parsed.connections as Record<string, ConnectorCatalogConnection>
          : {},
        ...(typeof parsed.updated_at === 'string' ? { updated_at: parsed.updated_at } : {})
      };
    } catch (error) {
      if (isNotFound(error)) return { version: CATALOG_VERSION, connections: {} };
      throw error;
    }
  }

  private async writeCatalog(catalog: ConnectorCatalogFile): Promise<void> {
    await fs.mkdir(path.dirname(this.catalogPath()), { recursive: true });
    await fs.writeFile(this.catalogPath(), `${JSON.stringify({ ...catalog, version: CATALOG_VERSION }, null, 2)}\n`, 'utf8');
  }
}

export function createConnectorCatalogStore(vaultPath: string): ConnectorCatalogStore {
  return new ConnectorCatalogStore(vaultPath);
}

function metadataText(document: ConnectorDocument): string {
  return [document.title, document.excerpt, document.canonical_ref, document.doc_ref].filter(Boolean).join('\n');
}

function scoreDocument(document: ConnectorDocument, projectionText: string, query: string): number {
  if (document.title.toLowerCase().includes(query)) return 3;
  if ((document.excerpt ?? '').toLowerCase().includes(query)) return 2;
  if (projectionText.toLowerCase().includes(query)) return 1.5;
  return 1;
}

function excerptAround(text: string, query: string, limit = 220): string {
  const index = text.indexOf(query);
  if (index < 0) return '';
  return text.slice(Math.max(0, index - 60), index + query.length + limit).replace(/\s+/gu, ' ').trim();
}

function stringMetadata(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeName(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT');
}
