import path from 'node:path';
import * as frontmatter from './frontmatter';
import {
  type Effort,
  type EntitySummary,
  type ParaEntityType,
  type TaskRecord,
  type TaskStatus,
  TASK_STATUSES,
  normalizeTaskStatus
} from '@shared/schemas';
import { toPosix } from './pathGuard';

export const INLINE_TASK_RE = /^(\s*)-\s*\[( |x|X)\]\s+(.*)$/;
export const STATUS_COMMENT_RE = /<!--\s*orbit:status=([a-z]+)\s*-->/i;

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asNullableString(v: unknown): string | null | undefined {
  if (typeof v === 'string') return v;
  if (v === null) return null;
  return undefined;
}

function asStringArr(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const x of v) if (typeof x === 'string') out.push(x);
  return out.length ? out : undefined;
}

function asEffort(v: unknown): Effort | undefined {
  if (v === 'xs' || v === 's' || v === 'm' || v === 'l' || v === 'xl') return v;
  return undefined;
}

function asTaskStatus(v: unknown, fallback: TaskStatus = 'backlog'): TaskStatus {
  return normalizeTaskStatus(v) ?? fallback;
}

/**
 * Parse the inline GFM checklist tasks contained in `body`. Line numbers are
 * 1-based relative to `body` (i.e. after any frontmatter has been stripped).
 */
export function parseInlineTasks(
  body: string
): { line: number; status: TaskStatus; title: string }[] {
  const out: { line: number; status: TaskStatus; title: string }[] = [];
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const m = line.match(INLINE_TASK_RE);
    if (!m) continue;
    const checked = m[2] !== ' ';
    let rest = (m[3] ?? '').trim();
    let status: TaskStatus = checked ? 'done' : 'backlog';
    const sc = rest.match(STATUS_COMMENT_RE);
    if (sc) {
      rest = rest.replace(STATUS_COMMENT_RE, '').trim();
      if (!checked) status = asTaskStatus(sc[1], 'backlog');
    }
    out.push({ line: i + 1, status, title: rest });
  }
  return out;
}

/**
 * Build a list of tasks (file + inline) for a single markdown file whose
 * content has already been loaded. `absPath`/`relPath` must point to the same
 * file. Used by `TaskIndex` per-file and also exported for unit tests.
 */
export function tasksOfFile(
  absPath: string,
  relPath: string,
  content: string
): TaskRecord[] {
  const { data, body } = frontmatter.read(content);
  const out: TaskRecord[] = [];
  const ownerProject =
    data['type'] === 'project' ? asString(data['uid']) : asString(data['project_uid']);
  const ownerArea =
    data['type'] === 'area' ? asString(data['uid']) : asString(data['area_uid']);

  if (data['type'] === 'task') {
    const title = asString(data['title']) ?? path.basename(relPath, '.md');
    const status = asTaskStatus(data['status']);
    const rec: TaskRecord = {
      id: `file:${toPosix(relPath)}`,
      source: 'file',
      status,
      title,
      filePath: absPath,
      relPath: toPosix(relPath)
    };
    const uid = asString(data['uid']);
    if (uid) rec.uid = uid;
    const pu = asString(data['project_uid']);
    if (pu) rec.project_uid = pu;
    const au = asString(data['area_uid']);
    if (au) rec.area_uid = au;
    const due = asString(data['due']);
    if (due) rec.due = due;
    const effort = asEffort(data['effort']);
    if (effort) rec.effort = effort;
    const tags = asStringArr(data['tags']);
    if (tags) rec.tags = tags;
    const priority = asString(data['priority']);
    if (priority === 'low' || priority === 'med' || priority === 'high') rec.priority = priority;
    const executionStrategy = asString(data['execution_strategy']);
    if (executionStrategy === 'manual' || executionStrategy === 'autonomous') {
      rec.execution_strategy = executionStrategy;
    }
    const preConditions = asStringArr(data['pre_conditions']);
    if (preConditions) rec.pre_conditions = preConditions;
    const origin = asString(data['origin']);
    if (origin === 'human' || origin === 'agent' || origin === 'system' || origin === 'imported') {
      rec.origin = origin;
    }
    const createdBy = asString(data['created_by']);
    if (createdBy) rec.created_by = createdBy;
    const approvedBy = asNullableString(data['approved_by']);
    if (approvedBy !== undefined) rec.approved_by = approvedBy;
    const approvedAt = asNullableString(data['approved_at']);
    if (approvedAt !== undefined) rec.approved_at = approvedAt;
    const proposedByAgentRun = asNullableString(data['proposed_by_agent_run']);
    if (proposedByAgentRun !== undefined) rec.proposed_by_agent_run = proposedByAgentRun;
    const proposedDuringTask = asNullableString(data['proposed_during_task']);
    if (proposedDuringTask !== undefined) rec.proposed_during_task = proposedDuringTask;
    const proposalId = asNullableString(data['proposal_id']);
    if (proposalId !== undefined) rec.proposal_id = proposalId;
    const approvalDecisionNote = asNullableString(data['approval_decision_note']);
    if (approvalDecisionNote !== undefined) rec.approval_decision_note = approvalDecisionNote;
    const assignedTo = asString(data['assigned_to']);
    if (assignedTo) rec.assigned_to = assignedTo;
    const ownerType = asString(data['owner_type']);
    if (ownerType === 'agent' || ownerType === 'binding' || ownerType === 'human') {
      rec.owner_type = ownerType;
    }
    const ownerId = asString(data['owner_id']);
    if (ownerId) rec.owner_id = ownerId;
    const claimedAt = asString(data['claimed_at']);
    if (claimedAt) rec.claimed_at = claimedAt;
    const activeRunId = asString(data['active_run_id']);
    if (activeRunId) rec.active_run_id = activeRunId;
    const parentTaskUid = asString(data['parent_task_uid']);
    if (parentTaskUid) rec.parent_task_uid = parentTaskUid;
    const generatedFromTaskUid = asString(data['generated_from_task_uid']);
    if (generatedFromTaskUid) rec.generated_from_task_uid = generatedFromTaskUid;
    rec.depends_on = asStringArr(data['depends_on']) ?? [];
    const derivedFrom = asNullableString(data['derived_from']);
    rec.derived_from = derivedFrom ?? null;
    const roleBindingId = asString(data['role_binding_id']);
    if (roleBindingId) rec.role_binding_id = roleBindingId;
    const recommendedRole = asString(data['recommended_role']);
    if (recommendedRole) rec.recommended_role = recommendedRole;
    const candidateRoleSlugs = asStringArr(data['candidate_role_slugs']);
    if (candidateRoleSlugs) rec.candidate_role_slugs = candidateRoleSlugs;
    const blockedReason = asString(data['blocked_reason'] ?? data['agent_block_reason']);
    if (blockedReason) rec.blocked_reason = blockedReason;
    if (data['recommended'] === true) rec.recommended = true;
    out.push(rec);
  }

  for (const t of parseInlineTasks(body)) {
    const rec: TaskRecord = {
      id: `inline:${toPosix(relPath)}:${t.line}`,
      source: 'inline',
      status: t.status,
      title: t.title,
      filePath: absPath,
      relPath: toPosix(relPath),
      line: t.line
    };
    if (ownerProject) rec.project_uid = ownerProject;
    if (ownerArea) rec.area_uid = ownerArea;
    out.push(rec);
  }
  return out;
}

