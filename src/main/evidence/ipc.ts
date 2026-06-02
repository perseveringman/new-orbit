import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { EvidenceSelector, EvidenceSourceFilter } from '@shared/evidence';
import type { ExternalAISessionSettings } from '@shared/evidence';
import { readExternalAISessionSettings, updateExternalAISessionSettings } from './external-ai-session-settings';
import { openEvidenceNavigation, resolveEvidenceNavigation } from './navigation';
import { createEvidenceStore } from './store';
import { createOrbitEvidenceProvider, syncOrbitEvidenceSources } from './providers';
import { createEvidenceChunkIndexStore } from './chunk-index';
import { eventReplayBus } from '../events/bus';

let evidenceIndexerRegistered = false;
const pendingEvidenceSyncs = new Map<string, NodeJS.Timeout>();

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

  registerEvidenceIndexer(getVaultPath);

  ipcMain.handle(IPC.evidence.list, async (_event, filter: EvidenceSourceFilter = {}) =>
    runtime().store.list(filter)
  );

  ipcMain.handle(IPC.evidence.get, async (_event, sourceId: string) =>
    runtime().provider.get(sourceId)
  );

  ipcMain.handle(IPC.evidence.read, async (_event, selector: EvidenceSelector) =>
    runtime().provider.read(selector)
  );

  ipcMain.handle(IPC.evidence.resolveNavigation, async (_event, selector: EvidenceSelector) =>
    resolveEvidenceNavigation(runtime().vaultPath, selector)
  );

  ipcMain.handle(IPC.evidence.open, async (_event, selector: EvidenceSelector) =>
    openEvidenceNavigation(runtime().vaultPath, selector)
  );

  ipcMain.handle(
    IPC.evidence.sync,
    async (
      _event,
      options: { includeExternalAISessions?: boolean; externalAISessionLimit?: number } = {}
    ) => {
      const { vaultPath } = runtime();
      const syncOptions = {
        includeExternalAISessions: options.includeExternalAISessions ?? true,
        externalAISessionLimit: options.externalAISessionLimit ?? 300
      };
      const sources = await syncOrbitEvidenceSources(vaultPath, syncOptions);
      await createEvidenceChunkIndexStore(vaultPath).syncIncremental({
        ...syncOptions,
        includeActivities: false,
        prefetchedSources: sources
      });
      return sources;
    }
  );

  ipcMain.handle(IPC.evidence.externalSessionSettings, () =>
    readExternalAISessionSettings(runtime().vaultPath)
  );

  ipcMain.handle(IPC.evidence.updateExternalSessionSettings, (_event, patch: Partial<ExternalAISessionSettings>) =>
    updateExternalAISessionSettings(runtime().vaultPath, patch)
  );
}

function registerEvidenceIndexer(getVaultPath: () => string | null): void {
  if (evidenceIndexerRegistered) return;
  evidenceIndexerRegistered = true;
  eventReplayBus.on('event', (event) => {
    const vaultPath = getVaultPath();
    if (!vaultPath || !shouldIndexEvent(event.type)) return;
    scheduleEvidenceSync(vaultPath);
  });
}

function scheduleEvidenceSync(vaultPath: string): void {
  const existing = pendingEvidenceSyncs.get(vaultPath);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingEvidenceSyncs.delete(vaultPath);
    void createEvidenceChunkIndexStore(vaultPath)
      .syncIncremental({ includeActivities: false })
      .catch((error: unknown) => console.error('[evidence] background incremental sync failed', error));
  }, 1500);
  pendingEvidenceSyncs.set(vaultPath, timer);
}

function shouldIndexEvent(type: string): boolean {
  return [
    'note.',
    'library.',
    'resources.',
    'resource.',
    'project.',
    'area.',
    'conversation.',
    'synthesis.artifact.',
    'kb.',
    'connector.'
  ].some((prefix) => type.startsWith(prefix));
}
