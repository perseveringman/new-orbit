import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import {
  ORBIT_CONFIG,
  ORBIT_COST_DIR,
  ORBIT_DIR,
  ORBIT_LOGS_DIR,
  ORBIT_TRASH_DIR,
  ORBIT_WORKTREES_DIR,
  PROJECTS_DIR,
  PROJECT_AGENT_DIR,
  PROJECT_AGENT_MD,
  PROJECT_CONFIG,
  PROJECT_MEMORIES_DIR,
  PROJECT_README,
  PROJECT_TASKS_DIR
} from '@shared/constants';
import { inferTypeFromPath } from '@shared/schemas';
import * as frontmatter from './frontmatter';
import { ensureUid } from './uid';
import { walkMarkdown } from './walk';
import { toPosix, vaultRel } from './pathGuard';
import { ensureProjectAgentContext, readProjectAgentContextMeta } from './project_agent_context';
import { renderTemplate } from './templates';
import { BASE_AGENT_MD, BASE_CONFIG_JSON } from './templates/common';

export interface MarkdownFile {
  absPath: string;
  relPath: string;
  content: string;
}

export interface Migration {
  version: number;
  describe: string;
  migrate(file: MarkdownFile): string | null;
}

/**
 * v1 — Inject a PARA `type` front-matter key inferred from the file's
 * top-level folder when absent. Idempotent: files already carrying a `type`
 * are untouched, and files outside the four PARA roots are untouched.
 */
const v1: Migration = {
  version: 1,
  describe: 'inject PARA type from folder',
  migrate(file) {
    const inferred = inferTypeFromPath(file.relPath);
    if (!inferred) return null;
    const parsed = frontmatter.read(file.content);
    if (parsed.data['type']) return null;
    // ensure uid first (ensureUid already writes frontmatter when needed)
    const withUid = ensureUid(file.content);
    const r = frontmatter.update(withUid.content, { type: inferred });
    if (!r.changed && !withUid.changed) return null;
    return r.content;
  }
};

export const MIGRATIONS: Migration[] = [v1];

export const LATEST_SCHEMA_VERSION: number = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

const V2_SCHEMA_VERSION = 2;
const V3_SCHEMA_VERSION = 3;
const V4_SCHEMA_VERSION = 4;

// --- v3: projectsFilesToFolders ---

export interface V3Result {
  migrated: string[];
  skipped: string[];
  /** Slugs that failed individually without aborting the whole run. */
  failed?: { slug: string; error: string }[];
  /** Git SHA of the vault-root snapshot commit produced before migration. */
  snapshotSha?: string | null;
  dryRun: boolean;
}

async function _exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

const AGENT_SECTION_RE = /^##\s+(Agent|Persona)\b[^\n]*\n([\s\S]*?)(?=\n##\s|$)/m;

export function extractAgentSection(body: string): {
  agent: string | null;
  body: string;
} {
  const m = body.match(AGENT_SECTION_RE);
  if (!m) return { agent: null, body };
  const full = m[0] ?? '';
  const inner = (m[2] ?? '').trim();
  const next = body.replace(full, '').replace(/\n{3,}/g, '\n\n').trimStart();
  return { agent: inner.length > 0 ? inner : null, body: next };
}

export interface MigrateV3Deps {
  initGit?: (dir: string, slug: string) => Promise<void>;
  commitVaultRoot?: (vault: string, msg: string) => Promise<string | null>;
}

async function defaultInitGit(dir: string, slug: string): Promise<void> {
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
    await git.commit(`orbit: migrate project ${slug}`).catch(() => undefined);
  }
}

async function defaultCommitVaultRoot(vault: string, msg: string): Promise<string | null> {
  const git = simpleGit(vault);
  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) return null;
  try {
    await git.add('.');
    // Commit may be a no-op if nothing changed; swallow that.
    await git.commit(msg).catch(() => undefined);
    const sha = await git.revparse(['HEAD']).catch(() => '');
    return sha ? sha.trim() : null;
  } catch {
    return null;
  }
}

