import { describe, expect, it } from 'vitest';
import { EXIT_SUCCESS } from '../../src/cli/errors';
import { runCli } from '../../src/cli/runner';
import { capture, RecordingBridge } from './helpers';

describe('CLI approval commands', () => {
  it('maps list/get to approval bridge methods', async () => {
    const io = capture();
    const bridge = new RecordingBridge({
      'approval.list': [],
      'approval.get': { id: 'proposal_1' }
    });

    await expect(
      runCli(['approval', 'list', '--pending', '--type', 'new_task'], { ...io.options, bridge })
    ).resolves.toBe(EXIT_SUCCESS);
    await expect(
      runCli(['approval', 'get', 'proposal_1'], { ...io.options, bridge })
    ).resolves.toBe(EXIT_SUCCESS);

    expect(bridge.calls).toEqual([
      { method: 'approval.list', params: { status: 'pending', type: 'new_task' } },
      { method: 'approval.get', params: { id: 'proposal_1' } }
    ]);
  });

  it('normalizes resolve decisions for approval.resolve', async () => {
    const io = capture();
    const bridge = new RecordingBridge({ 'approval.resolve': { proposal: { id: 'proposal_1' } } });

    await expect(
      runCli(['approval', 'resolve', 'proposal_1', '--decision', 'reject', '--note', 'too broad'], {
        ...io.options,
        bridge
      })
    ).resolves.toBe(EXIT_SUCCESS);

    expect(bridge.calls[0]).toEqual({
      method: 'approval.resolve',
      params: {
        id: 'proposal_1',
        input: {
          resolution_source: 'cli',
          status: 'rejected',
          resolution_note: 'too broad'
        }
      }
    });
  });
});
