import { EventEmitter } from 'node:events';
import path from 'node:path';
import type { AutoRunnerRunDTO, AutoRunnerStatusDTO } from '@shared/auto_runner';
import type { StartTaskResult } from '@shared/agent';
import type { WorktreeRecord } from '@shared/git';
import type { AutoRunnerSettings } from '@shared/schemas';
import type { TaskRecord } from '@shared/schemas';
import type { PoolEvent, RunnerPool } from '../agent/pool';
import { getPool } from '../agent/pool';
import { createExecutionContextForProject } from '../execution';
import type { ExecutionContext } from '../execution';
import { buildReadySet } from './ready_set';
import { AutoRunnerEventBridge } from './event_bridge';
import { launchCapacity, schedulerDecision, startsInCurrentHour } from './scheduler';
import { readAutoRunnerSettings, setAutoRunnerEnabled } from './settings';
import { reduceTaskState } from '../task-state/reducer';

export interface AutoRunnerActiveRun extends AutoRunnerRunDTO {
  projectPath?: string;
}

export interface AutoRunnerDispatcherDeps {
  readSettings?: () => Promise<AutoRunnerSettings>;
  setEnabled?: (enabled: boolean) => Promise<AutoRunnerSettings>;
  listTasks?: () => Promise<readonly TaskRecord[]> | readonly TaskRecord[];
  resolveProjectPath?: (vaultPath: string, task: TaskRecord) => Promise<string | null>;
  createContextForProject?: (projectPath: string) => Promise<ExecutionContext>;
  startTask?: (args: { taskId: string; instructions?: string; worktreePath?: string }) => Promise<StartTaskResult>;
  updateTask?: (task: TaskRecord, patch: Record<string, unknown>) => Promise<void>;
  pool?: RunnerPool;
  eventBridge?: AutoRunnerEventBridge;
  now?: () => Date;
  setInterval?: (handler: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval?: (timer: ReturnType<typeof setInterval>) => void;
}

export class AutoRunnerDispatcher extends EventEmitter {
  private vaultPath: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private timerIntervalMs = 0;
  private running = new Map<string, AutoRunnerActiveRun>();
  private startedAt: string[] = [];
  private ticking = false;
  private lastTickAt: string | undefined;
  private lastError: string | undefined;
  private poolListenerAttached = false;

  private readonly readSettings: () => Promise<AutoRunnerSettings>;
  private readonly setEnabled: (enabled: boolean) => Promise<AutoRunnerSettings>;
  private readonly listTasks: () => Promise<readonly TaskRecord[]> | readonly TaskRecord[];
  private readonly resolveProjectPath: (vaultPath: string, task: TaskRecord) => Promise<string | null>;
  private readonly createContextForProject: (projectPath: string) => Promise<ExecutionContext>;
  private readonly startTaskImpl: (args: {
    taskId: string;
    instructions?: string;
    worktreePath?: string;
  }) => Promise<StartTaskResult>;
  private readonly updateTask: (task: TaskRecord, patch: Record<string, unknown>) => Promise<void>;
  private readonly pool: RunnerPool;
  private readonly eventBridge: AutoRunnerEventBridge;
  private readonly now: () => Date;
  private readonly installTimer: (handler: () => void, ms: number) => ReturnType<typeof setInterval>;
  private readonly uninstallTimer: (timer: ReturnType<typeof setInterval>) => void;

  constructor(deps: AutoRunnerDispatcherDeps = {}) {
    super();
    this.readSettings = deps.readSettings ?? readAutoRunnerSettings;
    this.setEnabled = deps.setEnabled ?? setAutoRunnerEnabled;
    this.listTasks = deps.listTasks ?? defaultListTasks;
    this.resolveProjectPath = deps.resolveProjectPath ?? defaultResolveProjectPath;
    this.createContextForProject = deps.createContextForProject ?? createExecutionContextForProject;
    this.startTaskImpl = deps.startTask ?? defaultStartTask;
    this.updateTask = deps.updateTask ?? defaultUpdateTask;
    this.pool = deps.pool ?? getPool();
    this.eventBridge = deps.eventBridge ?? new AutoRunnerEventBridge();
    this.now = deps.now ?? (() => new Date());
    this.installTimer = deps.setInterval ?? ((handler, ms) => setInterval(handler, ms));
    this.uninstallTimer = deps.clearInterval ?? ((timer) => clearInterval(timer));
  }