/**
 * In-memory task index keyed by relPath. The owning `VaultIndex` calls
 * `upsert`/`remove`/`rename` on file events so this stays consistent with the
 * markdown index.
 */
export class TaskIndex {
  private readonly vault: string;
  // relPath -> tasks
  private byFile: Map<string, TaskRecord[]> = new Map();
  // relPath -> entity summary
  private entities: Map<string, EntitySummary> = new Map();

  constructor(vault: string) {
    this.vault = vault;
  }

  upsert(relPath: string, content: string): void {
    const rel = toPosix(relPath);
    const abs = path.join(this.vault, rel);
    const tasks = tasksOfFile(abs, rel, content);
    if (tasks.length) this.byFile.set(rel, tasks);
    else this.byFile.delete(rel);
    this.upsertEntity(rel, content, abs);
  }

  private upsertEntity(rel: string, content: string, abs: string): void {
    const { data } = frontmatter.read(content);
    const t = data['type'];
    if (t === 'project' || t === 'area' || t === 'resource' || t === 'archive') {
      const uid = asString(data['uid']);
      if (!uid) {
        this.entities.delete(rel);
        return;
      }
      const summary: EntitySummary = {
        type: t as ParaEntityType,
        uid,
        title: asString(data['title']) ?? path.basename(rel, '.md'),
        relPath: rel,
        path: abs
      };
      const s = asString(data['status']);
      if (s) summary.status = s;
      const au = asString(data['area_uid']);
      if (au) summary.area_uid = au;
      const at = asString(data['archived_at']);
      if (at) summary.archived_at = at;
      const ot = asString(data['original_type']);
      if (ot === 'project' || ot === 'area' || ot === 'resource') summary.original_type = ot;
      this.entities.set(rel, summary);
    } else {
      this.entities.delete(rel);
    }
  }

  remove(relPath: string): void {
    const rel = toPosix(relPath);
    this.byFile.delete(rel);
    this.entities.delete(rel);
  }

  rename(oldRel: string, newRel: string): void {
    const src = toPosix(oldRel);
    const dst = toPosix(newRel);
    const t = this.byFile.get(src);
    if (t) {
      this.byFile.delete(src);
      const abs = path.join(this.vault, dst);
      const remapped = t.map((x) => ({
        ...x,
        filePath: abs,
        relPath: dst,
        id:
          x.source === 'file'
            ? `file:${dst}`
            : `inline:${dst}:${x.line ?? 0}`
      }));
      this.byFile.set(dst, remapped);
    }
    const e = this.entities.get(src);
    if (e) {
      this.entities.delete(src);
      this.entities.set(dst, { ...e, relPath: dst, path: path.join(this.vault, dst) });
    }
  }

  tasksOf(relPath: string): TaskRecord[] {
    return this.byFile.get(toPosix(relPath)) ?? [];
  }

  allTasks(): TaskRecord[] {
    const out: TaskRecord[] = [];
    for (const arr of this.byFile.values()) out.push(...arr);
    return out;
  }

  allEntities(): EntitySummary[] {
    return [...this.entities.values()];
  }
}
