import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { GitHubRepoBinding } from '@shared/github';
import {
  ARCHIVES_DIR,
  PROJECTS_DIR,
  PROJECT_AGENT_DIR,
  PROJECT_ORBIT_AGENT_DIR,
  PROJECT_ORBIT_CONFIG,
  PROJECT_ORBIT_DIR,
  PROJECT_ORBIT_MEMORIES_DIR,
  PROJECT_README,
  PROJECT_ORBIT_TASKS_DIR,
  PROJECT_TASKS_DIR,
  SPACE_ASSETS_DIR,
  SPACE_OUTPUTS_DIR
} from '@shared/constants';
import { newUid } from './uid';
import * as frontmatter from './frontmatter';
import { assertInsideVault, toPosix, vaultRel } from './pathGuard';
import { renderTaskMarkdown, scaffoldProject } from './templates';
import { ensureProjectAgentContext } from './project_agent_context';
import { walkMarkdown } from './walk';
import {
  defaultAgentExposureSettings,
  projectExecutionContextKind,
  readProjectConfig,
  writeProjectConfig,
  type AgentExposureSettings,
  type ProjectConfig,
  type ProjectExecutionContext,
  type ProjectExecutionContextConfig,
  type ProjectGitInfo,
  type ProjectLinkedVia,
  type ProjectWorkdirRef
} from './project_config';
import { findAreaByUid } from './area';
import { ensureSpaceLayout } from './space/layout';
import { createResourceStore } from './resource/store';
import {
  probeProjectWorkdir,
  resolveProjectWorkdir,
  scaffoldWorkdirFromTemplate
} from './project_workdir';

export interface ProjectSummary {
  uid: string;
  slug: string;
  name: string;
  description?: string;
  status: string;
  tags?: string[];
  created_at?: string;
  archived_at?: string;
  template?: string;
  area_uid?: string;
  area_slugs?: string[];
  /** Absolute path to the vault coordination folder (or legacy .md file). */
  path: string;
  /** Absolute path to the vault coordination folder. */
  coordinationPath: string;
  /** Absolute path to the linked work directory agents operate on. */
  workdirPath: string;
  workdirMissing?: boolean;
  /** Absolute path to README.md (folder mode) or the .md file (legacy). */
  readmePath: string;
  /** Vault-relative POSIX path to the project folder or legacy file. */
  relPath: string;
  /** Folder-mode projects have a `.agent/config.json`; legacy ones don't. */
  legacy: boolean;
  github?: GitHubRepoBinding;
  git?: ProjectGitInfo;
  workdir?: ProjectWorkdirRef;
  execution_context?: ProjectExecutionContext;
  vendor_bridge_files?: boolean;
}

export interface CreateProjectArgs {
  slug: string;
  template: string;
  name: string;
  description?: string;
  uid?: string;
  area_uid?: string;
  tags?: string[];
  agent_exposure?: Partial<AgentExposureSettings>;
}

export interface LinkExistingProjectArgs {
  slug: string;
  name: string;
  workdirPath: string;
  description?: string;
  uid?: string;
  area_uid?: string;
  tags?: string[];
  execution_context?: ProjectExecutionContext;
  vendor_bridge_files?: boolean;
}

export interface ScaffoldNewProjectArgs {
  slug: string;
  name: string;
  parentDir: string;
  dirName?: string;
  template: string;
  description?: string;
  uid?: string;
  area_uid?: string;
  tags?: string[];
  initializeGit?: boolean;
  execution_context?: ProjectExecutionContext;
  vendor_bridge_files?: boolean;
}

export interface RelinkProjectWorkdirArgs {
  uid: string;
  workdirPath: string;
  execution_context?: ProjectExecutionContext;
  vendor_bridge_files?: boolean;
}

export interface MigrateProjectWorkdirArgs {
  uid: string;
  targetDir: string;
  removeCopiedFiles?: boolean;
  initializeGit?: boolean;
  execution_context?: ProjectExecutionContext;
}

export interface CreateProjectResult {
  projectPath: string;
  relPath: string;
  uid: string;
  slug: string;
}