  async attach(vaultPath: string): Promise<void> {
    this.vaultPath = vaultPath;
    this.attachPoolListener();
    const settings = await this.readSettings();
    if (settings.enabled) this.ensureTimer(settings);
  }

  detach(): void {
    this.stopTimer();
    this.vaultPath = null;
    this.running.clear();
    this.lastTickAt = undefined;
    this.lastError = undefined;
  }

  async start(): Promise<AutoRunnerStatusDTO> {
    const settings = await this.setEnabled(true);
    this.ensureTimer(settings);
    await this.tick();
    return this.status();
  }

  async stop(): Promise<AutoRunnerStatusDTO> {
    await this.setEnabled(false);
    this.stopTimer();
    return this.status();
  }

  async status(): Promise<AutoRunnerStatusDTO> {
    const settings = await this.readSettings();
    const recent = startsInCurrentHour(this.startedAt, this.now());
    this.startedAt = recent;
    const tasks = await this.listTasks();
    const ready = buildReadySet(tasks).ready.filter((entry) => this.isDispatchCandidate(entry.task));
    return {
      attached: this.vaultPath !== null,
      enabled: settings.enabled,
      settings,
      running: [...this.running.values()].map(toRunDTO),
      readyTaskCount: ready.length,
      hourlyStarted: recent.length,
      hourlyRemaining: Math.max(0, settings.hourlyTaskLimit - recent.length),
      ...(this.lastTickAt ? { lastTickAt: this.lastTickAt } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {})
    };
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    if (!this.vaultPath) return;
    this.ticking = true;
    try {
      const settings = await this.readSettings();
      if (!settings.enabled) {
        this.stopTimer();
        return;
      }
      this.ensureTimer(settings);
      this.lastTickAt = this.now().toISOString();
      this.startedAt = startsInCurrentHour(this.startedAt, this.now());
      const readyTasks = buildReadySet(await this.listTasks())
        .ready.map((entry) => entry.task)
        .filter((task) => this.isDispatchCandidate(task));
      const decision = schedulerDecision(
        settings,
        { runningCount: this.running.size, startedAt: this.startedAt },
        this.now()
      );
      const capacity = launchCapacity(decision);
      for (const task of readyTasks.slice(0, capacity)) {
        await this.launchTask(this.vaultPath, task);
      }
      this.lastError = undefined;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.emit('dispatcher_error', this.lastError);
    } finally {
      this.ticking = false;
    }
  }

  private attachPoolListener(): void {
    if (this.poolListenerAttached) return;
    this.pool.on('event', (event: PoolEvent) => {
      void this.handlePoolEvent(event);
    });
    this.poolListenerAttached = true;
  }

  private ensureTimer(settings: AutoRunnerSettings): void {
    if (!settings.enabled || !this.vaultPath) return;
    if (this.timer && this.timerIntervalMs === settings.tickIntervalMs) return;
    this.stopTimer();
    this.timerIntervalMs = settings.tickIntervalMs;
    this.timer = this.installTimer(() => {
      void this.tick();
    }, settings.tickIntervalMs);
  }

  private stopTimer(): void {
    if (!this.timer) return;
    this.uninstallTimer(this.timer);
    this.timer = null;
    this.timerIntervalMs = 0;
  }

  private isDispatchCandidate(task: TaskRecord): boolean {
    if (task.source !== 'file') return false;
    if (!task.filePath) return false;
    if (task.active_run_id || task.owner_id) return false;
    if (this.running.has(task.id)) return false;
    return true;
  }

