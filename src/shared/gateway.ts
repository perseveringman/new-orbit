export type ChannelKind = 'telegram' | 'whatsapp' | 'email' | 'sms' | 'webhook' | 'wechat';
export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type GatewayLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ChannelConfig {
  id: string;
  kind: ChannelKind;
  name: string;
  enabled: boolean;
  status?: ChannelStatus;
  bot_token?: string;
  allowed_user_ids?: string[];
  default_thread_id?: string;
  require_bind?: boolean;
  drop_pending_updates_on_start?: boolean;
  poll_timeout_seconds?: number;
  bot_username?: string;
  last_error?: string;
  last_seen_at?: string;
}

export interface GatewayConfig {
  version: 1;
  daemon: {
    auto_start: boolean;
    keep_running_after_app_close: boolean;
    log_level: GatewayLogLevel;
  };
  channels: ChannelConfig[];
  orbit: {
    app_ipc_socket: string;
    vault_path: string;
  };
  pending_binds: Array<{
    code: string;
    orbit_user_id: string;
    expires_at: string;
  }>;
}

export interface GatewayStatus {
  running: boolean;
  started_at?: string;
  channels: GatewayChannelStatus[];
  logs?: GatewayLogEntry[];
}

export interface GatewayChannelStatus extends ChannelConfig {
  status: ChannelStatus;
  started_at?: string;
  last_error?: string;
  last_seen_at?: string;
}

export interface GatewayLogEntry {
  id: string;
  at: string;
  level: GatewayLogLevel;
  channel_id?: string;
  message: string;
}

export interface ChannelInboundMessage {
  channel_id: string;
  from: {
    id: string;
    name?: string;
    identity_verified?: boolean;
  };
  kind: 'text' | 'image' | 'audio' | 'file' | 'url' | 'forward';
  content: unknown;
  timestamp: string;
  raw?: unknown;
}

export interface ChannelOutboundMessage {
  channel_id: string;
  to: string;
  kind: 'text' | 'image' | 'file' | 'link_card';
  content: unknown;
}

export interface GatewayRouteResult {
  accepted: boolean;
  reason?: string;
  conversationId?: string;
  artifact?: { kind: string; ref: string };
  reply?: string;
}
