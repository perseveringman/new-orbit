import type {
  ExternalGatewayArtifactKind,
  ExternalGatewayCapability,
  ExternalGatewayInboundRequest,
  ExternalGatewayOutboundEvent,
  ExternalGatewayTargetUser
} from './external-gateway-protocol';

export type {
  ExternalGatewayArtifactKind,
  ExternalGatewayCapability,
  ExternalGatewayInboundRequest,
  ExternalGatewayOutboundEvent
} from './external-gateway-protocol';

export interface ExternalGatewayAllowedUser {
  platform: string;
  userId: string;
  name?: string;
}

export interface ExternalGatewayConfig {
  version: 1;
  enabled: boolean;
  socket_path: string;
  require_allowed_user: boolean;
  allowed_users: ExternalGatewayAllowedUser[];
  capability_permissions: Record<ExternalGatewayCapability, boolean>;
  delegate: {
    enabled: boolean;
    target_agent: string;
  };
  rate_limit: {
    requests_per_minute: number;
  };
  request_log_retention_days: number;
}

export interface ExternalGatewaySessionMapping {
  sessionId: string;
  conversationId: string;
  platform: string;
  userId: string;
  userName?: string;
  createdAt: string;
  lastActivityAt: string;
  archived: boolean;
}

export type ExternalGatewayPushKind =
  | 'daily_summary'
  | 'weekly_review'
  | 'inbox_approval'
  | 'auto_runner_alert';

export interface ExternalGatewayPushSubscription {
  id: string;
  kind: ExternalGatewayPushKind;
  target: ExternalGatewayTargetUser;
  enabled: boolean;
  schedule?: string;
  createdAt: string;
}

export type ExternalGatewayRequestOutcome =
  | 'completed'
  | 'failed'
  | 'delegated'
  | 'cancelled'
  | 'rejected';

export interface ExternalGatewayRequestLogEntry {
  requestId: string;
  sessionId: string;
  platform: string;
  userId: string;
  receivedAt: string;
  routedTo: ExternalGatewayCapability;
  outcome: ExternalGatewayRequestOutcome;
  finishedAt: string;
  durationMs: number;
  artifactRefs: Array<{ kind: ExternalGatewayArtifactKind; ref: string }>;
  errorCode?: string;
}

export interface ExternalGatewayStatus {
  running: boolean;
  socket_path: string;
  started_at?: string;
  connected_clients: number;
  active_requests: number;
  active_sessions: number;
  messages_today: number;
  last_error?: string;
  capabilities: Array<{ capability: ExternalGatewayCapability; enabled: boolean }>;
}

export interface ExternalGatewaySnapshot {
  config: ExternalGatewayConfig;
  status: ExternalGatewayStatus;
  sessions: ExternalGatewaySessionMapping[];
  subscriptions: ExternalGatewayPushSubscription[];
  requestLog: ExternalGatewayRequestLogEntry[];
}

export interface ExternalGatewayRouteDecision {
  capability: ExternalGatewayCapability;
  params: Record<string, unknown>;
  confidence: number;
  reasoning: string;
}

export interface ExternalGatewayClientFrame {
  inbound?: ExternalGatewayInboundRequest;
  outbound?: ExternalGatewayOutboundEvent;
}

