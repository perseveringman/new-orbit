import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { spawn as nodeSpawn } from 'node:child_process';
import { nanoid } from 'nanoid';
import { simpleGit } from 'simple-git';
import { ORBIT_DIR } from '@shared/constants';
import type { CheckReport } from '@shared/git';
import { listProjects, listProjectTaskPaths } from '../project';
import * as frontmatter from '../frontmatter';
import { parseTaskSections, appendToSection } from '../task_sections';
import { runPreMergeCheck } from '../git/checks';
import { hasGhCli } from '../env/gh';
import { runProjectLifecycle } from '../project_lifecycle';
import { LIMITS } from '@shared/limits';

export type NightShiftTaskPhase =
  | 'pending'
  | 'worktree'
  | 'running'
  | 'pre-merge'
  | 'pr'
  | 'done'
  | 'blocked'
  | 'cancelled';

export interface NightShiftTaskStatus {
  taskUid: string;
  title: string;
  projectUid: string;
  projectPath: string;
  taskPath: string;
  phase: NightShiftTaskPhase;
  detail?: string;
  branch?: string;
  prUrl?: string;
  startedAt?: string;
  endedAt?: string;
}

export interface NightShiftPlan {
  taskUids: string[];
  concurrency?: number;
  createPR?: boolean;
}

export interface NightShiftRun {
  runId: string;
  startedAt: string;
  endedAt?: string;
  status: 'running' | 'done' | 'cancelled' | 'error';
  concurrency: number;
  createPR: boolean;
  tasks: NightShiftTaskStatus[];
  summary?: { done: number; blocked: number; cancelled: number };
}

export interface StubRunner {
  runId: string;
  stop(reason?: string): Promise<void>;
  /** Resolves when runner finishes (success → code 0 style). */
  whenExit(): Promise<{ ok: boolean; reason?: string }>;
}

export interface RunnerSpawnArgs {
  taskUid: string;
  taskPath: string;
  projectPath: string;
  worktreePath: string;
  prompt: string;
  vaultPath: string;
}

export interface NightShiftDeps {
  /** Factory for per-task runner (tests stub this). */
  spawnRunner?: (args: RunnerSpawnArgs) => Promise<StubRunner>;
  /** Override pre-merge check (tests). */
  preMergeCheck?: (worktreePath: string, baseRef: string) => Promise<CheckReport>;
  /** Override gh availability probe. */
  hasGh?: () => Promise<boolean>;
  /** Override gh invocation. */
  runGh?: (
    args: string[],
    cwd: string
  ) => Promise<{ stdout: string; code: number }>;
  /** Override worktree creation. */
  createWorktree?: (
    projectPath: string,
    worktreePath: string,
    branch: string
  ) => Promise<void>;
  /** Override worktree teardown. */
  removeWorktree?: (projectPath: string, worktreePath: string) => Promise<void>;
  now?: () => Date;
}

const MAX_CONCURRENCY_CAP = LIMITS.MAX_CONCURRENT_AGENT_RUNS;

// --- DAG sort ---------------------------------------------------------------

interface DagTask {
  uid: string;
  deps: string[];
}

export interface DagSortResult {
  order: string[];
  cycle: string[] | null;
}

