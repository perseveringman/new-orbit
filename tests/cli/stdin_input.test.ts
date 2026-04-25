import { describe, expect, it } from 'vitest';
import { EXIT_SUCCESS } from '../../src/cli/errors';
import { runCli } from '../../src/cli/runner';
import { capture, RecordingBridge } from './helpers';

describe('CLI stdin input', () => {
  it('uses stdin as task proposal description', async () => {
    const io = capture();
    const bridge = new RecordingBridge({ 'task.propose': { id: 'proposal_1' } });

    await expect(
      runCli(['task', 'propose', '--title', 'Follow up', '--project', 'project_1'], {
        ...io.options,
        bridge,
        stdin: 'Long proposal body\n'
      })
    ).resolves.toBe(EXIT_SUCCESS);

    expect(bridge.calls).toEqual([
      {
        method: 'task.propose',
        params: {
          title: 'Follow up',
          project_uid: 'project_1',
          description: 'Long proposal body'
        }
      }
    ]);
  });

  it('uses stdin as run progress message', async () => {
    const io = capture();
    const bridge = new RecordingBridge({ 'run.reportProgress': { appended: true } });

    await expect(
      runCli(['run', 'report-progress', '--task', 'task_1'], {
        ...io.options,
        bridge,
        stdin: 'Ran validation\n'
      })
    ).resolves.toBe(EXIT_SUCCESS);

    expect(bridge.calls[0]).toEqual({
      method: 'run.reportProgress',
      params: { task_uid: 'task_1', message: 'Ran validation' }
    });
  });
});
