import { describe, expect, it } from 'vitest';
import { EXIT_BUSINESS_ERROR, EXIT_SUCCESS } from '../../src/cli/errors';
import { runCli } from '../../src/cli/runner';
import { capture, RecordingBridge } from './helpers';

describe('CLI task commands', () => {
  it('maps list/get/update/deps/related/transcript/switch-runtime to bridge methods', async () => {
    const io = capture();
    const bridge = new RecordingBridge({
      'task.list': [],
      'task.get': {
        task: { uid: 'task_1', id: 'task_1', title: 'T', status: 'todo', relPath: 'x.md' }
      },
      'task.update': { uid: 'task_1', id: 'task_1', title: 'T', status: 'done', relPath: 'x.md' },
      'task.deps': { uid: 'task_1', status: 'todo', children: [] },
      'task.related': { relatedTasks: [] },
      'task.transcript': { segments: [], turns: [] },
      'task.switchRuntime': { runId: 'run_2' }
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
      runCli(['task', 'update', 'task_1', '--status', 'done', '--mode', 'assisted', '--depends-on', 'a,b'], {
        ...io.options,
        bridge
      })
    ).resolves.toBe(EXIT_SUCCESS);
    await expect(runCli(['task', 'deps', 'task_1'], { ...io.options, bridge })).resolves.toBe(
      EXIT_SUCCESS
    );
    await expect(runCli(['task', 'related', 'task_1'], { ...io.options, bridge })).resolves.toBe(
      EXIT_SUCCESS
    );
    await expect(runCli(['task', 'transcript', 'task_1'], { ...io.options, bridge })).resolves.toBe(
      EXIT_SUCCESS
    );
    await expect(
      runCli(['task', 'switch-runtime', 'task_1', '--to', 'claude:/bin/claude'], {
        ...io.options,
        bridge
      })
    ).resolves.toBe(EXIT_SUCCESS);

    expect(bridge.calls.map((call) => call.method)).toEqual([
      'task.list',
      'task.get',
      'task.update',
      'task.deps',
      'task.related',
      'task.transcript',
      'task.switchRuntime'
    ]);
    expect(bridge.calls[0]?.params).toEqual({ status: 'todo', project_uid: 'project_1' });
    expect(bridge.calls[2]?.params).toEqual({
      uid: 'task_1',
      status: 'done',
      execution_mode: 'assisted',
      depends_on: ['a', 'b']
    });
    expect(bridge.calls[6]?.params).toEqual({
      uid: 'task_1',
      runtime_id: 'claude:/bin/claude'
    });
  });

  it('maps propose, propose-scope and propose-split to approval-backed handlers', async () => {
    const io = capture();
    const bridge = new RecordingBridge({
      'task.propose': { id: 'proposal_1' },
      'task.proposeScope': { id: 'proposal_2' },
      'task.proposeSplit': { id: 'proposal_3' }
    });

    await expect(
      runCli(['task', 'propose', '--title', 'New task', '--area', 'area_1', '--mode', 'agent', '--run', 'run_1'], {
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
    await expect(
      runCli(
        ['task', 'propose-split', 'task_1', '--run', 'run_1', '--summary', 'Split into two'],
        {
          ...io.options,
          bridge
        }
      )
    ).resolves.toBe(EXIT_SUCCESS);

    expect(bridge.calls[0]?.params).toEqual({
      title: 'New task',
      area_uid: 'area_1',
      execution_mode: 'agent',
      run_id: 'run_1',
      description: 'details'
    });
    expect(bridge.calls[1]?.params).toEqual({
      current_uid: 'task_1',
      run_id: 'run_1',
      summary: 'Need more files'
    });
    expect(bridge.calls[2]?.params).toEqual({
      current_uid: 'task_1',
      run_id: 'run_1',
      summary: 'Split into two'
    });
  });

  it('maps project overview, kanban list and project-scoped search', async () => {
    const io = capture();
    const bridge = new RecordingBridge({
      'project.overview': { project: { slug: 'demo', name: 'Demo', status: 'active' } },
      'task.list': [],
      search: []
    });

    await expect(runCli(['project', 'overview', 'demo'], { ...io.options, bridge })).resolves.toBe(
      EXIT_SUCCESS
    );
    await expect(runCli(['kanban', 'list', 'demo'], { ...io.options, bridge })).resolves.toBe(
      EXIT_SUCCESS
    );
    await expect(
      runCli(['search', 'roadmap', '--project', 'demo'], { ...io.options, bridge })
    ).resolves.toBe(EXIT_SUCCESS);

    expect(bridge.calls.map((call) => call.method)).toEqual([
      'project.overview',
      'task.list',
      'search'
    ]);
    expect(bridge.calls[0]?.params).toEqual({ slug: 'demo' });
    expect(bridge.calls[1]?.params).toEqual({ project_uid: 'demo' });
    expect(bridge.calls[2]?.params).toEqual({ query: 'roadmap', limit: 30, project: 'demo' });
  });

  it('returns unavailable for delete without a backend', async () => {
    const io = capture();
    await expect(runCli(['task', 'delete', 'task_1'], io.options)).resolves.toBe(
      EXIT_BUSINESS_ERROR
    );
    expect(io.stderr.join('')).toContain('unavailable');
  });
});
