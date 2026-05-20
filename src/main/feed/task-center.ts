import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  EnqueueFeedTaskInput,
  EnqueueFeedTaskResult,
  FeedFetchResult,
  FeedSource,
  FeedTask,
  FeedTaskKind,
  FeedTaskLaneSnapshot,
  FeedTaskPlatform,
  FeedTaskPriority,
  FeedTaskSnapshot,
  FeedTaskStatus
} from '@shared/feed';
import { publishTraceableEvent } from '../events/bus';
import { publishFeedChange } from './events';
import { createFeedStore, type FeedStore } from './store';

const TASK_CENTER_ROOT = path.join('.orbit', 'feed', 'task-center');
const TASKS_FILE = 'jobs.json';
const TASK_FILE_VERSION = 1;
const DEFAULT_MAX_GLOBAL_CONCURRENCY = 4;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAYS_MS = [15_000, 60_000, 5 * 60_000];
const HISTORY_LIMIT = 200;
const LEASE_MS = 10 * 60_000;

const FEED_TASK_PLATFORMS: FeedTaskPlatform[] = ['rss', 'youtube', 'x', 'reddit', 'hackernews', 'custom'];
const ACTIVE_STATUSES = new Set<FeedTaskStatus>(['queued', 'running', 'retry_wait']);
const TERMINAL_STATUSES = new Set<FeedTaskStatus>(['success', 'failed', 'cancelled']);
const PRIORITY_WEIGHT: Record<FeedTaskPriority, number> = {
  manual: 0,
  scheduled: 1,
  background: 2
};

interface FeedTaskCenterFile {
  version: 1;
  jobs: FeedTask[];
}

type FeedTaskFeedStore = Pick<FeedStore, 'listSources' | 'fetch'>;

export interface FeedTaskCenterOptions {
  now?: () => Date;
  feedStoreFactory?: (vaultPath: string) => FeedTaskFeedStore;
  maxGlobalConcurrency?: number;
  maxAttempts?: number;
  retryDelaysMs?: number[];
  platformConcurrency?: Partial<Record<FeedTaskPlatform, number>>;
}

