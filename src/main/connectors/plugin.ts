import type {
  ConnectConnectorInput,
  ConnectorConnection,
  ConnectorDefinition,
  ConnectorDocument,
  ConnectorDocumentContent,
  ConnectorOpenInput,
  ConnectorSearchHit
} from '@shared/connectors';

export interface ConnectorPlugin {
  definition: ConnectorDefinition;
  normalizeConfig(input: ConnectConnectorInput['config']): Promise<Record<string, unknown>>;
  listDocuments(connection: ConnectorConnection): Promise<ConnectorDocument[]>;
  readDocument(connection: ConnectorConnection, docRef: string): Promise<ConnectorDocumentContent | null>;
  search?(connection: ConnectorConnection, query: string, limit: number): Promise<ConnectorSearchHit[]>;
  openDocument?(connection: ConnectorConnection, input: ConnectorOpenInput): Promise<void>;
}

export class ConnectorPluginRegistry {
  private readonly plugins = new Map<string, ConnectorPlugin>();

  register(plugin: ConnectorPlugin): void {
    this.plugins.set(plugin.definition.id, plugin);
  }

  listDefinitions(): ConnectorDefinition[] {
    return Array.from(this.plugins.values()).map((plugin) => plugin.definition);
  }

  get(connectorId: string): ConnectorPlugin | null {
    return this.plugins.get(connectorId) ?? null;
  }

  require(connectorId: string): ConnectorPlugin {
    const plugin = this.get(connectorId);
    if (!plugin) throw new Error(`connector_plugin_not_found:${connectorId}`);
    return plugin;
  }
}
