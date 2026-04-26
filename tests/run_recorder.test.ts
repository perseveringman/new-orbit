import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RunRecorder } from '../src/main/events/run-recorder';

describe('RunRecorder', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'orbit-recorder-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('records raw, abstract, and UI layers as separate NDJSON files', async () => {
    const recorder = new RunRecorder(tempDir);
    const paths = await recorder.startRecording('run_1');

    await recorder.recordRaw('run_1', { type: 'message' });
    await recorder.recordAbstract('run_1', { kind: 'message' });
    await recorder.recordUi('run_1', { kind: 'message', rendered: true });

    expect(await readFile(paths.raw, 'utf8')).toBe('{"type":"message"}\n');
    expect(await readFile(paths.abstract, 'utf8')).toBe('{"kind":"message"}\n');
    expect(await readFile(paths.ui, 'utf8')).toBe('{"kind":"message","rendered":true}\n');

    recorder.stopRecording('run_1');
    expect(recorder.getRecordingPaths('run_1')).toBeNull();
  });
});
