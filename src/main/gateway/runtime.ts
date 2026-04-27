import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { ChannelConfig, ChannelStatus, GatewayChannelStatus, GatewayLogEntry, GatewayLogLevel, GatewayStatus } from '@shared/gateway';
import { createGatewayStore, GatewayStore } from './store';
import { runTelegramLongPolling, type TelegramRuntimeDeps } from './telegram';

interface ChannelHandle {
  controller: AbortController;
  task: Promise<void>;
}

interface RuntimeChannelState {
  status: ChannelStatus;
  started_at?: string;
  last_error?: string;
  last_seen_at?: string;
  bot_username?: string;
}

export class GatewayRuntime {
  private running = false;
  private startedAt: string | undefined;
  private readonly emitter = new EventEmitter();
  private readonly handles = new Map<string, ChannelHandle>();
  private readonly states = new Map<string, RuntimeChannelState>();
  private readonly logs: GatewayLogEntry[] = [];
  private readonly store: GatewayStore;

  constructor(private readonly vaultPath: string, private readonly deps: TelegramRuntimeDeps = {}) {
    this.store = createGatewayStore(vaultPath);
  }

  onStatus(listener: (status: GatewayStatus) => void): () => void {
    this.emitter.on('status', listener);
    return () => this.emitter.off('status', listener);
  }

  async status(): Promise<GatewayStatus> {
    const config = await this.store.getConfig();
    return {
      running: this.running,
      ...(this.startedAt ? { started_at: this.startedAt } : {}),
      channels: config.channels.map((channel) => this.statusFor(channel)),
      logs: this.logs.slice(-100).reverse()
    };
  }

  async start(): Promise<GatewayStatus> {
    if (!this.running) {
      this.running = true;
      this.startedAt = new Date().toISOString();
      this.log('info', 'Gateway started');
    }
    const config = await this.store.getConfig();
    for (const channel of config.channels) {
      if (channel.enabled) this.startChannel(channel);
      else this.setChannelState(channel.id, { status: 'disconnected' });
    }
    await this.emitStatus();
    return this.status();
  }

  async stop(): Promise<GatewayStatus> {
    this.running = false;
    this.startedAt = undefined;
    for (const [channelId, handle] of this.handles) {
      handle.controller.abort();
      this.setChannelState(channelId, { status: 'disconnected' });
    }
    const tasks = [...this.handles.values()].map((handle) => handle.task.catch(() => undefined));
    this.handles.clear();
    await Promise.all(tasks);
    this.log('info', 'Gateway stopped');
    await this.emitStatus();
    return this.status();
  }

  async reloadConfig(): Promise<GatewayStatus> {
    if (!this.running) return this.status();
    const config = await this.store.getConfig();
    const enabled = new Set(config.channels.filter((channel) => channel.enabled).map((channel) => channel.id));
    for (const channelId of [...this.handles.keys()]) {
      if (!enabled.has(channelId)) this.stopChannel(channelId);
    }
    for (const channel of config.channels) {
      if (!channel.enabled) {
        this.setChannelState(channel.id, { status: 'disconnected' });
        continue;
      }
      if (!this.handles.has(channel.id)) this.startChannel(channel);
    }
    await this.emitStatus();
    return this.status();
  }

  private startChannel(channel: ChannelConfig): void {
    if (this.handles.has(channel.id)) return;
    const controller = new AbortController();
    this.setChannelState(channel.id, {
      status: 'connecting',
      started_at: new Date().toISOString(),
      last_error: undefined
    });
    const task = this.runChannel(channel, controller.signal)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        this.setChannelState(channel.id, { status: 'error', last_error: message });
        this.log('error', message, channel.id);
      })
      .finally(() => {
        this.handles.delete(channel.id);
        if (!controller.signal.aborted && this.running && channel.enabled) {
          this.log('warn', 'Channel task exited; restart it from the Gateway page to reconnect.', channel.id);
        }
        void this.emitStatus();
      });
    this.handles.set(channel.id, { controller, task });
  }

  private stopChannel(channelId: string): void {
    const handle = this.handles.get(channelId);
    if (!handle) return;
    handle.controller.abort();
    this.handles.delete(channelId);
    this.setChannelState(channelId, { status: 'disconnected' });
  }

  private async runChannel(channel: ChannelConfig, signal: AbortSignal): Promise<void> {
    if (channel.kind !== 'telegram') {
      this.setChannelState(channel.id, {
        status: 'error',
        last_error: `${channel.kind} runtime is not implemented yet`
      });
      return;
    }
    await runTelegramLongPolling(
      channel,
      signal,
      {
        onStatus: (status, patch = {}) => {
          this.setChannelState(channel.id, {
            status,
            ...(patch.bot_username ? { bot_username: patch.bot_username } : {}),
            ...(patch.last_error !== undefined ? { last_error: patch.last_error } : {}),
            last_seen_at: new Date().toISOString()
          });
        },
        onLog: (level, message) => this.log(level, message, channel.id),
        onBind: (code, user) => this.store.bindTelegramUser(channel.id, code, user),
        onInbound: async (message) => {
          const result = await this.store.routeInbound(message);
          this.setChannelState(channel.id, { status: 'connected', last_seen_at: new Date().toISOString() });
          return result;
        }
      },
      this.deps
    );
  }

  private statusFor(channel: ChannelConfig): GatewayChannelStatus {
    const runtime = this.states.get(channel.id);
    return {
      ...channel,
      status: runtime?.status ?? (this.running && channel.enabled ? 'connecting' : 'disconnected'),
      ...(runtime?.started_at ? { started_at: runtime.started_at } : {}),
      ...(runtime?.last_error ? { last_error: runtime.last_error } : channel.last_error ? { last_error: channel.last_error } : {}),
      ...(runtime?.last_seen_at ? { last_seen_at: runtime.last_seen_at } : channel.last_seen_at ? { last_seen_at: channel.last_seen_at } : {}),
      ...(runtime?.bot_username ? { bot_username: runtime.bot_username } : channel.bot_username ? { bot_username: channel.bot_username } : {})
    };
  }

  private setChannelState(channelId: string, patch: RuntimeChannelState): void {
    const current = this.states.get(channelId) ?? { status: 'disconnected' as ChannelStatus };
    this.states.set(channelId, { ...current, ...patch });
    void this.emitStatus();
  }

  private log(level: GatewayLogLevel, message: string, channelId?: string): void {
    this.logs.push({
      id: `gateway-log-${randomUUID()}`,
      at: new Date().toISOString(),
      level,
      ...(channelId ? { channel_id: channelId } : {}),
      message
    });
    if (this.logs.length > 200) this.logs.splice(0, this.logs.length - 200);
  }

  private async emitStatus(): Promise<void> {
    this.emitter.emit('status', await this.status());
  }
}

const runtimes = new Map<string, GatewayRuntime>();

export function getGatewayRuntime(vaultPath: string, deps?: TelegramRuntimeDeps): GatewayRuntime {
  const existing = runtimes.get(vaultPath);
  if (existing) return existing;
  const runtime = new GatewayRuntime(vaultPath, deps);
  runtimes.set(vaultPath, runtime);
  return runtime;
}

export async function stopGatewayRuntime(vaultPath: string): Promise<void> {
  const runtime = runtimes.get(vaultPath);
  if (!runtime) return;
  await runtime.stop();
  runtimes.delete(vaultPath);
}