  private async launchTask(vaultPath: string, task: TaskRecord): Promise<void> {
    const projectPath = await this.resolveProjectPath(vaultPath, task);
    if (!projectPath) {
      await this.markTaskBlocked(task, 'Auto-runner requires a project execution context.');
      await this.eventBridge.runFailed({
        vaultPath,
        task,
        runId: 'auto-runner',
        message: 'Auto-runner requires a project execution context.'
      });
      return;
    }

    const context = await this.createContextForProject(projectPath);
    if (context.kind === 'sandbox') {
      const message =
        'Sandbox ExecutionContext is not implemented yet, so Auto-runner skipped this task.';
      await this.markTaskBlocked(task, message);
      await this.eventBridge.sandboxUnsupported({ vaultPath, task, message });
      return;
    }

    let worktree: WorktreeRecord | null = null;
    try {
      worktree = await context.create({ taskId: task.id, name: task.uid ?? task.id });
      const startTransition = reduceTaskState(
        {
          task,
          activeRunSegment: { sessionStatus: 'idle' },
          pendingDependencies: []
        },
        { source: 'dispatcher', kind: 'agent_session_started' }
      );
      await this.updateTask(task, {
        status: startTransition.newTaskStatus,
        owner_type: 'agent',
        owner_id: 'auto_runner',
        claimed_at: this.now().toISOString(),
        worktree_path: worktree.path,
        git_branch: worktree.branch
      });
      const startResult = await this.startTaskImpl({
        taskId: task.id,
        worktreePath: worktree.path,
        instructions: AUTO_RUNNER_INSTRUCTIONS
      });
      if (startResult.kind !== 'ok') {
        await this.markStartFailure(vaultPath, task, context, worktree, startResult.message);
        return;
      }

      const startedAt = this.now().toISOString();
      this.running.set(task.id, {
        taskId: task.id,
        ...(task.uid ? { taskUid: task.uid } : {}),
        title: task.title,
        runId: startResult.runId,
        worktreeId: worktree.id,
        worktreePath: worktree.path,
        projectPath,
        startedAt
      });
      this.startedAt = [...startsInCurrentHour(this.startedAt, this.now()), startedAt];
      await this.updateTask(task, { active_run_id: startResult.runId });
      this.eventBridge.runStarted({ vaultPath, task, runId: startResult.runId });
      this.emit('run_started', toRunDTO(this.running.get(task.id)!));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (worktree) {
        await context.remove(worktree.id, { force: true }).catch(() => undefined);
      }
      await this.markTaskBlocked(task, message);
      await this.eventBridge.runFailed({ vaultPath, task, runId: 'auto-runner', message });
    }
  }

  private async markStartFailure(
    vaultPath: string,
    task: TaskRecord,
    context: ExecutionContext,
    worktree: WorktreeRecord,
    message: string
  ): Promise<void> {
    await context.remove(worktree.id, { force: true }).catch(() => undefined);
    await this.markTaskBlocked(task, message);
    await this.eventBridge.runFailed({ vaultPath, task, runId: 'auto-runner', message });
  }

  private async markTaskBlocked(task: TaskRecord, message: string): Promise<void> {
    const transition = reduceTaskState(
      {
        task,
        activeRunSegment: { sessionStatus: 'idle' },
        pendingDependencies: []
      },
      { source: 'dispatcher', kind: 'dispatcher_dispatch_failed' }
    );
    await this.updateTask(task, {
      status: transition.newTaskStatus,
      owner_type: undefined,
      owner_id: undefined,
      active_run_id: undefined,
      agent_block_reason: message
    });
  }

