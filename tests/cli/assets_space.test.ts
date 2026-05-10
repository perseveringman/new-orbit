import { describe, expect, it } from 'vitest';
import { EXIT_SUCCESS } from '../../src/cli/errors';
import { runCli } from '../../src/cli/runner';
import { capture, RecordingBridge } from './helpers';

describe('CLI assets and space commands', () => {
  it('maps space context to the unified context bridge method', async () => {
    const io = capture();
    const bridge = new RecordingBridge({
      'space.context': {
        space: { type: 'project', slug: 'demo', name: 'Demo', status: 'active' },
        tasks: {},
        materials: { scopes: [], pins: [] },
        outputs: []
      }
    });

    await expect(
      runCli(['space', 'context', 'demo', '--summary', '--section', 'tasks,materials'], {
        ...io.options,
        bridge
      })
    ).resolves.toBe(EXIT_SUCCESS);

    expect(bridge.calls).toEqual([
      { method: 'space.context', params: { id: 'demo', summary: true, sections: ['tasks', 'materials'] } }
    ]);
  });

  it('requires explicit confirmation before adding an asset scope', async () => {
    const io = capture();
    const bridge = new RecordingBridge();

    await runCli(['assets', 'add-scope', '/tmp/demo', '--project', 'demo', '--kind', 'folder'], {
      ...io.options,
      bridge
    });

    expect(bridge.calls).toEqual([]);
    expect(io.stderr.join('')).toContain('requires --confirm');
  });

  it('maps asset list and add-scope to bridge methods', async () => {
    const io = capture();
    const bridge = new RecordingBridge({
      'assets.manifest.get': { scopes: [], pins: [] },
      'assets.scope.add': { id: 'footage' }
    });

    await expect(
      runCli(['assets', 'list', '--project', 'demo'], { ...io.options, bridge })
    ).resolves.toBe(EXIT_SUCCESS);
    await expect(
      runCli(
        ['assets', 'add-scope', '/tmp/footage', '--project', 'demo', '--kind', 'folder', '--title', 'Footage', '--confirm'],
        { ...io.options, bridge }
      )
    ).resolves.toBe(EXIT_SUCCESS);

    expect(bridge.calls).toEqual([
      { method: 'assets.manifest.get', params: { project: 'demo' } },
      {
        method: 'assets.scope.add',
        params: {
          project: 'demo',
          source: '/tmp/footage',
          tags: [],
          kind: 'folder',
          title: 'Footage'
        }
      }
    ]);
  });
});

