import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { TaskRecord } from '@shared/schemas';
import { currentSession } from '../fs';
import { listProjects } from '../project';
import { toPosix, vaultRel } from '../pathGuard';

export async function refreshTaskFileInSession(absPath: string): Promise<void> {
  const sess = currentSession();
  if (!sess) return;
  try {
    const raw = await fs.readFile(absPath, 'utf8');
    const rel = toPosix(vaultRel(sess.vault, absPath));
    sess.index.upsert(rel, raw);
    sess.search.upsert(rel);
    sess.tasks.upsert(rel, raw);
  } catch {
    // ignore
  }
}

export async function findProjectPathByUid(vaultPath: string, projectUid: string): Promise<string | null> {
  const projects = await listProjects(vaultPath);
  return projects.find((project) => project.uid === projectUid)?.path ?? null;
}

export function currentProjectTasks(projectUid?: string): TaskRecord[] {
  const sess = currentSession();
  if (!sess) return [];
  return sess.tasks
    .allTasks()
    .filter((task) => !projectUid || task.project_uid === projectUid);
}

export function relPathForTask(absPath: string): string | null {
  const sess = currentSession();
  if (!sess) return null;
  try {
    return toPosix(vaultRel(sess.vault, absPath));
  } catch {
    return null;
  }
}
