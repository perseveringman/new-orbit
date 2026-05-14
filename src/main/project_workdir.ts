import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import type {
  ProjectExecutionContext,
  ProjectExecutionContextConfig,
  ProjectGitInfo
} from './project_config';
import { getTemplate, renderTemplate } from './templates';

export interface ProjectWorkdirProbe {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  git?: ProjectGitInfo;
  markers: string[];
  hasCodeMarkers: boolean;
  recommendedExecutionContext: ProjectExecutionContext;
}

const CODE_MARKERS = [
  'package.json',
  'Cargo.toml',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'Makefile',
  'deno.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  'tsconfig.json'
];

export function resolveProjectWorkdir(projectDir: string, config?: { workdir?: { path: string } } | null): string {
  return config?.workdir?.path ? path.resolve(config.workdir.path) : projectDir;
}

export function projectWorktreeRoot(args: {
  vaultPath: string;
  projectDir: string;
  slug: string;
  uid: string;
  workdir: string;
  executionContext: ProjectExecutionContextConfig;
}): string {
  if (args.executionContext.worktree_root === 'vault') {
    return path.join(args.vaultPath, '.orbit', 'worktrees', args.uid);
  }
  return path.join(
    path.dirname(path.resolve(args.workdir)),
    args.executionContext.worktree_dir_name,
    args.slug
  );
}

export async function probeProjectWorkdir(workdirPath: string): Promise<ProjectWorkdirProbe> {
  const abs = path.resolve(workdirPath);
  let isDirectory = false;
  try {
    isDirectory = (await fs.stat(abs)).isDirectory();
  } catch {
    return {
      path: abs,
      exists: false,
      isDirectory: false,
      markers: [],
      hasCodeMarkers: false,
      recommendedExecutionContext: 'direct'
    };
  }

  const markers = await detectMarkers(abs);
  const git = isDirectory ? await detectGitInfo(abs) : undefined;
  return {
    path: abs,
    exists: true,
    isDirectory,
    ...(git ? { git } : {}),
    markers,
    hasCodeMarkers: markers.length > 0,
    recommendedExecutionContext: git?.is_repo ? 'worktree' : 'direct'
  };
}

export async function scaffoldWorkdirFromTemplate(args: {
  targetDir: string;
  templateId: string;
  vars: Record<string, string>;
  initializeGit?: boolean;
}): Promise<{ files: string[]; git?: ProjectGitInfo }> {
  const tpl = getTemplate(args.templateId);
  if (!tpl) throw new Error(`unknown template: ${args.templateId}`);
  try {
    await fs.access(args.targetDir);
    throw new Error(`target already exists: ${args.targetDir}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await fs.mkdir(args.targetDir, { recursive: true });
  const written: string[] = [];
  for (const [rel, raw] of Object.entries(tpl.files)) {
    if (isOrbitOnlyTemplateFile(rel)) continue;
    const abs = path.join(args.targetDir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, raw ? renderTemplate(raw, args.vars) : raw, 'utf8');
    written.push(rel);
  }
  let git: ProjectGitInfo | undefined;
  if (args.initializeGit) {
    const g = simpleGit(args.targetDir);
    await g.init();
    await g.addConfig('user.name', 'Orbit', false, 'local').catch(() => undefined);
    await g.addConfig('user.email', 'orbit@localhost', false, 'local').catch(() => undefined);
    await g.add('.');
    await g.commit(`orbit: scaffold ${path.basename(args.targetDir)}`).catch(() => undefined);
    git = await detectGitInfo(args.targetDir);
  }
  return { files: written, ...(git ? { git } : {}) };
}

export async function ensureWorkdirGitignore(workdir: string, patterns: string[]): Promise<void> {
  const gitignore = path.join(workdir, '.gitignore');
  let current = '';
  try {
    current = await fs.readFile(gitignore, 'utf8');
  } catch {
    current = '';
  }
  const lines = current.split(/\r?\n/);
  let changed = false;
  for (const pattern of patterns) {
    if (!lines.includes(pattern)) {
      lines.push(pattern);
      changed = true;
    }
  }
  if (changed) {
    await fs.writeFile(gitignore, lines.filter((line, idx) => line || idx < lines.length - 1).join('\n') + '\n', 'utf8');
  }
}

async function detectMarkers(workdir: string): Promise<string[]> {
  const found: string[] = [];
  for (const marker of CODE_MARKERS) {
    try {
      await fs.access(path.join(workdir, marker));
      found.push(marker);
    } catch {
      // absent
    }
  }
  return found;
}

async function detectGitInfo(workdir: string): Promise<ProjectGitInfo | undefined> {
  const git = simpleGit(workdir);
  try {
    const isRepo = await git.checkIsRepo();
    if (!isRepo) return undefined;
    const info: ProjectGitInfo = { is_repo: true };
    const root = (await git.raw(['rev-parse', '--show-toplevel']).catch(() => '')).trim();
    if (root) info.root_path = root;
    const branch = (await git.raw(['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => '')).trim();
    if (branch) info.default_branch = branch;
    const remote = (await git.raw(['remote', 'get-url', 'origin']).catch(() => '')).trim();
    if (remote) info.remote_origin = remote;
    return info;
  } catch {
    return undefined;
  }
}

function isOrbitOnlyTemplateFile(relPath: string): boolean {
  return (
    relPath === 'AGENT.md' ||
    relPath === 'CLAUDE.md' ||
    relPath === 'CODEX.md' ||
    relPath === 'GEMINI.md' ||
    relPath.startsWith('.orbit/') ||
    relPath.startsWith('.agent/')
  );
}
