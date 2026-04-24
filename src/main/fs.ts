import { promises as fs, Dirent } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { BrowserWindow, ipcMain } from 'electron';
import {
  IPC,
  type ArchiveProjectResultDTO,
  type CreateProjectArgsDTO,
  type CreateProjectResultDTO,
  type CreateTaskArgsDTO,
  type CreateTaskResultDTO,
  type EnsureMcpConfigResultDTO,
  type EntityFilter,
  type CloseProjectResult,
  type OrphanRescueCandidate,
  type ProjectSummaryDTO,
  type TemplateMetaDTO,
  type V3MigrationReport
} from '@shared/ipc';
import type {
  BacklinkItem,
  CreateFileResult,
  FileNode,
  FsEvent,
  RenameResult,
  SearchHit
} from '@shared/types';
import {
  inferTypeFromPath,
  type EntitySummary,
  type TaskFilter,
  type TaskRecord,
  type TaskStatus
} from '@shared/schemas';
import { ORBIT_DIR, ORBIT_TRASH_DIR } from '@shared/constants';
import { assertInsideVault, toPosix, vaultRel } from './pathGuard';
import { RefmapStore } from './refmap';
import { VaultIndex } from './index_store';
import { SearchIndex } from './search';
import { VaultWatcher } from './watcher';
import { ensureUid } from './uid';
import * as frontmatter from './frontmatter';
import { rewriteWikilinks, parseWikilinks } from './wikilink';
import { IGNORE_DIRS, walkMarkdown } from './walk';
import { TaskIndex } from './tasks';
import { applyInlineTaskStatus } from './task_mutate';
import { runMigrations, migrateProjectsToFolders } from './migrations';
import {
  archiveProjectByUid,
  createProject,
  createTask,
  listProjectTaskPaths,
  listProjects
} from './project';
import { ensureMcpConfig } from './mcp_config';
import { getMcpServerPath } from './mcp_path';
import { contentHash } from './content_hash';
import { listTemplates } from './templates';
import {
  appendExecutionLog,
  readTaskFile,
  updateTaskFrontmatter,
  updateTaskSection
} from './task';
import { relinkTask } from './task_relink';
import {
  listProjectTree as _listProjectTree,
  createDirectory as _createDirectory
} from './project_fs';

export interface VaultSession {
  vault: string;
  refmap: RefmapStore;
  index: VaultIndex;
  search: SearchIndex;
  tasks: TaskIndex;
  watcher: VaultWatcher;
}

let current: VaultSession | null = null;

function getSession(): VaultSession {
  if (!current) throw new Error('no vault open');
  return current;
}

/**
 * Public accessor for the in-memory vault session. Used by sibling modules
 * (e.g. the agent layer) to look up tasks, entities and run searches
 * without re-implementing IPC plumbing. Returns `null` when no vault is
 * open so callers can degrade gracefully.
 */
export function currentSession(): VaultSession | null {
  return current;
}

type WatcherHook = (ev: FsEvent) => void;
const watcherHooks: Set<WatcherHook> = new Set();

/** Register a side-channel listener for watcher events (vector indexer). */
export function onVaultFsEvent(cb: WatcherHook): () => void {
  watcherHooks.add(cb);
  return () => watcherHooks.delete(cb);
}

function notifyHooks(ev: FsEvent): void {
  for (const h of watcherHooks) {
    try {
      h(ev);
    } catch {
      // hook errors must never break the watcher
    }
  }
}

function broadcast(ev: FsEvent): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IPC.fs.event, ev);
  }
}

async function atomicWriteFile(abs: string, content: string): Promise<void> {
  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, abs);
}

async function buildTree(vault: string): Promise<FileNode> {
  const root: FileNode = {
    name: path.basename(vault),
    path: vault,
    relPath: '',
    isDir: true,
    children: []
  };

  async function visit(dir: string, parent: FileNode): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const nodes: FileNode[] = [];
    for (const e of entries) {
      if (IGNORE_DIRS.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      const node: FileNode = {
        name: e.name,
        path: abs,
        relPath: toPosix(vaultRel(vault, abs)),
        isDir: e.isDirectory()
      };
      if (e.isDirectory()) {
        node.children = [];
        await visit(abs, node);
        nodes.push(node);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        nodes.push(node);
      }
    }
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    parent.children = nodes;
  }

  await visit(vault, root);
  return root;
}

/**
 * Rewrite wikilinks in every markdown file that references `oldBase` so they
 * now point at `newBase`. Uses the in-memory backlink index to narrow the set
 * of files we touch.
 */
