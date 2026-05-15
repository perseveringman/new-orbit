import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { SearchQuery, SemanticIndexStatus } from '@shared/semantic';
import { eventReplayBus } from '../events/bus';
import { getSDKRuntime } from '../runtime/sdk/ipc';
import { createSemanticIndexStore, type SemanticIndexStore } from './index-store';
import { searchAndAnswer } from './search-answer';
import { searchWithContext } from './search-context';

let current: { vaultPath: string; store: SemanticIndexStore } | null = null;
let invalidatorRegistered = false;

export function getSemanticRuntime(vaultPath: string): { store: SemanticIndexStore } {
  if (current?.vaultPath === vaultPath) return current;
  current = { vaultPath, store: createSemanticIndexStore(vaultPath) };
  return current;
}

export function registerSemanticIpc(getVaultPath: () => string | null): void {
  const runtime = () => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('no vault open');
    return { vaultPath, ...getSemanticRuntime(vaultPath) };
  };

  registerSemanticInvalidator(getVaultPath);

  ipcMain.handle(IPC.semantic.search, async (_event, query: SearchQuery) => searchWithContext(runtime().vaultPath, query));
  ipcMain.handle(IPC.semantic.getDocument, async (_event, docId: string) => runtime().store.getDocument(docId));
  ipcMain.handle(IPC.semantic.indexStatus, async () => runtime().store.status());
  ipcMain.handle(IPC.semantic.rebuildIndex, async () => {
    const status = await runtime().store.rebuildIndex();
    broadcastSemantic({ type: 'semantic.index.rebuilt', status });
    return status;
  });
  ipcMain.handle(IPC.semantic.searchAndAnswer, async (_event, query: SearchQuery) => {
    const { vaultPath } = runtime();
    const sdk = getSDKRuntime(vaultPath);
    return searchAndAnswer(vaultPath, query, { router: sdk.router, maxBudgetUsd: 1 });
  });
}

function registerSemanticInvalidator(getVaultPath: () => string | null): void {
  if (invalidatorRegistered) return;
  invalidatorRegistered = true;
  eventReplayBus.on('event', (event) => {
    const vaultPath = getVaultPath();
    if (!vaultPath || !shouldInvalidate(event.type)) return;
    void getSemanticRuntime(vaultPath)
      .store.markAllStale(event.type)
      .then(() => getSemanticRuntime(vaultPath).store.status())
      .then((status) => broadcastSemantic({ type: 'semantic.index.stale', status }))
      .catch((error: unknown) => console.error('[semantic] failed to mark index stale', error));
  });
}

function shouldInvalidate(type: string): boolean {
  return [
    'note.',
    'library.',
    'resources.',
    'resource.',
    'project.',
    'area.',
    'conversation.',
    'synthesis.artifact.',
    'kb.'
  ].some((prefix) => type.startsWith(prefix));
}

function broadcastSemantic(event: { type: string; status?: SemanticIndexStatus }): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.semantic.event, event);
  }
}
