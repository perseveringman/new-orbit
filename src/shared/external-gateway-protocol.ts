export const EXTERNAL_GATEWAY_PROTOCOL_VERSION = 1 as const;

export const EXTERNAL_GATEWAY_CAPABILITIES = [
  'ask_anywhere',
  'capture.thought',
  'capture.note',
  'library.save',
  'task.query',
  'inbox.review',
  'synthesis.run',
  'memory.recall',
  'delegate.coding_agent'
] as const;

export type ExternalGatewayCapability = (typeof EXTERNAL_GATEWAY_CAPABILITIES)[number];

export const EXTERNAL_GATEWAY_ARTIFACT_KINDS = [
  'note',
  'library_item',
  'task',
  'thought',
  'approval',
  'synthesis_artifact',
  'memory',
  'conversation',
  'file'
] as const;

export type ExternalGatewayArtifactKind = (typeof EXTERNAL_GATEWAY_ARTIFACT_KINDS)[number];

export interface ExternalGatewayUser {
  platform: string;
  id: string;
  name?: string;
}

export type ExternalGatewayMessageContent =
  | { kind: 'text'; text: string }
  | { kind: 'image'; path: string; caption?: string }
  | { kind: 'file'; path: string; name: string; mime: string }
  | { kind: 'url'; url: string };

export type ExternalGatewayInboundRequest =
  | {
      version?: typeof EXTERNAL_GATEWAY_PROTOCOL_VERSION;
      type: 'message.submit';
      requestId: string;
      sessionId: string;
      user: ExternalGatewayUser;
      content: ExternalGatewayMessageContent;
      context?: { replyTo?: string };
    }
  | {
      version?: typeof EXTERNAL_GATEWAY_PROTOCOL_VERSION;
      type: 'message.cancel';
      requestId: string;
    }
  | {
      version?: typeof EXTERNAL_GATEWAY_PROTOCOL_VERSION;
      type: 'session.close';
      sessionId: string;
    }
  | {
      version?: typeof EXTERNAL_GATEWAY_PROTOCOL_VERSION;
      type: 'ping';
    };

export interface ExternalGatewayCardDefinition {
  title: string;
  body?: string;
  url?: string;
  actions?: Array<{ id: string; label: string; style?: 'default' | 'primary' | 'danger' }>;
}

export interface ExternalGatewayHumanOption {
  id: string;
  label: string;
  style?: 'default' | 'primary' | 'danger';
}

export interface ExternalGatewayTargetUser {
  platform: string;
  userId: string;
}

export type ExternalGatewayNotificationContent =
  | { kind: 'text'; text: string }
  | { kind: 'markdown'; text: string };

export type ExternalGatewayOutboundEvent =
  | {
      version?: typeof EXTERNAL_GATEWAY_PROTOCOL_VERSION;
      type: 'request.accepted';
      requestId: string;
      routedTo: ExternalGatewayCapability;
    }
  | {
      version?: typeof EXTERNAL_GATEWAY_PROTOCOL_VERSION;
      type: 'request.rejected';
      requestId: string;
      reason: string;
    }
  | {
      version?: typeof EXTERNAL_GATEWAY_PROTOCOL_VERSION;
      type: 'progress';
      requestId: string;
      stage: string;
      detail?: string;
    }
  | {
      version?: typeof EXTERNAL_GATEWAY_PROTOCOL_VERSION;
      type: 'text.delta';
      requestId: string;
      text: string;
    }
  | {
      version?: typeof EXTERNAL_GATEWAY_PROTOCOL_VERSION;
      type: 'artifact';
      requestId: string;
      kind: ExternalGatewayArtifactKind;
      ref: string;
      preview: unknown;
    }
  | {
      version?: typeof EXTERNAL_GATEWAY_PROTOCOL_VERSION;
      type: 'card';
      requestId: string;
      card: ExternalGatewayCardDefinition;
    }
  | {
      version?: typeof EXTERNAL_GATEWAY_PROTOCOL_VERSION;
      type: 'file';
      requestId: string;
      path: string;
      mime: string;
    }
  | {
      version?: typeof EXTERNAL_GATEWAY_PROTOCOL_VERSION;
      type: 'human_input.required';
      requestId: string;
      prompt: string;
      options: ExternalGatewayHumanOption[];
    }
  | {
      version?: typeof EXTERNAL_GATEWAY_PROTOCOL_VERSION;
      type: 'request.completed';
      requestId: string;
      summary?: string;
    }
  | {
      version?: typeof EXTERNAL_GATEWAY_PROTOCOL_VERSION;
      type: 'request.failed';
      requestId: string;
      error: { code: string; message: string };
    }
  | {
      version?: typeof EXTERNAL_GATEWAY_PROTOCOL_VERSION;
      type: 'delegate';
      requestId: string;
      targetAgent: string;
      enrichedPrompt: string;
      workingDirectory?: string;
    }
  | {
      version?: typeof EXTERNAL_GATEWAY_PROTOCOL_VERSION;
      type: 'notification';
      target: ExternalGatewayTargetUser;
      content: ExternalGatewayNotificationContent;
    }
  | {
      version?: typeof EXTERNAL_GATEWAY_PROTOCOL_VERSION;
      type: 'pong';
    };

export type ExternalGatewayTerminalEvent =
  | Extract<ExternalGatewayOutboundEvent, { type: 'request.completed' | 'request.failed' | 'delegate' }>
  | Extract<ExternalGatewayOutboundEvent, { type: 'request.rejected' }>;

export function isExternalGatewayCapability(value: string): value is ExternalGatewayCapability {
  return (EXTERNAL_GATEWAY_CAPABILITIES as readonly string[]).includes(value);
}

export function isExternalGatewayTerminalEvent(event: ExternalGatewayOutboundEvent): event is ExternalGatewayTerminalEvent {
  return event.type === 'request.completed' || event.type === 'request.failed' || event.type === 'delegate' || event.type === 'request.rejected';
}

