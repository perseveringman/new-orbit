import { describe, expect, it } from 'vitest';
import { EXIT_BUSINESS_ERROR, EXIT_SUCCESS } from '../../src/cli/errors';
import { runCli } from '../../src/cli/runner';
import { capture, RecordingBridge } from './helpers';

describe('CLI v1 MCP equivalent mapping', () => {
  it('maps search_vault, get_file, update_task, create_task replacement, and project graph', async () => {
    const io = capture();
    const bridge = new RecordingBridge({
      search: [],
      cat: { content: '# File' },
      'task.update': { uid: 'task_1', id: 'task_1', title: 'T', status: 'done', relPath: 't.md' },
      'task.propose': { id: 'proposal_1' },
      'project.graph': { projects: [], tasks: [] }
    });

    await expect(runCli(['search', 'roadmap'], { ...io.options, bridge })).resolves.toBe(
      EXIT_SUCCESS
    );
    await expect(runCli(['cat', 'README.md'], { ...io.options, bridge })).resolves.toBe(
      EXIT_SUCCESS
    );
    await expect(
      runCli(['task', 'update', 'task_1', '--status', 'done'], { ...io.options, bridge })
    ).resolves.toBe(EXIT_SUCCESS);
    await expect(
      runCli(['task', 'propose', '--title', 'New task', '--project', 'project_1'], {
        ...io.options,
        bridge
      })
    ).resolves.toBe(EXIT_SUCCESS);
    await expect(runCli(['project', 'graph'], { ...io.options, bridge })).resolves.toBe(
      EXIT_SUCCESS
    );

    expect(bridge.calls.map((call) => call.method)).toEqual([
      'search',
      'cat',
      'task.update',
      'task.propose',
      'project.graph'
    ]);
  });

  it('returns unavailable for memory MCP equivalents without a backend', async () => {
    const io = capture();
    await expect(runCli(['memory', 'search', 'foo'], io.options)).resolves.toBe(
      EXIT_BUSINESS_ERROR
    );
    expect(io.stderr.join('')).toContain('no memory backend');
  });
});
