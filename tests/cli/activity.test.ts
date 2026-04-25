import { describe, expect, it } from 'vitest';
import { EXIT_SUCCESS } from '../../src/cli/errors';
import { runCli } from '../../src/cli/runner';
import { capture, RecordingBridge } from './helpers';

describe('CLI activity commands', () => {
  it('maps list filters to activity.list', async () => {
    const io = capture();
    const bridge = new RecordingBridge({ 'activity.list': [] });

    await expect(
      runCli(
        [
          'activity',
          'list',
          '--from',
          '2026-04-26',
          '--actor',
          'agent',
          '--action',
          'task.updated',
          '--limit',
          '5'
        ],
        { ...io.options, bridge }
      )
    ).resolves.toBe(EXIT_SUCCESS);

    expect(bridge.calls[0]).toEqual({
      method: 'activity.list',
      params: { from: '2026-04-26', actor: 'agent', action: 'task.updated', limit: 5 }
    });
  });

  it('maps summary to activity.summary', async () => {
    const io = capture();
    const bridge = new RecordingBridge({ 'activity.summary': { total: 0 } });

    await expect(
      runCli(['activity', 'summary', '--from', '-7d'], { ...io.options, bridge })
    ).resolves.toBe(EXIT_SUCCESS);

    expect(bridge.calls[0]?.method).toBe('activity.summary');
    expect((bridge.calls[0]?.params as { from: string }).from).toMatch(/T/);
  });
});
