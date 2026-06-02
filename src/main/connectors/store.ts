import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  defaultConnectorPrivacy,
  type ConnectConnectorInput,
  type ConnectorConnection,
  type ConnectorDefinition,
  type ConnectorDocumentContent,
  type ConnectorReadInput,
  type ConnectorScanResult,
  type ConnectorSearchHit,
  type UpdateConnectorInput
} from '@shared/connectors';
import { ORBIT_DIR } from '@shared/constants';
import { LOCAL_AI_SESSIONS_CONNECTOR_DISPLAY_NAME } from './local-ai-sessions';
import { createDefaultConnectorPluginRegistry } from './registry';
import type { ConnectorPluginRegistry } from './plugin';
import { createConnectorCatalogStore, type ConnectorCatalogStore } from './catalog';

interface ConnectorRegistryFile {
  version: 1;
  connections: ConnectorConnection[];
  updated_at?: string;
}

export class ConnectorStore {
  constructor(
    private readonly vaultPath: string,
    private readonly plugins: ConnectorPluginRegistry = createDefaultConnectorPluginRegistry(vaultPath),
    private readonly catalog: ConnectorCatalogStore = createConnectorCatalogStore(vaultPath)
  ) {}

  definitions(): ConnectorDefinition[] {
    return this.plugins.listDefinitions();
  }

  async list(): Promise<ConnectorConnection[]> {
    return (await this.readRegistry()).connections;
  }

  async get(connectionId: string): Promise<ConnectorConnection | null> {
    return (await this.list()).find((connection) => connection.id === connectionId) ?? null;
  }

  async connect(input: ConnectConnectorInput): Promise<ConnectorConnection> {
    const plugin = this.plugins.require(input.connector_id);
    const now = new Date().toISOString();
    const config = await plugin.normalizeConfig(input.config);
    const registry = await this.readRegistry();
    const reusable = findReusableConnection(registry.connections, plugin.definition, config);
    const connection: ConnectorConnection = {
      id: reusable?.id ?? `conn-${randomUUID()}`,
      connector_id: plugin.definition.id,
      display_name: input.display_name?.trim() || reusable?.display_name || plugin.definition.display_name,
      enabled: input.enabled ?? reusable?.enabled ?? true,
      status: 'connected',
      connected_at: reusable?.connected_at ?? now,
      updated_at: now,
      last_scanned_at: reusable?.last_scanned_at,
      item_count: reusable?.item_count ?? 0,
      config,
      privacy: reusable
        ? defaultConnectorPrivacy({ ...reusable.privacy, ...(input.privacy ?? {}) })
        : defaultConnectorPrivacy(input.privacy)
    };
    const scanned = await this.scanConnection(connection).catch((error) => ({
      ...connection,
      status: 'error' as const,
      error: error instanceof Error ? error.message : String(error),
      updated_at: now
    }));
    const latestRegistry = await this.readRegistry();
    const latestReusable = findReusableConnection(latestRegistry.connections, plugin.definition, config);
    const saved = latestReusable
      ? { ...scanned, id: latestReusable.id, connected_at: latestReusable.connected_at }
      : scanned;
    if (latestReusable) {
      latestRegistry.connections = latestRegistry.connections.map((item) => item.id === latestReusable.id ? saved : item);
    } else {
      latestRegistry.connections.push(saved);
    }
    await this.writeRegistry(latestRegistry);
    return saved;
  }

