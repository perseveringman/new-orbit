import type { ExternalGatewayInboundRequest } from '@shared/external-gateway-protocol';
import { textFromExternalContent } from '../intent-router';

export type MessageSubmitRequest = Extract<ExternalGatewayInboundRequest, { type: 'message.submit' }>;

export function stringParam(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function requestText(request: MessageSubmitRequest, params: Record<string, unknown>, key = 'text'): string {
  return stringParam(params, key) ?? textFromExternalContent(request).trim();
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('request_cancelled');
}

export function titleFromText(text: string, fallback: string): string {
  return text.split(/\r?\n/)[0]?.slice(0, 60).trim() || fallback;
}

