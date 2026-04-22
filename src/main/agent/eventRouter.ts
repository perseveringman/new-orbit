import { EventEmitter } from 'node:events';
import type { HookServer, HookEnvelope } from './hooks/server';

export interface RoutedEvent extends HookEnvelope {
  /** Monotonic sequence per router (for tests / UI virtualisation). */
  seq: number;
}

export interface EventRouter {
  readonly events: EventEmitter;
  stop(): void;
}

const DEFAULT_DEDUP_TTL_MS = 30_000;
const MAX_ENTRIES = 4096;

export function attachEventRouter(
  server: HookServer,
  opts: { dedupTtlMs?: number; clock?: () => number } = {}
): EventRouter {
  const ttl = opts.dedupTtlMs ?? DEFAULT_DEDUP_TTL_MS;
  const clock = opts.clock ?? ((): number => Date.now());
  const events = new EventEmitter();
  const lastSeen = new Map<string, number>();
  let seq = 0;

  const onEvent = (envelope: HookEnvelope): void => {
    const key = `${envelope.runId}:${envelope.eventType}:${envelope.worktreeId ?? ''}`;
    const now = clock();
    const prev = lastSeen.get(key);
    if (prev !== undefined && now - prev < ttl) {
      return;
    }
    lastSeen.delete(key);
    lastSeen.set(key, now);
    if (lastSeen.size > MAX_ENTRIES) {
      const removeCount = Math.floor(lastSeen.size / 2);
      const it = lastSeen.keys();
      for (let i = 0; i < removeCount; i++) {
        const next = it.next();
        if (next.done) break;
        lastSeen.delete(next.value);
      }
    }
    const routed: RoutedEvent = { ...envelope, seq: seq++ };
    events.emit('event', routed);
  };

  server.events.on('event', onEvent);

  return {
    events,
    stop(): void {
      server.events.off('event', onEvent);
    }
  };
}
