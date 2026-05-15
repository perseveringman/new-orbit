import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { EvidenceSelector, EvidenceSourceFilter } from '@shared/evidence';
import { createEvidenceStore } from './store';
import { createOrbitEvidenceProvider, syncOrbitEvidenceSources } from './providers';

export function registerEvidenceIpc(getVaultPath: () => string | null): void {
  const runtime = () => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('no vault open');
    return {
      vaultPath,
      store: createEvidenceStore(vaultPath),
      provider: createOrbitEvidenceProvider(vaultPath)
    };
  };

  ipcMain.handle(IPC.evidence.list, async (_event, filter: EvidenceSourceFilter = {}) =>
    runtime().store.list(filter)
  );

  ipcMain.handle(IPC.evidence.get, async (_event, sourceId: string) =>
    runtime().provider.get(sourceId)
  );

  ipcMain.handle(IPC.evidence.read, async (_event, selector: EvidenceSelector) =>
    runtime().provider.read(selector)
  );

  ipcMain.handle(
    IPC.evidence.sync,
    async (
      _event,
      options: { includeExternalAISessions?: boolean; externalAISessionLimit?: number } = {}
    ) =>
      syncOrbitEvidenceSources(runtime().vaultPath, {
        includeExternalAISessions: options.includeExternalAISessions ?? true,
        externalAISessionLimit: options.externalAISessionLimit ?? 300
      })
  );
}
