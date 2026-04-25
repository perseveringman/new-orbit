import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {
  decodeCliResponse,
  encodeCliMessage,
  splitCliFrames,
  type CliRequest,
  type CliResponse
} from '@shared/cli_protocol';
import { businessError, connectionError } from './errors';

export interface BridgeClient {
  request(method: string, params?: unknown): Promise<unknown>;
}

export interface BridgeOptions {
  socketPath?: string;
  vaultPath?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

function findVaultRoot(start: string): string | null {
  let current = path.resolve(start);
  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, '.orbit', 'config.json'))) return current;
    current = path.dirname(current);
  }
  return existsSync(path.join(current, '.orbit', 'config.json')) ? current : null;
}

export function resolveCliSocketPath(options: BridgeOptions = {}): string {
  const env = options.env ?? process.env;
  if (options.socketPath) return options.socketPath;
  if (env['ORBIT_CLI_SOCKET']) return env['ORBIT_CLI_SOCKET'];
  const vaultPath =
    options.vaultPath ?? env['ORBIT_VAULT'] ?? findVaultRoot(options.cwd ?? process.cwd());
  if (!vaultPath)
    throw connectionError('Cannot locate an Orbit vault. Pass --vault or ORBIT_VAULT.');
  return path.join(vaultPath, '.orbit', 'cli-socket');
}

export class SocketBridgeClient implements BridgeClient {
  private readonly socketPath: string;
  private readonly timeoutMs: number;

  constructor(options: BridgeOptions = {}) {
    this.socketPath = resolveCliSocketPath(options);
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const request: CliRequest = { id: randomUUID(), method };
    if (params !== undefined) request.params = params;

    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.socketPath);
      let buffer = '';
      let settled = false;
      const timer = setTimeout(() => {
        fail(connectionError('Timed out waiting for Orbit main process CLI response.'));
      }, this.timeoutMs);

      const cleanup = (): void => {
        clearTimeout(timer);
        socket.removeAllListeners();
        socket.end();
      };
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const succeed = (response: CliResponse): void => {
        if (settled) return;
        settled = true;
        cleanup();
        if (!response.ok) {
          reject(businessError(response.error.message, response.error.code));
          return;
        }
        resolve(response.data);
      };

      socket.on('connect', () => {
        socket.write(encodeCliMessage(request));
      });
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const split = splitCliFrames(buffer);
        buffer = split.rest;
        for (const frame of split.frames) {
          try {
            const response = decodeCliResponse(frame);
            if (response.id === request.id) succeed(response);
          } catch (error) {
            fail(error);
          }
        }
      });
      socket.on('error', () => fail(connectionError()));
      socket.on('close', () => {
        if (!settled) fail(connectionError());
      });
    });
  }
}