  async update(connectionId: string, patch: UpdateConnectorInput): Promise<ConnectorConnection> {
    const registry = await this.readRegistry();
    const current = registry.connections.find((connection) => connection.id === connectionId);
    if (!current) throw new Error(`connector_connection_not_found:${connectionId}`);
    const plugin = this.plugins.require(current.connector_id);
    const config = patch.config ? await plugin.normalizeConfig(patch.config) : current.config;
    const next: ConnectorConnection = {
      ...current,
      ...(patch.display_name !== undefined ? { display_name: patch.display_name.trim() || current.display_name } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      config,
      privacy: patch.privacy ? defaultConnectorPrivacy({ ...current.privacy, ...patch.privacy }) : current.privacy,
      updated_at: new Date().toISOString()
    };
    registry.connections = registry.connections.map((connection) => connection.id === connectionId ? next : connection);
    await this.writeRegistry(registry);
    return next;
  }

  async remove(connectionId: string): Promise<ConnectorConnection | null> {
    const registry = await this.readRegistry();
    const removed = registry.connections.find((connection) => connection.id === connectionId) ?? null;
    registry.connections = registry.connections.filter((connection) => connection.id !== connectionId);
    await this.writeRegistry(registry);
    await this.catalog.removeConnection(connectionId);
    return removed;
  }

  async scan(connectionId: string): Promise<ConnectorScanResult> {
    const registry = await this.readRegistry();
    const current = registry.connections.find((connection) => connection.id === connectionId);
    if (!current) throw new Error(`connector_connection_not_found:${connectionId}`);
    const next = await this.scanConnection(current);
    registry.connections = registry.connections.map((connection) => connection.id === connectionId ? next : connection);
    await this.writeRegistry(registry);
    return {
      connection: next,
      item_count: next.item_count,
      scanned_at: next.last_scanned_at ?? next.updated_at
    };
  }

  async search(query: string, limit = 20): Promise<ConnectorSearchHit[]> {
    const q = query.trim();
    if (!q) return [];
    const connections = (await this.list()).filter((connection) => connection.enabled && connection.status === 'connected');
    return this.catalog.search(q, connections.map((connection) => connection.id), limit);
  }

  async read(input: ConnectorReadInput): Promise<ConnectorDocumentContent | null> {
    const connection = await this.requireConnection(input.connection_id);
    if (input.content_view === 'metadata' || input.content_view === 'safe_projection' || input.content_view === undefined) {
      const cached = await this.catalog.readCachedContent(connection.id, input.doc_ref, input.content_view ?? 'safe_projection');
      if (cached) return cached;
    }
    return this.plugins.require(connection.connector_id).readDocument(connection, input.doc_ref, input.content_view);
  }

  async readCached(input: ConnectorReadInput): Promise<ConnectorDocumentContent | null> {
    const connection = await this.requireConnection(input.connection_id);
    return this.catalog.readCachedContent(connection.id, input.doc_ref, input.content_view ?? 'safe_projection');
  }

  async listDocuments(connectionId?: string): Promise<ConnectorDocumentContent['document'][]> {
    const connections = (await this.list()).filter((connection) =>
      connection.enabled && connection.status === 'connected' && (!connectionId || connection.id === connectionId)
    );
    return this.catalog.listDocuments(connections.map((connection) => connection.id));
  }

  async open(connectionId: string, docRef: string): Promise<void> {
    const connection = await this.requireConnection(connectionId);
    const plugin = this.plugins.require(connection.connector_id);
    if (!plugin.openDocument) throw new Error(`connector_open_not_supported:${connection.connector_id}`);
    await plugin.openDocument(connection, { connection_id: connectionId, doc_ref: docRef });
  }

  private async requireConnection(connectionId: string): Promise<ConnectorConnection> {
    const connection = await this.get(connectionId);
    if (!connection) throw new Error(`connector_connection_not_found:${connectionId}`);
    return connection;
  }

  private async scanConnection(connection: ConnectorConnection): Promise<ConnectorConnection> {
    const plugin = this.plugins.require(connection.connector_id);
    const config = await plugin.normalizeConfig(connection.config).catch(() => connection.config);
    const normalizedConnection = { ...connection, config };
    const docs = (await plugin.listDocuments(normalizedConnection)).map((doc) => ({
      ...doc,
      connection_id: connection.id,
      connector_id: connection.connector_id,
      evidence_kind: doc.evidence_kind ?? plugin.definition.evidence_kind ?? 'external_file'
    }));
    await this.catalog.replaceConnectionDocuments(
      normalizedConnection,
      docs,
      async (doc) => {
        if (normalizedConnection.privacy.index_level === 'metadata_only') {
          return [doc.title, doc.excerpt, doc.canonical_ref].filter(Boolean).join('\n');
        }
        const content = await plugin.readDocument(normalizedConnection, doc.doc_ref, 'safe_projection');
        return content?.content_markdown ?? doc.excerpt ?? doc.title;
      }
    );
    const now = new Date().toISOString();
    return {
      ...connection,
      config,
      status: 'connected',
      error: undefined,
      item_count: docs.length,
      last_scanned_at: now,
      updated_at: now
    };
  }

  private registryPath(): string {
    return path.join(this.vaultPath, ORBIT_DIR, 'connectors', 'registry.json');
  }

  private async readRegistry(): Promise<ConnectorRegistryFile> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.registryPath(), 'utf8')) as Partial<ConnectorRegistryFile>;
      const connections = Array.isArray(parsed.connections)
        ? dedupeReusableConnections(parsed.connections.map(normalizeConnection), this.plugins.listDefinitions())
        : [];
      const registry = {
        version: 1 as const,
        connections,
        ...(typeof parsed.updated_at === 'string' ? { updated_at: parsed.updated_at } : {})
      };
      if (Array.isArray(parsed.connections) && parsed.connections.length !== connections.length) {
        await this.writeRegistry(registry);
      }
      return registry;
    } catch (error) {
      if (isNotFound(error)) return { version: 1, connections: [] };
      throw error;
    }
  }

  private async writeRegistry(registry: ConnectorRegistryFile): Promise<void> {
    const next = { ...registry, version: 1 as const, updated_at: new Date().toISOString() };
    await fs.mkdir(path.dirname(this.registryPath()), { recursive: true });
    await fs.writeFile(this.registryPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
}

export function createConnectorStore(vaultPath: string): ConnectorStore {
  return new ConnectorStore(vaultPath);
}

function normalizeConnection(value: ConnectorConnection): ConnectorConnection {
  const displayName = value.connector_id === 'local-ai-sessions' && (value.display_name === '本地 AI 会话' || value.display_name === '本地 AI 会话库')
    ? LOCAL_AI_SESSIONS_CONNECTOR_DISPLAY_NAME
    : value.display_name;
  return {
    ...value,
    display_name: displayName,
    enabled: value.enabled ?? true,
    status: value.status ?? 'connected',
    item_count: value.item_count ?? 0,
    config: value.config ?? {},
    privacy: defaultConnectorPrivacy(value.privacy)
  };
}

function dedupeReusableConnections(
  connections: ConnectorConnection[],
  definitions: ConnectorDefinition[]
): ConnectorConnection[] {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  const deduped: ConnectorConnection[] = [];
  for (const connection of connections) {
    const definition = definitionsById.get(connection.connector_id);
    const existing = definition ? findReusableConnection(deduped, definition, connection.config) : null;
    if (!existing) {
      deduped.push(connection);
      continue;
    }
    const index = deduped.findIndex((item) => item.id === existing.id);
    deduped[index] = mergeDuplicateConnection(existing, connection);
  }
  return deduped;
}

function findReusableConnection(
  connections: ConnectorConnection[],
  definition: ConnectorDefinition,
  config: Record<string, unknown>
): ConnectorConnection | null {
  const candidates = connections.filter((connection) => connection.connector_id === definition.id);
  if (definition.config_schema.length === 0) return candidates[0] ?? null;
  const configKey = stableStringify(config);
  return candidates.find((connection) => stableStringify(connection.config ?? {}) === configKey) ?? null;
}

function mergeDuplicateConnection(keeper: ConnectorConnection, duplicate: ConnectorConnection): ConnectorConnection {
  const preferred = isBetterConnection(duplicate, keeper) ? duplicate : keeper;
  return {
    ...preferred,
    id: keeper.id,
    connected_at: keeper.connected_at,
    privacy: defaultConnectorPrivacy(preferred.privacy)
  };
}

function isBetterConnection(candidate: ConnectorConnection, current: ConnectorConnection): boolean {
  const candidateStatus = statusRank(candidate.status);
  const currentStatus = statusRank(current.status);
  if (candidateStatus !== currentStatus) return candidateStatus > currentStatus;
  if (candidate.item_count !== current.item_count) return candidate.item_count > current.item_count;
  return connectionTimestamp(candidate).localeCompare(connectionTimestamp(current)) > 0;
}

function statusRank(status: ConnectorConnection['status']): number {
  if (status === 'connected') return 3;
  if (status === 'disconnected') return 2;
  return 1;
}

function connectionTimestamp(connection: ConnectorConnection): string {
  return connection.last_scanned_at ?? connection.updated_at ?? connection.connected_at;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT');
}
