import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface FetchTextResult {
  finalUrl: string;
  status: number;
  ok: boolean;
  contentType: string;
  text: string;
  bytesRead: number;
  truncated: boolean;
}

export function parsePublicHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`invalid_url:${rawUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`unsupported_url_protocol:${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error('url_credentials_not_allowed');
  }
  return url;
}

export async function assertPublicNetworkTarget(url: URL): Promise<void> {
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('blocked_private_network_target:localhost');
  }
  const literal = isIP(hostname);
  if (literal) {
    if (isBlockedIp(hostname, literal === 6 ? 6 : 4)) {
      throw new Error(`blocked_private_network_target:${hostname}`);
    }
    return;
  }
  const addresses = await lookup(hostname, { all: true, verbatim: false }).catch((error: unknown) => {
    throw new Error(`dns_lookup_failed:${error instanceof Error ? error.message : String(error)}`);
  });
  if (addresses.length === 0) throw new Error(`dns_lookup_empty:${hostname}`);
  for (const address of addresses) {
    const version = address.family === 6 ? 6 : 4;
    if (isBlockedIp(address.address, version)) {
      throw new Error(`blocked_private_network_target:${address.address}`);
    }
  }
}

export async function fetchTextWithLimit(
  url: URL,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    maxBytes: number;
    timeoutMs: number;
  }
): Promise<FetchTextResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'Orbit Ask Anywhere/1.0',
        accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5',
        ...(options.headers ?? {})
      },
      ...(options.body !== undefined ? { body: options.body } : {}),
      signal: controller.signal
    });
    const contentType = response.headers.get('content-type') ?? '';
    const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(contentLength) && contentLength > options.maxBytes * 4) {
      throw new Error(`response_too_large:${contentLength}`);
    }
    const reader = response.body?.getReader();
    if (!reader) {
      return {
        finalUrl: response.url,
        status: response.status,
        ok: response.ok,
        contentType,
        text: '',
        bytesRead: 0,
        truncated: false
      };
    }
    const chunks: Uint8Array[] = [];
    let bytesRead = 0;
    let truncated = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = options.maxBytes - bytesRead;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      if (value.byteLength > remaining) {
        chunks.push(value.slice(0, remaining));
        bytesRead += remaining;
        truncated = true;
        break;
      }
      chunks.push(value);
      bytesRead += value.byteLength;
    }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(concat(chunks, bytesRead));
    return {
      finalUrl: response.url,
      status: response.status,
      ok: response.ok,
      contentType,
      text,
      bytesRead,
      truncated
    };
  } finally {
    clearTimeout(timer);
  }
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function isBlockedIp(address: string, version: 4 | 6): boolean {
  if (version === 4) return isBlockedIpv4(address);
  return isBlockedIpv6(address);
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }
  if (normalized.startsWith('ff')) return true;
  if (normalized.startsWith('2001:db8')) return true;
  if (normalized.includes('ffff:')) {
    const maybeIpv4 = normalized.split(':').at(-1);
    if (maybeIpv4 && isIP(maybeIpv4) === 4) return isBlockedIpv4(maybeIpv4);
  }
  return false;
}
