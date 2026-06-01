import { ipcMain } from 'electron';
import type {
  AIConfigDefaults,
  AIEmbeddingCredentialInput,
  AIEmbeddingProviderInput
} from '@shared/ai-config';
import { IPC } from '@shared/ipc';
import { getAIConfigRuntime } from './runtime';

export function registerAIConfigIpc(getVaultPath: () => string | null): void {
  ipcMain.handle(IPC.aiConfig.snapshot, async () => getRuntime(getVaultPath).service.snapshot());
  ipcMain.handle(IPC.aiConfig.upsertEmbeddingProvider, async (_event, input: AIEmbeddingProviderInput) =>
    getRuntime(getVaultPath).service.upsertEmbeddingProvider(input)
  );
  ipcMain.handle(
    IPC.aiConfig.setEmbeddingSecret,
    async (_event, providerId: string, input: AIEmbeddingCredentialInput) =>
      getRuntime(getVaultPath).service.setEmbeddingSecret(providerId, input)
  );
  ipcMain.handle(IPC.aiConfig.deleteEmbeddingSecret, async (_event, providerId: string) =>
    getRuntime(getVaultPath).service.deleteEmbeddingSecret(providerId)
  );
  ipcMain.handle(IPC.aiConfig.setDefaults, async (_event, defaults: Partial<AIConfigDefaults>) =>
    getRuntime(getVaultPath).service.setDefaults(defaults)
  );
  ipcMain.handle(IPC.aiConfig.testEmbedding, async (_event, providerId: string, text?: string) =>
    getRuntime(getVaultPath).service.testEmbedding(providerId, text)
  );
}

function getRuntime(getVaultPath: () => string | null) {
  const vaultPath = getVaultPath();
  if (!vaultPath) throw new Error('no vault open');
  return getAIConfigRuntime(vaultPath);
}
