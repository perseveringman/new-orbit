import { createServer } from 'node:net';

/**
 * Dynamic port allocator for agent subprocesses.
 *
 * `allocate(scope)` returns a currently-free TCP port by binding to
 * port 0 then immediately closing. The returned port is recorded as
 * "claimed" by the scope until `release(scope)` is called so we don't
 * hand the same port to two concurrent runners.
 *
 * Note: between bind-0 + release, another process may grab the port.
 * We treat this as best-effort — consumers must still handle EADDRINUSE.
 */
export class PortAllocator {
  private readonly claimed = new Map<string, number>();
  private readonly allAllocated = new Set<number>();

  async allocate(scope: string): Promise<number> {
    // Release any prior allocation under this scope first.
    const prior = this.claimed.get(scope);
    if (typeof prior === 'number') {
      this.claimed.delete(scope);
      this.allAllocated.delete(prior);
    }

    // Try up to 8 times to find a port not already claimed by this allocator.
    for (let i = 0; i < 8; i++) {
      const port = await probeFreePort();
      if (!this.allAllocated.has(port)) {
        this.claimed.set(scope, port);
        this.allAllocated.add(port);
        return port;
      }
    }
    // Last resort — accept a collision; callers already handle EADDRINUSE.
    const port = await probeFreePort();
    this.claimed.set(scope, port);
    this.allAllocated.add(port);
    return port;
  }

  release(scope: string): void {
    const p = this.claimed.get(scope);
    if (typeof p === 'number') {
      this.claimed.delete(scope);
      this.allAllocated.delete(p);
    }
  }

  portOf(scope: string): number | null {
    return this.claimed.get(scope) ?? null;
  }
}

function probeFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('failed to get port')));
      }
    });
  });
}

let singleton: PortAllocator | null = null;
export function getPortAllocator(): PortAllocator {
  if (!singleton) singleton = new PortAllocator();
  return singleton;
}

export function resetPortAllocatorForTesting(): void {
  singleton = null;
}
