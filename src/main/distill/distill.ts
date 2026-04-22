import { promises as fs } from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { ORBIT_DIR, ORBIT_GIT_LOG, ORBIT_LOGS_DIR } from '@shared/constants';
import * as frontmatter from '../frontmatter';
import { toPosix, vaultRel } from '../pathGuard';
import type { VaultSession } from '../fs';
import type { TaskRecord } from '@shared/schemas';
import type { AgentEvent, CostRecord } from '@shared/agent';
import {
  composeDistillPrompt,
  parseDistillResponse,
  renderDistillBody,
  type GitLogEntry,
  type RelatedFile
} from './prompt';
import { DISTILL_PERSONA } from './persona';
import {
  appendCostRecord,
  buildCostRecord,
  estimateTokens,
  readCostRecords,
  estimateUsd
} from '../agent/tokens';

export interface DistillResult {
  resourcePath: string;
  resourceRelPath: string;
  resourceUid: string;
  runId: string;
}

/**
 * Runner abstraction so tests can drive the distillation without
 * spawning `claude`. Returns the full final assistant text once the
 * run is complete.
 */
export interface DistillRunner {
  run(args: {
    prompt: string;
    cwd: string;
    vaultPath: string;
    title: string;
  }): Promise<{ runId: string; finalText: string; events?: AgentEvent[] }>;
  cancel?(runId: string): Promise<void>;
}

export interface DistillDeps {
  session: VaultSession;
  runner: DistillRunner;
  now?: () => Date;
  /** Injected so tests can bypass monthly cost file randomness. */
  writeResource?: (abs: string, content: string) => Promise<void>;
}

const shortUid = (uid: string): string => (uid || '').slice(0, 8) || nanoid(8);

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'project'
  );
}

