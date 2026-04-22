import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readLogForReattach } from '../src/main/agent/reattach';
import { ORBIT_DIR, ORBIT_LOGS_DIR } from '../src/shared/constants';
import type { AgentEvent } from '../src/shared/agent';

let vaultPath: string;

async function writeLog(runId: string, lines: string[]): Promise<void> {
  const dir = path.join(vaultPath, ORBIT_DIR, ORBIT_LOGS_DIR);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${runId}.ndjson`), lines.join('\n') + '\n', 'utf8');
}

function mkEvent(idx: number, kind: AgentEvent['kind'], text?: string): AgentEvent {
  return { idx, at: new Date(idx * 1000).toISOString(), kind, text };
}

beforeAll(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-reattach-'));
});

afterAll(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('readLogForReattach', () => {
  it('reads full log and marks terminated when last event is done', async () => {
    await writeLog('abc', [
      JSON.stringify(mkEvent(1, 'message', 'hi')),
      JSON.stringify(mkEvent(2, 'message', 'there')),
      JSON.stringify(mkEvent(3, 'done'))
    ]);
    const res = await readLogForReattach({ vaultPath, runId: 'abc' });
    expect(res.events.map((e) => e.idx)).toEqual([1, 2, 3]);
    expect(res.terminated).toBe(true);
    expect(res.logPath.endsWith(path.join(ORBIT_DIR, ORBIT_LOGS_DIR, 'abc.ndjson'))).toBe(true);
  });

  it('filters by sinceIdx', async () => {
    const res = await readLogForReattach({ vaultPath, runId: 'abc', sinceIdx: 1 });
    expect(res.events.map((e) => e.idx)).toEqual([2, 3]);
    expect(res.terminated).toBe(true);
  });

  it('returns empty + terminated for missing runId', async () => {
    const res = await readLogForReattach({ vaultPath, runId: 'does-not-exist' });
    expect(res.events).toEqual([]);
    expect(res.terminated).toBe(true);
  });

  it('skips corrupt lines in the middle', async () => {
    await writeLog('def', [
      JSON.stringify(mkEvent(1, 'message', 'a')),
      '{this is not json',
      JSON.stringify(mkEvent(2, 'message', 'b')),
      '',
      JSON.stringify(mkEvent(3, 'message', 'c'))
    ]);
    const res = await readLogForReattach({ vaultPath, runId: 'def' });
    expect(res.events.map((e) => e.idx)).toEqual([1, 2, 3]);
    // Last known event is 'message', not terminal → not terminated.
    expect(res.terminated).toBe(false);
  });
});
