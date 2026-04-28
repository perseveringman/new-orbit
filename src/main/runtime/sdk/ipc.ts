import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { SDKEndpointDefaults, SDKEndpointInput } from '@shared/runtime';
import { createSDKEndpointRegistry, type SDKEndpointRegistry } from './endpoint-registry';
import { createSDKKeyVault, type SDKKeyVault } from './key-vault';
import { RuntimeRouter } from '../router';

let current: { vaultPath: string; keyVault: SDKKeyVault; registry: SDKEndpointRegistry; router: RuntimeRouter } | null = null;

export function getSDKRuntime(vaultPath: string): { keyVault: SDKKeyVault; registry: SDKEndpointRegistry; router: RuntimeRouter } {
  if (current?.vaultPath === vaultPath) return current;
  const keyVault = createSDKKeyVault();
  const registry = createSDKEndpointRegistry(vaultPath, keyVault);
  const router = new RuntimeRouter(registry, keyVault);
  current = { vaultPath, keyVault, registry, router };
  return current;
}

export function registerSDKRuntimeIpc(getVaultPath: () => string | null): void {
  ipcMain.handle(IPC.runtime.sdk.snapshot, async () => getRegistry(getVaultPath).snapshot());
  ipcMain.handle(IPC.runtime.sdk.upsertEndpoint, async (_event, input: SDKEndpointInput) =>
    getRegistry(getVaultPath).upsert(input)
  );
  ipcMain.handle(IPC.runtime.sdk.deleteEndpoint, async (_event, endpointId: string) =>
    getRegistry(getVaultPath).delete(endpointId)
  );
  ipcMain.handle(IPC.runtime.sdk.setApiKey, async (_event, endpointId: string, apiKey: string) =>
    getRegistry(getVaultPath).setApiKey(endpointId, apiKey)
  );
  ipcMain.handle(IPC.runtime.sdk.deleteApiKey, async (_event, endpointId: string) =>
    getRegistry(getVaultPath).deleteApiKey(endpointId)
  );
  ipcMain.handle(IPC.runtime.sdk.setDefaults, async (_event, defaults: SDKEndpointDefaults) =>
    getRegistry(getVaultPath).setDefaults(defaults)
  );
  ipcMain.handle(IPC.runtime.sdk.testEndpoint, async (_event, endpointId: string, model?: string) =>
    getRuntime(getVaultPath).router.testEndpoint(endpointId, model)
  );
  ipcMain.handle(IPC.runtime.sdk.decide, async (_event, input) => getRuntime(getVaultPath).router.decide(input));
}

function getRegistry(getVaultPath: () => string | null): SDKEndpointRegistry {
  return getRuntime(getVaultPath).registry;
}

function getRuntime(getVaultPath: () => string | null): { keyVault: SDKKeyVault; registry: SDKEndpointRegistry; router: RuntimeRouter } {
  const vaultPath = getVaultPath();
  if (!vaultPath) throw new Error('no vault open');
  return getSDKRuntime(vaultPath);
}

