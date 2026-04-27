import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { ChannelConfig, ChannelInboundMessage, GatewayConfig, GatewayStatus } from '@shared/gateway';
import { createGatewayStore } from './store';
import { publishTraceableEvent } from '../events/bus';

export function registerGatewayIpc(getVaultPath: () => string | null): void {
  const vaultPath = (): string => {
    const value = getVaultPath();
    if (!value) throw new Error('no vault open');
    return value;
  };
  const store = () => createGatewayStore(vaultPath());

  ipcMain.handle(IPC.gateway.configGet, () => store().getConfig());
  ipcMain.handle(IPC.gateway.configUpdate, (_event, patch: Partial<GatewayConfig>) => store().updateConfig(patch));
  ipcMain.handle(IPC.gateway.status, () => store().status());
  ipcMain.handle(IPC.gateway.start, async () => {
    const status = await store().start();
    publishTraceableEvent({ source: 'activity', kind: 'channel.connected', payload: { channel: 'gateway' } });
    broadcast(status);
    return status;
  });
  ipcMain.handle(IPC.gateway.stop, async () => {
    const status = await store().stop();
    publishTraceableEvent({ source: 'activity', kind: 'channel.disconnected', payload: { channel: 'gateway' } });
    broadcast(status);
    return status;
  });
  ipcMain.handle(IPC.gateway.addChannel, (_event, channel: Omit<ChannelConfig, 'id'> & { id?: string }) =>
    store().addChannel(channel)
  );
  ipcMain.handle(IPC.gateway.updateChannel, (_event, channelId: string, patch: Partial<ChannelConfig>) =>
    store().updateChannel(channelId, patch)
  );
  ipcMain.handle(IPC.gateway.removeChannel, (_event, channelId: string) => store().removeChannel(channelId));
  ipcMain.handle(IPC.gateway.generateBindCode, (_event, orbitUserId?: string) => store().generateBindCode(orbitUserId));
  ipcMain.handle(IPC.gateway.routeInbound, async (_event, message: ChannelInboundMessage) => {
    const result = await store().routeInbound(message);
    publishTraceableEvent({
      source: 'conversation',
      kind: 'channel.inbound.message',
      summary: result.reason ?? 'Gateway inbound message',
      payload: {
        channel: message.channel_id,
        threadId: message.from.id,
        userId: message.from.id,
        text: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        raw: message.raw
      }
    });
    return result;
  });
}

export async function autoStartGatewayIfNeeded(vaultPath: string): Promise<void> {
  const store = createGatewayStore(vaultPath);
  const config = await store.getConfig();
  if (config.daemon.auto_start) await store.start();
}

function broadcast(status: GatewayStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.gateway.event, status);
  }
}

