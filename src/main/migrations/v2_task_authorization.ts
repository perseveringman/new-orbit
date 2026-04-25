import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { ActivityEventInput } from '@shared/activity';
import * as frontmatter from '../frontmatter';
import { toPosix, vaultRel } from '../pathGuard';
import { walkMarkdown } from '../walk';
import { createActivityEmitter } from '../activity/emitter';
import { createActivityStore } from '../activity/store';

const SNAPSHOT_MESSAGE = 'orbit: pre-v2 task authorization migration snapshot';

export interface SafetySnapshotResult {
  snapshotSha: string | null;
  warning?: string;
}

export interface V2TaskAuthorizationMigrationDeps {
  createSafetySnapshot?: (vault: string, message: string) => Promise<SafetySnapshotResult>;
  emitActivity?: (vault: string, input: ActivityEventInput) => Promise<void>;
  warn?: (message: string) => void;
  now?: () => Date;
}

export interface V2TaskAuthorizationMigrationReport {
  migrated: string[];
  skipped: string[];
  warnings: string[];
  snapshotSha: string | null;
  dryRun: boolean;
}

interface Candidate {
  absPath: string;
  relPath: string;
}

function hasOwn(data: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function approvedAtFromMtime(mtime: Date, now: () => Date): string {
  return Number.isFinite(mtime.getTime()) ? mtime.toISOString() : now().toISOString();
}

function taskAuthorizationUpdates(
  data: Record<string, unknown>,
  approvedAt: string
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  if (!hasOwn(data, 'created_by')) updates['created_by'] = 'user';
  if (!hasOwn(data, 'approved_by')) updates['approved_by'] = 'user';
  if (!hasOwn(data, 'approved_at')) updates['approved_at'] = approvedAt;
  if (!hasOwn(data, 'proposed_by_agent_run')) updates['proposed_by_agent_run'] = null;
  if (!hasOwn(data, 'proposed_during_task')) updates['proposed_during_task'] = null;
  if (!hasOwn(data, 'proposal_id')) updates['proposal_id'] = null;
  if (!hasOwn(data, 'approval_decision_note')) updates['approval_decision_note'] = null;
  return updates;
}

async function taskNeedsAuthorizationBackfill(
  absPath: string,
  relPath: string,
  now: () => Date
): Promise<boolean> {
  const raw = await fs.readFile(absPath, 'utf8');
  const { data } = frontmatter.read(raw);
  if (data['type'] !== 'task') return false;
  const stat = await fs.stat(absPath);
  const updates = taskAuthorizationUpdates(data, approvedAtFromMtime(stat.mtime, now));
  return Object.keys(updates).length > 0 && relPath.length > 0;
}

async function collectCandidates(vault: string, now: () => Date): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  for await (const absPath of walkMarkdown(vault)) {
    const relPath = toPosix(vaultRel(vault, absPath));
    try {
      if (await taskNeedsAuthorizationBackfill(absPath, relPath, now)) {
        candidates.push({ absPath, relPath });
      }
    } catch {
      continue;
    }
  }
  return candidates;
}

async function applyBackfill(candidate: Candidate, now: () => Date): Promise<boolean> {
  const raw = await fs.readFile(candidate.absPath, 'utf8');
  const { data } = frontmatter.read(raw);
  if (data['type'] !== 'task') return false;
  const stat = await fs.stat(candidate.absPath);
  const updates = taskAuthorizationUpdates(data, approvedAtFromMtime(stat.mtime, now));
  if (Object.keys(updates).length === 0) return false;
  const patched = frontmatter.update(raw, updates);
  if (!patched.changed) return false;
  await fs.writeFile(candidate.absPath, patched.content, 'utf8');
  return true;
}

async function defaultSafetySnapshot(
  vault: string,
  message: string
): Promise<SafetySnapshotResult> {
  const git = simpleGit(vault);
  const isRepo = await git.checkIsRepo().catch(() => false);
  const topLevel = isRepo ? await git.revparse(['--show-toplevel']).catch(() => '') : '';
  if (!isRepo || path.resolve(topLevel.trim()) !== path.resolve(vault)) {
    return {
      snapshotSha: null,
      warning:
        'v2 task authorization migration safety snapshot skipped: vault is not a git repository'
    };
  }

  try {
    const before = await git.status();
    if (before.files.length > 0) {
      await git.add('.');
      await git.commit(message);
    }
    const sha = await git.revparse(['HEAD']).catch(() => '');
    const snapshotSha = sha.trim();
    if (snapshotSha.length > 0) return { snapshotSha };
    return {
      snapshotSha: null,
      warning:
        'v2 task authorization migration safety snapshot failed: repository has no HEAD commit'
    };
  } catch (error) {
    return {
      snapshotSha: null,
      warning: `v2 task authorization migration safety snapshot failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }
}

async function defaultEmitActivity(vault: string, input: ActivityEventInput): Promise<void> {
  const emitter = createActivityEmitter(createActivityStore(vault));
  await emitter.emitAndWait(input);
}

export async function migrateV2TaskAuthorization(
  vault: string,
  opts: { dryRun?: boolean; deps?: V2TaskAuthorizationMigrationDeps } = {}
): Promise<V2TaskAuthorizationMigrationReport> {
  const dryRun = opts.dryRun === true;
  const deps = opts.deps ?? {};
  const now = deps.now ?? (() => new Date());
  const warn = deps.warn ?? ((message: string) => console.warn(`[migration] ${message}`));
  const createSafetySnapshot = deps.createSafetySnapshot ?? defaultSafetySnapshot;
  const emitMigrationActivity = deps.emitActivity ?? defaultEmitActivity;
  const migrated: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];
  let snapshotSha: string | null = null;

  const candidates = await collectCandidates(vault, now);
  if (dryRun) {
    return {
      migrated: candidates.map((candidate) => candidate.relPath),
      skipped,
      warnings,
      snapshotSha,
      dryRun
    };
  }
  if (candidates.length === 0) {
    return { migrated, skipped, warnings, snapshotSha, dryRun };
  }

  const snapshot = await createSafetySnapshot(vault, SNAPSHOT_MESSAGE);
  snapshotSha = snapshot.snapshotSha;
  if (snapshot.warning) {
    warnings.push(snapshot.warning);
    warn(snapshot.warning);
  }

  for (const candidate of candidates) {
    try {
      if (await applyBackfill(candidate, now)) {
        migrated.push(candidate.relPath);
      } else {
        skipped.push(candidate.relPath);
      }
    } catch (error) {
      const message = `v2 task authorization migration skipped ${candidate.relPath}: ${
        error instanceof Error ? error.message : String(error)
      }`;
      warnings.push(message);
      warn(message);
      skipped.push(candidate.relPath);
    }
  }

  if (migrated.length > 0) {
    await emitMigrationActivity(vault, {
      actor: 'system',
      action: 'migration.v2_task_authorization',
      context: {},
      payload: { migrated_count: migrated.length, snapshotSha },
      summary: `Backfilled v2 task authorization fields for ${migrated.length} task(s)`
    }).catch((error: unknown) => {
      const message = `v2 task authorization migration activity log failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      warnings.push(message);
      warn(message);
    });
  }

  return { migrated, skipped, warnings, snapshotSha, dryRun };
}
