import { describe, expect, it } from 'vitest';
import { createRingBufferStore } from '../src/main/agent/ringBuffer';
import type { AgentEvent } from '../src/shared/agent';

function ev(idx: number): AgentEvent {
  return { idx, at: new Date(0).toISOString(), kind: 'message', text: `m${idx}` };
}

describe('ring buffer', () => {
  it('stores and retrieves a single event', () => {
    const store = createRingBufferStore(4);
    const buf = store.get('r1');
    const e = ev(7);
    buf.push(e);
    expect(buf.size()).toBe(1);
    expect(buf.latestIdx()).toBe(7);
    expect(buf.since(-1)).toEqual([e]);
  });

  it('evicts oldest events past capacity', () => {
    const store = createRingBufferStore(4);
    const buf = store.get('r1');
    for (let i = 1; i <= 6; i += 1) buf.push(ev(i));
    expect(buf.size()).toBe(4);
    const got = buf.since(0).map((e) => e.idx);
    expect(got).toEqual([3, 4, 5, 6]);
  });

  it('since() returns only events with idx > sinceIdx', () => {
    const store = createRingBufferStore(4);
    const buf = store.get('r1');
    for (let i = 1; i <= 6; i += 1) buf.push(ev(i));
    expect(buf.since(5).map((e) => e.idx)).toEqual([6]);
  });

  it('drop removes buffer and activeRuns reflects it', () => {
    const store = createRingBufferStore(4);
    store.get('r1').push(ev(1));
    store.get('r2').push(ev(2));
    expect(store.activeRuns()).toBe(2);
    store.drop('r1');
    store.drop('r2');
    expect(store.activeRuns()).toBe(0);
  });

  it('latestIdx is -1 when empty', () => {
    const store = createRingBufferStore(4);
    expect(store.get('x').latestIdx()).toBe(-1);
  });
});
