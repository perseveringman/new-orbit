import { getSDKRuntime } from '../runtime/sdk/ipc';
import type { RuntimeRouter } from '../runtime/router';
import type { SDKEndpointRegistry } from '../runtime/sdk/endpoint-registry';
import type { SDKKeyVault } from '../runtime/sdk/key-vault';
import { AIConfigService } from './service';

let current: {
  vaultPath: string;
  keyVault: SDKKeyVault;
  registry: SDKEndpointRegistry;
  router: RuntimeRouter;
  service: AIConfigService;
} | null = null;

export function getAIConfigRuntime(vaultPath: string): {
  keyVault: SDKKeyVault;
  registry: SDKEndpointRegistry;
  router: RuntimeRouter;
  service: AIConfigService;
} {
  if (current?.vaultPath === vaultPath) return current;
  const sdk = getSDKRuntime(vaultPath);
  current = {
    vaultPath,
    ...sdk,
    service: new AIConfigService(sdk.registry, sdk.keyVault, vaultPath)
  };
  return current;
}

export function resetAIConfigRuntime(vaultPath?: string): void {
  if (!vaultPath || current?.vaultPath === vaultPath) current = null;
}
