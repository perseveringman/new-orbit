import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import type { ExternalGatewayOutboundEvent } from '@shared/external-gateway-protocol';
import { decodeExternalGatewayLine, encodeExternalGatewayEvent, splitExternalGatewayFrames } from './protocol-codec';
import type { ExternalOrchestrator } from './orchestrator';

export class ExternalGatewaySocketServer {
  private server: net.Server | null = null;
  private readonly clients = new Set<net.Socket>();
  private startedAt: string | undefined;
  private lastError: string | undefined;

  constructor(
    private readonly orchestrator: ExternalOrchestrator,
    private readonly socketPath: string
  ) {}

  async start(): Promise<void> {
    if (this.server) return;
    await fs.mkdir(path.dirname(this.socketPath), { recursive: true });
    await fs.rm(this.socketPath, { force: true }).catch(() => undefined);
    this.server = net.createServer((socket) => this.handleConnection(socket));
    await new Promise<void>((resolve, reject) => {
      const server = this.server;
      if (!server) {
        reject(new Error('external_gateway_server_missing'));
        return;
      }
      server.once('error', reject);
      server.listen(this.socketPath, () => {
        server.off('error', reject);
        resolve();
      });
    });
    this.startedAt = new Date().toISOString();
    this.lastError = undefined;
  }

  async stop(): Promise<void> {
    for (const client of this.clients) client.destroy();
    this.clients.clear();
    const server = this.server;
    this.server = null;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await fs.rm(this.socketPath, { force: true }).catch(() => undefined);
    this.startedAt = undefined;
  }

  broadcast(event: ExternalGatewayOutboundEvent): void {
    const frame = encodeExternalGatewayEvent(event);
    for (const client of this.clients) {
      if (!client.destroyed) client.write(frame);
    }
  }

  connectedClients(): number {
    return this.clients.size;
  }

  running(): boolean {
    return Boolean(this.server);
  }

  path(): string {
    return this.socketPath;
  }

  started_at(): string | undefined {
    return this.startedAt;
  }

  last_error(): string | undefined {
    return this.lastError;
  }

  private handleConnection(socket: net.Socket): void {
    this.clients.add(socket);
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const split = splitExternalGatewayFrames(buffer);
      buffer = split.rest;
      for (const line of split.lines) {
        void this.handleLine(socket, line);
      }
    });
    socket.on('error', (error) => {
      this.lastError = error.message;
    });
    socket.on('close', () => {
      this.clients.delete(socket);
    });
  }

  private async handleLine(socket: net.Socket, line: string): Promise<void> {
    try {
      const request = decodeExternalGatewayLine(line);
      await this.orchestrator.handleInbound(request, (event) => {
        if (!socket.destroyed) socket.write(encodeExternalGatewayEvent(event));
      });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      if (!socket.destroyed) {
        socket.write(
          encodeExternalGatewayEvent({
            type: 'request.failed',
            requestId: 'unknown',
            error: { code: 'invalid_frame', message: this.lastError }
          })
        );
      }
    }
  }
}
