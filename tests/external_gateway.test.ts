import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { configureActivityEmitter } from '../src/main/activity';
import { createExternalOrchestrator } from '../src/main/external-orchestrator/orchestrator';
import { decodeExternalGatewayLine, encodeExternalGatewayEvent, splitExternalGatewayFrames } from '../src/main/external-orchestrator/protocol-codec';
import { getExternalGatewayRuntime, stopExternalGatewayRuntime } from '../src/main/external-orchestrator/runtime';
import { ExternalGatewaySessionBridge } from '../src/main/external-orchestrator/session-bridge';
import { createExternalGatewayStore } from '../src/main/external-orchestrator/store';
import type { ExternalGatewayInboundRequest, ExternalGatewayOutboundEvent } from '../src/shared/external-gateway-protocol';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-external-gateway-'));
  configureActivityEmitter(vaultPath);
});

afterEach(async () => {
  configureActivityEmitter(null);
  await stopExternalGatewayRuntime(vaultPath);
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('External Gateway protocol', () => {
  it('encodes JSONL events and rejects incompatible protocol versions', () => {
    const encoded = encodeExternalGatewayEvent({ type: 'pong' });
    expect(JSON.parse(encoded)).toMatchObject({ version: 1, type: 'pong' });
    expect(splitExternalGatewayFrames(`${encoded}partial`)).toEqual({ lines: [encoded.trim()], rest: 'partial' });
    expect(() => decodeExternalGatewayLine('{"version":99,"type":"ping"}')).toThrow(/unsupported_protocol_version/);
  });
});

describe('External Orchestrator', () => {
  it('routes /capture through capture.note, writes a note, and records a request log', async () => {
    const orchestrator = createExternalOrchestrator(vaultPath);
    const events: ExternalGatewayOutboundEvent[] = [];
    await orchestrator.handleInbound(message('/capture remember the socket bridge'), (event) => {
      events.push(event);
    });

    expect(events.map((event) => event.type)).toEqual(['request.accepted', 'artifact', 'request.completed']);
    expect(events[0]).toMatchObject({ type: 'request.accepted', routedTo: 'capture.note' });
    expect(events[1]).toMatchObject({ type: 'artifact', kind: 'note' });

    const notes = await fs.readdir(path.join(vaultPath, 'notes', 'captures'));
    expect(notes).toHaveLength(1);
    const log = await orchestrator.store.listRequestLog();
    expect(log[0]).toMatchObject({ routedTo: 'capture.note', outcome: 'completed' });
  });

  it('persists cc-connect session mapping and archives the conversation on close', async () => {
    const store = createExternalGatewayStore(vaultPath);
    const bridge = new ExternalGatewaySessionBridge(vaultPath, store);
    const first = await bridge.resolveSession({
      sessionId: 'telegram:42',
      user: { platform: 'telegram', id: '42', name: 'Ryan' }
    });
    const second = await bridge.resolveSession({
      sessionId: 'telegram:42',
      user: { platform: 'telegram', id: '42', name: 'Ryan' }
    });
    expect(second.conversationId).toBe(first.conversationId);

    await bridge.closeSession('telegram:42');
    const archived = await store.getSession('telegram:42');
    expect(archived?.archived).toBe(true);
    const conversation = await bridge.conversationOrchestrator().getConversation(first.conversationId);
    expect(conversation?.archived).toBe(true);
  });

  it('serves JSONL over a Unix socket for ping and capture requests', async () => {
    const socketPath = path.join(vaultPath, '.orbit', 'external-test.sock');
    const store = createExternalGatewayStore(vaultPath);
    await store.updateConfig({ socket_path: socketPath });
    const runtime = getExternalGatewayRuntime(vaultPath);
    await runtime.start();

    const client = await connect(socketPath);
    try {
      client.write(JSON.stringify({ type: 'ping' }) + '\n');
      expect(await readFrame(client)).toMatchObject({ type: 'pong' });

      client.write(JSON.stringify(message('/capture from socket', 'socket-req')) + '\n');
      const frames = await readFramesUntil(client, 'request.completed');
      expect(frames.map((frame) => frame.type)).toEqual(['request.accepted', 'artifact', 'request.completed']);
    } finally {
      client.destroy();
      await runtime.stop();
    }
  });
});

function message(text: string, requestId = 'req-1'): Extract<ExternalGatewayInboundRequest, { type: 'message.submit' }> {
  return {
    type: 'message.submit',
    requestId,
    sessionId: 'telegram:42',
    user: { platform: 'telegram', id: '42', name: 'Ryan' },
    content: { kind: 'text', text }
  };
}

function connect(socketPath: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

function readFrame(socket: net.Socket): Promise<ExternalGatewayOutboundEvent> {
  return readFramesUntil(socket).then((frames) => frames[0]!);
}

function readFramesUntil(socket: net.Socket, terminalType?: ExternalGatewayOutboundEvent['type']): Promise<ExternalGatewayOutboundEvent[]> {
  const frames: ExternalGatewayOutboundEvent[] = [];
  let buffer = '';
  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8');
      const split = splitExternalGatewayFrames(buffer);
      buffer = split.rest;
      for (const line of split.lines) {
        const frame = JSON.parse(line) as ExternalGatewayOutboundEvent;
        frames.push(frame);
        if (!terminalType || frame.type === terminalType) {
          cleanup();
          resolve(frames);
          return;
        }
      }
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const cleanup = (): void => {
      socket.off('data', onData);
      socket.off('error', onError);
    };
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

