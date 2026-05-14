import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  CreateScheduledTaskInput,
  NaturalLanguageScheduleResult,
  ScheduledTask,
  ScheduledTaskExecution,
  ScheduledTaskFilter
} from '@shared/scheduled-task';
import { createFeedStore } from '../feed/store';

interface ScheduledTaskFile {
  version: 1;
  tasks: ScheduledTask[];
}

const SYSTEM_TASKS: CreateScheduledTaskInput[] = [
  {
    name: 'Daily Summary',
    description: 'Generate the AI summary card for today.',
    schedule: { kind: 'daily', time: '21:30', timezone: 'local' },
    action: { kind: 'synthesis', synthesis_kind: 'summary.daily', scope: 'timeline:today' },
    source: 'system',
    tags: ['timeline', 'summary']
  },
  {
    name: 'Weekly Review',
    description: 'Generate the weekly PARA review.',
    schedule: { kind: 'weekly', days: [0], day_of_week: [0], time: '20:00', timezone: 'local' },
    action: { kind: 'review', review_kind: 'weekly' },
    source: 'system',
    tags: ['review']
  },
  {
    name: 'Monthly Review',
    description: 'Generate the monthly PARA review.',
    schedule: { kind: 'monthly', day_of_month: -1, time: '20:00', timezone: 'local' },
    action: { kind: 'review', review_kind: 'monthly' },
    source: 'system',
    tags: ['review']
  },
  {
    name: 'Resource Health Scan',
    description: 'Scan resource activity and surface dormant topics.',
    schedule: { kind: 'weekly', days: [1], day_of_week: [1], time: '09:00', timezone: 'local' },
    action: { kind: 'review', review_kind: 'resource' },
    source: 'system',
    tags: ['resource']
  },
  {
    name: 'Feed Daily Digest',
    description: 'Refresh subscriptions and generate the daily Feed digest/report.',
    schedule: { kind: 'daily', time: '19:00', timezone: 'local' },
    action: { kind: 'feed_refresh', generate_digest: true, generate_report: true },
    source: 'system',
    tags: ['feed', 'digest']
  },
  {
    name: 'Vision Quarterly Review',
    description: 'Review structured Vision goals and drift.',
    schedule: { kind: 'monthly', day_of_month: -1, time: '20:00', timezone: 'local', flexible_days: [90] },
    action: { kind: 'synthesis', synthesis_kind: 'summary.entity', scope: 'vision:quarterly' },
    source: 'system',
    tags: ['vision', 'review']
  },
  {
    name: 'Memory Weekly Digest',
    description: 'Generate the weekly memory digest artifact.',
    schedule: { kind: 'weekly', days: [0], day_of_week: [0], time: '18:00', timezone: 'local' },
    action: { kind: 'memory_digest' },
    source: 'system',
    tags: ['memory', 'digest']
  }
];

export class ScheduledTaskStore {
  constructor(private readonly vaultPath: string) {}

  async ensureSystemTasks(): Promise<void> {
    const file = await this.readFile();
    let changed = false;
    for (const input of SYSTEM_TASKS) {
      const systemKey = slugify(input.name);
      const existing = file.tasks.find((task) => task.system_key === systemKey);
      if (!existing) {
        file.tasks.push(this.fromInput(input, systemKey));
        changed = true;
        continue;
      }
      if (existing.source === 'system' && shouldRefreshSystemTask(existing, input)) {
        Object.assign(existing, {
          name: input.name,
          description: input.description,
          schedule: input.schedule,
          action: input.action,
          tags: input.tags,
          updated_at: new Date().toISOString(),
          next_run_at: existing.status === 'active' ? computeNextRun(input.schedule) : existing.next_run_at
        });
        changed = true;
      }
    }
    if (changed) await this.writeFile(file);
  }

  async list(filter: ScheduledTaskFilter = {}): Promise<ScheduledTask[]> {
    await this.ensureSystemTasks();
    return (await this.readFile()).tasks
      .filter((task) => !filter.status || task.status === filter.status)
      .filter((task) => !filter.source || task.source === filter.source)
      .sort((a, b) => (a.next_run_at ?? '').localeCompare(b.next_run_at ?? '') || a.name.localeCompare(b.name));
  }

