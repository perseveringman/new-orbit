import http, { type Server } from 'node:http';
import type { AIConfigService } from './service';

const MAX_PORT_ATTEMPTS = 30;

interface ProxyRuntime {
  vaultPath: string;
  port: number;
  server: Server;
  service: AIConfigService;
}

let current: ProxyRuntime | null = null;

export async function ensureEmbeddingProxy(options: {
  vaultPath: string;
  port: number;
  service: AIConfigService;
}): Promise<{ baseURL: string }> {
  if (current?.vaultPath === options.vaultPath && current.port === options.port) {
    current.service = options.service;
    return { baseURL: `http://127.0.0.1:${options.port}/v1` };
  }
  await shutdownEmbeddingProxy();
  const runtime = await startProxyWithFallback(options);
  current = runtime;
  return { baseURL: `http://127.0.0.1:${runtime.port}/v1` };
}

async function startProxyWithFallback(options: {
  vaultPath: string;
  port: number;
  service: AIConfigService;
}): Promise<ProxyRuntime> {
  let lastError: unknown = null;
  for (let offset = 0; offset < MAX_PORT_ATTEMPTS; offset += 1) {
    const port = options.port + offset;
    try {
      return await startProxyServer(options, port);
    } catch (error) {
      if (!isAddressInUse(error)) throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error(`embedding_proxy_port_unavailable:${options.port}`);
}

async function startProxyServer(
  options: {
    vaultPath: string;
    service: AIConfigService;
  },
  port: number
): Promise<ProxyRuntime> {
  const server = http.createServer((request, response) => {
    void handleProxyRequest(options.service, request, response);
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      reject(error);
    };
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', onError);
      resolve();
    });
  });
  return { ...options, port, server };
}

export async function shutdownEmbeddingProxy(): Promise<void> {
  if (!current) return;
  const server = current.server;
  current = null;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function handleProxyRequest(
  service: AIConfigService,
  request: http.IncomingMessage,
  response: http.ServerResponse
): Promise<void> {
  try {
    if (request.method === 'GET' && request.url === '/healthz') {
      writeJson(response, 200, { ok: true });
      return;
    }
    if (request.method !== 'POST' || !request.url?.match(/^\/(?:v1\/)?embeddings$/u)) {
      writeJson(response, 404, { error: 'not_found' });
      return;
    }
    const body = await readJson(request);
    const input = normalizeInput(body.input);
    const vectors = await service.embedTexts(input, { role: 'memory' });
    writeJson(response, 200, {
      object: 'list',
      model: String(body.model ?? 'orbit-memory-embedding'),
      data: vectors.map((embedding, index) => ({
        object: 'embedding',
        index,
        embedding
      })),
      usage: {
        prompt_tokens: input.join('\n').length,
        total_tokens: input.join('\n').length
      }
    });
  } catch (error) {
    writeJson(response, 500, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function readJson(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

function normalizeInput(input: unknown): string[] {
  if (typeof input === 'string') return [input];
  if (Array.isArray(input)) return input.map((item) => String(item)).filter((item) => item.trim());
  throw new Error('embedding_proxy_input_required');
}

function writeJson(response: http.ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
}

function isAddressInUse(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'EADDRINUSE');
}
