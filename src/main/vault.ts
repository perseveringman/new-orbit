import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import {
  AGENT_MD_TEMPLATE,
  ORBIT_CONFIG,
  ORBIT_COST_DIR,
  ORBIT_DIR,
  ORBIT_LOGS_DIR,
  ORBIT_REFMAP,
  ORBIT_TRASH_DIR,
  ORBIT_WORKTREES_DIR,
  PARA_DIRS
} from '@shared/constants';
import type { VaultConfig, VaultInfo } from '@shared/types';
import { scaffoldVisionArea } from './area';
import { ensureVision } from './vision';

const ORBIT_VERSION = '0.1.0';

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function isVault(dir: string): Promise<boolean> {
  return exists(path.join(dir, ORBIT_DIR, ORBIT_CONFIG));
}

export async function createVault(dir: string): Promise<VaultInfo> {
  await fs.mkdir(dir, { recursive: true });

  for (const p of PARA_DIRS) {
    await fs.mkdir(path.join(dir, p), { recursive: true });
    // Obsidian-friendly: keep empty dirs visible via a placeholder
    const keep = path.join(dir, p, '.gitkeep');
    if (!(await exists(keep))) await fs.writeFile(keep, '');
  }

  const agentPath = path.join(dir, 'AGENT.md');
  if (!(await exists(agentPath))) {
    await fs.writeFile(agentPath, AGENT_MD_TEMPLATE, 'utf8');
  }

  // R2: Vision Area is auto-scaffolded at vault creation; provides the user's
  // North Star AGENTS.md, interview questions, and vision template.
  await scaffoldVisionArea(dir);
  await ensureVision(dir);

  const orbitDir = path.join(dir, ORBIT_DIR);
  await fs.mkdir(orbitDir, { recursive: true });
  await fs.mkdir(path.join(orbitDir, ORBIT_LOGS_DIR), { recursive: true });
  await fs.mkdir(path.join(orbitDir, ORBIT_COST_DIR), { recursive: true });

  const cfgPath = path.join(orbitDir, ORBIT_CONFIG);
  const createdAt = new Date().toISOString();
  const name = path.basename(dir);
  const cfg: VaultConfig = { version: ORBIT_VERSION, createdAt, name };
  if (!(await exists(cfgPath))) {
    await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
  }

  const refmapPath = path.join(orbitDir, ORBIT_REFMAP);
  if (!(await exists(refmapPath))) {
    await fs.writeFile(refmapPath, '{}\n', 'utf8');
  }

  const gitignore = path.join(dir, '.gitignore');
  if (!(await exists(gitignore))) {
    const lines = [
      `${ORBIT_DIR}/${ORBIT_LOGS_DIR}/`,
      `${ORBIT_DIR}/${ORBIT_COST_DIR}/`,
      `${ORBIT_DIR}/${ORBIT_WORKTREES_DIR}/`,
      `${ORBIT_DIR}/${ORBIT_TRASH_DIR}/`,
      // Per-project git repos live under 01_Projects/<slug>/.git — keep
      // them out of the outer vault repo so they aren't treated as submodules.
      '01_Projects/*/.git'
    ];
    await fs.writeFile(gitignore, `${lines.join('\n')}\n`, 'utf8');
  } else {
    // Ensure the per-project .git ignore line is present even on existing
    // vaults (R1 upgrade path). Runs on every createVault re-invocation but
    // is idempotent.
    const existing = await fs.readFile(gitignore, 'utf8');
    if (!/^01_Projects\/\*\/\.git\s*$/m.test(existing)) {
      const patched =
        (existing.endsWith('\n') ? existing : existing + '\n') + '01_Projects/*/.git\n';
      await fs.writeFile(gitignore, patched, 'utf8');
    }
  }

  const git = simpleGit(dir);
  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) {
    await git.init();
    await git.addConfig('user.name', 'Orbit', false, 'local').catch(() => undefined);
    await git.addConfig('user.email', 'orbit@localhost', false, 'local').catch(() => undefined);
    await git.add('.');
    await git.commit('orbit: initial vault').catch(() => undefined);
  }

  return { path: dir, name, createdAt, orbitVersion: ORBIT_VERSION };
}

export async function openVault(dir: string): Promise<VaultInfo> {
  const cfgPath = path.join(dir, ORBIT_DIR, ORBIT_CONFIG);
  const raw = await fs.readFile(cfgPath, 'utf8');
  const cfg = JSON.parse(raw) as VaultConfig;
  return {
    path: dir,
    name: cfg.name ?? path.basename(dir),
    createdAt: cfg.createdAt,
    orbitVersion: cfg.version
  };
}

export async function openOrCreateVault(dir: string): Promise<VaultInfo> {
  if (await isVault(dir)) return openVault(dir);
  return createVault(dir);
}
