import { describe, expect, it } from 'vitest';
import { PortAllocator } from '../src/main/env/ports';

describe('PortAllocator', () => {
  it('returns distinct ports for distinct scopes', async () => {
    const a = new PortAllocator();
    const p1 = await a.allocate('s1');
    const p2 = await a.allocate('s2');
    const p3 = await a.allocate('s3');
    expect(p1).toBeGreaterThan(0);
    expect(p2).toBeGreaterThan(0);
    expect(p3).toBeGreaterThan(0);
    expect(new Set([p1, p2, p3]).size).toBe(3);
  });

  it('release() makes a port eligible for reuse', async () => {
    const a = new PortAllocator();
    const p1 = await a.allocate('s1');
    void p1;
    a.release('s1');
    // After release the allocator must not remember it; re-allocating the same
    // scope should return *some* port (possibly the same one).
    const p1b = await a.allocate('s1');
    expect(p1b).toBeGreaterThan(0);
    // Allocate under a different scope to confirm set bookkeeping cleared.
    const p2 = await a.allocate('s2');
    expect(p2).not.toBe(p1b);
    a.release('s1');
    a.release('s2');
  });

  it('portOf tracks the current claim', async () => {
    const a = new PortAllocator();
    expect(a.portOf('q')).toBeNull();
    const p = await a.allocate('q');
    expect(a.portOf('q')).toBe(p);
    a.release('q');
    expect(a.portOf('q')).toBeNull();
  });
});
