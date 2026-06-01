import { createLocalAISessionsConnectorPlugin } from './local-ai-sessions';
import { createObsidianConnectorPlugin } from './obsidian';
import { ConnectorPluginRegistry } from './plugin';

export function createDefaultConnectorPluginRegistry(vaultPath: string): ConnectorPluginRegistry {
  const registry = new ConnectorPluginRegistry();
  registry.register(createObsidianConnectorPlugin());
  registry.register(createLocalAISessionsConnectorPlugin(vaultPath));
  return registry;
}