  async get(taskId: string): Promise<ScheduledTask | null> {
    await this.ensureSystemTasks();
    return (await this.readFile()).tasks.find((task) => task.id === taskId) ?? null;
  }

  async create(input: CreateScheduledTaskInput): Promise<ScheduledTask> {
    const file = await this.readFile();
    const task = this.fromInput(input);
    file.tasks.push(task);
    await this.writeFile(file);
    return task;
  }

  async update(taskId: string, patch: Partial<ScheduledTask>): Promise<ScheduledTask> {
    const file = await this.readFile();
    const task = file.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error(`scheduled task not found: ${taskId}`);
    const next: ScheduledTask = {
      ...task,
      ...patch,
      id: task.id,
      source: task.source,
      system_key: task.system_key,
      updated_at: new Date().toISOString(),
      next_run_at: patch.schedule ? computeNextRun(patch.schedule) : patch.next_run_at ?? task.next_run_at
    };
    file.tasks = file.tasks.map((item) => (item.id === taskId ? next : item));
    await this.writeFile(file);
    return next;
  }

  async delete(taskId: string): Promise<void> {
    const file = await this.readFile();
    const task = file.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error(`scheduled task not found: ${taskId}`);
    if (task.source === 'system') throw new Error('system scheduled tasks cannot be deleted');
    file.tasks = file.tasks.filter((item) => item.id !== taskId);
    await this.writeFile(file);
  }

  async pause(taskId: string): Promise<ScheduledTask> {
    return this.update(taskId, { status: 'paused' });
  }

  async resume(taskId: string): Promise<ScheduledTask> {
    const task = await this.get(taskId);
    if (!task) throw new Error(`scheduled task not found: ${taskId}`);
    return this.update(taskId, { status: 'active', next_run_at: computeNextRun(task.schedule) });
  }

  async triggerNow(taskId: string): Promise<ScheduledTaskExecution> {
    const task = await this.get(taskId);
    if (!task) throw new Error(`scheduled task not found: ${taskId}`);
    const now = new Date().toISOString();
    if (task.budget_usd !== undefined && task.budget_usd <= 0) {
      const execution = failedExecution(taskId, now, 'scheduled_task_budget_exceeded');
      await this.appendExecution(execution);
      await this.update(taskId, {
        status: 'disabled',
        disabled_reason: 'budget_exceeded',
        last_run_at: now,
        total_runs: task.total_runs + 1,
        failure_runs: task.failure_runs + 1
      });
      return execution;
    }
    try {
      const result = await executeAction(this.vaultPath, task.action);
      const completedAt = new Date().toISOString();
      const execution: ScheduledTaskExecution = {
        id: `exec-${randomUUID()}`,
        task_id: taskId,
        triggered_at: now,
        started_at: now,
        completed_at: completedAt,
        status: 'success',
        output: result.output,
        artifacts: result.artifacts ?? []
      };
      await this.appendExecution(execution);
      await this.update(taskId, {
        last_run_at: completedAt,
        total_runs: task.total_runs + 1,
        success_runs: task.success_runs + 1
      });
      return execution;
    } catch (error) {
      const completedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      const execution: ScheduledTaskExecution = {
        id: `exec-${randomUUID()}`,
        task_id: taskId,
        triggered_at: now,
        started_at: now,
        completed_at: completedAt,
        status: 'failure',
        error: message
      };
      await this.appendExecution(execution);
      await this.update(taskId, {
        last_run_at: completedAt,
        total_runs: task.total_runs + 1,
        failure_runs: task.failure_runs + 1
      });
      return execution;
    }
  }

  async executions(taskId: string, limit = 30, offset = 0): Promise<ScheduledTaskExecution[]> {
    const all = await this.readExecutions();
    return all
      .filter((execution) => execution.task_id === taskId)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(offset, offset + limit);
  }

