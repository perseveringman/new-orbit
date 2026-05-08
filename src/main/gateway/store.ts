import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  ChannelConfig,
  ChannelInboundMessage,
  ChannelOutboundMessage,
  GatewayConfig,
  GatewayMessage,
  GatewayRouteResult
} from '@shared/gateway';
import { createLibraryService } from '../capture/library/service';
import { createThoughtService } from '../capture/thoughts/service';
import { getAskAnywhereOrchestrator } from '../ask-anywhere/ipc';
import { createNoteStore } from '../note/store';
import { parseGatewayCommand, textFromMessage } from './router';
import { saveGatewayFile } from './vault-io';

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

  async listMessages(limit = 50): Promise<GatewayMessage[]> {
    try {
      return (await fs.readFile(this.messagesPath(), 'utf8'))
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as GatewayMessage)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }

  async sendOutbound(message: ChannelOutboundMessage): Promise<GatewayRouteResult> {
    const config = await this.getConfig();
    const channel = config.channels.find((item) => item.id === message.channel_id);
    if (!channel) return { accepted: false, reason: 'channel_not_found' };
    const saved: GatewayMessage = {
      id: `gateway-message-${randomUUID()}`,
      direction: 'outbound',
      channel_id: message.channel_id,
      to: message.to,
      at: new Date().toISOString(),
      kind: message.kind,
      content: message.content,
      accepted: true,
      reply: 'Outbound message queued.'
    };
    await this.appendMessage(saved);
    return { accepted: true, reply: 'Outbound message queued.' };
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
    if (!channel) return this.recordInbound(message, { accepted: false, reason: 'channel_not_found' });
    if (channel.require_bind !== false && !channel.allowed_user_ids?.includes(message.from.id)) {
      return this.recordInbound(message, { accepted: false, reason: 'sender_not_bound', reply: 'This Telegram user is not bound to Orbit yet.' });
    }
    if (channel.allowed_user_ids?.length && !channel.allowed_user_ids.includes(message.from.id)) {
      return this.recordInbound(message, { accepted: false, reason: 'sender_not_allowed', reply: 'This Telegram user is not allowed for this Orbit channel.' });
    }
    const command = parseGatewayCommand(message);
    if (command.kind === 'start') {
      return this.recordInbound(message, { accepted: true, reply: 'Telegram is connected. Use /capture, /ask, /summary, or forward a URL.' });
    }
    if (command.kind === 'capture') {
      if (channel.permissions?.capture === false) return this.recordInbound(message, { accepted: false, reason: 'permission_denied', reply: 'Capture is disabled for this channel.' });
      const note = await createNoteStore(this.vaultPath).create({
        type: 'capture',
        title: command.text.slice(0, 60),
        body: command.text,
        tags: ['gateway', channel.kind],
        source: { kind: 'manual', ref: `${channel.kind}:${message.from.id}` }
      });
      return this.recordInbound(message, { accepted: true, artifact: { kind: 'note', ref: note.frontmatter.id }, reply: 'Captured as a Note.' });
    }
    if (command.kind === 'ask') {
      if (channel.permissions?.ask === false) return this.recordInbound(message, { accepted: false, reason: 'permission_denied', reply: 'Ask is disabled for this channel.' });
      const result = await getAskAnywhereOrchestrator().ingestExternalMessage({
        source: channel.kind,
        threadId: channel.default_thread_id ?? message.from.id,
        text: command.question,
        title: `${channel.name} · ${message.from.name ?? message.from.id}`
      });
      return this.recordInbound(message, { accepted: true, conversationId: result.conversationId, reply: 'Routed to Ask-Anywhere.' });
    }
    if (command.kind === 'summary') {
      if (channel.permissions?.summary === false) return this.recordInbound(message, { accepted: false, reason: 'permission_denied', reply: 'Summary is disabled for this channel.' });
      const result = await getAskAnywhereOrchestrator().ingestExternalMessage({
        source: channel.kind,
        threadId: channel.default_thread_id ?? message.from.id,
        text: "Generate today's daily summary.",
        title: `${channel.name} · Daily summary`
      });
      return this.recordInbound(message, { accepted: true, conversationId: result.conversationId, reply: 'Daily summary requested.' });
    }
    if (command.kind === 'url') {
      if (channel.permissions?.save_url === false) return this.recordInbound(message, { accepted: false, reason: 'permission_denied', reply: 'URL saving is disabled for this channel.' });
      const item = await createLibraryService(this.vaultPath).saveArticle({
        url: command.url,
        source: 'share',
        actor: 'user'
      });
      return this.recordInbound(message, { accepted: true, artifact: { kind: 'library_item', ref: item.id }, reply: 'Saved to Library.' });
    }
    if (command.kind === 'file') {
      if (channel.permissions?.save_file === false) return this.recordInbound(message, { accepted: false, reason: 'permission_denied', reply: 'File saving is disabled for this channel.' });
      const relPath = await saveGatewayFile(this.vaultPath, command.name ?? 'telegram-file.txt', JSON.stringify(message.raw ?? message.content, null, 2));
      return this.recordInbound(message, { accepted: true, artifact: { kind: 'file', ref: relPath }, reply: 'Saved forwarded file to vault.' });
    }
    const text = textFromMessage(message);
    if (!text) return this.recordInbound(message, { accepted: false, reason: 'empty_message', reply: 'Orbit received an empty message.' });
    if (text.startsWith('#')) {
      const item = await createThoughtService(this.vaultPath).create({
        content: text.replace(/^#+\s*/, ''),
        tags: ['gateway', channel.kind],
        createdFrom: 'manual',
        actor: 'user'
      });
      return this.recordInbound(message, { accepted: true, artifact: { kind: 'thought', ref: item.id }, reply: 'Captured as a Thought.' });
    }
    const result = await getAskAnywhereOrchestrator().ingestExternalMessage({
      source: channel.kind,
      threadId: channel.default_thread_id ?? message.from.id,
      text,
      title: `${channel.name} · ${message.from.name ?? message.from.id}`
    });
    return this.recordInbound(message, { accepted: true, conversationId: result.conversationId, reply: 'Routed to Ask-Anywhere.' });
  }

  private configPath(): string {
    return path.join(this.vaultPath, '.orbit', 'gateway', 'config.json');
  }

  private messagesPath(): string {
    return path.join(this.vaultPath, '.orbit', 'gateway', 'messages.ndjson');
  }

  private async writeConfig(config: GatewayConfig): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath()), { recursive: true });
    await fs.writeFile(this.configPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }

  private async recordInbound(message: ChannelInboundMessage, result: GatewayRouteResult): Promise<GatewayRouteResult> {
    await this.appendMessage({
      id: `gateway-message-${randomUUID()}`,
      direction: 'inbound',
      channel_id: message.channel_id,
      at: message.timestamp,
      from: message.from,
      kind: message.kind,
      content: message.content,
      accepted: result.accepted,
      ...(result.reason ? { reason: result.reason } : {}),
      ...(result.reply ? { reply: result.reply } : {}),
      ...(result.artifact ? { artifact: result.artifact } : {}),
      ...(result.conversationId ? { conversationId: result.conversationId } : {})
    });
    return result;
  }

  private async appendMessage(message: GatewayMessage): Promise<void> {
    await fs.mkdir(path.dirname(this.messagesPath()), { recursive: true });
    await fs.appendFile(this.messagesPath(), `${JSON.stringify(message)}\n`, 'utf8');
  }
}

export function createGatewayStore(vaultPath: string): GatewayStore {
  return new GatewayStore(vaultPath);
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
    permissions: channel.permissions ?? { capture: true, ask: true, save_url: true, save_file: true, summary: true },
    allowed_user_ids: channel.allowed_user_ids ?? [],
    status: channel.status ?? 'disconnected'
  };
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
