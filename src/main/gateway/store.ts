import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  ChannelConfig,
  ChannelInboundMessage,
  GatewayConfig,
  GatewayRouteResult
} from '@shared/gateway';
import { createLibraryService } from '../capture/library/service';
import { createThoughtService } from '../capture/thoughts/service';
import { getAskAnywhereOrchestrator } from '../ask-anywhere/ipc';

export class GatewayStore {
  constructor(private readonly vaultPath: string) {}

  async getConfig(): Promise<GatewayConfig> {
    try {
      return normalizeConfig(JSON.parse(await fs.readFile(this.configPath(), 'utf8')) as Partial<GatewayConfig>, this.vaultPath);
    } catch (error) {
      if (!isNotFound(error)) throw error;
      return {
        version: 1,
        daemon: { auto_start: false, keep_running_after_app_close: false, log_level: 'info' },
        channels: [],
        orbit: { app_ipc_socket: path.join(this.vaultPath, '.orbit', 'gateway.sock'), vault_path: this.vaultPath },
        pending_binds: []
      };
    }
  }

  async updateConfig(patch: Partial<GatewayConfig>): Promise<GatewayConfig> {
    const current = await this.getConfig();
    const next: GatewayConfig = {
      ...current,
      ...patch,
      daemon: { ...current.daemon, ...(patch.daemon ?? {}) },
      orbit: { ...current.orbit, ...(patch.orbit ?? {}) },
      channels: patch.channels ?? current.channels,
      pending_binds: patch.pending_binds ?? current.pending_binds
    };
    await this.writeConfig(next);
    return next;
  }

  async addChannel(channel: Omit<ChannelConfig, 'id'> & { id?: string }): Promise<GatewayConfig> {
    const config = await this.getConfig();
    const next = normalizeChannel({
      ...channel,
      id: channel.id ?? `channel-${randomUUID()}`,
      status: 'disconnected'
    });
    config.channels.push(next);
    await this.writeConfig(config);
    return config;
  }

  async updateChannel(channelId: string, patch: Partial<ChannelConfig>): Promise<GatewayConfig> {
    const config = await this.getConfig();
    config.channels = config.channels.map((channel) =>
      channel.id === channelId ? normalizeChannel({ ...channel, ...patch, id: channel.id }) : channel
    );
    await this.writeConfig(config);
    return config;
  }

  async bindTelegramUser(
    channelId: string,
    code: string,
    user: { id: string; name?: string }
  ): Promise<{ accepted: boolean; reason?: string; config?: GatewayConfig }> {
    const normalizedCode = code.trim().toUpperCase();
    const config = await this.getConfig();
    const now = Date.now();
    const bind = config.pending_binds.find(
      (item) => item.code.toUpperCase() === normalizedCode && Date.parse(item.expires_at) > now
    );
    if (!bind) {
      config.pending_binds = config.pending_binds.filter((item) => Date.parse(item.expires_at) > now);
      await this.writeConfig(config);
      return { accepted: false, reason: 'bind_code_invalid_or_expired' };
    }
    const channel = config.channels.find((item) => item.id === channelId);
    if (!channel) return { accepted: false, reason: 'channel_not_found' };
    if (channel.kind !== 'telegram') return { accepted: false, reason: 'channel_not_telegram' };

    const allowed = new Set(channel.allowed_user_ids ?? []);
    allowed.add(user.id);
    channel.allowed_user_ids = [...allowed];
    channel.default_thread_id = channel.default_thread_id ?? user.id;
    channel.require_bind = true;
    channel.last_seen_at = new Date().toISOString();
    config.pending_binds = config.pending_binds.filter((item) => item.code !== bind.code);
    await this.writeConfig(config);
    return { accepted: true, config };
  }

  async removeChannel(channelId: string): Promise<GatewayConfig> {
    const config = await this.getConfig();
    config.channels = config.channels.filter((channel) => channel.id !== channelId);
    await this.writeConfig(config);
    return config;
  }

  async generateBindCode(orbitUserId = 'local-user'): Promise<{ code: string; expires_at: string }> {
    const config = await this.getConfig();
    const code = randomUUID().slice(0, 6).toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    config.pending_binds.push({ code, orbit_user_id: orbitUserId, expires_at: expiresAt });
    await this.writeConfig(config);
    return { code, expires_at: expiresAt };
  }