export class FeedTaskCenter {
  private readonly now: () => Date;
  private readonly feedStoreFactory: (vaultPath: string) => FeedTaskFeedStore;
  private readonly maxGlobalConcurrency: number;
  private readonly maxAttempts: number;
  private readonly retryDelaysMs: number[];
  private readonly platformConcurrency: Record<FeedTaskPlatform, number>;
  private jobs: FeedTask[] = [];
  private loaded = false;
  private loadPromise: Promise<void> | null = null;
  private mutation: Promise<void> = Promise.resolve();
  private drainPromise: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly vaultPath: string, options: FeedTaskCenterOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.feedStoreFactory = options.feedStoreFactory ?? ((currentVaultPath) => createFeedStore(currentVaultPath));
    this.maxGlobalConcurrency = options.maxGlobalConcurrency ?? DEFAULT_MAX_GLOBAL_CONCURRENCY;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.platformConcurrency = {
      rss: 1,
      youtube: 1,
      x: 1,
      reddit: 1,
      hackernews: 1,
      custom: 1,
      ...(options.platformConcurrency ?? {})
    };
  }

  async enqueueRefresh(input: EnqueueFeedTaskInput = {}): Promise<EnqueueFeedTaskResult> {
    await this.ensureLoaded();
    const store = this.feedStoreFactory(this.vaultPath);
    const sources = (await store.listSources()).filter((source) => source.enabled);
    const targets = input.source_id ? sources.filter((source) => source.id === input.source_id) : sources;
    if (input.source_id && targets.length === 0) throw new Error(`feed_source_not_found:${input.source_id}`);

    const enqueued = await this.withMutation(async () => {
      const jobs: FeedTask[] = [];
      const now = this.now().toISOString();
      for (const source of targets) {
        const kind = input.kind ?? 'source.refresh';
        const dedupeKey = taskDedupeKey(kind, source.id);
        const existing = this.jobs.find((job) => job.dedupe_key === dedupeKey && ACTIVE_STATUSES.has(job.status));
        if (existing && !input.force) {
          if (input.priority === 'manual' && existing.priority !== 'manual') {
            existing.priority = 'manual';
            existing.updated_at = now;
          }
          jobs.push(cloneTask(existing));
          continue;
        }

        const job: FeedTask = {
          id: `feed-task-${randomUUID()}`,
          kind,
          source_id: source.id,
          source_title: source.title,
          source_url: source.url,
          platform: platformForSource(source),
          priority: input.priority ?? 'manual',
          status: 'queued',
          dedupe_key: input.force ? `${dedupeKey}:${randomUUID()}` : dedupeKey,
          attempts: 0,
          max_attempts: this.maxAttempts,
          due_at: now,
          created_at: now,
          updated_at: now,
          run_ids: []
        };
        this.jobs.push(job);
        jobs.push(cloneTask(job));
      }
      this.pruneHistoryUnsafe();
      await this.persistUnsafe();
      this.publishTasksChangedUnsafe();
      return jobs;
    });

    this.scheduleDrain();
    return { jobs: enqueued, snapshot: await this.list() };
  }

  async list(): Promise<FeedTaskSnapshot> {
    await this.ensureLoaded();
    return this.snapshotUnsafe();
  }

  async cancel(jobId: string): Promise<FeedTask> {
    await this.ensureLoaded();
    const job = await this.withMutation(async () => {
      const target = this.jobs.find((item) => item.id === jobId);
      if (!target) throw new Error(`feed_task_not_found:${jobId}`);
      if (target.status === 'running') throw new Error(`feed_task_running:${jobId}`);
      if (!ACTIVE_STATUSES.has(target.status)) return cloneTask(target);
      const now = this.now().toISOString();
      target.status = 'cancelled';
      target.completed_at = now;
      target.updated_at = now;
      target.error = undefined;
      await this.persistUnsafe();
      this.publishTasksChangedUnsafe(target);
      return cloneTask(target);
    });
    this.scheduleDrain();
    return job;
  }

  async cancelSource(sourceId: string): Promise<FeedTask[]> {
    await this.ensureLoaded();
    const cancelled = await this.withMutation(async () => {
      const now = this.now().toISOString();
      const jobs: FeedTask[] = [];
      for (const job of this.jobs) {
        if (job.source_id !== sourceId || !ACTIVE_STATUSES.has(job.status) || job.status === 'running') continue;
        job.status = 'cancelled';
        job.completed_at = now;
        job.updated_at = now;
        job.error = undefined;
        jobs.push(cloneTask(job));
      }
      if (jobs.length > 0) await this.persistUnsafe();
      if (jobs.length > 0) this.publishTasksChangedUnsafe();
      return jobs;
    });
    this.scheduleDrain();
    return cancelled;
  }

  async retry(jobId: string): Promise<FeedTask> {
    await this.ensureLoaded();
    const job = await this.withMutation(async () => {
      const target = this.jobs.find((item) => item.id === jobId);
      if (!target) throw new Error(`feed_task_not_found:${jobId}`);
      if (!TERMINAL_STATUSES.has(target.status)) throw new Error(`feed_task_not_terminal:${jobId}`);
      const now = this.now().toISOString();
      target.status = 'queued';
      target.priority = 'manual';
      target.attempts = 0;
      target.due_at = now;
      target.updated_at = now;
      target.started_at = undefined;
      target.completed_at = undefined;
      target.lease_expires_at = undefined;
      target.error = undefined;
      target.result = undefined;
      target.run_ids = [];
      await this.persistUnsafe();
      this.publishTasksChangedUnsafe(target);
      return cloneTask(target);
    });
    this.scheduleDrain();
    return job;
  }

  async waitForJobs(jobIds: string[], timeoutMs = 120_000): Promise<FeedTask[]> {
    await this.ensureLoaded();
    this.scheduleDrain();
    const deadline = Date.now() + timeoutMs;
    const uniqueIds = [...new Set(jobIds)];
    while (Date.now() <= deadline) {
      const snapshot = await this.list();
      const jobs = uniqueIds.flatMap((id) => {
        const job = snapshot.jobs.find((item) => item.id === id);
        return job ? [job] : [];
      });
      if (jobs.length === uniqueIds.length && jobs.every((job) => TERMINAL_STATUSES.has(job.status))) return jobs;
      await sleep(100);
    }
    throw new Error(`feed_task_wait_timeout:${uniqueIds.join(',')}`);
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.loadUnsafe();
    await this.loadPromise;
  }

  private async loadUnsafe(): Promise<void> {
    const loaded = await readJsonFile<FeedTaskCenterFile>(this.tasksPath()).catch((error: unknown) => {
      if (isNotFound(error)) return { version: TASK_FILE_VERSION, jobs: [] as FeedTask[] };
      throw error;
    });
    const now = this.now().toISOString();
    let changed = false;
    this.jobs = Array.isArray(loaded.jobs)
      ? loaded.jobs.flatMap((job) => (isFeedTask(job) ? [normalizeTask(job)] : []))
      : [];
    for (const job of this.jobs) {
      if (job.status !== 'running') continue;
      job.status = 'queued';
      job.updated_at = now;
      job.lease_expires_at = undefined;
      job.error = job.error ?? '上次运行中断，已恢复排队。';
      changed = true;
    }
    this.loaded = true;
    this.loadPromise = null;
    if (changed) {
      await this.persistUnsafe();
      this.publishTasksChangedUnsafe();
    }
    if (this.jobs.some((job) => ACTIVE_STATUSES.has(job.status))) this.scheduleDrain();
  }

  private scheduleDrain(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.drainPromise) return this.drainPromise;
    this.drainPromise = this.drainLoop().finally(() => {
      this.drainPromise = null;
    });
    return this.drainPromise;
  }

  private async drainLoop(): Promise<void> {
    await this.ensureLoaded();
    for (;;) {
      const job = await this.withMutation(async () => {
        const next = this.nextReadyJobUnsafe();
        if (!next) {
          this.armRetryTimerUnsafe();
          return null;
        }
        const now = this.now();
        next.status = 'running';
        next.attempts += 1;
        next.started_at = next.started_at ?? now.toISOString();
        next.updated_at = now.toISOString();
        next.lease_expires_at = new Date(now.getTime() + LEASE_MS).toISOString();
        next.error = undefined;
        await this.persistUnsafe();
        this.publishTasksChangedUnsafe(next);
        return cloneTask(next);
      });
      if (!job) return;
      void this.runJob(job.id);
    }
  }

  private async runJob(jobId: string): Promise<void> {
    const sourceId = this.jobs.find((job) => job.id === jobId)?.source_id;
    if (!sourceId) return;
    try {
      const results = await this.feedStoreFactory(this.vaultPath).fetch(sourceId);
      const result = results.find((item) => item.source_id === sourceId) ?? results[0];
      if (result?.error) throw Object.assign(new Error(result.error), { feedResults: results });
      const completed = await this.withMutation(async () => {
        const target = this.jobs.find((job) => job.id === jobId);
        if (!target || target.status === 'cancelled') return null;
        const now = this.now().toISOString();
        target.status = 'success';
        target.completed_at = now;
        target.updated_at = now;
        target.lease_expires_at = undefined;
        target.result = result;
        target.run_ids = results.flatMap((item) => (item.run_id ? [item.run_id] : []));
        target.error = undefined;
        this.pruneHistoryUnsafe();
        await this.persistUnsafe();
        this.publishTasksChangedUnsafe(target);
        return cloneTask(target);
      });
      if (completed?.result) publishFeedFetchEvent(completed.result);
    } catch (error) {
      const message = errorMessage(error);
      const feedResults = feedResultsFromError(error);
      await this.withMutation(async () => {
        const target = this.jobs.find((job) => job.id === jobId);
        if (!target || target.status === 'cancelled') return;
        const now = this.now();
        const retryDelayMs = this.retryDelaysMs[Math.min(target.attempts - 1, this.retryDelaysMs.length - 1)] ?? 60_000;
        target.updated_at = now.toISOString();
        target.lease_expires_at = undefined;
        target.error = message;
        if (feedResults.length > 0) {
          target.result = feedResults.find((item) => item.source_id === target.source_id) ?? feedResults[0];
          target.run_ids = feedResults.flatMap((item) => (item.run_id ? [item.run_id] : []));
        }
        if (target.attempts < target.max_attempts) {
          target.status = 'retry_wait';
          target.due_at = new Date(now.getTime() + retryDelayMs).toISOString();
        } else {
          target.status = 'failed';
          target.completed_at = now.toISOString();
        }
        this.pruneHistoryUnsafe();
        await this.persistUnsafe();
        this.publishTasksChangedUnsafe(target);
      });
    } finally {
      this.scheduleDrain();
    }
  }

  private nextReadyJobUnsafe(): FeedTask | null {
    const now = this.now().getTime();
    const running = this.jobs.filter((job) => job.status === 'running');
    if (running.length >= this.maxGlobalConcurrency) return null;
    const runningByPlatform = countByPlatform(running, 'running');
    const ready = this.jobs
      .filter((job) => (job.status === 'queued' || job.status === 'retry_wait') && Date.parse(job.due_at) <= now)
      .sort(compareRunnableJobs);
    for (const job of ready) {
      const runningCount = runningByPlatform.get(job.platform) ?? 0;
      if (runningCount >= (this.platformConcurrency[job.platform] ?? 1)) continue;
      return job;
    }
    return null;
  }

  private armRetryTimerUnsafe(): void {
    const now = this.now().getTime();
    const nextDue = this.jobs
      .filter((job) => job.status === 'retry_wait')
      .map((job) => Date.parse(job.due_at))
      .filter((value) => Number.isFinite(value) && value > now)
      .sort((a, b) => a - b)[0];
    if (!nextDue) return;
    this.retryTimer = setTimeout(() => this.scheduleDrain(), Math.max(50, nextDue - now));
    this.retryTimer.unref?.();
  }

  private snapshotUnsafe(): FeedTaskSnapshot {
    const jobs = [...this.jobs].sort(compareSnapshotJobs).map(cloneTask);
    const lanes: FeedTaskLaneSnapshot[] = FEED_TASK_PLATFORMS.map((platform) => ({
      platform,
      running: jobs.filter((job) => job.platform === platform && job.status === 'running').length,
      queued: jobs.filter((job) => job.platform === platform && job.status === 'queued').length,
      retry_wait: jobs.filter((job) => job.platform === platform && job.status === 'retry_wait').length
    })).filter((lane) => lane.running > 0 || lane.queued > 0 || lane.retry_wait > 0);
    return {
      jobs,
      total: jobs.length,
      running: jobs.filter((job) => job.status === 'running').length,
      queued: jobs.filter((job) => job.status === 'queued').length,
      retry_wait: jobs.filter((job) => job.status === 'retry_wait').length,
      success: jobs.filter((job) => job.status === 'success').length,
      failed: jobs.filter((job) => job.status === 'failed').length,
      cancelled: jobs.filter((job) => job.status === 'cancelled').length,
      created: jobs.reduce((sum, job) => sum + (job.result?.created ?? 0), 0),
      fetched: jobs.reduce((sum, job) => sum + (job.result?.fetched ?? 0), 0),
      lanes
    };
  }

  private publishTasksChangedUnsafe(task?: FeedTask | null): void {
    publishFeedChange({
      type: 'tasks_changed',
      vault_path: this.vaultPath,
      source_id: task?.source_id,
      task_id: task?.id,
      snapshot: this.snapshotUnsafe()
    });
  }

  private pruneHistoryUnsafe(): void {
    const active = this.jobs.filter((job) => ACTIVE_STATUSES.has(job.status));
    const terminal = this.jobs
      .filter((job) => !ACTIVE_STATUSES.has(job.status))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, HISTORY_LIMIT);
    this.jobs = [...active, ...terminal];
  }

  private async withMutation<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.mutation;
    let release: () => void = () => undefined;
    this.mutation = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private async persistUnsafe(): Promise<void> {
    const file: FeedTaskCenterFile = {
      version: TASK_FILE_VERSION,
      jobs: this.jobs
    };
    await fs.mkdir(this.taskDir(), { recursive: true });
    const target = this.tasksPath();
    const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(file, null, 2), 'utf8');
    await fs.rename(tmp, target);
  }

  private taskDir(): string {
    return path.join(this.vaultPath, TASK_CENTER_ROOT);
  }

  private tasksPath(): string {
    return path.join(this.taskDir(), TASKS_FILE);
  }
}

