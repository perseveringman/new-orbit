import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { attachEventRouter } from '../src/main/agent/eventRouter';
import type { HookServer, HookEnvelope } from '../src/main/agent/hooks/server';
import type { RoutedEvent } from '../src/main/agent/eventRouter';

function makeFakeServer(): { server: HookServer; emit: (env: HookEnvelope) => void } {
  const events = new EventEmitter();
  const server: HookServer = {
    port: 0,
    token: 'fake',
    version: 1,
    events,
    close: (): Promise<void> => Promise.resolve()
  };
  return { server, emit: (env) => events.emit('event', env) };
}

function mkEnvelope(over: Partial<HookEnvelope> = {}): HookEnvelope {
  return {
    runId: 'run-1',
    worktreeId: 'wt-1',
    eventType: 'Stop',
    payload: {},
    ts: '2024-01-01T00:00:00Z',
    ...over
  };
}

describe('eventRouter dedup', () => {
  it('drops identical envelope within TTL, emits after TTL', () => {
    const { server, emit } = makeFakeServer();
    let now = 1000;
    const router = attachEventRouter(server, { dedupTtlMs: 30_000, clock: () => now });

    const received: RoutedEvent[] = [];
    router.events.on('event', (r: RoutedEvent) => received.push(r));

    emit(mkEnvelope());
    expect(received).toHaveLength(1);
    expect(received[0].seq).toBe(0);

    // duplicate within TTL
    now += 1000;
    emit(mkEnvelope());
    expect(received).toHaveLength(1);

    // different eventType bypasses dedup
    emit(mkEnvelope({ eventType: 'Progress' }));
    expect(received).toHaveLength(2);
    expect(received[1].seq).toBe(1);

    // advance past TTL, original key fires again
    now += 30_000;
    emit(mkEnvelope());
    expect(received).toHaveLength(3);
    expect(received[2].seq).toBe(2);

    router.stop();
  });

  it('stop() removes listener from server', () => {
    const { server, emit } = makeFakeServer();
    const router = attachEventRouter(server);
    const received: RoutedEvent[] = [];
    router.events.on('event', (r: RoutedEvent) => received.push(r));
    router.stop();
    emit(mkEnvelope());
    expect(received).toHaveLength(0);
  });
});
