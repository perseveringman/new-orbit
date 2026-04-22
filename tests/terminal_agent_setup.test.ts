import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installTerminalAgentHooks } from '../src/main/agent/setup/terminal_hooks';

describe('installTerminalAgentHooks', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-terminal-hooks-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('writes a vault-scoped notify.sh and merges managed Claude hooks into the user home config', async () => {
    const vaultPath = path.join(root, 'vault');
    const homeDir = path.join(root, 'home');
    await fs.mkdir(path.join(vaultPath, '.orbit'), { recursive: true });
    await fs.mkdir(path.join(homeDir, '.claude'), { recursive: true });
    await fs.writeFile(
      path.join(homeDir, '.claude', 'settings.json'),
      JSON.stringify(
        {
          theme: 'dark',
          hooks: {
            Stop: [
              {
                hooks: [{ type: 'command', command: '/tmp/user-stop.sh' }]
              }
            ]
          }
        },
        null,
        2
      ),
      'utf8'
    );

    const result = await installTerminalAgentHooks({
      vaultPath,
      homeDir,
      hookPort: 43123
    });

    expect(result.notifyScriptPath).toBe(path.join(vaultPath, '.orbit', 'hooks', 'notify.sh'));
    const script = await fs.readFile(result.notifyScriptPath, 'utf8');
    expect(script).toContain('/hook/event?eventType=');

    const settings = JSON.parse(
      await fs.readFile(path.join(homeDir, '.claude', 'settings.json'), 'utf8')
    ) as {
      theme: string;
      hooks: Record<string, unknown[]>;
    };
    expect(settings.theme).toBe('dark');
    expect(JSON.stringify(settings.hooks.Stop)).toContain('/tmp/user-stop.sh');
    expect(JSON.stringify(settings.hooks.UserPromptSubmit)).toContain(result.notifyScriptPath);
  });
});
