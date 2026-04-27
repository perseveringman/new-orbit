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

interface ScheduledTaskFile {
  version: 1;
  tasks: ScheduledTask[];
}

const SYSTEM_TASKS: CreateScheduledTaskInput[] = [
  {
    name: 'Daily timeline summary',
    description: 'Generate the AI summary card for today.',
    schedule: { kind: 'daily', time: '21:30' },
    action: { kind: 'ask_anywhere', prompt: 'Generate today timeline summary.', skills: ['timeline'] },
    source: 'system',
    tags: ['timeline', 'summary']
  },
  {
    name: 'Feed refresh',
    description: 'Refresh all feed subscriptions.',
    schedule: { kind: 'interval', interval_minutes: 180 },
    action: { kind: 'feed_refresh' },
    source: 'system',
    tags: ['feed']
  },
  {
    name: 'Resource health scan',
    description: 'Scan resource activity and surface dormant topics.',
    schedule: { kind: 'weekly', day_of_week: [1], time: '09:00' },
    action: { kind: 'ask_anywhere', prompt: 'Scan resource health and flag dormant resources.', skills: ['resources'] },
    source: 'system',
    tags: ['resource']
  },
  {
    name: 'Area weekly review',
    description: 'Prepare a weekly review prompt for active Areas.',
    schedule: { kind: 'weekly', day_of_week: [0], time: '20:00' },
    action: { kind: 'ask_anywhere', prompt: 'Prepare my weekly Area review.', skills: ['areas'] },
    source: 'system',
    tags: ['area', 'review']
  },
  {
    name: 'Knowledge-base rescan',
    description: 'Rescan imported knowledge bases for external edits.',
    schedule: { kind: 'daily', time: '08:30' },
    action: { kind: 'ask_anywhere', prompt: 'Rescan knowledge bases and report changes.', skills: ['knowledge-base'] },
    source: 'system',
    tags: ['kb']
  }
];

export class ScheduledTaskStore {
  constructor(private readonly vaultPath: string) {}

  async ensureSystemTasks(): Promise<void> {
    const file = await this.readFile();
    const existing = new Set(file.tasks.map((task) => task.system_key).filter(Boolean));
    let changed = false;
    for (const input of SYSTEM_TASKS) {
      const systemKey = slugify(input.name);
      if (existing.has(systemKey)) continue;
      file.tasks.push(this.fromInput(input, systemKey));
      changed = true;
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
    const execution: ScheduledTaskExecution = {
      id: `exec-${randomUUID()}`,
      task_id: taskId,
      triggered_at: now,
      started_at: now,
      completed_at: now,
      status: 'success',
      output: outputForAction(task.action),
      artifacts: []
    };
    await this.appendExecution(execution);
    await this.update(taskId, {
      last_run_at: now,
      total_runs: task.total_runs + 1,
      success_runs: task.success_runs + 1
    });
    return execution;
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
  if (schedule.kind === 'weekly' && schedule.day_of_week?.length) {
    while (!schedule.day_of_week.includes(next.getDay())) next.setDate(next.getDate() + 1);
  }
  if (schedule.kind === 'monthly' && schedule.day_of_month) {
    next.setDate(schedule.day_of_month);
    if (next <= now) next.setMonth(next.getMonth() + 1);
  }
  return next.toISOString();
}

function outputForAction(action: ScheduledTask['action']): unknown {
  if (action.kind === 'feed_refresh') return { message: 'Feed refresh queued.' };
  if (action.kind === 'ask_anywhere') return { prompt: action.prompt, message: 'Ask-Anywhere task recorded.' };
  if (action.kind === 'shell') return { command: action.command, message: 'Shell execution is disabled in this safe trigger path.' };
  return { message: `${action.kind} trigger recorded.` };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'system-task';
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