  private async handlePoolEvent(event: PoolEvent): Promise<void> {
    if (event.event.kind !== 'done') return;
    if (!this.vaultPath) return;
    const active = [...this.running.values()].find((run) => run.runId === event.runId);
    if (!active) return;
    this.running.delete(active.taskId);
    const task = (await this.listTasks()).find((entry) => entry.id === active.taskId);
    if (!task) return;
    const snapshot = this.pool.get(event.runId)?.snapshot();
    const failed = snapshot?.summary.status === 'error' || snapshot?.summary.status === 'killed';
    const transition = failed
      ? reduceTaskState(
          {
            task,
            activeRunSegment: { sessionStatus: 'running' },
            pendingDependencies: []
          },
          {
            source: 'agent',
            kind: 'agent_failed',
            payload: { retryable: snapshot?.summary.status === 'killed' }
          }
        )
      : reduceTaskState(
          {
            task,
            activeRunSegment: { sessionStatus: 'running' },
            pendingDependencies: []
          },
          { source: 'agent', kind: 'agent_completed', payload: { taskCompleted: task.status === 'done' } }
        );
    await this.updateTask(task, {
      owner_type: undefined,
      owner_id: undefined,
      active_run_id: undefined,
      status: transition.newTaskStatus,
      ...(failed
        ? { agent_block_reason: snapshot?.summary.reason ?? event.event.text }
        : { agent_block_reason: undefined })
    });
    if (failed) {
      await this.eventBridge.runFailed({
        vaultPath: this.vaultPath,
        task,
        runId: event.runId,
        message: snapshot?.summary.reason ?? event.event.text ?? 'Agent run failed.'
      });
    } else {
      this.eventBridge.runCompleted({ vaultPath: this.vaultPath, task, runId: event.runId });
    }
    this.emit(failed ? 'run_failed' : 'run_completed', active);
  }
}

async function defaultResolveProjectPath(vaultPath: string, task: TaskRecord): Promise<string | null> {
  if (!task.project_uid) return null;
  const { listProjects } = await import('../project');
  const projects = await listProjects(vaultPath);
  const project = projects.find((entry) => entry.uid === task.project_uid);
  if (!project) return null;
  return project.legacy ? path.dirname(project.path) : project.path;
}

async function defaultUpdateTask(task: TaskRecord, patch: Record<string, unknown>): Promise<void> {
  if (task.source !== 'file') return;
  const { updateTaskFrontmatter } = await import('../task');
  const { refreshTaskFileInSession } = await import('../orchestration/session');
  await updateTaskFrontmatter(task.filePath, patch);
  await refreshTaskFileInSession(task.filePath);
}

async function defaultListTasks(): Promise<readonly TaskRecord[]> {
  const { currentSession } = await import('../fs');
  return currentSession()?.tasks.allTasks() ?? [];
}

async function defaultStartTask(args: {
  taskId: string;
  instructions?: string;
  worktreePath?: string;
}): Promise<StartTaskResult> {
  const { startTask } = await import('../agent/ipc');
  return startTask(args);
}

function toRunDTO(run: AutoRunnerActiveRun): AutoRunnerRunDTO {
  return {
    taskId: run.taskId,
    ...(run.taskUid ? { taskUid: run.taskUid } : {}),
    title: run.title,
    runId: run.runId,
    ...(run.worktreeId ? { worktreeId: run.worktreeId } : {}),
    ...(run.worktreePath ? { worktreePath: run.worktreePath } : {}),
    startedAt: run.startedAt
  };
}

const AUTO_RUNNER_INSTRUCTIONS = `This run was started by Orbit Auto-runner. Follow the task boundary. Record internal substeps in the current task Execution Log, use \`orbit task propose\` for independent new work, use \`orbit inbox help\` if blocked, and use \`orbit run request-merge\` when the result is ready for review.`;

let singleton: AutoRunnerDispatcher | null = null;

export function getAutoRunnerDispatcher(): AutoRunnerDispatcher {
  if (!singleton) singleton = new AutoRunnerDispatcher();
  return singleton;
}

export function resetAutoRunnerDispatcherForTesting(): void {
  singleton = null;
}