export function topoSort(tasks: DagTask[]): DagSortResult {
  const inSet = new Set(tasks.map((t) => t.uid));
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const t of tasks) {
    indeg.set(t.uid, 0);
    adj.set(t.uid, []);
  }
  for (const t of tasks) {
    for (const d of t.deps) {
      if (!inSet.has(d)) continue; // external deps ignored
      adj.get(d)!.push(t.uid);
      indeg.set(t.uid, (indeg.get(t.uid) ?? 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const [u, deg] of indeg) if (deg === 0) queue.push(u);
  queue.sort();
  const order: string[] = [];
  while (queue.length) {
    const u = queue.shift()!;
    order.push(u);
    for (const v of adj.get(u) ?? []) {
      const deg = (indeg.get(v) ?? 0) - 1;
      indeg.set(v, deg);
      if (deg === 0) {
        // keep deterministic
        let i = 0;
        while (i < queue.length && queue[i]! < v) i++;
        queue.splice(i, 0, v);
      }
    }
  }
  if (order.length !== tasks.length) {
    const cycle = tasks.filter((t) => (indeg.get(t.uid) ?? 0) > 0).map((t) => t.uid);
    return { order, cycle };
  }
  return { order, cycle: null };
}

// --- dispatcher -------------------------------------------------------------

async function defaultCreateWorktree(
  projectPath: string,
  worktreePath: string,
  branch: string
): Promise<void> {
  await fs.mkdir(path.dirname(worktreePath), { recursive: true });
  const g = simpleGit(projectPath);
  await g.raw(['worktree', 'add', '-b', branch, worktreePath]);
  await runProjectLifecycle('setup', {
    projectPath,
    vaultPath: projectPath,
    worktreeId: path.basename(worktreePath),
    cwd: worktreePath
  });
}

async function defaultRemoveWorktree(
  projectPath: string,
  worktreePath: string
): Promise<void> {
  await runProjectLifecycle('teardown', {
    projectPath,
    vaultPath: projectPath,
    worktreeId: path.basename(worktreePath),
    cwd: worktreePath
  }).catch(() => undefined);
  try {
    const g = simpleGit(projectPath);
    await g.raw(['worktree', 'remove', '--force', worktreePath]);
  } catch {
    try {
      await fs.rm(worktreePath, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

async function defaultRunGh(
  args: string[],
  cwd: string
): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    let buf = '';
    const child = nodeSpawn('gh', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout?.on('data', (c: Buffer) => {
      buf += c.toString('utf8');
    });
    child.stderr?.on('data', (c: Buffer) => {
      buf += c.toString('utf8');
    });
    child.on('error', () => resolve({ stdout: buf, code: 1 }));
    child.on('close', (code) => resolve({ stdout: buf, code: code ?? 1 }));
  });
}

export class NightShiftDispatcher extends EventEmitter {
  private runs = new Map<string, NightShiftRun>();
  private runners = new Map<string, Map<string, StubRunner>>(); // runId -> taskUid -> runner
  private cancelled = new Set<string>();

  constructor(
    private vaultPath: string,
    private deps: NightShiftDeps = {}
  ) {
    super();
  }

  list(): NightShiftRun[] {
    return [...this.runs.values()].map(cloneRun);
  }

  get(runId: string): NightShiftRun | null {
    const r = this.runs.get(runId);
    return r ? cloneRun(r) : null;
  }

  async start(plan: NightShiftPlan): Promise<string> {
    if (plan.taskUids.length === 0) throw new Error('no taskUids provided');

    const tasks = await this.resolveTasks(plan.taskUids);
    if (tasks.length === 0) throw new Error('no matching tasks found');

    const dag = topoSort(
      tasks.map((t) => ({ uid: t.taskUid, deps: t.preConditions }))
    );
    if (dag.cycle && dag.cycle.length) {
      throw new Error(`pre_conditions form a cycle: ${dag.cycle.join(', ')}`);
    }

    const runId = `ns-${nanoid(8)}`;
    const cpu = Math.max(1, Math.floor((os.cpus().length || 2) / 2));
    const concurrency = Math.min(
      MAX_CONCURRENCY_CAP,
      Math.max(1, plan.concurrency ?? 2, 1),
      cpu
    );
    const createPR = plan.createPR === true;

    const order = dag.order;
    const byUid = new Map(tasks.map((t) => [t.taskUid, t]));

    const run: NightShiftRun = {
      runId,
      startedAt: this.now().toISOString(),
      status: 'running',
      concurrency,
      createPR,
      tasks: order.map((uid) => {
        const t = byUid.get(uid)!;
        const status: NightShiftTaskStatus & { _pre?: string[] } = {
          taskUid: uid,
          title: t.title,
          projectUid: t.projectUid,
          projectPath: t.projectPath,
          taskPath: t.taskPath,
          phase: 'pending'
        };
        status._pre = t.preConditions;
        return status;
      })
    };
    this.runs.set(runId, run);
    this.runners.set(runId, new Map());

    // fire-and-forget main loop
    void this.execute(run).catch((e: Error) => {
      run.status = 'error';
      run.endedAt = this.now().toISOString();
      this.emit('done', { runId, summary: this.summarize(run) });
      this.emit('error', { runId, error: e.message });
    });

    return runId;
  }

  async cancel(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    this.cancelled.add(runId);
    const runners = this.runners.get(runId);
    if (runners) {
      await Promise.all(
        [...runners.values()].map((r) =>
          r.stop('night_shift_cancel').catch(() => undefined)
        )
      );
    }
    for (const t of run.tasks) {
      if (
        t.phase !== 'done' &&
        t.phase !== 'blocked' &&
        t.phase !== 'cancelled'
      ) {
        t.phase = 'cancelled';
        t.endedAt = this.now().toISOString();
        this.emit('progress', {
          runId,
          taskUid: t.taskUid,
          phase: 'cancelled' as NightShiftTaskPhase
        });
      }
    }
    if (run.status === 'running') {
      run.status = 'cancelled';
      run.endedAt = this.now().toISOString();
      run.summary = this.summarize(run);
      this.emit('done', { runId, summary: run.summary });
    }
  }

  // ------------------------------------------------------------------

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private summarize(run: NightShiftRun): { done: number; blocked: number; cancelled: number } {
    let done = 0,
      blocked = 0,
      cancelled = 0;
    for (const t of run.tasks) {
      if (t.phase === 'done') done++;
      else if (t.phase === 'blocked') blocked++;
      else if (t.phase === 'cancelled') cancelled++;
    }
    return { done, blocked, cancelled };
  }

  private async resolveTasks(
    uids: string[]
  ): Promise<
    {
      taskUid: string;
      title: string;
      projectUid: string;
      projectPath: string;
      taskPath: string;
      preConditions: string[];
    }[]
  > {
    const projects = await listProjects(this.vaultPath);
    const want = new Set(uids);
    const out: {
      taskUid: string;
      title: string;
      projectUid: string;
      projectPath: string;
      taskPath: string;
      preConditions: string[];
    }[] = [];
    for (const p of projects) {
      if (p.legacy) continue;
      const paths = await listProjectTaskPaths(p.path);
      for (const abs of paths) {
        try {
          const raw = await fs.readFile(abs, 'utf8');
          const { data } = frontmatter.read(raw);
          const uid = typeof data['uid'] === 'string' ? (data['uid'] as string) : '';
          if (!uid || !want.has(uid)) continue;
          const title =
            (typeof data['title'] === 'string' && (data['title'] as string)) ||
            path.basename(abs, '.md');
          const preConditions = Array.isArray(data['pre_conditions'])
            ? ((data['pre_conditions'] as unknown[]).filter(
                (x): x is string => typeof x === 'string'
              ))
            : [];
          out.push({
            taskUid: uid,
            title,
            projectUid: p.uid,
            projectPath: p.path,
            taskPath: abs,
            preConditions
          });
        } catch {
          /* ignore */
        }
      }
    }
    return out;
  }

  private emitProgress(
    runId: string,
    task: NightShiftTaskStatus,
    phase: NightShiftTaskPhase,
    detail?: string
  ): void {
    task.phase = phase;
    if (detail !== undefined) task.detail = detail;
    this.emit('progress', { runId, taskUid: task.taskUid, phase, detail });
  }

  private async execute(run: NightShiftRun): Promise<void> {
    const queue = [...run.tasks];
    const inFlight = new Set<Promise<void>>();

    const takeNext = (): NightShiftTaskStatus | null => {
      if (this.cancelled.has(run.runId)) return null;
      const doneUids = new Set(
        run.tasks.filter((t) => t.phase === 'done').map((t) => t.taskUid)
      );
      const blockedUids = new Set(
        run.tasks
          .filter((t) => t.phase === 'blocked' || t.phase === 'cancelled')
          .map((t) => t.taskUid)
      );
      for (let i = 0; i < queue.length; i++) {
        const t = queue[i]!;
        const pre = getPreCond(run, t.taskUid);
        const ready = pre.every((u) => doneUids.has(u) || !run.tasks.some((x) => x.taskUid === u));
        const skipUpstream = pre.some((u) => blockedUids.has(u));
        if (skipUpstream) {
          queue.splice(i, 1);
          this.emitProgress(run.runId, t, 'blocked', 'upstream dependency failed');
          t.endedAt = this.now().toISOString();
          i--;
          continue;
        }
        if (ready) {
          queue.splice(i, 1);
          return t;
        }
      }
      return null;
    };

    const runOne = async (task: NightShiftTaskStatus): Promise<void> => {
      try {
        task.startedAt = this.now().toISOString();
        const branch = `orbit/night/${task.taskUid}`;
        task.branch = branch;
        const worktreePath = path.join(
          this.vaultPath,
          ORBIT_DIR,
          'night-worktrees',
          run.runId,
          task.taskUid.replace(/[^A-Za-z0-9_-]+/g, '_')
        );

        this.emitProgress(run.runId, task, 'worktree');
        const createWt = this.deps.createWorktree ?? defaultCreateWorktree;
        try {
          await createWt(task.projectPath, worktreePath, branch);
        } catch (e) {
          this.emitProgress(
            run.runId,
            task,
            'blocked',
            `worktree creation failed: ${(e as Error).message}`
          );
          await this.setTaskStatus(task.taskPath, 'blocked', (e as Error).message);
          task.endedAt = this.now().toISOString();
          return;
        }

        this.emitProgress(run.runId, task, 'running');
        const prompt = await buildPromptForTask(task);
        const spawnRunner =
          this.deps.spawnRunner ??
          (async () => {
            throw new Error(
              'no AgentRunner factory supplied (R6 injects this in production)'
            );
          });
        const runner = await spawnRunner({
          taskUid: task.taskUid,
          taskPath: task.taskPath,
          projectPath: task.projectPath,
          worktreePath,
          prompt,
          vaultPath: this.vaultPath
        });
        this.runners.get(run.runId)!.set(task.taskUid, runner);

        const exit = await runner.whenExit();
        this.runners.get(run.runId)!.delete(task.taskUid);

        if (this.cancelled.has(run.runId)) {
          this.emitProgress(run.runId, task, 'cancelled', exit.reason);
          task.endedAt = this.now().toISOString();
          await (this.deps.removeWorktree ?? defaultRemoveWorktree)(
            task.projectPath,
            worktreePath
          );
          return;
        }

        if (!exit.ok) {
          const reason = exit.reason ?? 'agent runner failed';
          this.emitProgress(run.runId, task, 'blocked', reason);
          await this.appendExecLog(task.taskPath, `night-shift: ${reason}`);
          await this.setTaskStatus(task.taskPath, 'blocked', reason);
          task.endedAt = this.now().toISOString();
          await (this.deps.removeWorktree ?? defaultRemoveWorktree)(
            task.projectPath,
            worktreePath
          );
          return;
        }

        this.emitProgress(run.runId, task, 'pre-merge');
        const check = this.deps.preMergeCheck ?? ((wt, base) => runPreMergeCheck(wt, base));
        let report: CheckReport;
        try {
          report = await check(worktreePath, 'HEAD');
        } catch (e) {
          const reason = `pre-merge failed: ${(e as Error).message}`;
          this.emitProgress(run.runId, task, 'blocked', reason);
          await this.appendExecLog(task.taskPath, `night-shift: ${reason}`);
          await this.setTaskStatus(task.taskPath, 'blocked', reason);
          task.endedAt = this.now().toISOString();
          await (this.deps.removeWorktree ?? defaultRemoveWorktree)(
            task.projectPath,
            worktreePath
          );
          return;
        }

        if (!report.build.ok || !report.secrets.ok) {
          const reason = !report.build.ok
            ? `build failed (exit ${report.build.exitCode ?? '?'})`
            : `secrets scan found ${report.secrets.findings.length} issue(s)`;
          this.emitProgress(run.runId, task, 'blocked', reason);
          await this.appendExecLog(
            task.taskPath,
            `night-shift pre-merge: ${reason}\n${report.build.logTail.slice(-500)}`
          );
          await this.setTaskStatus(task.taskPath, 'blocked', reason);
          task.endedAt = this.now().toISOString();
          await (this.deps.removeWorktree ?? defaultRemoveWorktree)(
            task.projectPath,
            worktreePath
          );
          return;
        }

        // PR
        let prUrl: string | undefined;
        if (run.createPR) {
          const probe = this.deps.hasGh ?? hasGhCli;
          const gh = await probe();
          if (!gh) {
            await this.appendExecLog(
              task.taskPath,
              `night-shift: gh CLI not available — skipping PR`
            );
          } else {
            this.emitProgress(run.runId, task, 'pr');
            const runGh = this.deps.runGh ?? defaultRunGh;
            const body = `Automated by Orbit Night Shift.\nTask: ${task.title}\nUID: ${task.taskUid}`;
            const r = await runGh(
              [
                'pr',
                'create',
                '--base',
                'main',
                '--head',
                branch,
                '--title',
                task.title,
                '--body',
                body
              ],
              worktreePath
            );
            const url = (r.stdout.match(/https?:\/\/\S+/) ?? [])[0];
            if (r.code === 0 && url) {
              prUrl = url;
              task.prUrl = url;
            } else {
              await this.appendExecLog(
                task.taskPath,
                `night-shift: gh pr create failed (code ${r.code}): ${r.stdout.slice(-200)}`
              );
            }
          }
        }

        this.emitProgress(run.runId, task, 'done');
        task.endedAt = this.now().toISOString();
        await this.markDone(task.taskPath, branch, prUrl);
        // Keep the ghost branch; remove only the worktree working copy.
        await (this.deps.removeWorktree ?? defaultRemoveWorktree)(
          task.projectPath,
          worktreePath
        );
      } catch (e) {
        const reason = (e as Error).message;
        this.emitProgress(run.runId, task, 'blocked', reason);
        try {
          await this.appendExecLog(task.taskPath, `night-shift: ${reason}`);
        } catch {
          /* ignore */
        }
        task.endedAt = this.now().toISOString();
      }
    };

    // main loop
    while (!this.cancelled.has(run.runId)) {
      while (
        inFlight.size < run.concurrency &&
        !this.cancelled.has(run.runId)
      ) {
        const next = takeNext();
        if (!next) break;
        const p = runOne(next).finally(() => inFlight.delete(p));
        inFlight.add(p);
      }
      if (inFlight.size === 0) break;
      await Promise.race(inFlight);
    }
    await Promise.all(inFlight);

    if (this.cancelled.has(run.runId)) return; // cancel() already emitted done
    run.status = 'done';
    run.endedAt = this.now().toISOString();
    run.summary = this.summarize(run);
    this.emit('done', { runId: run.runId, summary: run.summary });
  }

  private async appendExecLog(abs: string, line: string): Promise<void> {
    try {
      const raw = await fs.readFile(abs, 'utf8');
      const { data, body } = frontmatter.read(raw);
      const sections = parseTaskSections(body);
      const stamp = this.now().toISOString();
      const next = appendToSection(
        body,
        'executionLog',
        `- [${stamp}] ${line}`
      );
      void sections;
      const fm = [
        '---',
        ...Object.entries(data).map(([k, v]) => `${k}: ${stringifyValue(v)}`),
        '---'
      ].join('\n');
      await fs.writeFile(abs, `${fm}\n${next}`, 'utf8');
    } catch {
      /* best effort */
    }
  }

  private async setTaskStatus(
    abs: string,
    status: 'blocked' | 'done',
    reason?: string
  ): Promise<void> {
    try {
      const raw = await fs.readFile(abs, 'utf8');
      const { data, body } = frontmatter.read(raw);
      data['status'] = status;
      data['updated_at'] = this.now().toISOString();
      if (status === 'blocked' && reason) data['agent_block_reason'] = reason;
      const fm = [
        '---',
        ...Object.entries(data).map(([k, v]) => `${k}: ${stringifyValue(v)}`),
        '---'
      ].join('\n');
      await fs.writeFile(abs, `${fm}\n${body}`, 'utf8');
    } catch {
      /* ignore */
    }
  }

  private async markDone(
    abs: string,
    branch: string,
    prUrl?: string
  ): Promise<void> {
    try {
      const raw = await fs.readFile(abs, 'utf8');
      const { data, body } = frontmatter.read(raw);
      data['status'] = 'done';
      data['git_branch'] = branch;
      if (prUrl) data['pr_url'] = prUrl;
      data['updated_at'] = this.now().toISOString();
      const fm = [
        '---',
        ...Object.entries(data).map(([k, v]) => `${k}: ${stringifyValue(v)}`),
        '---'
      ].join('\n');
      await fs.writeFile(abs, `${fm}\n${body}`, 'utf8');
    } catch {
      /* ignore */
    }
  }
}

function getPreCond(run: NightShiftRun, uid: string): string[] {
  // pre_conditions fetched at resolution; stash on the task status object.
  const t = run.tasks.find((x) => x.taskUid === uid) as
    | (NightShiftTaskStatus & { _pre?: string[] })
    | undefined;
  return t?._pre ?? [];
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return '""';
  if (typeof v === 'string') {
    if (/[:#\-\n]/.test(v) || v.includes(' ')) return JSON.stringify(v);
    return v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => stringifyValue(x)).join(', ')}]`;
  return JSON.stringify(v);
}

function cloneRun(r: NightShiftRun): NightShiftRun {
  return {
    ...r,
    tasks: r.tasks.map((t) => ({ ...t }))
  };
}

async function buildPromptForTask(t: NightShiftTaskStatus): Promise<string> {
  try {
    const raw = await fs.readFile(t.taskPath, 'utf8');
    const { body } = frontmatter.read(raw);
    const sections = parseTaskSections(body);
    return [
      `# Night Shift Task: ${t.title}`,
      ``,
      `## Description`,
      sections.description.trim() || '(no description)',
      ``,
      `## Constraints`,
      `- Work autonomously inside the provided worktree.`,
      `- Commit your work to the current branch (${t.branch ?? 'orbit/night'}).`,
      `- Do not push to remotes.`
    ].join('\n');
  } catch {
    return `# Night Shift Task: ${t.title}\n(Task file could not be read.)`;
  }
}

// --- singleton --------------------------------------------------------------

let singleton: NightShiftDispatcher | null = null;
let boundVault: string | null = null;

export function getDispatcher(
  vaultPath: string,
  deps?: NightShiftDeps
): NightShiftDispatcher {
  if (!singleton || boundVault !== vaultPath) {
    singleton = new NightShiftDispatcher(vaultPath, deps);
    boundVault = vaultPath;
  }
  return singleton;
}

export function resetDispatcherForTesting(): void {
  singleton = null;
  boundVault = null;
}

/**
 * Exposed for the dispatcher to persist pre_conditions on task objects so
 * the DAG logic can re-check deps across cancellations. Used internally.
 */
export function attachPre(run: NightShiftRun, uid: string, pre: string[]): void {
  const t = run.tasks.find((x) => x.taskUid === uid) as NightShiftTaskStatus & {
    _pre?: string[];
  };
  if (t) t._pre = pre;
}