  parseNaturalLanguage(text: string): NaturalLanguageScheduleResult {
    const lower = text.toLowerCase();
    const time = lower.match(/(\d{1,2}):(\d{2})/);
    const prompt = text.trim();
    if (lower.includes('weekly') || lower.includes('每周')) {
      return {
        schedule: { kind: 'weekly', day_of_week: [1], time: time ? `${time[1]?.padStart(2, '0')}:${time[2]}` : '09:00' },
        action: { kind: 'ask_anywhere', prompt },
        confidence: 0.68
      };
    }
    if (lower.includes('every') || lower.includes('interval') || lower.includes('每隔')) {
      return {
        schedule: { kind: 'interval', interval_minutes: 60 },
        action: { kind: 'ask_anywhere', prompt },
        confidence: 0.55
      };
    }
    return {
      schedule: { kind: 'daily', time: time ? `${time[1]?.padStart(2, '0')}:${time[2]}` : '09:00' },
      action: { kind: 'ask_anywhere', prompt },
      confidence: 0.72
    };
  }

  private fromInput(input: CreateScheduledTaskInput, systemKey?: string): ScheduledTask {
    const now = new Date().toISOString();
    return {
      id: `scheduled-${randomUUID()}`,
      name: input.name.trim(),
      ...(input.description ? { description: input.description } : {}),
      schedule: input.schedule,
      action: input.action,
      status: 'active',
      created_at: now,
      updated_at: now,
      next_run_at: computeNextRun(input.schedule),
      source: input.source ?? 'user',
      ...(systemKey ? { system_key: systemKey } : {}),
      ...(input.para_ref ? { para_ref: input.para_ref } : {}),
      ...(input.budget_usd !== undefined ? { budget_usd: input.budget_usd } : {}),
      ...(input.retry ? { retry: input.retry } : {}),
      ...(input.notify_channels ? { notify_channels: input.notify_channels } : {}),
      total_runs: 0,
      success_runs: 0,
      failure_runs: 0,
      ...(input.tags ? { tags: input.tags } : {})
    };
  }

  private tasksPath(): string {
    return path.join(this.vaultPath, '.orbit', 'scheduled-tasks', 'tasks.json');
  }

  private executionsPath(): string {
    return path.join(this.vaultPath, '.orbit', 'scheduled-tasks', 'executions.ndjson');
  }

  private async readFile(): Promise<ScheduledTaskFile> {
    try {
      return JSON.parse(await fs.readFile(this.tasksPath(), 'utf8')) as ScheduledTaskFile;
    } catch (error) {
      if (!isNotFound(error)) throw error;
      return { version: 1, tasks: [] };
    }
  }

