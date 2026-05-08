import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { ExternalGatewayConfig, ExternalGatewayPushSubscription, ExternalGatewayStatus } from '@shared/external-gateway';
import { createExternalGatewayStore } from './store';
import { getExternalGatewayRuntime } from './runtime';
import { publishTraceableEvent } from '../events/bus';

export function registerExternalGatewayIpc(getVaultPath: () => string | null): void {
  const vaultPath = (): string => {
    const value = getVaultPath();
    if (!value) throw new Error('no vault open');
    return value;
  };
  const store = () => createExternalGatewayStore(vaultPath());
  const runtime = () => getExternalGatewayRuntime(vaultPath());

  ipcMain.handle(IPC.externalGateway.configGet, () => store().getConfig());
  ipcMain.handle(IPC.externalGateway.configUpdate, async (_event, patch: Partial<ExternalGatewayConfig>) => {
    const next = await store().updateConfig(patch);
    const status = await runtime().reloadConfig();
    broadcast(status);
    return next;
  });
  ipcMain.handle(IPC.externalGateway.status, () => runtime().status());
  ipcMain.handle(IPC.externalGateway.start, async () => {
    const status = await runtime().start();
    await store().updateConfig({ enabled: true });
    publishTraceableEvent({ source: 'activity', kind: 'external.gateway.connected', payload: { channel: 'external-gateway' } });
    broadcast(status);
    return status;
  });
  ipcMain.handle(IPC.externalGateway.stop, async () => {
    const status = await runtime().stop();
    await store().updateConfig({ enabled: false });
    publishTraceableEvent({ source: 'activity', kind: 'external.gateway.disconnected', payload: { channel: 'external-gateway' } });
    broadcast(status);
    return status;
  });
  ipcMain.handle(IPC.externalGateway.sessions, () => store().listSessions());
  ipcMain.handle(IPC.externalGateway.requestLog, (_event, limit?: number) => store().listRequestLog(limit));
  ipcMain.handle(IPC.externalGateway.subscriptions, () => store().listSubscriptions());
  ipcMain.handle(
    IPC.externalGateway.upsertSubscription,
    (_event, input: Omit<ExternalGatewayPushSubscription, 'id' | 'createdAt'> & Partial<Pick<ExternalGatewayPushSubscription, 'id' | 'createdAt'>>) =>
      store().upsertSubscription(input)
  );
}

export async function autoStartExternalGatewayIfNeeded(vaultPath: string): Promise<void> {
  await getExternalGatewayRuntime(vaultPath).autoStartIfEnabled();
}

function broadcast(status: ExternalGatewayStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.externalGateway.event, status);
  }
}

