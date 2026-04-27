import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { ChannelConfig, ChannelInboundMessage, GatewayConfig, GatewayStatus } from '@shared/gateway';
import { createGatewayStore } from './store';
import { getGatewayRuntime } from './runtime';
import { publishTraceableEvent } from '../events/bus';

export function registerGatewayIpc(getVaultPath: () => string | null): void {
  const vaultPath = (): string => {
    const value = getVaultPath();
    if (!value) throw new Error('no vault open');
    return value;
  };
  const store = () => createGatewayStore(vaultPath());
  const runtime = () => {
    const path = vaultPath();
    ensureRuntimeBroadcast(path);
    return getGatewayRuntime(path);
  };

  ipcMain.handle(IPC.gateway.configGet, () => store().getConfig());
  ipcMain.handle(IPC.gateway.configUpdate, async (_event, patch: Partial<GatewayConfig>) => {
    const config = await store().updateConfig(patch);
    await runtime().reloadConfig();
    return config;
  });
  ipcMain.handle(IPC.gateway.status, () => runtime().status());
  ipcMain.handle(IPC.gateway.start, async () => {
    const status = await runtime().start();
    publishTraceableEvent({ source: 'activity', kind: 'channel.connected', payload: { channel: 'gateway' } });
    broadcast(status);
    return status;
  });
  ipcMain.handle(IPC.gateway.stop, async () => {
    const status = await runtime().stop();
    publishTraceableEvent({ source: 'activity', kind: 'channel.disconnected', payload: { channel: 'gateway' } });
    broadcast(status);
    return status;
  });
  ipcMain.handle(IPC.gateway.addChannel, async (_event, channel: Omit<ChannelConfig, 'id'> & { id?: string }) => {
    const config = await store().addChannel(channel);
    await runtime().reloadConfig();
    return config;
  });
  ipcMain.handle(IPC.gateway.updateChannel, async (_event, channelId: string, patch: Partial<ChannelConfig>) => {
    const config = await store().updateChannel(channelId, patch);
    await runtime().reloadConfig();
    return config;
  });
  ipcMain.handle(IPC.gateway.removeChannel, async (_event, channelId: string) => {
    const config = await store().removeChannel(channelId);
    await runtime().reloadConfig();
    return config;
  });
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
  ensureRuntimeBroadcast(vaultPath);
  if (config.daemon.auto_start) await getGatewayRuntime(vaultPath).start();
}

const broadcastListeners = new Set<string>();

function ensureRuntimeBroadcast(vaultPath: string): void {
  if (broadcastListeners.has(vaultPath)) return;
  broadcastListeners.add(vaultPath);
  getGatewayRuntime(vaultPath).onStatus((status) => broadcast(status));
}

function broadcast(status: GatewayStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.gateway.event, status);
  }
}