  async routeInbound(message: ChannelInboundMessage): Promise<GatewayRouteResult> {
    const config = await this.getConfig();
    const channel = config.channels.find((item) => item.id === message.channel_id);
    if (!channel) return { accepted: false, reason: 'channel_not_found' };
    if (channel.require_bind !== false && !channel.allowed_user_ids?.includes(message.from.id)) {
      return { accepted: false, reason: 'sender_not_bound', reply: 'This Telegram user is not bound to Orbit yet.' };
    }
    if (channel.allowed_user_ids?.length && !channel.allowed_user_ids.includes(message.from.id)) {
      return { accepted: false, reason: 'sender_not_allowed', reply: 'This Telegram user is not allowed for this Orbit channel.' };
    }
    const text = textFromMessage(message);
    if (!text) return { accepted: false, reason: 'empty_message', reply: 'Orbit received an empty message.' };
    if (message.kind === 'url' || /^https?:\/\//i.test(text)) {
      const item = await createLibraryService(this.vaultPath).saveArticle({
        url: text,
        source: 'share',
        actor: 'user'
      });
      return { accepted: true, artifact: { kind: 'library_item', ref: item.id }, reply: 'Saved to Library.' };
    }
    if (text.startsWith('#')) {
      const item = await createThoughtService(this.vaultPath).create({
        content: text.replace(/^#+\s*/, ''),
        tags: ['gateway', channel.kind],
        createdFrom: 'manual',
        actor: 'user'
      });
      return { accepted: true, artifact: { kind: 'thought', ref: item.id }, reply: 'Captured as a Thought.' };
    }
    const result = await getAskAnywhereOrchestrator().ingestExternalMessage({
      source: channel.kind,
      threadId: channel.default_thread_id ?? message.from.id,
      text,
      title: `${channel.name} · ${message.from.name ?? message.from.id}`
    });
    return { accepted: true, conversationId: result.conversationId, reply: 'Routed to Ask-Anywhere.' };
  }

  private configPath(): string {
    return path.join(this.vaultPath, '.orbit', 'gateway', 'config.json');
  }

  private async writeConfig(config: GatewayConfig): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath()), { recursive: true });
    await fs.writeFile(this.configPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }
}

export function createGatewayStore(vaultPath: string): GatewayStore {
  return new GatewayStore(vaultPath);
}

function textFromMessage(message: ChannelInboundMessage): string {
  if (typeof message.content === 'string') return message.content.trim();
  if (typeof message.content === 'object' && message.content && 'text' in message.content) {
    return String((message.content as { text?: unknown }).text ?? '').trim();
  }
  if (typeof message.content === 'object' && message.content && 'url' in message.content) {
    return String((message.content as { url?: unknown }).url ?? '').trim();
  }
  return '';
}

function normalizeConfig(config: Partial<GatewayConfig>, vaultPath: string): GatewayConfig {
  return {
    version: 1,
    daemon: {
      auto_start: Boolean(config.daemon?.auto_start),
      keep_running_after_app_close: Boolean(config.daemon?.keep_running_after_app_close),
      log_level: config.daemon?.log_level ?? 'info'
    },
    channels: (config.channels ?? []).map(normalizeChannel),
    orbit: {
      app_ipc_socket: config.orbit?.app_ipc_socket ?? path.join(vaultPath, '.orbit', 'gateway.sock'),
      vault_path: config.orbit?.vault_path ?? vaultPath
    },
    pending_binds: (config.pending_binds ?? []).filter((item) => Date.parse(item.expires_at) > Date.now())
  };
}

function normalizeChannel(channel: ChannelConfig): ChannelConfig {
  return {
    ...channel,
    require_bind: channel.require_bind ?? channel.kind === 'telegram',
    drop_pending_updates_on_start: channel.drop_pending_updates_on_start ?? channel.kind === 'telegram',
    poll_timeout_seconds: channel.poll_timeout_seconds ?? (channel.kind === 'telegram' ? 25 : undefined),
    allowed_user_ids: channel.allowed_user_ids ?? [],
    status: channel.status ?? 'disconnected'
  };
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