async function rewriteBacklinksOnRename(
  sess: VaultSession,
  oldAbs: string,
  newAbs: string
): Promise<number> {
  const oldBase = path.basename(oldAbs, '.md');
  const newBase = path.basename(newAbs, '.md');
  if (oldBase === newBase) return 0;
  const linkers = new Set<string>(sess.index.linkersByName(oldBase));
  // Also consider files that might not yet be indexed (cold start).
  let total = 0;
  for (const rel of linkers) {
    const abs = path.join(sess.vault, rel);
    try {
      const content = await fs.readFile(abs, 'utf8');
      const { content: next, changed } = rewriteWikilinks(content, oldBase, newBase);
      if (changed > 0) {
        await atomicWriteFile(abs, next);
        sess.index.upsert(rel, next);
        sess.search.upsert(rel);
        total += changed;
      }
    } catch {
      // ignore
    }
  }
  return total;
}

export async function openFsSession(vault: string): Promise<void> {
  await closeFsSession();

  const refmap = new RefmapStore(vault);
  await refmap.load();

  // Run pending schema migrations before we build the in-memory indices so
  // migration-induced frontmatter rewrites are already on disk.
  await runMigrations(vault);

  const index = new VaultIndex(vault);
  await index.rebuild();

  const search = new SearchIndex(vault, index);
  await refmap.reconcile();
  // After reconcile, rebuild index once more because UIDs may have been injected.
  await index.rebuild();
  search.rebuild();

  const tasks = new TaskIndex(vault);
  await rebuildTaskIndex(vault, tasks);

  const watcher = new VaultWatcher(vault, async (ev) => {
    try {
      await handleWatcherEvent(ev);
      notifyHooks(ev);
    } catch {
      // never throw out of the watcher
    } finally {
      broadcast(ev);
    }
  });
  watcher.start();

  current = { vault, refmap, index, search, tasks, watcher };
}

async function rebuildTaskIndex(vault: string, tasks: TaskIndex): Promise<void> {
  for await (const abs of walkMarkdown(vault)) {
    try {
      const content = await fs.readFile(abs, 'utf8');
      tasks.upsert(toPosix(vaultRel(vault, abs)), content);
    } catch {
      // ignore
    }
  }
}

async function handleWatcherEvent(ev: FsEvent): Promise<void> {
  const sess = current;
  if (!sess) return;
  if (ev.kind === 'add' && ev.path.toLowerCase().endsWith('.md')) {
    await ensureUidOnDisk(sess, ev.path);
    await sess.index.upsertAbs(ev.path);
    sess.search.upsert(ev.relPath);
    await upsertTasksFromDisk(sess, ev.path, ev.relPath);
    sess.refmap.set(
      sess.refmap.uidOfRel(ev.relPath) ?? (await readUid(ev.path)) ?? '',
      ev.path
    );
    await sess.refmap.flush();
  } else if (ev.kind === 'change' && ev.path.toLowerCase().endsWith('.md')) {
    await sess.index.upsertAbs(ev.path);
    sess.search.upsert(ev.relPath);
    await upsertTasksFromDisk(sess, ev.path, ev.relPath);
  } else if (ev.kind === 'unlink' && ev.path.toLowerCase().endsWith('.md')) {
    sess.index.remove(ev.relPath);
    sess.search.remove(ev.relPath);
    sess.tasks.remove(ev.relPath);
    sess.refmap.deletePath(ev.path);
    await sess.refmap.flush();
  } else if (ev.kind === 'rename' && ev.oldRelPath) {
    if (ev.path.toLowerCase().endsWith('.md')) {
      sess.refmap.renamePath(ev.oldPath ?? '', ev.path);
      sess.index.rename(ev.oldRelPath, ev.relPath);
      sess.search.rename(ev.oldRelPath, ev.relPath);
      sess.tasks.rename(ev.oldRelPath, ev.relPath);
      await sess.refmap.flush();
      const updated = await rewriteBacklinksOnRename(
        sess,
        ev.oldPath ?? path.join(sess.vault, ev.oldRelPath),
        ev.path
      );
      if (updated > 0) {
        broadcast({
          kind: 'change',
          path: ev.path,
          relPath: ev.relPath
        });
      }
    }
  }
}

async function upsertTasksFromDisk(
  sess: VaultSession,
  abs: string,
  rel: string
): Promise<void> {
  try {
    const content = await fs.readFile(abs, 'utf8');
    sess.tasks.upsert(rel, content);
  } catch {
    // ignore
  }
}

async function readUid(abs: string): Promise<string | null> {
  try {
    const content = await fs.readFile(abs, 'utf8');
    const { uid } = ensureUid(content);
    return uid;
  } catch {
    return null;
  }
}

