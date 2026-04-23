import { spawn } from 'node:child_process';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  PROJECT_AGENT_DIR,
  PROJECT_CONFIG,
  PROJECT_ORBIT_CONFIG,
  PROJECT_ORBIT_DIR
} from '@shared/constants';
import { normalizeProjectConfig, type ProjectConfig } from './project_config';

export interface ProjectLifecycleContext {
  projectPath: string;
  vaultPath?: string;
  projectUid?: string;
  worktreeId?: string;
  cwd?: string;
}

export interface ProjectLifecycleConfig {
  setup: string[];
  teardown: string[];
}

export async function readProjectLifecycleConfig(
  projectPath: string
): Promise<ProjectLifecycleConfig> {
  const candidates = [
    path.join(projectPath, PROJECT_ORBIT_DIR, PROJECT_ORBIT_CONFIG),
    path.join(projectPath, PROJECT_AGENT_DIR, PROJECT_CONFIG)
  ];
  for (const file of candidates) {
    try {
      const raw = await fs.readFile(file, 'utf8');
      const parsed = normalizeProjectConfig(JSON.parse(raw)) as ProjectConfig;
      return {
        setup: Array.isArray(parsed.setup) ? parsed.setup.filter(isString) : [],
        teardown: Array.isArray(parsed.teardown) ? parsed.teardown.filter(isString) : []
      };
    } catch {
      // try next candidate
    }
  }
  return { setup: [], teardown: [] };
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildEnv(ctx: ProjectLifecycleContext): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ORBIT_PROJECT_PATH: ctx.projectPath,
    ORBIT_VAULT_PATH: ctx.vaultPath ?? '',
    ORBIT_PROJECT_UID: ctx.projectUid ?? '',
    ORBIT_WORKTREE_ID: ctx.worktreeId ?? ''
  };
}

async function runCommand(command: string, ctx: ProjectLifecycleContext): Promise<void> {
  const cwd = ctx.cwd ?? ctx.projectPath;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.env.SHELL || '/bin/zsh', ['-lc', command], {
      cwd,
      env: buildEnv(ctx),
      stdio: 'ignore'
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`lifecycle command failed (${code}): ${command}`));
    });
  });
}

export async function runProjectLifecycle(
  phase: 'setup' | 'teardown',
  ctx: ProjectLifecycleContext
): Promise<void> {
  const config = await readProjectLifecycleConfig(ctx.projectPath);
  const commands = phase === 'setup' ? config.setup : config.teardown;
  for (const command of commands) {
    await runCommand(command, ctx);
  }
}
