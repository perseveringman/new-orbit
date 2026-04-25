import type { CliErrorPayload } from '@shared/cli_protocol';

export interface JsonSuccessEnvelope {
  ok: true;
  data: unknown;
}

export interface JsonErrorEnvelope {
  ok: false;
  error: CliErrorPayload;
}

export type JsonEnvelope = JsonSuccessEnvelope | JsonErrorEnvelope;

export function formatJsonSuccess(data: unknown): string {
  return `${JSON.stringify({ ok: true, data } satisfies JsonSuccessEnvelope, null, 2)}\n`;
}

export function formatJsonError(error: CliErrorPayload): string {
  return `${JSON.stringify({ ok: false, error } satisfies JsonErrorEnvelope, null, 2)}\n`;
}