async function readGitLog(vault: string): Promise<GitLogEntry[]> {
  const p = path.join(vault, ORBIT_DIR, ORBIT_LOGS_DIR, ORBIT_GIT_LOG);
  try {
    const raw = await fs.readFile(p, 'utf8');
    const out: GitLogEntry[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line) as GitLogEntry;
        if (obj && typeof obj === 'object' && typeof obj.at === 'string') {
          out.push(obj);
        }
      } catch {
        // ignore bad line
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function collectRelatedFiles(
  session: VaultSession,
  projectUid: string
): Promise<RelatedFile[]> {
  const out: RelatedFile[] = [];
  for (const entry of session.index.all()) {
    if (entry.relPath.endsWith('.md') === false) continue;
    try {
      const abs = path.join(session.vault, entry.relPath);
      const raw = await fs.readFile(abs, 'utf8');
      const { data, body } = frontmatter.read(raw);
      const pu =
        typeof data['project_uid'] === 'string' ? data['project_uid'] : undefined;
      const uid = typeof data['uid'] === 'string' ? data['uid'] : undefined;
      // Skip the archived project itself; include everything tagged to it.
      if (uid === projectUid) continue;
      if (pu !== projectUid) continue;
      const title =
        typeof data['title'] === 'string'
          ? data['title']
          : path.basename(entry.relPath, '.md');
      out.push({ relPath: entry.relPath, title, body });
    } catch {
      // skip unreadable
    }
  }
  return out;
}

function collectClosedTasks(
  session: VaultSession,
  projectUid: string
): TaskRecord[] {
  return session.tasks
    .allTasks()
    .filter((t) => t.project_uid === projectUid && t.status === 'done');
}

function withinRange(at: string, from?: string, to?: string): boolean {
  if (from && at < from) return false;
  if (to && at > to) return false;
  return true;
}

async function readCostLifecycle(
  vault: string,
  lifecycle: { from?: string; to?: string }
): Promise<CostRecord[]> {
  // Walk current + previous 3 months; sufficient for typical project scopes.
  const out: CostRecord[] = [];
  const seen = new Set<string>();
  const now = new Date();
  for (let i = 0; i < 4; i++) {
    const at = new Date(now);
    at.setUTCMonth(at.getUTCMonth() - i);
    const recs = await readCostRecords(vault, at);
    for (const r of recs) {
      const key = `${r.runId}:${r.at}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (withinRange(r.at, lifecycle.from, lifecycle.to)) out.push(r);
    }
  }
  return out;
}

async function firstMentionAt(vault: string, projectUid: string): Promise<string | undefined> {
  const gl = await readGitLog(vault);
  // Git log entries may contain a `projectUid` marker when Orbit writes them;
  // fall back to scanning for the uid as a substring in any field.
  for (const entry of gl) {
    if ((entry as Record<string, unknown>)['projectUid'] === projectUid) return entry.at;
    const blob = JSON.stringify(entry);
    if (blob.includes(projectUid)) return entry.at;
  }
  return undefined;
}

/**
 * Distill a closed project into a new resource file under
 * `03_Resources/distilled/`. Spawns the injected runner, parses the
 * response into the seven-section template, and logs a cost record
 * with reason `distilled`.
 */
export async function distillProject(
  args: { projectUid: string; archivedAbsPath: string },
  deps: DistillDeps
): Promise<DistillResult> {
  const { session, runner } = deps;
  const now = deps.now ?? (() => new Date());

  // Read the archived project file to pull title + body.
  const archivedRaw = await fs.readFile(args.archivedAbsPath, 'utf8');
  const { data: archivedFm, body: archivedBody } = frontmatter.read(archivedRaw);
  const projectTitle =
    typeof archivedFm['title'] === 'string'
      ? archivedFm['title']
      : path.basename(args.archivedAbsPath, '.md');
  const archivedRelPath = toPosix(vaultRel(session.vault, args.archivedAbsPath));
  const archivedAt =
    typeof archivedFm['archived_at'] === 'string' ? archivedFm['archived_at'] : undefined;

  const relatedFiles = await collectRelatedFiles(session, args.projectUid);
  const tasks = collectClosedTasks(session, args.projectUid);

  const lifecycle = {
    from: await firstMentionAt(session.vault, args.projectUid),
    to: archivedAt
  };
  const gitLogAll = await readGitLog(session.vault);
  const gitLog = gitLogAll.filter((g) => withinRange(g.at, lifecycle.from, lifecycle.to));
  const costRecords = await readCostLifecycle(session.vault, lifecycle);

  const prompt = composeDistillPrompt({
    projectUid: args.projectUid,
    projectTitle,
    archivedRelPath,
    projectBody: archivedBody,
    relatedFiles,
    tasks,
    gitLog,
    costRecords,
    lifecycle
  });

  const runResult = await runner.run({
    prompt,
    cwd: session.vault,
    vaultPath: session.vault,
    title: `Distill: ${projectTitle}`
  });

  const sections = parseDistillResponse(runResult.finalText);
  const body = renderDistillBody(sections);

  const resourceUid = nanoid(12);
  const resourceAt = now().toISOString();
  const fm: Record<string, unknown> = {
    uid: resourceUid,
    type: 'resource',
    title: `Distilled: ${projectTitle}`,
    source_project_uid: args.projectUid,
    tags: ['distilled'],
    distilled_at: resourceAt
  };
  const written = frontmatter.write(fm, `\n${body}`);

  const slug = slugify(projectTitle);
  const filename = `${slug}-${shortUid(args.projectUid)}.md`;
  const resourceAbs = path.join(session.vault, '03_Resources', 'distilled', filename);
  const resourceRel = toPosix(vaultRel(session.vault, resourceAbs));
  await fs.mkdir(path.dirname(resourceAbs), { recursive: true });
  const writer =
    deps.writeResource ??
    (async (abs: string, content: string) => {
      await fs.writeFile(abs, content, 'utf8');
    });
  await writer(resourceAbs, written);

  // Update in-memory indices so the new file is immediately searchable.
  session.index.upsert(resourceRel, written);
  session.search.upsert(resourceRel);
  session.tasks.upsert(resourceRel, written);

  // Cost record for the distillation run.
  const record = buildCostRecord({
    runId: runResult.runId,
    taskId: null,
    promptText: prompt,
    completionText: runResult.finalText,
    at: resourceAt
  });
  record.reason = 'distilled';
  // If the runner reported tokens via events, prefer them.
  const events = runResult.events ?? [];
  for (const ev of events) {
    if (ev.kind === 'cost') {
      if (typeof ev.input_tokens === 'number') record.input = ev.input_tokens;
      if (typeof ev.output_tokens === 'number') record.output = ev.output_tokens;
      if (typeof ev.total_cost_usd === 'number') {
        record.estUSD = ev.total_cost_usd;
        record.source = 'cli';
      } else {
        record.estUSD = estimateUsd(record.input, record.output);
      }
    }
  }
  await appendCostRecord(session.vault, record);

  return {
    resourcePath: resourceAbs,
    resourceRelPath: resourceRel,
    resourceUid,
    runId: runResult.runId
  };
}

/** Export for prompt tests: expose the persona string. */
export { DISTILL_PERSONA };

/** Estimate-only cost helper used by the budget gate in the IPC layer. */
export function estimateDistillCost(promptText: string): {
  tokens: number;
  usd: number;
} {
  const tokens = estimateTokens(promptText);
  return { tokens, usd: (tokens / 1_000_000) * 3 };
}
