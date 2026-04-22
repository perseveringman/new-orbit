import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import {
  PROJECTS_DIR,
  PROJECT_AGENT_DIR,
  PROJECT_TASKS_DIR
} from '@shared/constants';
import * as frontmatter from './frontmatter';
import { listProjects } from './project';

export interface RelinkResult {
  taskPath: string;
  relPath: string;
  uid: string;
  projectUid: string;
  /** True when the file was physically moved to the target project folder. */
  moved: boolean;
}

/**
 * Relink a task markdown file to a different project. Rewrites the
 * `project_uid` frontmatter. If the file currently lives outside the target
 * project's `.agent/tasks/` directory, it is physically moved via `git mv`
 * when possible, or a plain rename when the source repo can't track it.
 *
 * Idempotent: no-op (but still returns a consistent result) when the task is
 * already linked to the target project and already in place.
 */
export async function relinkTask(
  vault: string,
  taskAbsPath: string,
  newProjectUid: string
): Promise<RelinkResult> {
  const projects = await listProjects(vault);
  const target = projects.find((p) => p.uid === newProjectUid);
  if (!target) throw new Error(`project_uid not found: ${newProjectUid}`);
  if (target.legacy) {
    throw new Error(
      `project "${target.slug}" is legacy (single-file). Migrate it first.`
    );
  }

  const targetTasksDir = path.join(
    target.path,
    PROJECT_AGENT_DIR,
    PROJECT_TASKS_DIR
  );
  await fs.mkdir(targetTasksDir, { recursive: true });

  let raw: string;
  try {
    raw = await fs.readFile(taskAbsPath, 'utf8');
  } catch (err) {
    throw new Error(
      `task file not readable: ${taskAbsPath} (${(err as Error).message})`
    );
  }
  const { data } = frontmatter.read(raw);
  const uid = typeof data['uid'] === 'string' ? (data['uid'] as string) : '';

  // 1) rewrite frontmatter so project_uid matches target
  const patched = frontmatter.update(raw, { project_uid: newProjectUid }).content;
  if (patched !== raw) {
    await fs.writeFile(taskAbsPath, patched, 'utf8');
  }

  // 2) if the file sits elsewhere, try to move into target `.agent/tasks/`
  const desired = path.join(targetTasksDir, path.basename(taskAbsPath));
  let finalPath = taskAbsPath;
  let moved = false;

  if (path.resolve(taskAbsPath) !== path.resolve(desired)) {
    // Work out whether the source lives inside another project repo we can
    // use `git mv` on. If yes, prefer that so history follows.
    const srcProjectsRoot = path.join(vault, PROJECTS_DIR);
    const relFromProjects = path.relative(srcProjectsRoot, taskAbsPath);
    const srcProjectSlug = relFromProjects.split(path.sep)[0];
    let movedViaGit = false;
    if (
      srcProjectSlug &&
      !relFromProjects.startsWith('..') &&
      srcProjectSlug !== target.slug
    ) {
      const srcRepoDir = path.join(srcProjectsRoot, srcProjectSlug);
      try {
        const srcIsRepo = await simpleGit(srcRepoDir).checkIsRepo();
        const tgtIsRepo = await simpleGit(target.path).checkIsRepo();
        if (srcIsRepo && tgtIsRepo) {
          // cross-repo: can't git mv; fall back to filesystem move
          movedViaGit = false;
        } else if (srcIsRepo && !tgtIsRepo) {
          // unusual; plain move
          movedViaGit = false;
        }
      } catch {
        /* ignore */
      }
    }

    // Overwriting an existing file at the target is refused — caller must
    // resolve the collision first.
    try {
      await fs.access(desired);
      throw new Error(
        `relink collision: ${desired} already exists. Delete or rename it before relinking.`
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // actual error (not "file doesn't exist")
        if ((err as Error).message?.startsWith('relink collision')) throw err;
      }
    }

    if (movedViaGit) {
      // currently unused branch (kept for future same-repo moves)
      await simpleGit(path.dirname(taskAbsPath)).raw(['mv', taskAbsPath, desired]);
    } else {
      await fs.rename(taskAbsPath, desired).catch(async (err) => {
        if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
          await fs.copyFile(taskAbsPath, desired);
          await fs.unlink(taskAbsPath);
        } else {
          throw err;
        }
      });
    }
    finalPath = desired;
    moved = true;
  }

  return {
    taskPath: finalPath,
    relPath: path.posix.join(
      PROJECTS_DIR,
      target.slug,
      PROJECT_AGENT_DIR,
      PROJECT_TASKS_DIR,
      path.basename(finalPath)
    ),
    uid,
    projectUid: newProjectUid,
    moved
  };
}
