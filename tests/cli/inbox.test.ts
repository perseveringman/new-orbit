import { describe, expect, it } from 'vitest';
import { EXIT_SUCCESS } from '../../src/cli/errors';
import { runCli } from '../../src/cli/runner';
import { capture, RecordingBridge } from './helpers';

describe('CLI inbox commands', () => {
  it('maps list/get/archive to inbox bridge methods', async () => {
    const io = capture();
    const bridge = new RecordingBridge({
      'inbox.list': { items: [], counts: {} },
      'inbox.get': { id: 'inbox_1' },
      'inbox.archive': { id: 'inbox_1', status: 'archived' }
    });

    await expect(
      runCli(['inbox', 'list', '--status', 'pending'], { ...io.options, bridge })
    ).resolves.toBe(EXIT_SUCCESS);
    await expect(runCli(['inbox', 'get', 'inbox_1'], { ...io.options, bridge })).resolves.toBe(
      EXIT_SUCCESS
    );
    await expect(runCli(['inbox', 'archive', 'inbox_1'], { ...io.options, bridge })).resolves.toBe(
      EXIT_SUCCESS
    );

    expect(bridge.calls).toEqual([
      { method: 'inbox.list', params: { includeArchived: false, status: 'pending' } },
      { method: 'inbox.get', params: { id: 'inbox_1' } },
      { method: 'inbox.archive', params: { id: 'inbox_1' } }
    ]);
  });

  it('maps resolve, dismiss, and emit-message with CLI source metadata', async () => {
    const io = capture();
    const bridge = new RecordingBridge({
      'inbox.resolve': { id: 'inbox_1' },
      'inbox.dismiss': { id: 'inbox_2' },
      'inbox.emitMessage': { id: 'inbox_3' }
    });

    await expect(
      runCli(['inbox', 'resolve', 'inbox_1', '--decision', 'approve', '--note', 'ok'], {
        ...io.options,
        bridge
      })
    ).resolves.toBe(EXIT_SUCCESS);
    await expect(
      runCli(['inbox', 'dismiss', 'inbox_2', '--note', 'noise'], { ...io.options, bridge })
    ).resolves.toBe(EXIT_SUCCESS);
    await expect(
      runCli(['inbox', 'emit-message', '--type', 'B1', '--title', 'Need info', '--run', 'run_1'], {
        ...io.options,
        bridge,
        stdin: 'Please provide API key location'
      })
    ).resolves.toBe(EXIT_SUCCESS);

    expect(bridge.calls[0]).toEqual({
      method: 'inbox.resolve',
      params: { id: 'inbox_1', input: { source: 'cli', decision: 'approve', note: 'ok' } }
    });
    expect(bridge.calls[1]).toEqual({
      method: 'inbox.dismiss',
      params: { id: 'inbox_2', input: { source: 'cli', note: 'noise' } }
    });
    expect(bridge.calls[2]).toEqual({
      method: 'inbox.emitMessage',
      params: {
        subtype: 'B1',
        title: 'Need info',
        summary: 'Please provide API key location',
        context: { run_id: 'run_1' },
        actor: 'agent',
        payload: {}
      }
    });
  });
});
