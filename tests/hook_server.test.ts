import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { startHookServer, type HookServer, type HookEnvelope } from '../src/main/agent/hooks/server';

interface PostResult {
  status: number;
  body: string;
}

function post(
  port: number,
  path: string,
  headers: Record<string, string>,
  body: string,
  method = 'POST'
): Promise<PostResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: { 'content-type': 'application/json', ...headers }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })
        );
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

describe('hook server', () => {
  let server: HookServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('accepts a valid envelope and emits event', async () => {
    server = await startHookServer();
    const received: HookEnvelope[] = [];
    server.events.on('event', (env: HookEnvelope) => received.push(env));

    const body = JSON.stringify({
      version: 1,
      runId: 'run-1',
      worktreeId: 'wt-1',
      eventType: 'Stop',
      payload: { foo: 'bar' },
      ts: '2024-01-01T00:00:00Z'
    });
    const res = await post(
      server.port,
      '/hook',
      { authorization: `Bearer ${server.token}` },
      body
    );
    expect(res.status).toBe(204);
    expect(received).toHaveLength(1);
    expect(received[0].runId).toBe('run-1');
    expect(received[0].eventType).toBe('Stop');
  });

  it('rejects bad version with 409', async () => {
    server = await startHookServer({ version: 2 });
    const res = await post(
      server.port,
      '/hook',
      { authorization: `Bearer ${server.token}` },
      JSON.stringify({ version: 1, runId: 'r', eventType: 'Stop' })
    );
    expect(res.status).toBe(409);
    expect(JSON.parse(res.body)).toEqual({ error: 'version_mismatch' });
  });

  it('rejects missing token with 401', async () => {
    server = await startHookServer();
    const res = await post(
      server.port,
      '/hook',
      {},
      JSON.stringify({ version: 1, runId: 'r', eventType: 'Stop' })
    );
    expect(res.status).toBe(401);
  });

  it('rejects wrong method with 405', async () => {
    server = await startHookServer();
    const res = await post(
      server.port,
      '/hook',
      { authorization: `Bearer ${server.token}` },
      '',
      'GET'
    );
    expect(res.status).toBe(405);
  });

  it('returns 404 for unknown path', async () => {
    server = await startHookServer();
    const res = await post(
      server.port,
      '/nope',
      { authorization: `Bearer ${server.token}` },
      '',
      'POST'
    );
    expect(res.status).toBe(404);
  });
});