export interface ProjectWorkdirMutationResult extends CreateProjectResult {
  workdirPath: string;
  copiedFiles?: string[];
  removedFiles?: string[];
  skippedFiles?: string[];
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export function assertValidSlug(slug: string): void {
  if (!SLUG_RE.test(slug) || slug.length > 64 || slug.includes('--')) {
    throw new Error(
      `invalid slug "${slug}": must be kebab-case lowercase ASCII, 1-64 chars, no leading/trailing/consecutive '-'`
    );
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function projectDir(vault: string, slug: string): string {
  return path.join(vault, PROJECTS_DIR, slug);
}

export function projectConfigPath(vault: string, slug: string): string {
  return path.join(projectDir(vault, slug), PROJECT_ORBIT_DIR, PROJECT_ORBIT_CONFIG);
}

export function defaultExecutionContextForTemplate(template: string): ProjectExecutionContext {
  return template === 'research' || template === 'writing' ? 'sandbox' : 'worktree';
}

export function defaultExecutionContextConfig(
  kind: ProjectExecutionContext
): ProjectExecutionContextConfig {
  return {
    kind,
    worktree_root: 'workdir-sibling',
    worktree_dir_name: '.orbit-worktrees'
  };
}

async function initProjectGitRepo(dir: string, slug: string): Promise<void> {
  // `checkIsRepo()` walks up, so a project nested under a vault-level repo is
  // reported as already being inside a repo. Guard against that by checking
  // for a *local* .git directory instead.
  let hasLocalGit = false;
  try {
    const st = await fs.stat(path.join(dir, '.git'));
    hasLocalGit = st.isDirectory();
  } catch {
    hasLocalGit = false;
  }
  if (!hasLocalGit) {
    const git = simpleGit(dir);
    await git.init();
    await git.addConfig('user.name', 'Orbit', false, 'local').catch(() => undefined);
    await git
      .addConfig('user.email', 'orbit@localhost', false, 'local')
      .catch(() => undefined);
    await git.add('.');
    await git.commit(`orbit: init project ${slug}`).catch(() => undefined);
  }
}

/**
 * Create a new project folder under `01_Projects/<slug>/` using the requested
 * template. Initializes a dedicated git repo and returns the final uid + abs
 * path. Idempotent in the sense that it rejects when the target already
 * exists — callers must archive/delete first.
 */
export async function createProject(
  vault: string,
  args: CreateProjectArgs
): Promise<CreateProjectResult> {
  assertValidSlug(args.slug);
  const dir = projectDir(vault, args.slug);
  assertInsideVault(vault, dir);
  if (await exists(dir)) {
    throw new Error(`project already exists: ${args.slug}`);
  }
  const uid = args.uid ?? newUid();
  const createdAt = new Date().toISOString();
  const executionContext = defaultExecutionContextForTemplate(args.template);
  const vars: Record<string, string> = {
    uid,
    slug: args.slug,
    name: args.name,
    description: args.description ?? '',
    created_at: createdAt,
    template: args.template,
    vision_ref: '[[Vision]]',
    execution_context: executionContext
  };
  await scaffoldProject(dir, args.template, vars);
  await ensureSpaceLayout(dir);
  await writeProjectConfig(dir, {
    uid,
    slug: args.slug,
    name: args.name,
    type: 'project',
    template: args.template,
    workdir: {
      path: dir,
      kind: 'local',
      linked_at: createdAt,
      linked_via: 'legacy-in-vault',
      permissions: {
        agent_write: true,
        auto_runner: true
      }
    },
    execution_context: defaultExecutionContextConfig(executionContext),
    created_at: createdAt,
    vision_linked: true,
    setup: [],
    teardown: [],
    vendor_bridge_files: args.agent_exposure?.mode !== 'isolated',
    watcher: {
      enabled: true,
      extra_ignores: []
    },
    agent_exposure: {
      ...defaultAgentExposureSettings(args.agent_exposure?.mode),
      ...(args.agent_exposure ?? {})
    }
  });
  await ensureProjectAgentContext(dir, {
    uid,
    slug: args.slug,
    name: args.name,
    template: args.template,
    ...(args.description ? { description: args.description } : {})
  });

  // Patch README frontmatter with optional area_uid / tags if supplied.
  if (args.area_uid || (args.tags && args.tags.length > 0)) {
    const readmeAbs = path.join(dir, PROJECT_README);
    const raw = await fs.readFile(readmeAbs, 'utf8');
    const patch: Record<string, unknown> = {};
    if (args.area_uid) patch['area_uid'] = args.area_uid;
    if (args.tags && args.tags.length > 0) patch['tags'] = args.tags;
    const upd = frontmatter.update(raw, patch);
    if (upd.changed) await fs.writeFile(readmeAbs, upd.content, 'utf8');
  }

  await initProjectGitRepo(dir, args.slug);
  const detected = await probeProjectWorkdir(dir);
  const config = await readProjectConfig(dir);
  if (config) {
    await writeProjectConfig(dir, {
      ...config,
      git: detected.git,
      github: detected.git?.github_binding
    });
  }

  return {
    projectPath: dir,
    relPath: toPosix(vaultRel(vault, dir)),
    uid,
    slug: args.slug
  };
}

export async function linkExistingProject(
  vault: string,
  args: LinkExistingProjectArgs
): Promise<CreateProjectResult> {
  assertValidSlug(args.slug);
  const workdirProbe = await probeProjectWorkdir(args.workdirPath);
  if (!workdirProbe.exists || !workdirProbe.isDirectory) {
    throw new Error(`workdir is not a readable directory: ${args.workdirPath}`);
  }
  const dir = projectDir(vault, args.slug);
  assertInsideVault(vault, dir);
  if (await exists(dir)) throw new Error(`project already exists: ${args.slug}`);

  const uid = args.uid ?? newUid();
  const createdAt = new Date().toISOString();
  await createCoordinationProject(dir, {
    uid,
    slug: args.slug,
    name: args.name,
    description: args.description,
    template: 'linked-workdir',
    createdAt,
    area_uid: args.area_uid,
    tags: args.tags,
    workdirPath: workdirProbe.path,
    git: workdirProbe.git,
    executionContext:
      args.execution_context ?? workdirProbe.recommendedExecutionContext,
    vendorBridgeFiles: args.vendor_bridge_files ?? false,
    linkedVia: 'link-existing'
  });

  return {
    projectPath: dir,
    relPath: toPosix(vaultRel(vault, dir)),
    uid,
    slug: args.slug
  };
}

export async function scaffoldNewProject(
  vault: string,
  args: ScaffoldNewProjectArgs
): Promise<CreateProjectResult> {
  assertValidSlug(args.slug);
  const dirName = args.dirName?.trim() || args.slug;
  if (dirName.includes('/') || dirName.includes('\\') || dirName.includes('..')) {
    throw new Error(`invalid workdir name: ${dirName}`);
  }
  const workdirPath = path.resolve(args.parentDir, dirName);
  const coordDir = projectDir(vault, args.slug);
  assertInsideVault(vault, coordDir);
  if (await exists(coordDir)) throw new Error(`project already exists: ${args.slug}`);
  const uid = args.uid ?? newUid();
  const createdAt = new Date().toISOString();
  const vars: Record<string, string> = {
    uid,
    slug: args.slug,
    name: args.name,
    description: args.description ?? '',
    created_at: createdAt,
    template: args.template,
    vision_ref: '[[Vision]]',
    execution_context:
      args.execution_context ?? defaultExecutionContextForTemplate(args.template)
  };
  const scaffolded = await scaffoldWorkdirFromTemplate({
    targetDir: workdirPath,
    templateId: args.template,
    vars,
    initializeGit: args.initializeGit ?? true
  });
  const probe = await probeProjectWorkdir(workdirPath);
  await createCoordinationProject(coordDir, {
    uid,
    slug: args.slug,
    name: args.name,
    description: args.description,
    template: args.template,
    createdAt,
    area_uid: args.area_uid,
    tags: args.tags,
    workdirPath,
    git: probe.git ?? scaffolded.git,
    executionContext:
      args.execution_context ??
      probe.recommendedExecutionContext ??
      defaultExecutionContextForTemplate(args.template),
    vendorBridgeFiles: args.vendor_bridge_files ?? false,
    linkedVia: 'scaffold-new'
  });
  return {
    projectPath: coordDir,
    relPath: toPosix(vaultRel(vault, coordDir)),
    uid,
    slug: args.slug
  };
}

export async function relinkProjectWorkdir(
  vault: string,
  args: RelinkProjectWorkdirArgs
): Promise<ProjectWorkdirMutationResult> {
  const project = await requireFolderProjectByUid(vault, args.uid);
  const probe = await probeProjectWorkdir(args.workdirPath);
  if (!probe.exists || !probe.isDirectory) {
    throw new Error(`workdir is not a readable directory: ${args.workdirPath}`);
  }
  const config = await requireProjectConfig(project.coordinationPath);
  const executionContext =
    args.execution_context ?? probe.recommendedExecutionContext ?? projectExecutionContextKind(config);
  await updateProjectWorkdirConfig(project.coordinationPath, config, {
    workdirPath: probe.path,
    linkedVia: 'link-existing',
    git: probe.git,
    executionContext,
    vendorBridgeFiles: args.vendor_bridge_files
  });
  await rewriteReadmeWorkdirSection(project.coordinationPath, {
    workdirPath: probe.path,
    git: probe.git,
    linkedVia: 'link-existing'
  });
  await refreshProjectAgentContext(project.coordinationPath, config, {
    workdirPath: probe.path,
    template: project.template
  });
  return {
    projectPath: project.coordinationPath,
    relPath: project.relPath,
    uid: project.uid,
    slug: project.slug,
    workdirPath: probe.path
  };
}

export async function migrateProjectWorkdir(
  vault: string,
  args: MigrateProjectWorkdirArgs
): Promise<ProjectWorkdirMutationResult> {
  const project = await requireFolderProjectByUid(vault, args.uid);
  const config = await requireProjectConfig(project.coordinationPath);
  const currentWorkdir = path.resolve(project.workdirPath);
  if (
    path.resolve(project.coordinationPath) !== currentWorkdir &&
    config.workdir?.linked_via !== 'legacy-in-vault'
  ) {
    throw new Error(
      `project "${project.slug}" already uses an external workdir; use relink instead`
    );
  }
  const targetDir = path.resolve(args.targetDir);
  if (targetDir === path.resolve(project.coordinationPath) || isInside(targetDir, project.coordinationPath)) {
    throw new Error('migration target must be outside the project coordination folder');
  }
  if (await exists(targetDir)) {
    throw new Error(`migration target already exists: ${targetDir}`);
  }

  let copied: string[] = [];
  let removed: string[] = [];
  let skipped: string[] = [];
  try {
    await fs.mkdir(targetDir, { recursive: true });
    const result = await copyLegacyWorkdirPayload(project.coordinationPath, targetDir, {
      removeCopiedFiles: args.removeCopiedFiles ?? false
    });
    copied = result.copiedFiles;
    removed = result.removedFiles;
    skipped = result.skippedFiles;
    if (args.initializeGit ?? true) {
      await initProjectGitRepo(targetDir, project.slug);
    }
  } catch (error) {
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  const probe = await probeProjectWorkdir(targetDir);
  const executionContext =
    args.execution_context ?? probe.recommendedExecutionContext ?? projectExecutionContextKind(config);
  await updateProjectWorkdirConfig(project.coordinationPath, config, {
    workdirPath: targetDir,
    linkedVia: 'migrated-from-vault',
    git: probe.git,
    executionContext
  });
  await rewriteReadmeWorkdirSection(project.coordinationPath, {
    workdirPath: targetDir,
    git: probe.git,
    linkedVia: 'migrated-from-vault'
  });
  await refreshProjectAgentContext(project.coordinationPath, config, {
    workdirPath: targetDir,
    template: project.template,
    overwrite: true
  });
  return {
    projectPath: project.coordinationPath,
    relPath: project.relPath,
    uid: project.uid,
    slug: project.slug,
    workdirPath: targetDir,
    copiedFiles: copied,
    removedFiles: removed,
    skippedFiles: skipped
  };
}

async function createCoordinationProject(
  dir: string,
  args: {
    uid: string;
    slug: string;
    name: string;
    description?: string;
    template: string;
    createdAt: string;
    area_uid?: string;
    tags?: string[];
    workdirPath: string;
    git?: ProjectGitInfo;
    executionContext: ProjectExecutionContext;
    vendorBridgeFiles: boolean;
    linkedVia: ProjectLinkedVia;
  }
): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await ensureSpaceLayout(dir);
  const readmeAbs = path.join(dir, PROJECT_README);
  const tags = args.tags ?? [];
  const readme = [
    '---',
    `uid: ${args.uid}`,
    'type: project',
    `title: ${JSON.stringify(args.name)}`,
    `slug: ${args.slug}`,
    'status: active',
    `template: ${args.template}`,
    `created_at: ${args.createdAt}`,
    ...(args.area_uid ? [`area_uid: ${args.area_uid}`] : []),
    `tags: ${JSON.stringify(tags)}`,
    '---',
    '',
    `# ${args.name}`,
    '',
    args.description?.trim() ?? '',
    '',
    '## Workdir',
    '',
    `- Path: \`${args.workdirPath}\``,
    args.git?.is_repo ? '- Git: detected' : '- Git: not detected',
    ''
  ].join('\n');
  await fs.writeFile(readmeAbs, readme, 'utf8');
  await writeProjectConfig(dir, {
    uid: args.uid,
    slug: args.slug,
    name: args.name,
    type: 'project',
    template: args.template,
    workdir: {
      path: args.workdirPath,
      kind: 'local',
      linked_at: args.createdAt,
      linked_via: args.linkedVia,
      permissions: {
        agent_write: true,
        auto_runner: args.executionContext === 'worktree'
      }
    },
    ...(args.git ? { git: args.git, github: args.git.github_binding } : {}),
    execution_context: defaultExecutionContextConfig(args.executionContext),
    created_at: args.createdAt,
    vision_linked: true,
    setup: [],
    teardown: [],
    vendor_bridge_files: args.vendorBridgeFiles,
    watcher: {
      enabled: true,
      extra_ignores: []
    },
    agent_exposure: defaultAgentExposureSettings(args.vendorBridgeFiles ? 'bridge' : 'isolated')
  });
  await ensureProjectAgentContext(dir, {
    uid: args.uid,
    slug: args.slug,
    name: args.name,
    template: args.template,
    ...(args.description ? { description: args.description } : {})
  }, { workdirPath: args.workdirPath });
}

async function requireFolderProjectByUid(vault: string, uid: string): Promise<ProjectSummary> {
  const project = (await listProjects(vault)).find((item) => item.uid === uid);
  if (!project) throw new Error(`project not found: ${uid}`);
  if (project.legacy) {
    throw new Error(
      `project "${project.slug}" is a legacy single-file project; run the v3 migration first`
    );
  }
  return project;
}

async function requireProjectConfig(projectDir: string): Promise<ProjectConfig> {
  const config = await readProjectConfig(projectDir);
  if (!config) throw new Error(`project config missing: ${projectDir}`);
  return config;
}

async function updateProjectWorkdirConfig(
  projectDir: string,
  config: ProjectConfig,
  args: {
    workdirPath: string;
    linkedVia: ProjectLinkedVia;
    git?: ProjectGitInfo;
    executionContext: ProjectExecutionContext;
    vendorBridgeFiles?: boolean;
  }
): Promise<ProjectConfig> {
  const existingPermissions = config.workdir?.permissions ?? {
    agent_write: true,
    auto_runner: true
  };
  const next: ProjectConfig = {
    ...config,
    workdir: {
      path: args.workdirPath,
      kind: 'local',
      linked_at: new Date().toISOString(),
      linked_via: args.linkedVia,
      permissions: {
        agent_write: existingPermissions.agent_write,
        auto_runner: args.executionContext === 'worktree'
      }
    },
    execution_context: defaultExecutionContextConfig(args.executionContext),
    vendor_bridge_files: args.vendorBridgeFiles ?? config.vendor_bridge_files
  };
  if (args.git) {
    next.git = args.git;
    if (args.git.github_binding) next.github = args.git.github_binding;
    else delete next.github;
  } else {
    delete next.git;
    delete next.github;
  }
  if (args.vendorBridgeFiles !== undefined) {
    next.agent_exposure = defaultAgentExposureSettings(
      args.vendorBridgeFiles ? 'bridge' : 'isolated'
    );
  }
  await writeProjectConfig(projectDir, next);
  return next;
}

async function refreshProjectAgentContext(
  projectDir: string,
  config: ProjectConfig,
  opts: { workdirPath: string; template?: string; overwrite?: boolean }
): Promise<void> {
  await ensureProjectAgentContext(
    projectDir,
    {
      uid: config.uid,
      slug: config.slug || path.basename(projectDir),
      name: config.name || config.slug || path.basename(projectDir),
      template: opts.template ?? config.template ?? 'blank'
    },
    {
      overwrite: opts.overwrite ?? true,
      workdirPath: opts.workdirPath
    }
  );
}

async function rewriteReadmeWorkdirSection(
  projectDir: string,
  args: { workdirPath: string; git?: ProjectGitInfo; linkedVia: ProjectLinkedVia }
): Promise<void> {
  const readmeAbs = path.join(projectDir, PROJECT_README);
  let raw = '';
  try {
    raw = await fs.readFile(readmeAbs, 'utf8');
  } catch {
    raw = `# ${path.basename(projectDir)}\n`;
  }
  const section = [
    '## Workdir',
    '',
    `- Path: \`${args.workdirPath}\``,
    args.git?.is_repo ? '- Git: detected' : '- Git: not detected',
    `- Linked via: \`${args.linkedVia}\``
  ].join('\n');
  await fs.writeFile(readmeAbs, replaceMarkdownSection(raw, 'Workdir', section), 'utf8');
}

function replaceMarkdownSection(raw: string, title: string, section: string): string {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
  const lines = normalized.split('\n');
  const header = `## ${title}`;
  const start = lines.findIndex((line) => line.trim() === header);
  const sectionLines = section.replace(/\n*$/, '').split('\n');
  if (start === -1) {
    return `${normalized.trimEnd()}\n\n${sectionLines.join('\n')}\n`;
  }
  let end = start + 1;
  while (end < lines.length && !/^##\s+/.test(lines[end] ?? '')) end += 1;
  lines.splice(start, end - start, ...sectionLines);
  return `${lines.join('\n').replace(/\n*$/, '')}\n`;
}

interface LegacyCopyResult {
  copiedFiles: string[];
  removedFiles: string[];
  skippedFiles: string[];
}

async function copyLegacyWorkdirPayload(
  sourceDir: string,
  targetDir: string,
  opts: { removeCopiedFiles: boolean }
): Promise<LegacyCopyResult> {
  const copiedFiles: string[] = [];
  const removedFiles: string[] = [];
  const skippedFiles: string[] = [];

  async function visit(srcDir: string, relDir: string): Promise<void> {
    const entries = await fs.readdir(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = toPosix(path.join(relDir, entry.name));
      const skipReason = legacyMigrationSkipReason(rel);
      if (skipReason) {
        skippedFiles.push(rel);
        continue;
      }
      const src = path.join(srcDir, entry.name);
      const dst = path.join(targetDir, rel);
      if (entry.isDirectory()) {
        await fs.mkdir(dst, { recursive: true });
        await visit(src, rel);
        if (opts.removeCopiedFiles) {
          await fs.rmdir(src).catch(() => undefined);
        }
        continue;
      }
      await fs.mkdir(path.dirname(dst), { recursive: true });
      if (entry.isFile()) {
        await fs.copyFile(src, dst);
      } else if (entry.isSymbolicLink()) {
        await fs.symlink(await fs.readlink(src), dst);
      } else {
        skippedFiles.push(rel);
        continue;
      }
      copiedFiles.push(rel);
      if (opts.removeCopiedFiles) {
        await fs.rm(src, { force: true });
        removedFiles.push(rel);
      }
    }
  }

  await visit(sourceDir, '');
  return {
    copiedFiles: copiedFiles.sort(),
    removedFiles: removedFiles.sort(),
    skippedFiles: skippedFiles.sort()
  };
}

function legacyMigrationSkipReason(relPath: string): string | null {
  const rel = toPosix(relPath);
  const parts = rel.split('/').filter(Boolean);
  const first = parts[0] ?? '';
  if (!first) return null;
  const skipSegments = new Set([
    PROJECT_ORBIT_DIR,
    PROJECT_AGENT_DIR,
    '.git',
    'node_modules',
    'dist',
    'build',
    '.next',
    '.turbo',
    '.cache',
    'coverage'
  ]);
  if (parts.some((part) => skipSegments.has(part))) return 'managed-or-generated';
  const rootOnly = new Set([
    PROJECT_README,
    'AGENT.md',
    'AGENTS.md',
    'CLAUDE.md',
    'CODEX.md',
    'GEMINI.md',
    PROJECT_TASKS_DIR,
    SPACE_ASSETS_DIR,
    SPACE_OUTPUTS_DIR
  ]);
  return rootOnly.has(first) ? 'coordination-only' : null;
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function parseReadmeSummary(
  dir: string,
  vault: string,
  readmeRaw: string,
  config: ProjectConfig | null
): ProjectSummary {
  const { data } = frontmatter.read(readmeRaw);
  const uid =
    config?.uid ||
    (typeof data['uid'] === 'string' ? (data['uid'] as string) : '') ||
    '';
  const slug =
    config?.slug ||
    (typeof data['slug'] === 'string' ? (data['slug'] as string) : '') ||
    path.basename(dir);
  const name =
    (typeof data['title'] === 'string' ? (data['title'] as string) : '') ||
    config?.name ||
    path.basename(dir);
  const status =
    (typeof data['status'] === 'string' ? (data['status'] as string) : '') || 'active';
  const tags = Array.isArray(data['tags'])
    ? (data['tags'] as unknown[]).filter((t): t is string => typeof t === 'string')
    : undefined;
  const summary: ProjectSummary = {
    uid,
    slug,
    name,
    status,
    path: dir,
    coordinationPath: dir,
    workdirPath: resolveProjectWorkdir(dir, config),
    readmePath: path.join(dir, PROJECT_README),
    relPath: toPosix(vaultRel(vault, dir)),
    legacy: false
  };
  if (tags && tags.length) summary.tags = tags;
  if (typeof data['created_at'] === 'string') summary.created_at = data['created_at'];
  if (typeof data['archived_at'] === 'string')
    summary.archived_at = data['archived_at'] as string;
  if (config?.template) summary.template = config.template;
  else if (typeof data['template'] === 'string') summary.template = data['template'] as string;
  if (typeof data['area_uid'] === 'string')
    summary.area_uid = data['area_uid'] as string;
  const areaSlugs = areaSlugsFromFrontmatter(data['areas']);
  if (areaSlugs.length) summary.area_slugs = areaSlugs;
  if (config?.github) summary.github = config.github;
  else if (config?.git?.github_binding) summary.github = config.git.github_binding;
  if (config?.git) summary.git = config.git;
  if (config?.workdir) summary.workdir = config.workdir;
  if (config) {
    summary.execution_context = projectExecutionContextKind(config);
    summary.vendor_bridge_files = config.vendor_bridge_files;
  }
  return summary;
}

/**
 * List every project folder (and legacy single-file project) under
 * `01_Projects/`. Missing README.md files are tolerated — such folders are
 * still returned so the UI can show a repair prompt.
 */
export async function listProjects(vault: string): Promise<ProjectSummary[]> {
  const out: ProjectSummary[] = [];
  const root = path.join(vault, PROJECTS_DIR);
  let entries: Dirent[] = [];
  try {
    entries = (await fs.readdir(root, { withFileTypes: true })) as Dirent[];
  } catch {
    return out;
  }
  for (const e of entries) {
      const abs = path.join(root, e.name);
    if (e.isDirectory()) {
      const config = await readProjectConfig(abs);
      const readmeAbs = path.join(abs, PROJECT_README);
      let readme = '';
      try {
        readme = await fs.readFile(readmeAbs, 'utf8');
      } catch {
        if (!config) continue; // not a project folder
      }
      const summary = parseReadmeSummary(abs, vault, readme, config);
      summary.workdirMissing = !(await exists(summary.workdirPath));
      out.push(summary);
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      try {
        const raw = await fs.readFile(abs, 'utf8');
        const { data } = frontmatter.read(raw);
        if (data['type'] !== 'project') continue;
        const uid = typeof data['uid'] === 'string' ? (data['uid'] as string) : '';
        const name =
          typeof data['title'] === 'string'
            ? (data['title'] as string)
            : path.basename(e.name, '.md');
        const status =
          typeof data['status'] === 'string' ? (data['status'] as string) : 'active';
        const summary: ProjectSummary = {
          uid,
          slug: path.basename(e.name, '.md'),
          name,
          status,
          path: abs,
          coordinationPath: abs,
          workdirPath: abs,
          readmePath: abs,
          relPath: toPosix(vaultRel(vault, abs)),
          legacy: true
        };
        const tags = Array.isArray(data['tags'])
          ? (data['tags'] as unknown[]).filter(
              (t): t is string => typeof t === 'string'
            )
          : undefined;
        if (tags && tags.length) summary.tags = tags;
        const areaSlugs = areaSlugsFromFrontmatter(data['areas']);
        if (areaSlugs.length) summary.area_slugs = areaSlugs;
        out.push(summary);
      } catch {
        // ignore unreadable files
      }
    }
  }
  out.sort((a, b) => a.slug.localeCompare(b.slug));
  return out;
}

export async function resolveProjectReference(
  vault: string,
  reference: string
): Promise<ProjectSummary | null> {
  const raw = reference.trim();
  if (!raw) return null;
  const projects = await listProjects(vault);
  const exact = projects.find((project) => project.uid === raw);
  if (exact) return exact;

  const normalized = normalizeProjectReference(raw);
  return (
    projects.find((project) => {
      const candidates = [
        project.slug,
        project.name,
        project.relPath,
        project.path,
        path.basename(project.path),
        path.basename(project.relPath)
      ];
      return candidates.some((candidate) => normalizeProjectReference(candidate) === normalized);
    }) ?? null
  );
}

function normalizeProjectReference(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/g, '')
    .replace(/^\.\//, '')
    .toLowerCase();
}

function areaSlugsFromFrontmatter(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .flatMap((item): string[] => {
          if (typeof item === 'string') return [item];
          if (item && typeof item === 'object' && typeof (item as Record<string, unknown>)['area_slug'] === 'string') {
            return [(item as Record<string, string>)['area_slug']];
          }
          return [];
        })
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}

async function moveDir(src: string, dst: string): Promise<void> {
  await fs.mkdir(path.dirname(dst), { recursive: true });
  try {
    await fs.rename(src, dst);
  } catch (err) {
    // Cross-device fallback: recursive copy + remove.
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    await fs.cp(src, dst, { recursive: true });
    await fs.rm(src, { recursive: true, force: true });
  }
}

/**
 * Move the whole project folder to `04_Archives/YYYY/<slug>/`, rewriting the
 * README frontmatter to mark it as archived. Uid is preserved. The per-project
 * git repo is carried with the directory so history stays intact.
 */
export async function archiveProjectByUid(
  vault: string,
  uid: string
): Promise<{
  oldPath: string;
  newPath: string;
  uid: string;
  slug: string;
  archivedAt: string;
}> {
  const projects = await listProjects(vault);
  const match = projects.find((p) => p.uid === uid);
  if (!match) throw new Error(`project not found: ${uid}`);
  if (match.legacy) {
    throw new Error(
      `project "${match.slug}" is a legacy single-file project; run the v3 migration first`
    );
  }
  const archivedAt = new Date().toISOString();
  const year = archivedAt.slice(0, 4);
  const targetDir = path.join(vault, ARCHIVES_DIR, year, match.slug);
  assertInsideVault(vault, targetDir);
  if (await exists(targetDir)) {
    throw new Error(`archive target already exists: ${targetDir}`);
  }
  // Rewrite README frontmatter before the move so the on-disk marker is
  // in place even if the move fails partway (file rename is atomic on same
  // device but we prefer to fail with an accurate status marker).
  const readmeAbs = path.join(match.path, PROJECT_README);
  try {
    const raw = await fs.readFile(readmeAbs, 'utf8');
    const upd = frontmatter.update(raw, {
      status: 'archived',
      archived_at: archivedAt,
      original_type: 'project'
    });
    if (upd.changed) await fs.writeFile(readmeAbs, upd.content, 'utf8');
  } catch {
    // README missing — tolerate; archive still proceeds
  }
  await moveDir(match.path, targetDir);
  return {
    oldPath: match.path,
    newPath: targetDir,
    uid: match.uid,
    slug: match.slug,
    archivedAt
  };
}

/** Enumerate task markdown files stored under a project's task directories. */
export async function listProjectTaskPaths(projectDir: string): Promise<string[]> {
  const taskDirs = [
    path.join(projectDir, PROJECT_ORBIT_DIR, PROJECT_ORBIT_AGENT_DIR, PROJECT_ORBIT_TASKS_DIR),
    path.join(projectDir, PROJECT_AGENT_DIR, PROJECT_TASKS_DIR)
  ];
  const out = new Set<string>();
  for (const tasksDir of taskDirs) {
    try {
      for await (const abs of walkMarkdown(tasksDir)) out.add(abs);
    } catch {
      // no tasks dir
    }
  }
  return Array.from(out).sort();
}

export interface CreateTaskArgs {
  project_uid?: string;
  area_uid?: string;
  resource_uid?: string;
  title: string;
  description?: string;
  uid?: string;
  /** Extra frontmatter to merge after skeleton is rendered (priority, due, tags, pre_conditions…). */
  frontmatter?: Record<string, unknown>;
}

export interface CreateTaskResult {
  taskPath: string;
  relPath: string;
  uid: string;
}

function datePrefix(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}${m}${day}`;
}

function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'task';
}

export async function createTask(
  vault: string,
  args: CreateTaskArgs
): Promise<CreateTaskResult> {
  const ownerCount = [args.project_uid, args.area_uid, args.resource_uid].filter(Boolean).length;
  if (ownerCount === 0) {
    throw new Error('task owner missing: provide project_uid, area_uid, or resource_uid');
  }
  if (ownerCount > 1) {
    throw new Error('task owner ambiguous: provide only one of project_uid, area_uid, or resource_uid');
  }

  let tasksDir = '';
  if (args.project_uid) {
    const projects = await listProjects(vault);
    const target = projects.find((p) => p.uid === args.project_uid);
    if (!target) throw new Error(`project_uid not found: ${args.project_uid}`);
    if (target.legacy) {
      throw new Error(
        `project "${target.slug}" is a legacy project; cannot create structured task inside it`
      );
    }
    tasksDir = path.join(
      target.path,
      PROJECT_ORBIT_DIR,
      PROJECT_ORBIT_AGENT_DIR,
      PROJECT_ORBIT_TASKS_DIR
    );
  } else if (args.area_uid) {
    const target = await findAreaByUid(vault, args.area_uid!);
    if (!target) throw new Error(`area_uid not found: ${args.area_uid}`);
    tasksDir = path.join(target.path, '.orbit', 'agent', 'tasks');
  } else {
    const target = await createResourceStore(vault).get(args.resource_uid!);
    if (!target) throw new Error(`resource_uid not found: ${args.resource_uid}`);
    tasksDir = path.join(vault, path.dirname(target.path), 'tasks');
  }
  await fs.mkdir(tasksDir, { recursive: true });
  const now = new Date();
  const prefix = datePrefix(now);
  const base = slugifyTitle(args.title);
  // Ensure unique filename with a minimal suffix.
  let candidate = `${prefix}_${base}.md`;
  let abs = path.join(tasksDir, candidate);
  let counter = 1;
  while (await exists(abs)) {
    counter += 1;
    candidate = `${prefix}_${base}-${counter}.md`;
    abs = path.join(tasksDir, candidate);
  }
  const uid = args.uid ?? newUid();
  const content = renderTaskMarkdown({
    uid,
    title: args.title,
    ...(args.project_uid ? { project_uid: args.project_uid } : {}),
    ...(args.area_uid ? { area_uid: args.area_uid } : {}),
    ...(args.resource_uid ? { resource_uid: args.resource_uid } : {}),
    created_at: now.toISOString(),
    ...(args.description !== undefined ? { description: args.description } : {})
  });
  await fs.writeFile(abs, content, 'utf8');
  // R3: merge caller-provided frontmatter patch (priority/due/tags/pre_conditions…).
  if (args.frontmatter && Object.keys(args.frontmatter).length > 0) {
    const raw = await fs.readFile(abs, 'utf8');
    const upd = frontmatter.update(raw, args.frontmatter);
    if (upd.changed) await fs.writeFile(abs, upd.content, 'utf8');
  }
  return {
    taskPath: abs,
    relPath: toPosix(vaultRel(vault, abs)),
    uid
  };
}

// Re-export helper for tests / neighboring modules that want to resolve a
// project directory quickly without going through listProjects.
export async function findProjectDirByUid(
  vault: string,
  uid: string
): Promise<string | null> {
  const projects = await listProjects(vault);
  return projects.find((p) => p.uid === uid)?.path ?? null;
}

/** Async helper exposed to the task IPC layer. */
export async function ensureMemoriesDir(projectPath: string): Promise<void> {
  await fs.mkdir(
    path.join(
      projectPath,
      PROJECT_ORBIT_DIR,
      PROJECT_ORBIT_AGENT_DIR,
      PROJECT_ORBIT_MEMORIES_DIR
    ),
    { recursive: true }
  );
}

export type { AgentExposureSettings, ProjectConfig } from './project_config';
export { defaultAgentExposureSettings, readProjectConfig, writeProjectConfig } from './project_config';
