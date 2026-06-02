import { BrowserWindow, dialog, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { ConnectConnectorInput, ConnectorChangeEvent, ConnectorReadInput, UpdateConnectorInput } from '@shared/connectors';
import { syncRagDataPlane } from '../rag-data-plane';
import { createConnectorStore } from './store';

export function registerConnectorsIpc(getVaultPath: () => string | null): void {
  const runtime = () => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('no vault open');
    return { vaultPath, store: createConnectorStore(vaultPath) };
  };

  ipcMain.handle(IPC.connectors.definitions, () => runtime().store.definitions());
  ipcMain.handle(IPC.connectors.list, () => runtime().store.list());

  ipcMain.handle(IPC.connectors.connect, async (_event, input: ConnectConnectorInput) => {
    const { vaultPath, store } = runtime();
    const connection = await store.connect(input);
    await refreshConnectorIndexes(vaultPath, 'connector.connected');
    broadcastConnectorEvent({ type: 'connector.connected', connection });
    return connection;
  });

  ipcMain.handle(IPC.connectors.update, async (_event, connectionId: string, patch: UpdateConnectorInput) => {
    const { vaultPath, store } = runtime();
    const connection = await store.update(connectionId, patch);
    await refreshConnectorIndexes(vaultPath, 'connector.updated');
    broadcastConnectorEvent({ type: 'connector.updated', connection });
    return connection;
  });

  ipcMain.handle(IPC.connectors.remove, async (_event, connectionId: string) => {
    const { vaultPath, store } = runtime();
    const removed = await store.remove(connectionId);
    await refreshConnectorIndexes(vaultPath, 'connector.removed');
    broadcastConnectorEvent({ type: 'connector.removed', connection: removed ?? undefined, connection_id: connectionId });
    return removed;
  });

  ipcMain.handle(IPC.connectors.scan, async (_event, connectionId: string) => {
    const { vaultPath, store } = runtime();
    const result = await store.scan(connectionId);
    await refreshConnectorIndexes(vaultPath, 'connector.scanned');
    broadcastConnectorEvent({ type: 'connector.scanned', connection: result.connection });
    return result;
  });

  ipcMain.handle(IPC.connectors.search, (_event, query: string, limit?: number) =>
    runtime().store.search(query, limit)
  );

  ipcMain.handle(IPC.connectors.read, (_event, input: ConnectorReadInput) =>
    runtime().store.read(input)
  );

  ipcMain.handle(IPC.connectors.open, (_event, connectionId: string, docRef: string) =>
    runtime().store.open(connectionId, docRef)
  );

  ipcMain.handle(IPC.connectors.chooseDirectory, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return {
      canceled: result.canceled,
      ...(result.filePaths[0] ? { path: result.filePaths[0] } : {})
    };
  });
}

async function refreshConnectorIndexes(vaultPath: string, reason: string): Promise<void> {
  await syncRagDataPlane(vaultPath, {
    reason,
    includeActivities: false,
    includeExternalAISessions: false,
    rebuildSemantic: true,
    syncMemory: true,
    memorySourceKinds: ['external_file', 'external_ai_session'],
    archiveMissingMemorySources: reason === 'connector.removed'
  }).catch((error) => {
    console.warn('[connectors] data plane sync failed', error);
  });
}

function broadcastConnectorEvent(event: ConnectorChangeEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.connectors.event, event);
  }
}