/**
 * v3: migrate `01_Projects/<slug>.md` single-file projects into folder-form
 * projects. Idempotent — slugs whose target folder already exists are skipped.
 *
 * Runs a vault-root git commit before the destructive unlink so the
 * operation is recoverable. Each migrated project gets its own git repo
 * with an initial commit referencing the slug.
 */
export async function migrateProjectsToFolders(
  vault: string,
  opts: { dryRun?: boolean; deps?: MigrateV3Deps } = {}
): Promise<V3Result> {
  const dryRun = !!opts.dryRun;
  const deps: MigrateV3Deps = opts.deps ?? {};
  const injectedInitGit = deps.initGit;
  const initGit = injectedInitGit ?? defaultInitGit;
  const commit = deps.commitVaultRoot ?? defaultCommitVaultRoot;
  const projectsDir = path.join(vault, PROJECTS_DIR);

  const migrated: string[] = [];
  const skipped: string[] = [];
  const failed: { slug: string; error: string }[] = [];
  let snapshotSha: string | null = null;
  let entries: Dirent[] = [];
  try {
    entries = (await fs.readdir(projectsDir, { withFileTypes: true })) as Dirent[];
  } catch {
    return { migrated, skipped, failed, snapshotSha, dryRun };
  }

  const candidates: { slug: string; fromFile: string; toDir: string }[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.toLowerCase().endsWith('.md')) continue;
    const fromFile = path.join(projectsDir, e.name);
    try {
      const raw = await fs.readFile(fromFile, 'utf8');
      const { data } = frontmatter.read(raw);
      if (data['type'] !== 'project') continue;
      const slug = path.basename(e.name, '.md');
      const toDir = path.join(projectsDir, slug);
      if (await _exists(toDir)) {
        skipped.push(slug);
        continue;
      }
      candidates.push({ slug, fromFile, toDir });
    } catch {
      // ignore
    }
  }

  if (dryRun) {
    for (const c of candidates) migrated.push(c.slug);
    return { migrated, skipped, failed, snapshotSha, dryRun };
  }
  if (candidates.length === 0) {
    return { migrated, skipped, failed, snapshotSha, dryRun };
  }

  try {
    snapshotSha = (await commit(vault, 'orbit: pre-v3 migration snapshot')) ?? null;
  } catch {
    snapshotSha = null;
  }

  for (const c of candidates) {
    try {
      const raw = await fs.readFile(c.fromFile, 'utf8');
      const withUid = ensureUid(raw);
      const { data, body } = frontmatter.read(withUid.content);
      const uid =
        typeof data['uid'] === 'string' ? (data['uid'] as string) : withUid.uid;
      const name =
        typeof data['title'] === 'string' ? (data['title'] as string) : c.slug;
      const createdAt =
        typeof data['created_at'] === 'string'
          ? (data['created_at'] as string)
          : new Date().toISOString();

      const { agent, body: bodyWithoutAgent } = extractAgentSection(body);

      await fs.mkdir(path.join(c.toDir, PROJECT_AGENT_DIR, PROJECT_TASKS_DIR), {
        recursive: true
      });
      await fs.mkdir(path.join(c.toDir, PROJECT_AGENT_DIR, PROJECT_MEMORIES_DIR), {
        recursive: true
      });

      const patched = frontmatter.update(
        frontmatter.write(data, bodyWithoutAgent),
        {
          type: 'project',
          uid,
          slug: c.slug,
          title: name,
          template: typeof data['template'] === 'string' ? data['template'] : 'blank',
          created_at: createdAt
        }
      );
      await fs.writeFile(path.join(c.toDir, PROJECT_README), patched.content, 'utf8');

      const agentVars: Record<string, string> = {
        name,
        slug: c.slug,
        uid,
        description:
          typeof data['description'] === 'string'
            ? (data['description'] as string)
            : '',
        created_at: createdAt,
        template: 'blank',
        vision_ref: '[[Vision]]'
      };
      const agentMd =
        agent && agent.trim().length > 0
          ? `# ${name} — Agent Persona\n\n${agent.trim()}\n`
          : renderTemplate(BASE_AGENT_MD, agentVars);
      await fs.writeFile(path.join(c.toDir, PROJECT_AGENT_MD), agentMd, 'utf8');

      const configJson = renderTemplate(BASE_CONFIG_JSON, {
        uid,
        slug: c.slug,
        name,
        template: 'blank',
        created_at: createdAt
      });
      await fs.writeFile(
        path.join(c.toDir, PROJECT_AGENT_DIR, PROJECT_CONFIG),
        configJson,
        'utf8'
      );

      await fs.writeFile(
        path.join(c.toDir, PROJECT_AGENT_DIR, PROJECT_TASKS_DIR, '.gitkeep'),
        '',
        'utf8'
      );
      await fs.writeFile(
        path.join(c.toDir, PROJECT_AGENT_DIR, PROJECT_MEMORIES_DIR, '.gitkeep'),
        '',
        'utf8'
      );
      await fs.writeFile(
        path.join(c.toDir, '.gitignore'),
        `node_modules/\ndist/\n.DS_Store\n`,
        'utf8'
      );
      await ensureProjectAgentContext(c.toDir, {
        uid,
        slug: c.slug,
        name,
        template: 'blank',
        ...(typeof data['description'] === 'string'
          ? { description: data['description'] as string }
          : {})
      });

      // Injected deps are expected to propagate errors (tests rely on this
      // to exercise the partial-failure path). The built-in default is
      // best-effort — git not available shouldn't abort the migration.
      if (injectedInitGit) {
        await initGit(c.toDir, c.slug);
      } else {
        await initGit(c.toDir, c.slug).catch(() => undefined);
      }
      await fs.unlink(c.fromFile);
      migrated.push(c.slug);
    } catch (err) {
      failed.push({
        slug: c.slug,
        error: (err as Error).message ?? String(err)
      });
      // best-effort cleanup of a half-built folder so re-runs aren't blocked
      try {
        await fs.rm(c.toDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      continue;
    }
  }

  return { migrated, skipped, failed, snapshotSha, dryRun };
}

/**
 * Ensure the vault-root `.gitignore` keeps the per-project `.git` directories
 * out of the outer repo — otherwise nested repos become submodule booby traps.
 */
async function applyV3VaultMigration(vault: string): Promise<void> {
  const p = path.join(vault, '.gitignore');
  let existing = '';
  try {
    existing = await fs.readFile(p, 'utf8');
  } catch {
    existing = '';
  }
  const required = [`${PROJECTS_DIR}/*/.git`, `${PROJECTS_DIR}/*/.git/`];
  const lines = new Set(
    existing
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
  );
  let next = existing;
  let changed = false;
  if (next.length > 0 && !next.endsWith('\n')) {
    next += '\n';
    changed = true;
  }
  // We only need one of the two — prefer the glob without trailing slash.
  if (!lines.has(required[0]!)) {
    next += `${required[0]!}\n`;
    changed = true;
  }
  if (changed) await fs.writeFile(p, next, 'utf8');
}

async function applyV4ProjectAgentContextMigration(vault: string): Promise<void> {
  const projectsDir = path.join(vault, PROJECTS_DIR);
  let entries: Dirent[] = [];
  try {
    entries = (await fs.readdir(projectsDir, { withFileTypes: true })) as Dirent[];
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectDir = path.join(projectsDir, entry.name);
    const meta = await readProjectAgentContextMeta(projectDir);
    if (!meta || !meta.uid) continue;
    await ensureProjectAgentContext(projectDir, meta);
  }
}

/**
 * v2 vault-level migration: ensure `.gitignore` at the vault root lists
 * the Orbit internal directories we don't want committed. Runs once and
 * is idempotent (we append only the missing lines).
 */
async function applyV2VaultMigration(vault: string): Promise<void> {
  const p = path.join(vault, '.gitignore');
  const required = [
    `${ORBIT_DIR}/${ORBIT_WORKTREES_DIR}/`,
    `${ORBIT_DIR}/${ORBIT_LOGS_DIR}/`,
    `${ORBIT_DIR}/${ORBIT_COST_DIR}/`,
    `${ORBIT_DIR}/${ORBIT_TRASH_DIR}/`
  ];
  let existing = '';
  try {
    existing = await fs.readFile(p, 'utf8');
  } catch {
    existing = '';
  }
  const lines = new Set(
    existing
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
  );
  let changed = false;
  let next = existing;
  if (next.length > 0 && !next.endsWith('\n')) {
    next += '\n';
    changed = true;
  }
  for (const r of required) {
    if (!lines.has(r)) {
      next += `${r}\n`;
      changed = true;
    }
  }
  if (changed) {
    await fs.writeFile(p, next, 'utf8');
  }
}

interface OrbitConfigLike {
  version?: string;
  createdAt?: string;
  name?: string;
  schemaVersion?: number;
}

async function readConfig(vault: string): Promise<OrbitConfigLike> {
  try {
    const raw = await fs.readFile(path.join(vault, ORBIT_DIR, ORBIT_CONFIG), 'utf8');
    return JSON.parse(raw) as OrbitConfigLike;
  } catch {
    return {};
  }
}

async function writeConfig(vault: string, cfg: OrbitConfigLike): Promise<void> {
  const p = path.join(vault, ORBIT_DIR, ORBIT_CONFIG);
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(cfg, null, 2), 'utf8');
  await fs.rename(tmp, p);
}

