import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  crashLogDir,
  crashLogFile,
  describe as describeErr,
  formatCrashRecord,
  writeCrashRecord,
  writeCrashRecordSync
} from '../src/main/crash';

let tmp: string;

beforeEach(async () => {
  tmp = path.join(os.tmpdir(), `orbit-crash-${Date.now()}-${Math.random()}`);
  await fs.mkdir(tmp, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('crash logger', () => {
  it('resolves vault crash dir when vault is open', () => {
    expect(crashLogDir('/v', '/ud')).toBe(path.join('/v', '.orbit', 'crash'));
    expect(crashLogDir(null, '/ud')).toBe(path.join('/ud', 'crash'));
  });

  it('log file is YYYY-MM-DD.log', () => {
    const now = new Date(Date.UTC(2025, 3, 21, 10, 0, 0));
    expect(crashLogFile(null, '/ud', now).endsWith('2025-04-21.log')).toBe(true);
  });

  it('formatCrashRecord yields single-line NDJSON with origin + version', () => {
    const line = formatCrashRecord({
      ts: '2025-04-21T00:00:00.000Z',
      origin: 'main',
      version: '0.8.0',
      message: 'boom'
    });
    expect(line.endsWith('\n')).toBe(true);
    expect(line.split('\n')).toHaveLength(2);
    const parsed = JSON.parse(line.trim());
    expect(parsed.origin).toBe('main');
    expect(parsed.version).toBe('0.8.0');
    expect(parsed.message).toBe('boom');
  });

  it('writeCrashRecord appends NDJSON to today file', async () => {
    const rec1 = {
      ts: new Date().toISOString(),
      origin: 'renderer' as const,
      version: '0.8.0',
      message: 'first'
    };
    const rec2 = { ...rec1, origin: 'preload' as const, message: 'second' };
    const p1 = await writeCrashRecord(rec1, { vaultPath: null, userData: tmp });
    const p2 = await writeCrashRecord(rec2, { vaultPath: null, userData: tmp });
    expect(p1).toBe(p2);
    const raw = await fs.readFile(p1, 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(2);
    const [a, b] = lines.map((l) => JSON.parse(l));
    expect(a.origin).toBe('renderer');
    expect(b.origin).toBe('preload');
    expect(a.version).toBe('0.8.0');
  });

  it('writeCrashRecordSync also appends NDJSON', async () => {
    const p = writeCrashRecordSync(
      {
        ts: new Date().toISOString(),
        origin: 'main',
        version: '0.8.0',
        message: 'sync-boom'
      },
      { vaultPath: null, userData: tmp }
    );
    const contents = await fs.readFile(p, 'utf8');
    expect(contents).toMatch(/sync-boom/);
    expect(JSON.parse(contents.trim()).origin).toBe('main');
  });

  it('describe() handles Error, string, and non-serializable', () => {
    expect(describeErr(new Error('x')).message).toBe('x');
    expect(describeErr('plain').message).toBe('plain');
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(typeof describeErr(cyc).message).toBe('string');
  });
});
