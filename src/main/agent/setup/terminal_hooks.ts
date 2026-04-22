import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import {
  mergeClaudeHooks,
  renderTerminalNotifyShTemplate
} from '../hooks/template';

export interface InstallTerminalAgentHooksArgs {
  vaultPath: string;
  hookPort: number;
  homeDir?: string;
}

export interface InstallTerminalAgentHooksResult {
  notifyScriptPath: string;
}

export async function installTerminalAgentHooks(
  args: InstallTerminalAgentHooksArgs
): Promise<InstallTerminalAgentHooksResult> {
  void args.hookPort;
  const homeDir = args.homeDir ?? os.homedir();
  const hookDir = path.join(args.vaultPath, ORBIT_DIR, 'hooks');
  const notifyScriptPath = path.join(hookDir, 'notify.sh');
  await fs.mkdir(hookDir, { recursive: true });
  await fs.writeFile(notifyScriptPath, renderTerminalNotifyShTemplate(), 'utf8');
  await fs.chmod(notifyScriptPath, 0o700);

  const claudeDir = path.join(homeDir, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  await fs.mkdir(claudeDir, { recursive: true });

  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as Record<string, unknown>;
  } catch {
    existing = {};
  }

  const merged = mergeClaudeHooks(existing, notifyScriptPath);
  await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  return { notifyScriptPath };
}