  private async writeFile(file: ScheduledTaskFile): Promise<void> {
    await fs.mkdir(path.dirname(this.tasksPath()), { recursive: true });
    await fs.writeFile(this.tasksPath(), `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  }

  private async appendExecution(execution: ScheduledTaskExecution): Promise<void> {
    await fs.mkdir(path.dirname(this.executionsPath()), { recursive: true });
    await fs.appendFile(this.executionsPath(), `${JSON.stringify(execution)}\n`, 'utf8');
  }

  private async readExecutions(): Promise<ScheduledTaskExecution[]> {
    try {
      return (await fs.readFile(this.executionsPath(), 'utf8'))
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as ScheduledTaskExecution);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }
}

export function createScheduledTaskStore(vaultPath: string): ScheduledTaskStore {
  return new ScheduledTaskStore(vaultPath);
}

interface ActionExecutionResult {
  output: unknown;
  artifacts?: NonNullable<ScheduledTaskExecution['artifacts']>;
}

async function executeAction(vaultPath: string, action: ScheduledTask['action']): Promise<ActionExecutionResult> {
  if (action.kind === 'feed_refresh') {
    const feed = createFeedStore(vaultPath);
    const results = await feed.fetch(action.source_id);
    const date = localDateKey(new Date());
    const artifacts: NonNullable<ScheduledTaskExecution['artifacts']> = results
      .flatMap((result) => (result.run_id ? [{ kind: 'log' as const, ref: result.run_id }] : []));
    let digestArtifactId: string | undefined;
    let reportArtifactId: string | undefined;
    if (action.generate_digest) {
      const digest = await feed.digest(date);
      digestArtifactId = digest.artifact.id;
      artifacts.push({ kind: 'synthesis', ref: digest.artifact.id });
    }
    if (action.generate_report) {
      const report = await feed.dailyReport(date, { digest_artifact_id: digestArtifactId });
      reportArtifactId = report.artifact.id;
      artifacts.push({ kind: 'synthesis', ref: report.artifact.id });
    }
    return {
      output: {
        message: 'Feed refresh completed.',
        source_id: action.source_id ?? 'all',
        results,
        digest_artifact_id: digestArtifactId,
        report_artifact_id: reportArtifactId
      },
      artifacts
    };
  }

  if (action.kind === 'synthesis') {
    const feed = createFeedStore(vaultPath);
    if (action.synthesis_kind === 'feed.digest') {
      const date = dateFromScope(action.scope);
      const digest = await feed.digest(date);
      return {
        output: { artifact_kind: digest.artifact.kind, scope: digest.artifact.scope_key, artifact_id: digest.artifact.id },
        artifacts: [{ kind: 'synthesis', ref: digest.artifact.id }]
      };
    }
    if (action.synthesis_kind === 'feed.cluster') {
      const cluster = await feed.cluster(action.scope ?? 'all');
      return {
        output: { artifact_kind: cluster.artifact.kind, scope: cluster.artifact.scope_key, artifact_id: cluster.artifact.id },
        artifacts: [{ kind: 'synthesis', ref: cluster.artifact.id }]
      };
    }
    if (action.synthesis_kind === 'feed.report.daily') {
      const date = dateFromScope(action.scope);
      const report = await feed.dailyReport(date);
      return {
        output: { artifact_kind: report.artifact.kind, scope: report.artifact.scope_key, artifact_id: report.artifact.id },
        artifacts: [{ kind: 'synthesis', ref: report.artifact.id }]
      };
    }
  }

  return { output: outputForAction(action), artifacts: [] };
}

function computeNextRun(schedule: ScheduledTask['schedule']): string | undefined {
  const now = new Date();
  if (schedule.kind === 'once') return schedule.target_datetime;
  if (schedule.kind === 'interval') {
    return new Date(now.getTime() + (schedule.interval_minutes ?? 60) * 60_000).toISOString();
  }
  const [hour, minute] = (schedule.time ?? '09:00').split(':').map((part) => Number(part));
  const next = new Date(now);
  next.setHours(hour || 9, minute || 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  if (schedule.kind === 'weekly') {
    const days = schedule.days?.length ? schedule.days : schedule.day_of_week;
    if (days?.length) {
      while (!days.includes(next.getDay())) next.setDate(next.getDate() + 1);
    }
  }
  if (schedule.kind === 'monthly' && schedule.day_of_month) {
    if (schedule.day_of_month === -1) {
      next.setMonth(next.getMonth() + 1, 0);
    } else {
      next.setDate(schedule.day_of_month);
    }
    if (next <= now) next.setMonth(next.getMonth() + 1);
  }
  return next.toISOString();
}

function shouldRefreshSystemTask(existing: ScheduledTask, input: CreateScheduledTaskInput): boolean {
  return (
    existing.name !== input.name ||
    existing.description !== input.description ||
    JSON.stringify(existing.schedule) !== JSON.stringify(input.schedule) ||
    JSON.stringify(existing.action) !== JSON.stringify(input.action) ||
    JSON.stringify(existing.tags ?? []) !== JSON.stringify(input.tags ?? [])
  );
}

function dateFromScope(scope?: string): string {
  const match = scope?.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? localDateKey(new Date());
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function outputForAction(action: ScheduledTask['action']): unknown {
  if (action.kind === 'feed_refresh') return { message: 'Feed refresh queued.' };
  if (action.kind === 'synthesis') return { artifact_kind: action.synthesis_kind, scope: action.scope ?? 'global', message: 'Synthesis task queued.' };
  if (action.kind === 'review') return { review_kind: action.review_kind, scope_ref: action.scope_ref ?? null, message: 'Review task queued.' };
  if (action.kind === 'memory_digest') return { artifact_kind: 'memory.digest', period: action.period ?? 'current', message: 'Memory digest queued.' };
  if (action.kind === 'ask_anywhere') return { prompt: action.prompt, message: 'Ask-Anywhere task recorded.' };
  if (action.kind === 'shell') return { command: action.command, message: 'Shell execution is disabled in this safe trigger path.' };
  return { message: `${action.kind} trigger recorded.` };
}

function failedExecution(taskId: string, now: string, error: string): ScheduledTaskExecution {
  return {
    id: `exec-${randomUUID()}`,
    task_id: taskId,
    triggered_at: now,
    started_at: now,
    completed_at: now,
    status: 'failure',
    error
  };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'system-task';
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
