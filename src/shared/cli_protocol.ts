export interface CliRequest {
  id: string;
  method: string;
  params?: unknown;
}

export interface CliErrorPayload {
  code: string;
  message: string;
}

export interface CliSuccessResponse {
  id: string;
  ok: true;
  data?: unknown;
}

export interface CliErrorResponse {
  id: string;
  ok: false;
  error: CliErrorPayload;
}

export type CliResponse = CliSuccessResponse | CliErrorResponse;

export function encodeCliMessage(message: CliRequest | CliResponse): string {
  return `${JSON.stringify(message)}\n`;
}

export function splitCliFrames(buffer: string): { frames: string[]; rest: string } {
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  return { frames: parts.filter((part) => part.length > 0), rest };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function decodeCliRequest(frame: string): CliRequest {
  const parsed: unknown = JSON.parse(frame);
  if (!isRecord(parsed) || typeof parsed.id !== 'string' || typeof parsed.method !== 'string') {
    throw new Error('invalid CLI request frame');
  }
  const request: CliRequest = { id: parsed.id, method: parsed.method };
  if ('params' in parsed) request.params = parsed.params;
  return request;
}

export function decodeCliResponse(frame: string): CliResponse {
  const parsed: unknown = JSON.parse(frame);
  if (!isRecord(parsed) || typeof parsed.id !== 'string' || typeof parsed.ok !== 'boolean') {
    throw new Error('invalid CLI response frame');
  }
  if (parsed.ok) {
    const response: CliSuccessResponse = { id: parsed.id, ok: true };
    if ('data' in parsed) response.data = parsed.data;
    return response;
  }
  if (
    !isRecord(parsed.error) ||
    typeof parsed.error.code !== 'string' ||
    typeof parsed.error.message !== 'string'
  ) {
    throw new Error('invalid CLI error response frame');
  }
  return {
    id: parsed.id,
    ok: false,
    error: { code: parsed.error.code, message: parsed.error.message }
  };
}
