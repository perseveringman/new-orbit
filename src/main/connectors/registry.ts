import { createObsidianConnectorPlugin } from './obsidian';
import { ConnectorPluginRegistry } from './plugin';

export function createDefaultConnectorPluginRegistry(): ConnectorPluginRegistry {
  const registry = new ConnectorPluginRegistry();
  registry.register(createObsidianConnectorPlugin());
  return registry;
}