const centers = new Map<string, FeedTaskCenter>();

export function getFeedTaskCenter(vaultPath: string): FeedTaskCenter {
  const key = path.resolve(vaultPath);
  const existing = centers.get(key);
  if (existing) return existing;
  const center = new FeedTaskCenter(vaultPath);
  centers.set(key, center);
  return center;
}

export function resetFeedTaskCentersForTest(): void {
  centers.clear();
}

function taskDedupeKey(kind: FeedTaskKind, sourceId: string): string {
  return `${kind}:${sourceId}`;
}

function platformForSource(source: FeedSource): FeedTaskPlatform {
  const provider = source.metadata?.provider?.toLowerCase();
  if (source.kind === 'youtube' || provider === 'youtube') return 'youtube';
  if (source.kind === 'twitter' || provider === 'x' || provider === 'twitter') return 'x';
  if (source.kind === 'reddit' || provider === 'reddit') return 'reddit';
  if (source.kind === 'hackernews' || provider === 'hackernews') return 'hackernews';
  if (source.kind === 'rss' || source.kind === 'newsletter' || source.kind === 'podcast') return 'rss';
  return 'custom';
}

function compareRunnableJobs(a: FeedTask, b: FeedTask): number {
  return (
    PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] ||
    Date.parse(a.due_at) - Date.parse(b.due_at) ||
    a.created_at.localeCompare(b.created_at)
  );
}

