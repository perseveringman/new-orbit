import { describe, expect, it } from 'vitest';
import { EXIT_SUCCESS } from '../../src/cli/errors';
import { runCli } from '../../src/cli/runner';
import { capture, RecordingBridge } from './helpers';

describe('CLI auto-runner commands', () => {
  it('maps status/start/stop to auto-runner bridge methods', async () => {
    const io = capture();
    const bridge = new RecordingBridge({
      'autoRunner.status': { enabled: true, running: [], settings: {} },
      'autoRunner.start': { enabled: true, running: [], settings: {} },
      'autoRunner.stop': { enabled: false, running: [], settings: {} }
    });

    await expect(runCli(['auto-runner', 'status'], { ...io.options, bridge })).resolves.toBe(
      EXIT_SUCCESS
    );
    await expect(runCli(['auto-runner', 'start'], { ...io.options, bridge })).resolves.toBe(
      EXIT_SUCCESS
    );
    await expect(runCli(['auto-runner', 'stop'], { ...io.options, bridge })).resolves.toBe(
      EXIT_SUCCESS
    );

    expect(bridge.calls.map((call) => call.method)).toEqual([
      'autoRunner.status',
      'autoRunner.start',
      'autoRunner.stop'
    ]);
  });
});
