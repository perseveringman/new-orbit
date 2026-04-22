import type { AgentEvent } from '@shared/agent';

export interface RunRingBuffer {
  readonly runId: string;
  readonly capacity: number;
  push(ev: AgentEvent): void;
  /** Returns events with idx > sinceIdx, in order. */
  since(sinceIdx: number): AgentEvent[];
  /** Latest event idx known (or -1 if empty). */
  latestIdx(): number;
  /** Size in events currently buffered. */
  size(): number;
}

export interface RingBufferStore {
  get(runId: string): RunRingBuffer;
  drop(runId: string): void;
  /** Count of ring buffers held. */
  activeRuns(): number;
}

const DEFAULT_CAPACITY = 2048;

class RunRingBufferImpl implements RunRingBuffer {
  readonly runId: string;
  readonly capacity: number;
  private readonly buf: (AgentEvent | undefined)[];
  private head = 0; // next write position
  private count = 0;
  private lastIdx = -1;

  constructor(runId: string, capacity: number) {
    this.runId = runId;
    this.capacity = capacity;
    this.buf = new Array<AgentEvent | undefined>(capacity);
  }

  push(ev: AgentEvent): void {
    this.buf[this.head] = ev;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count += 1;
    this.lastIdx = ev.idx;
  }

  since(sinceIdx: number): AgentEvent[] {
    const out: AgentEvent[] = [];
    const start = (this.head - this.count + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i += 1) {
      const ev = this.buf[(start + i) % this.capacity];
      if (ev && ev.idx > sinceIdx) out.push(ev);
    }
    return out;
  }

  latestIdx(): number {
    return this.lastIdx;
  }

  size(): number {
    return this.count;
  }
}

export function createRingBufferStore(capacity: number = DEFAULT_CAPACITY): RingBufferStore {
  const cap = capacity > 0 ? capacity : DEFAULT_CAPACITY;
  const buffers = new Map<string, RunRingBuffer>();
  return {
    get(runId: string): RunRingBuffer {
      let b = buffers.get(runId);
      if (!b) {
        b = new RunRingBufferImpl(runId, cap);
        buffers.set(runId, b);
      }
      return b;
    },
    drop(runId: string): void {
      buffers.delete(runId);
    },
    activeRuns(): number {
      return buffers.size;
    }
  };
}
