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
  PROJECT_TASKS_DIR
} from '@shared/constants';
import { newUid } from './uid';
import * as frontmatter from './frontmatter';
import { assertInsideVault, toPosix, vaultRel } from './pathGuard';
import { renderTaskMarkdown, scaffoldProject } from './templates';
import { ensureMcpConfig } from './mcp_config';
import { ensureProjectAgentContext } from './project_agent_context';
import { walkMarkdown } from './walk';
import {
  defaultAgentExposureSettings,
  readProjectConfig,
  writeProjectConfig,
  type AgentExposureSettings,
  type ProjectConfig
} from './project_config';
import { findAreaByUid } from './area';

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
  /** Absolute path to the project folder (or legacy .md file). */
  path: string;
  /** Absolute path to README.md (folder mode) or the .md file (legacy). */
  readmePath: string;
  /** Vault-relative POSIX path to the project folder or legacy file. */
  relPath: string;
  /** Folder-mode projects have a `.agent/config.json`; legacy ones don't. */
  legacy: boolean;
  github?: GitHubRepoBinding;
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

export interface CreateProjectOptions {
  /**
   * Absolute path to `out/mcp/server.cjs`. When supplied (the
   * production path), `createProject` writes a per-project `.mcp.json`
   * registering the Orbit MCP server. Tests / CLI tooling can omit it
   * to skip MCP wiring.
   */
  mcpServerPath?: string;
}

export interface CreateProjectResult {
  projectPath: string;
  relPath: string;
  uid: string;
  slug: string;
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
  args: CreateProjectArgs,
  opts: CreateProjectOptions = {}
): Promise<CreateProjectResult> {
  assertValidSlug(args.slug);
  const dir = projectDir(vault, args.slug);
  assertInsideVault(vault, dir);
  if (await exists(dir)) {
    throw new Error(`project already exists: ${args.slug}`);
  }
  const uid = args.uid ?? newUid();
  const createdAt = new Date().toISOString();
  const vars: Record<string, string> = {
    uid,
    slug: args.slug,
    name: args.name,
    description: args.description ?? '',
    created_at: createdAt,
    template: args.template,
    vision_ref: '[[Vision]]'
  };
  await scaffoldProject(dir, args.template, vars);
  await writeProjectConfig(dir, {
    uid,
    slug: args.slug,
    name: args.name,
    template: args.template,
    created_at: createdAt,
    vision_linked: true,
    setup: [],
    teardown: [],
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

  // R5: register Orbit MCP server in this project's `.mcp.json` so
  // Claude Code can discover the seven Orbit hooks the moment a user
  // runs `claude` inside the project. Done before the initial git
  // commit so the file is included in the project's history.
  if (opts.mcpServerPath) {
    await ensureMcpConfig(dir, {
      vault,
      projectUid: uid,
      projectSlug: args.slug,
      mcpServerPath: opts.mcpServerPath
    });
  }

  await initProjectGitRepo(dir, args.slug);

  return {
    projectPath: dir,
    relPath: toPosix(vaultRel(vault, dir)),
    uid,
    slug: args.slug
  };
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
  if (config?.github) summary.github = config.github;
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
        out.push(summary);
      } catch {
        // ignore unreadable files
      }
    }
  }
  out.sort((a, b) => a.slug.localeCompare(b.slug));
  return out;
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
  if (!args.project_uid && !args.area_uid) {
    throw new Error('task owner missing: provide project_uid or area_uid');
  }
  if (args.project_uid && args.area_uid) {
    throw new Error('task owner ambiguous: provide only one of project_uid or area_uid');
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
  } else {
    const target = await findAreaByUid(vault, args.area_uid!);
    if (!target) throw new Error(`area_uid not found: ${args.area_uid}`);
    tasksDir = path.join(target.path, '.orbit', 'agent', 'tasks');
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
