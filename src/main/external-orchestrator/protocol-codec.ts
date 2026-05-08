import {
  EXTERNAL_GATEWAY_PROTOCOL_VERSION,
  type ExternalGatewayInboundRequest,
  type ExternalGatewayOutboundEvent
} from '@shared/external-gateway-protocol';

export function encodeExternalGatewayEvent(event: ExternalGatewayOutboundEvent): string {
  return `${JSON.stringify({ version: EXTERNAL_GATEWAY_PROTOCOL_VERSION, ...event })}\n`;
}

export function decodeExternalGatewayLine(line: string): ExternalGatewayInboundRequest {
  const trimmed = line.trim();
  if (!trimmed) throw new Error('empty_frame');
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) throw new Error('invalid_frame');
  const value = parsed as Record<string, unknown>;
  const version = value['version'];
  if (version !== undefined && version !== EXTERNAL_GATEWAY_PROTOCOL_VERSION) {
    throw new Error(`unsupported_protocol_version:${String(version)}`);
  }
  switch (value['type']) {
    case 'message.submit':
      assertString(value, 'requestId');
      assertString(value, 'sessionId');
      if (!value['user'] || typeof value['user'] !== 'object') throw new Error('invalid_user');
      if (!value['content'] || typeof value['content'] !== 'object') throw new Error('invalid_content');
      return parsed as ExternalGatewayInboundRequest;
    case 'message.cancel':
      assertString(value, 'requestId');
      return parsed as ExternalGatewayInboundRequest;
    case 'session.close':
      assertString(value, 'sessionId');
      return parsed as ExternalGatewayInboundRequest;
    case 'ping':
      return parsed as ExternalGatewayInboundRequest;
    default:
      throw new Error(`unknown_frame_type:${String(value['type'])}`);
  }
}

export function splitExternalGatewayFrames(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split(/\n/);
  const rest = parts.pop() ?? '';
  return { lines: parts.filter((line) => line.trim().length > 0), rest };
}

function assertString(value: Record<string, unknown>, key: string): void {
  if (typeof value[key] !== 'string' || !String(value[key]).trim()) throw new Error(`invalid_${key}`);
}