/**
 * Apply every pending migration to every markdown file in the vault, then
 * bump `.orbit/config.json` schemaVersion. Safe to run on every open — the
 * migrations are themselves idempotent and we skip fully-current vaults
 * without touching any file.
 */
export async function runMigrations(vault: string): Promise<{
  from: number;
  to: number;
  touched: number;
}> {
  const cfg = await readConfig(vault);
  const from = typeof cfg.schemaVersion === 'number' ? cfg.schemaVersion : 0;
  const to = Math.max(
    LATEST_SCHEMA_VERSION,
    V2_SCHEMA_VERSION,
    V3_SCHEMA_VERSION,
    V4_SCHEMA_VERSION
  );
  if (from >= to) {
    if (typeof cfg.schemaVersion !== 'number') {
      await writeConfig(vault, { ...cfg, schemaVersion: to });
    }
    return { from, to, touched: 0 };
  }
  const pending = MIGRATIONS.filter((m) => m.version > from);
  let touched = 0;
  for await (const abs of walkMarkdown(vault)) {
    const rel = toPosix(vaultRel(vault, abs));
    let content: string;
    try {
      content = await fs.readFile(abs, 'utf8');
    } catch {
      continue;
    }
    let changed = false;
    for (const m of pending) {
      const next = m.migrate({ absPath: abs, relPath: rel, content });
      if (next !== null && next !== content) {
        content = next;
        changed = true;
      }
    }
    if (changed) {
      await fs.writeFile(abs, content, 'utf8');
      touched++;
    }
  }
  if (from < V2_SCHEMA_VERSION) {
    await applyV2VaultMigration(vault);
  }
  if (from < V3_SCHEMA_VERSION) {
    await applyV3VaultMigration(vault);
    // Note: we *do not* auto-run migrateProjectsToFolders here — the task
    // migration is destructive and requires user confirmation via the UI
    // (see `migrations:runV3` IPC in R2). The .gitignore patch is safe.
  }
  if (from < V4_SCHEMA_VERSION) {
    await applyV4ProjectAgentContextMigration(vault);
  }
  await writeConfig(vault, { ...cfg, schemaVersion: to });
  return { from, to, touched };
}
