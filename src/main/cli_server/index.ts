import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { decodeCliRequest, encodeCliMessage, splitCliFrames } from '@shared/cli_protocol';
import { registerCoreCliHandlers } from './handlers';
import { CliHandlerRegistry } from './registry';
import { getCliSocketPath } from './socket_path';

interface CliServerState {
  server: net.Server;
  socketPath: string;
}

let currentServer: CliServerState | null = null;

function createDefaultRegistry(): CliHandlerRegistry {
  const registry = new CliHandlerRegistry();
  registerCoreCliHandlers(registry);
  return registry;
}

export async function startCliServerForVault(vaultPath: string): Promise<string> {
  await stopCliServer();
  const socketPath = getCliSocketPath(vaultPath);
  await fs.mkdir(path.dirname(socketPath), { recursive: true });
  await fs.rm(socketPath, { force: true });
  const registry = createDefaultRegistry();
  const server = net.createServer((socket) => {
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const split = splitCliFrames(buffer);
      buffer = split.rest;
      for (const frame of split.frames) {
        void (async (): Promise<void> => {
          try {
            const request = decodeCliRequest(frame);
            const response = await registry.handle(request);
            socket.write(encodeCliMessage(response));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            socket.write(
              encodeCliMessage({
                id: 'invalid',
                ok: false,
                error: { code: 'invalid_request', message }
              })
            );
          }
        })();
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.off('error', reject);
      resolve();
    });
  });
  currentServer = { server, socketPath };
  return socketPath;
}

export async function stopCliServer(): Promise<void> {
  const state = currentServer;
  if (!state) return;
  currentServer = null;
  await new Promise<void>((resolve) => state.server.close(() => resolve()));
  await fs.rm(state.socketPath, { force: true });
}

export { getCliSocketPath, CliHandlerRegistry, registerCoreCliHandlers };
