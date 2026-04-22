import { EventEmitter } from 'node:events';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { OrbitHookEventType } from './mapEventType';

export interface HookEnvelope {
  runId: string;
  worktreeId?: string;
  eventType: OrbitHookEventType;
  payload: Record<string, unknown>;
  ts: string;
}

export interface HookServer {
  readonly port: number;
  readonly token: string;
  readonly version: number;
  readonly events: EventEmitter;
  close(): Promise<void>;
}

export interface StartHookServerOpts {
  version?: number;
  host?: string;
}

const MAX_BODY_BYTES = 64 * 1024;
const ORBIT_EVENT_TYPES: ReadonlySet<string> = new Set<OrbitHookEventType>([
  'Start',
  'Stop',
  'PermissionRequest',
  'Progress'
]);

function writeJson(res: http.ServerResponse, status: number, body: unknown): void {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(buf.length)
  });
  res.end(buf);
}

export async function startHookServer(opts: StartHookServerOpts = {}): Promise<HookServer> {
  const version = opts.version ?? 1;
  const host = opts.host ?? '127.0.0.1';
  const token = randomBytes(12).toString('hex');
  const events = new EventEmitter();

  const server = http.createServer((req, res) => {
    const url = req.url ?? '';
    if (!url.startsWith('/hook')) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end();
      return;
    }
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${token}`) {
      res.writeHead(401);
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;
    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        aborted = true;
        res.writeHead(413);
        res.end();
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        writeJson(res, 400, { error: 'invalid_json' });
        return;
      }
      if (typeof body !== 'object' || body === null) {
        writeJson(res, 400, { error: 'invalid_body' });
        return;
      }
      if (body.version !== version) {
        writeJson(res, 409, { error: 'version_mismatch' });
        return;
      }
      const runId = body.runId;
      const eventType = body.eventType;
      if (typeof runId !== 'string' || runId.length === 0) {
        writeJson(res, 400, { error: 'missing_runId' });
        return;
      }
      if (typeof eventType !== 'string' || !ORBIT_EVENT_TYPES.has(eventType)) {
        writeJson(res, 400, { error: 'invalid_eventType' });
        return;
      }
      const worktreeId = typeof body.worktreeId === 'string' ? body.worktreeId : undefined;
      const payload =
        body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
          ? (body.payload as Record<string, unknown>)
          : {};
      const ts = typeof body.ts === 'string' ? body.ts : new Date().toISOString();
      const envelope: HookEnvelope = {
        runId,
        worktreeId,
        eventType: eventType as OrbitHookEventType,
        payload,
        ts
      };
      events.emit('event', envelope);
      res.writeHead(204);
      res.end();
    });
    req.on('error', () => {
      /* ignore */
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onErr = (err: Error): void => reject(err);
    server.once('error', onErr);
    server.listen(0, host, () => {
      server.off('error', onErr);
      resolve();
    });
  });

  const addr = server.address() as AddressInfo;
  const port = addr.port;

  const close = (): Promise<void> =>
    new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

  return {
    port,
    token,
    version,
    events,
    close
  };
}
