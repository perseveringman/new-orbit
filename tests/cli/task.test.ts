import { describe, expect, it } from 'vitest';
import { EXIT_BUSINESS_ERROR, EXIT_SUCCESS } from '../../src/cli/errors';
import { runCli } from '../../src/cli/runner';
import { capture, RecordingBridge } from './helpers';

describe('CLI task commands', () => {
  it('maps list/get/update/deps to bridge methods', async () => {
    const io = capture();
    const bridge = new RecordingBridge({
      'task.list': [],
      'task.get': {
        task: { uid: 'task_1', id: 'task_1', title: 'T', status: 'todo', relPath: 'x.md' }
      },
      'task.update': { uid: 'task_1', id: 'task_1', title: 'T', status: 'done', relPath: 'x.md' },
      'task.deps': { uid: 'task_1', status: 'todo', children: [] }
    });

    await expect(
      runCli(['task', 'list', '--status', 'todo', '--project', 'project_1'], {
        ...io.options,
        bridge
      })
    ).resolves.toBe(EXIT_SUCCESS);
    await expect(runCli(['task', 'get', 'task_1'], { ...io.options, bridge })).resolves.toBe(
      EXIT_SUCCESS
    );
    await expect(
      runCli(['task', 'update', 'task_1', '--status', 'done', '--depends-on', 'a,b'], {
        ...io.options,
        bridge
      })
    ).resolves.toBe(EXIT_SUCCESS);
    await expect(runCli(['task', 'deps', 'task_1'], { ...io.options, bridge })).resolves.toBe(
      EXIT_SUCCESS
    );

    expect(bridge.calls.map((call) => call.method)).toEqual([
      'task.list',
      'task.get',
      'task.update',
      'task.deps'
    ]);
    expect(bridge.calls[0]?.params).toEqual({ status: 'todo', project_uid: 'project_1' });
    expect(bridge.calls[2]?.params).toEqual({
      uid: 'task_1',
      status: 'done',
      depends_on: ['a', 'b']
    });
  });

  it('maps propose and propose-scope to approval-backed handlers', async () => {
    const io = capture();
    const bridge = new RecordingBridge({
      'task.propose': { id: 'proposal_1' },
      'task.proposeScope': { id: 'proposal_2' }
    });

    await expect(
      runCli(['task', 'propose', '--title', 'New task', '--area', 'area_1', '--run', 'run_1'], {
        ...io.options,
        bridge,
        stdin: 'details'
      })
    ).resolves.toBe(EXIT_SUCCESS);
    await expect(
      runCli(
        ['task', 'propose-scope', 'task_1', '--run', 'run_1', '--summary', 'Need more files'],
        {
          ...io.options,
          bridge
        }
      )
    ).resolves.toBe(EXIT_SUCCESS);

    expect(bridge.calls[0]?.params).toEqual({
      title: 'New task',
      area_uid: 'area_1',
      run_id: 'run_1',
      description: 'details'
    });
    expect(bridge.calls[1]?.params).toEqual({
      current_uid: 'task_1',
      run_id: 'run_1',
      summary: 'Need more files'
    });
  });

  it('returns unavailable for delete without a backend', async () => {
    const io = capture();
    await expect(runCli(['task', 'delete', 'task_1'], io.options)).resolves.toBe(
      EXIT_BUSINESS_ERROR
    );
    expect(io.stderr.join('')).toContain('unavailable');
  });
});