async function ensureUidOnDisk(sess: VaultSession, abs: string): Promise<string> {
  assertInsideVault(sess.vault, abs);
  const content = await fs.readFile(abs, 'utf8');
  const { uid, content: next, changed } = ensureUid(content);
  if (changed) await atomicWriteFile(abs, next);
  sess.refmap.set(uid, abs);
  return uid;
}

export async function closeFsSession(): Promise<void> {
  if (!current) return;
  await current.watcher.stop();
  await current.refmap.flush();
  current = null;
}

export function registerFsIpc(): void {
  ipcMain.handle(IPC.fs.listTree, async (_e, vault: string) => {
    const sess = getSession();
    void vault;
    return buildTree(sess.vault);
  });

  ipcMain.handle(IPC.fs.exists, async (_e, abs: string) => {
    const sess = getSession();
    assertInsideVault(sess.vault, abs);
    try {
      await fs.access(abs);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle(IPC.fs.readFile, async (_e, abs: string) => {
    const sess = getSession();
    assertInsideVault(sess.vault, abs);
    const content = await fs.readFile(abs, 'utf8');
    if (abs.toLowerCase().endsWith('.md')) {
      const { uid, content: withUid, changed } = ensureUid(content);
      const rel = toPosix(vaultRel(sess.vault, abs));
      // Inject PARA `type` when missing and we can infer it from the folder.
      const inferred = inferTypeFromPath(rel);
      let next = withUid;
      let mutated = changed;
      if (inferred) {
        const parsed = frontmatter.read(next);
        if (!parsed.data['type']) {
          const r = frontmatter.update(next, { type: inferred });
          if (r.changed) {
            next = r.content;
            mutated = true;
          }
        }
      }
      if (mutated) {
        await atomicWriteFile(abs, next);
        sess.refmap.set(uid, abs);
        await sess.refmap.flush();
        sess.index.upsert(rel, next);
        sess.search.upsert(rel);
        sess.tasks.upsert(rel, next);
        return next;
      }
      sess.refmap.set(uid, abs);
      sess.tasks.upsert(rel, content);
    }
    return content;
  });

  ipcMain.handle(IPC.fs.writeFile, async (_e, abs: string, content: string) => {
    const sess = getSession();
    assertInsideVault(sess.vault, abs);
    await atomicWriteFile(abs, content);
    if (abs.toLowerCase().endsWith('.md')) {
      const rel = toPosix(vaultRel(sess.vault, abs));
      sess.index.upsert(rel, content);
      sess.search.upsert(rel);
      sess.tasks.upsert(rel, content);
    }
  });

  ipcMain.handle(
    IPC.fs.createFile,
    async (
      _e,
      dirPath: string,
      filename: string,
      initialContent?: string
    ): Promise<CreateFileResult> => {
      const sess = getSession();
      assertInsideVault(sess.vault, dirPath);
      if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
        throw new Error('invalid filename');
      }
      await fs.mkdir(dirPath, { recursive: true });
      const abs = path.join(dirPath, filename.endsWith('.md') ? filename : `${filename}.md`);
      assertInsideVault(sess.vault, abs);
      const exists = await fs.access(abs).then(
        () => true,
        () => false
      );
      if (exists) throw new Error('file already exists');
      const { content } = ensureUid(initialContent ?? '');
      await atomicWriteFile(abs, content);
      const rel = toPosix(vaultRel(sess.vault, abs));
      sess.index.upsert(rel, content);
      sess.search.upsert(rel);
      sess.tasks.upsert(rel, content);
      const r = ensureUid(content);
      sess.refmap.set(r.uid, abs);
      await sess.refmap.flush();
      return { path: abs, relPath: rel };
    }
  );

  ipcMain.handle(
    IPC.fs.rename,
    async (_e, oldPath: string, newPath: string): Promise<RenameResult> => {
      const sess = getSession();
      assertInsideVault(sess.vault, oldPath);
      assertInsideVault(sess.vault, newPath);
      await fs.mkdir(path.dirname(newPath), { recursive: true });
      await fs.rename(oldPath, newPath);
      const oldRel = toPosix(vaultRel(sess.vault, oldPath));
      const newRel = toPosix(vaultRel(sess.vault, newPath));
      if (newPath.toLowerCase().endsWith('.md')) {
        sess.refmap.renamePath(oldPath, newPath);
        sess.index.rename(oldRel, newRel);
        sess.search.rename(oldRel, newRel);
        sess.tasks.rename(oldRel, newRel);
        await sess.refmap.flush();
      }
      const linksUpdated = await rewriteBacklinksOnRename(sess, oldPath, newPath);
      return { newPath, newRelPath: newRel, linksUpdated };
    }
  );

  ipcMain.handle(IPC.fs.deleteFile, async (_e, abs: string) => {
    const sess = getSession();
    assertInsideVault(sess.vault, abs);
    const trashDir = path.join(sess.vault, ORBIT_DIR, ORBIT_TRASH_DIR);
    await fs.mkdir(trashDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rel = toPosix(vaultRel(sess.vault, abs));
    const target = path.join(trashDir, `${stamp}__${rel.replace(/\//g, '__')}`);
    await fs.rename(abs, target);
    sess.refmap.deletePath(abs);
    sess.index.remove(rel);
    sess.search.remove(rel);
    sess.tasks.remove(rel);
    await sess.refmap.flush();
  });

  ipcMain.handle(IPC.fs.resolveUid, async (_e, uid: string) => {
    const sess = getSession();
    return sess.refmap.resolveUid(uid);
  });

  ipcMain.handle(IPC.fs.uidOf, async (_e, rel: string) => {
    const sess = getSession();
    return sess.refmap.uidOfRel(rel);
  });

  ipcMain.handle(
    IPC.fs.search,
    async (_e, query: string, opts?: { limit?: number }): Promise<SearchHit[]> => {
      const sess = getSession();
      return sess.search.search(query, opts?.limit ?? 30);
    }
  );

  ipcMain.handle(
    IPC.fs.backlinksOf,
    async (_e, abs: string): Promise<BacklinkItem[]> => {
      const sess = getSession();
      assertInsideVault(sess.vault, abs);
      const rel = toPosix(vaultRel(sess.vault, abs));
      return sess.index.backlinksOf(rel).map((b) => ({
        path: path.join(sess.vault, b.relPath),
        relPath: b.relPath,
        title: b.title,
        count: b.count
      }));
    }
  );

  ipcMain.handle(
    IPC.para.listEntities,
    async (_e, filter?: EntityFilter): Promise<EntitySummary[]> => {
      const sess = getSession();
      const all = sess.tasks.allEntities();
      const out = filter?.type ? all.filter((e) => e.type === filter.type) : all;
      return out
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title));
    }
  );

  ipcMain.handle(
    IPC.para.listTasks,
    async (_e, filter?: TaskFilter): Promise<TaskRecord[]> => {
      const sess = getSession();
      let list = sess.tasks.allTasks();
      if (filter?.status) list = list.filter((t) => t.status === filter.status);
      if (filter?.project_uid) list = list.filter((t) => t.project_uid === filter.project_uid);
      if (filter?.area_uid) list = list.filter((t) => t.area_uid === filter.area_uid);
      if (filter?.tag) list = list.filter((t) => (t.tags ?? []).includes(filter.tag!));
      if (filter?.due_before) {
        list = list.filter((t) => typeof t.due === 'string' && t.due <= filter.due_before!);
      }
      // Decorate with `lost` when the task's project_uid cannot be resolved.
      // Build a set of known project uids from the entity index so the check
      // is O(1) per task.
      const projectUids = new Set(
        sess.tasks.allEntities().filter((e) => e.type === 'project').map((e) => e.uid)
      );
      return list.map((t) => {
        if (!t.project_uid) return t;
        if (projectUids.has(t.project_uid)) return t;
        return { ...t, lost: true };
      });
    }
  );

  ipcMain.handle(
    IPC.para.updateTaskStatus,
    async (_e, id: string, status: TaskStatus): Promise<TaskRecord | null> => {
      const sess = getSession();
      return updateTaskStatus(sess, id, status);
    }
  );

  ipcMain.handle(
    IPC.para.closeProject,
    async (_e, abs: string): Promise<CloseProjectResult> => {
      const sess = getSession();
      return closeProject(sess, abs);
    }
  );

  // --- R1: project / task / migrations IPC ---

  ipcMain.handle(IPC.project.listTemplates, async (): Promise<TemplateMetaDTO[]> => {
    return listTemplates();
  });

  ipcMain.handle(
    IPC.project.create,
    async (_e, args: CreateProjectArgsDTO): Promise<CreateProjectResultDTO> => {
      const sess = getSession();
      let mcpServerPath: string | undefined;
      try {
        mcpServerPath = getMcpServerPath();
      } catch {
        // electron app not initialized (e.g. unit tests using a stripped main).
        mcpServerPath = undefined;
      }
      const result = await createProject(
        sess.vault,
        args,
        mcpServerPath ? { mcpServerPath } : {}
      );
      // Bring the new README into the in-memory indices.
      try {
        const readmeAbs = path.join(result.projectPath, 'README.md');
        const content = await fs.readFile(readmeAbs, 'utf8');
        const rel = toPosix(vaultRel(sess.vault, readmeAbs));
        sess.index.upsert(rel, content);
        sess.search.upsert(rel);
        sess.tasks.upsert(rel, content);
        sess.refmap.set(result.uid, readmeAbs);
        sess.refmap.setContentHash(result.uid, contentHash(content));
        await sess.refmap.flush();
      } catch {
        // best effort; watcher will pick it up
      }
      return result;
    }
  );

  ipcMain.handle(IPC.project.list, async (): Promise<ProjectSummaryDTO[]> => {
    const sess = getSession();
    return (await listProjects(sess.vault)) as ProjectSummaryDTO[];
  });

  ipcMain.handle(
    IPC.project.archive,
    async (_e, uid: string): Promise<ArchiveProjectResultDTO> => {
      const sess = getSession();
      const r = await archiveProjectByUid(sess.vault, uid);
      // Rebuild task index entries under the old project path — just let
      // the watcher settle. For determinism in tests, we manually refresh
      // entries under the old + new paths.
      await refreshRangeInIndex(sess, r.oldPath, r.newPath);
      return r;
    }
  );

  ipcMain.handle(
    IPC.project.getTasks,
    async (_e, uid: string): Promise<TaskRecord[]> => {
      const sess = getSession();
      const projects = await listProjects(sess.vault);
      const match = projects.find((p) => p.uid === uid);
      if (!match) return [];
      const out: TaskRecord[] = [];
      const paths = await listProjectTaskPaths(match.path);
      for (const abs of paths) {
        const rel = toPosix(vaultRel(sess.vault, abs));
        out.push(...sess.tasks.tasksOf(rel));
      }
      return out;
    }
  );

  ipcMain.handle(
    IPC.project.ensureMcpConfig,
    async (_e, uid: string): Promise<EnsureMcpConfigResultDTO> => {
      const sess = getSession();
      const projects = await listProjects(sess.vault);
      const match = projects.find((p) => p.uid === uid);
      if (!match) throw new Error(`project not found: ${uid}`);
      if (match.legacy) {
        throw new Error(
          `project "${match.slug}" is a legacy single-file project; migrate it first`
        );
      }
      const mcpServerPath = getMcpServerPath();
      const r = await ensureMcpConfig(match.path, {
        vault: sess.vault,
        projectUid: match.uid,
        projectSlug: match.slug,
        mcpServerPath
      });
      return {
        uid: match.uid,
        slug: match.slug,
        configPath: r.path,
        written: r.written,
        mcpServerPath
      };
    }
  );

  ipcMain.handle(
    IPC.task.create,
    async (_e, args: CreateTaskArgsDTO): Promise<CreateTaskResultDTO> => {
      const sess = getSession();
      const res = await createTask(sess.vault, args);
      try {
        const content = await fs.readFile(res.taskPath, 'utf8');
        const rel = toPosix(vaultRel(sess.vault, res.taskPath));
        sess.index.upsert(rel, content);
        sess.search.upsert(rel);
        sess.tasks.upsert(rel, content);
        sess.refmap.set(res.uid, res.taskPath);
        sess.refmap.setContentHash(res.uid, contentHash(content));
        await sess.refmap.flush();
      } catch {
        // best effort
      }
      return res;
    }
  );

  // --- R3: structured task IPC (get / update frontmatter / update section /
  //         append execution log). All mutate the file in place and refresh
  //         the refmap's content hash so orphan recovery stays accurate.
  const refreshAfterTaskWrite = async (abs: string, next: string): Promise<void> => {
    const sess = getSession();
    const rel = toPosix(vaultRel(sess.vault, abs));
    sess.index.upsert(rel, next);
    sess.search.upsert(rel);
    sess.tasks.upsert(rel, next);
    const uid = sess.refmap.uidOfAbs(abs);
    if (uid) {
      sess.refmap.setContentHash(uid, contentHash(next));
      await sess.refmap.flush();
    }
    const ev: FsEvent = {
      kind: 'change',
      path: abs,
      relPath: rel
    };
    notifyHooks(ev);
    broadcast(ev);
  };

  ipcMain.handle(IPC.task.get, async (_e, abs: string) => {
    const sess = getSession();
    assertInsideVault(sess.vault, abs);
    return readTaskFile(abs);
  });

  ipcMain.handle(
    IPC.task.updateFrontmatter,
    async (_e, abs: string, patch: Record<string, unknown>): Promise<void> => {
      const sess = getSession();
      assertInsideVault(sess.vault, abs);
      await updateTaskFrontmatter(abs, patch, (next) => refreshAfterTaskWrite(abs, next));
    }
  );

  ipcMain.handle(
    IPC.task.updateSection,
    async (
      _e,
      abs: string,
      section: 'description' | 'thinking' | 'executionLog' | 'summary',
      content: string
    ): Promise<void> => {
      const sess = getSession();
      assertInsideVault(sess.vault, abs);
      await updateTaskSection(abs, section, content, (next) =>
        refreshAfterTaskWrite(abs, next)
      );
    }
  );

  ipcMain.handle(
    IPC.task.appendExecutionLog,
    async (_e, abs: string, line: string): Promise<void> => {
      const sess = getSession();
      assertInsideVault(sess.vault, abs);
      await appendExecutionLog(abs, line, undefined, (next) =>
        refreshAfterTaskWrite(abs, next)
      );
    }
  );

  ipcMain.handle(
    IPC.task.relink,
    async (_e, taskAbsPath: string, newProjectUid: string) => {
      const sess = getSession();
      assertInsideVault(sess.vault, taskAbsPath);
      const res = await relinkTask(sess.vault, taskAbsPath, newProjectUid);
      // Index hygiene: drop the old entry (if the file moved), then upsert
      // the new one so the Kanban/Inbox views see the relink immediately.
      try {
        if (res.moved) {
          const oldRel = toPosix(vaultRel(sess.vault, taskAbsPath));
          sess.tasks.remove(oldRel);
          sess.index.remove(oldRel);
          sess.search.remove(oldRel);
        }
        const content = await fs.readFile(res.taskPath, 'utf8');
        const rel = toPosix(vaultRel(sess.vault, res.taskPath));
        sess.index.upsert(rel, content);
        sess.search.upsert(rel);
        sess.tasks.upsert(rel, content);
        if (res.uid) {
          sess.refmap.set(res.uid, res.taskPath);
          sess.refmap.setContentHash(res.uid, contentHash(content));
          await sess.refmap.flush();
        }
      } catch {
        /* best-effort */
      }
      return res;
    }
  );

  ipcMain.handle(
    IPC.migrations.runV3,
    async (_e, opts?: { dryRun?: boolean }): Promise<V3MigrationReport> => {
      const sess = getSession();
      const result = await migrateProjectsToFolders(sess.vault, {
        dryRun: !!opts?.dryRun
      });
      if (!result.dryRun) {
        // After destructive migration, refresh core indices.
        await sess.refmap.reconcile();
        await sess.index.rebuild();
        sess.search.rebuild();
      }
      return result;
    }
  );

  ipcMain.handle(IPC.fs.findByContentHash, async (_e, hash: string): Promise<string[]> => {
    const sess = getSession();
    return sess.refmap.findByContentHash(hash);
  });

  ipcMain.handle(
    IPC.fs.rescueOrphan,
    async (_e, taskAbsPath: string): Promise<OrphanRescueCandidate[]> => {
      const sess = getSession();
      assertInsideVault(sess.vault, taskAbsPath);
      return rescueOrphan(sess, taskAbsPath);
    }
  );

  ipcMain.handle(IPC.fs.listProjectTree, async (_e, root: string) => {
    const sess = getSession();
    assertInsideVault(sess.vault, root);
    return _listProjectTree(root);
  });

  ipcMain.handle(IPC.fs.createDirectory, async (_e, parent: string, name: string) => {
    const sess = getSession();
    assertInsideVault(sess.vault, parent);
    return _createDirectory(parent, name);
  });
}

/**
 * Walk the old and new project paths and refresh the vault / task indices in
 * place so watch-debounce latency doesn't hide archive moves in unit tests.
 */
async function refreshRangeInIndex(
  sess: VaultSession,
  oldDir: string,
  newDir: string
): Promise<void> {
  // Remove any entries that used to live under oldDir.
  const oldRel = toPosix(vaultRel(sess.vault, oldDir));
  for (const rel of Array.from(sess.tasks.allEntities()).map((e) => e.relPath)) {
    if (rel.startsWith(oldRel + '/')) {
      sess.tasks.remove(rel);
      sess.index.remove(rel);
      sess.search.remove(rel);
    }
  }
  // Walk newDir and upsert.
  for await (const abs of walkMarkdown(newDir)) {
    try {
      const content = await fs.readFile(abs, 'utf8');
      const rel = toPosix(vaultRel(sess.vault, abs));
      sess.index.upsert(rel, content);
      sess.search.upsert(rel);
      sess.tasks.upsert(rel, content);
    } catch {
      // ignore
    }
  }
}

/**
 * Best-effort reverse rename lookup. Searches `git log --follow` in both the
 * vault root repo and every project subrepo for a historical location of
 * `taskAbsPath`, so the UI can prompt the user to reconnect an orphaned task.
 */
async function rescueOrphan(
  sess: VaultSession,
  taskAbsPath: string
): Promise<OrphanRescueCandidate[]> {
  const candidates: OrphanRescueCandidate[] = [];
  const repos: { repo: 'vault' | 'project'; repoPath: string }[] = [
    { repo: 'vault', repoPath: sess.vault }
  ];
  try {
    const projectsRoot = path.join(sess.vault, '01_Projects');
    const entries = await fs.readdir(projectsRoot, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = path.join(projectsRoot, e.name);
      try {
        const isRepo = await simpleGit(dir).checkIsRepo();
        if (isRepo) repos.push({ repo: 'project', repoPath: dir });
      } catch {
        // not a repo
      }
    }
  } catch {
    // no projects dir
  }
  for (const r of repos) {
    try {
      const git = simpleGit(r.repoPath);
      const relForGit = path.relative(r.repoPath, taskAbsPath);
      if (!relForGit || relForGit.startsWith('..')) continue;
      const log = await git.raw([
        'log',
        '--follow',
        '--name-status',
        '--pretty=format:%H%x09%aI',
        '--',
        relForGit
      ]);
      let curCommit = '';
      let curAt = '';
      for (const line of log.split('\n')) {
        if (!line) continue;
        if (line.includes('\t') && !line.startsWith('R') && !line.startsWith('A') && !line.startsWith('M') && !line.startsWith('D')) {
          const parts = line.split('\t');
          if (parts.length === 2 && parts[0] && /^[0-9a-f]{7,}$/.test(parts[0]!)) {
            curCommit = parts[0]!;
            curAt = parts[1] ?? '';
            continue;
          }
        }
        // R100\told\tnew | A\tpath | M\tpath | D\tpath
        const segs = line.split('\t');
        if (segs[0]?.startsWith('R') && segs.length >= 3) {
          candidates.push({
            commit: curCommit,
            at: curAt,
            oldPath: segs[1]!,
            newPath: segs[2]!,
            repo: r.repo,
            repoPath: r.repoPath
          });
        }
      }
    } catch {
      // repo has no history for this file; skip
    }
  }
  return candidates;
}

/**
 * M5 circuit-breaker helper: mark a task as `blocked` and, for file-backed
 * tasks, persist the reason into frontmatter. Inline (checklist) tasks
 * only get the status flip — the spec explicitly says to skip
 * frontmatter writes for those and rely on a toast.
 */
export async function blockTask(
  id: string,
  reason: string
): Promise<TaskRecord | null> {
  const sess = currentSession();
  if (!sess) return null;
  const rec = await updateTaskStatus(sess, id, 'blocked');
  if (id.startsWith('file:')) {
    try {
      const rel = id.slice('file:'.length);
      const abs = path.join(sess.vault, rel);
      assertInsideVault(sess.vault, abs);
      const content = await fs.readFile(abs, 'utf8');
      const { content: next, changed } = frontmatter.update(content, {
        agent_block_reason: reason
      });
      if (changed) {
        await atomicWriteFile(abs, next);
        sess.index.upsert(rel, next);
        sess.search.upsert(rel);
        sess.tasks.upsert(rel, next);
        broadcast({ kind: 'change', path: abs, relPath: rel });
      }
    } catch {
      // best effort — a failed frontmatter write should not mask the block
    }
  }
  return rec;
}

async function updateTaskStatus(
  sess: VaultSession,
  id: string,
  status: TaskStatus
): Promise<TaskRecord | null> {
  if (id.startsWith('file:')) {
    const rel = id.slice('file:'.length);
    const abs = path.join(sess.vault, rel);
    assertInsideVault(sess.vault, abs);
    const content = await fs.readFile(abs, 'utf8');
    const { content: next, changed } = frontmatter.update(content, { status });
    if (changed) {
      await atomicWriteFile(abs, next);
      sess.index.upsert(rel, next);
      sess.search.upsert(rel);
      sess.tasks.upsert(rel, next);
      broadcast({ kind: 'change', path: abs, relPath: rel });
    }
    return sess.tasks.tasksOf(rel).find((t) => t.id === id) ?? null;
  }
  if (id.startsWith('inline:')) {
    const rest = id.slice('inline:'.length);
    const lastColon = rest.lastIndexOf(':');
    if (lastColon < 0) return null;
    const rel = rest.slice(0, lastColon);
    const line = Number.parseInt(rest.slice(lastColon + 1), 10);
    if (!Number.isFinite(line)) return null;
    const abs = path.join(sess.vault, rel);
    assertInsideVault(sess.vault, abs);
    const content = await fs.readFile(abs, 'utf8');
    // Inline task line numbers in TaskRecord are relative to the body (post
    // frontmatter strip). Compute the absolute line offset.
    const { raw } = frontmatter.read(content);
    const fmLines = raw ? raw.split(/\r?\n/).length - 1 : 0;
    const absLine = fmLines + line;
    const next = applyInlineTaskStatus(content, absLine, status);
    if (next !== content) {
      await atomicWriteFile(abs, next);
      sess.index.upsert(rel, next);
      sess.search.upsert(rel);
      sess.tasks.upsert(rel, next);
      broadcast({ kind: 'change', path: abs, relPath: rel });
    }
    return sess.tasks.tasksOf(rel).find((t) => t.id === id) ?? null;
  }
  return null;
}

async function closeProject(
  sess: VaultSession,
  abs: string
): Promise<CloseProjectResult> {
  assertInsideVault(sess.vault, abs);
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(abs);
  } catch {
    throw new Error(`closeProject: path not found: ${abs}`);
  }

  // --- Folder-mode project ---
  if (stat.isDirectory()) {
    // Identify the project by reading .agent/config.json if present.
    const configPath = path.join(abs, '.agent', 'config.json');
    let uid = '';
    try {
      const cfgRaw = await fs.readFile(configPath, 'utf8');
      const cfg = JSON.parse(cfgRaw) as { uid?: string };
      if (typeof cfg.uid === 'string') uid = cfg.uid;
    } catch {
      // Fall back to README frontmatter.
    }
    const readmePath = path.join(abs, 'README.md');
    let readmeContent = '';
    try {
      readmeContent = await fs.readFile(readmePath, 'utf8');
    } catch {
      // tolerate
    }
    if (!uid && readmeContent) {
      const parsed = frontmatter.read(readmeContent);
      if (typeof parsed.data['uid'] === 'string') uid = parsed.data['uid'] as string;
    }
    if (!uid) throw new Error('closeProject: project has no uid');
    const r = await archiveProjectByUid(sess.vault, uid);
    await refreshRangeInIndex(sess, r.oldPath, r.newPath);
    const newReadmeAbs = path.join(r.newPath, 'README.md');
    const newRel = toPosix(vaultRel(sess.vault, newReadmeAbs));
    broadcast({
      kind: 'rename',
      path: newReadmeAbs,
      relPath: newRel,
      oldPath: readmePath,
      oldRelPath: toPosix(vaultRel(sess.vault, readmePath))
    });
    return {
      oldPath: r.oldPath,
      newPath: r.newPath,
      newRelPath: toPosix(vaultRel(sess.vault, r.newPath)),
      uid: r.uid,
      archivedAt: r.archivedAt,
      linksUpdated: 0
    };
  }

  // --- Legacy single-file project ---
  const oldRel = toPosix(vaultRel(sess.vault, abs));
  const content = await fs.readFile(abs, 'utf8');
  const parsed = frontmatter.read(content);
  if (parsed.data['type'] !== 'project') {
    throw new Error('closeProject: not a project file');
  }
  const archivedAt = new Date().toISOString();
  const year = archivedAt.slice(0, 4);
  const targetDir = path.join(sess.vault, '04_Archives', year);
  await fs.mkdir(targetDir, { recursive: true });
  const newAbs = path.join(targetDir, path.basename(abs));
  assertInsideVault(sess.vault, newAbs);
  const newRel = toPosix(vaultRel(sess.vault, newAbs));
  const updated = frontmatter.update(content, {
    type: 'archive',
    archived_at: archivedAt,
    original_type: 'project'
  });
  await fs.writeFile(abs, updated.content, 'utf8');
  await fs.rename(abs, newAbs);
  sess.refmap.renamePath(abs, newAbs);
  sess.index.rename(oldRel, newRel);
  sess.search.rename(oldRel, newRel);
  sess.tasks.rename(oldRel, newRel);
  sess.index.upsert(newRel, updated.content);
  sess.tasks.upsert(newRel, updated.content);
  await sess.refmap.flush();
  const linksUpdated = await rewriteBacklinksOnRename(sess, abs, newAbs);
  broadcast({ kind: 'rename', path: newAbs, relPath: newRel, oldPath: abs, oldRelPath: oldRel });
  const uid =
    typeof parsed.data['uid'] === 'string' ? (parsed.data['uid'] as string) : '';
  return {
    oldPath: abs,
    newPath: newAbs,
    newRelPath: newRel,
    uid,
    archivedAt,
    linksUpdated
  };
}

// Re-export parse helpers for ad-hoc use.
export { parseWikilinks, walkMarkdown };