function compareSnapshotJobs(a: FeedTask, b: FeedTask): number {
  const statusWeight = (job: FeedTask): number => {
    if (job.status === 'running') return 0;
    if (job.status === 'queued') return 1;
    if (job.status === 'retry_wait') return 2;
    if (job.status === 'failed') return 3;
    if (job.status === 'success') return 4;
    return 5;
  };
  return statusWeight(a) - statusWeight(b) || b.updated_at.localeCompare(a.updated_at);
}

function countByPlatform(jobs: FeedTask[], status: FeedTaskStatus): Map<FeedTaskPlatform, number> {
  const counts = new Map<FeedTaskPlatform, number>();
  for (const job of jobs) {
    if (job.status !== status) continue;
    counts.set(job.platform, (counts.get(job.platform) ?? 0) + 1);
  }
  return counts;
}

function normalizeTask(job: FeedTask): FeedTask {
  return {
    ...job,
    status: isTaskStatus(job.status) ? job.status : 'queued',
    platform: isTaskPlatform(job.platform) ? job.platform : 'custom',
    priority: isTaskPriority(job.priority) ? job.priority : 'manual',
    attempts: Number.isFinite(job.attempts) ? job.attempts : 0,
    max_attempts: Number.isFinite(job.max_attempts) ? job.max_attempts : DEFAULT_MAX_ATTEMPTS,
    run_ids: Array.isArray(job.run_ids) ? job.run_ids : []
  };
}

function cloneTask(job: FeedTask): FeedTask {
  return {
    ...job,
    run_ids: [...(job.run_ids ?? [])],
    result: job.result ? { ...job.result } : undefined
  };
}

function isFeedTask(value: unknown): value is FeedTask {
  return typeof value === 'object' && value !== null && typeof (value as FeedTask).id === 'string';
}

function isTaskStatus(value: string): value is FeedTaskStatus {
  return ['queued', 'running', 'retry_wait', 'success', 'failed', 'cancelled'].includes(value);
}

function isTaskPlatform(value: string): value is FeedTaskPlatform {
  return FEED_TASK_PLATFORMS.includes(value as FeedTaskPlatform);
}

function isTaskPriority(value: string): value is FeedTaskPriority {
  return ['manual', 'scheduled', 'background'].includes(value);
}

function publishFeedFetchEvent(result: FeedFetchResult): void {
  publishTraceableEvent({
    source: 'activity',
    kind: 'feed.items.fetched',
    summary: `Fetched ${result.created}/${result.fetched} Feed items`,
    payload: { source_id: result.source_id, fetched: result.fetched, created: result.created }
  });
}

function feedResultsFromError(error: unknown): FeedFetchResult[] {
  if (!isErrorRecord(error) || !Array.isArray(error.feedResults)) return [];
  return error.feedResults.filter((value): value is FeedFetchResult => {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof value.source_id === 'string' &&
      typeof value.fetched === 'number' &&
      typeof value.created === 'number' &&
      typeof value.skipped === 'number'
    );
  });
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}

function errorMessage(error: unknown): string {
  if (!isErrorRecord(error)) return error instanceof Error ? error.message : String(error);
  const message = error instanceof Error ? error.message : String(error);
  const lines = [
    message,
    typeof error.stderr === 'string' && error.stderr.trim() ? `stderr: ${clipErrorPart(error.stderr.trim())}` : null,
    typeof error.stdout === 'string' && error.stdout.trim() ? `stdout: ${clipErrorPart(error.stdout.trim())}` : null,
    typeof error.signal === 'string' ? `signal: ${error.signal}` : null,
    typeof error.code === 'number' || typeof error.code === 'string' ? `exit code: ${String(error.code)}` : null
  ].filter((line): line is string => Boolean(line));
  return [...new Set(lines)].join('\n');
}

function isErrorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clipErrorPart(value: string, max = 1200): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
