import type { TaskRecord } from '@shared/schemas';
import type { ActivityEventInput } from '../activity';
import { emitActivity } from '../activity';
import { createInboxServiceForVault, type InboxService } from '../inbox/service';
import { broadcastInboxEvent } from '../inbox/events';

export interface AutoRunnerEventBridgeOptions {
  emitActivity?: (input: ActivityEventInput) => unknown;
  inboxForVault?: (vaultPath: string) => Pick<InboxService, 'emitMessage'>;
}

export interface AutoRunnerRunEvent {
  vaultPath: string;
  task: TaskRecord;
  runId: string;
  message?: string;
}

export interface AutoRunnerUnsupportedEvent {
  vaultPath: string;
  task: TaskRecord;
  message: string;
}

export class AutoRunnerEventBridge {
  private readonly activity: (input: ActivityEventInput) => unknown;
  private readonly inboxForVault: (vaultPath: string) => Pick<InboxService, 'emitMessage'>;

  constructor(options: AutoRunnerEventBridgeOptions = {}) {
    this.activity = options.emitActivity ?? emitActivity;
    this.inboxForVault =
      options.inboxForVault ??
      ((vaultPath) => createInboxServiceForVault(vaultPath, { onEvent: broadcastInboxEvent }));
  }

  runStarted(event: AutoRunnerRunEvent): void {
    this.activity({
      actor: 'agent',
      actor_id: event.runId,
      action: 'agent.run_started',
      context: contextFor(event.task, event.runId),
      payload: { title: event.task.title },
      summary: `Auto-runner started: ${event.task.title}`
    });
  }

  runCompleted(event: AutoRunnerRunEvent): void {
    this.activity({
      actor: 'agent',
      actor_id: event.runId,
      action: 'agent.run_completed',
      context: contextFor(event.task, event.runId),
      payload: { title: event.task.title },
      summary: `Auto-runner completed: ${event.task.title}`
    });
  }

  async runFailed(event: AutoRunnerRunEvent): Promise<void> {
    const message = event.message ?? 'Agent run failed.';
    this.activity({
      actor: 'agent',
      actor_id: event.runId,
      action: 'agent.run_failed',
      context: contextFor(event.task, event.runId),
      payload: { title: event.task.title, message },
      summary: `Auto-runner failed: ${event.task.title}`
    });
    await this.inboxForVault(event.vaultPath).emitMessage({
      subtype: 'B3',
      title: `Auto-runner failed: ${event.task.title}`,
      summary: message,
      context: contextFor(event.task, event.runId),
      payload: {
        task_uid: event.task.uid,
        task_id: event.task.id,
        run_id: event.runId,
        message
      },
      actor: 'agent'
    });
  }

  async sandboxUnsupported(event: AutoRunnerUnsupportedEvent): Promise<void> {
    this.activity({
      actor: 'agent',
      action: 'agent.run_failed',
      context: contextFor(event.task),
      payload: {
        title: event.task.title,
        message: event.message,
        reason: 'sandbox_unsupported'
      },
      summary: `Auto-runner skipped sandbox task: ${event.task.title}`
    });
    await this.inboxForVault(event.vaultPath).emitMessage({
      subtype: 'B1',
      title: `Sandbox Auto-runner unsupported: ${event.task.title}`,
      summary: event.message,
      context: contextFor(event.task),
      payload: {
        task_uid: event.task.uid,
        task_id: event.task.id,
        message: event.message,
        help: 'Sandbox ExecutionContext is not implemented yet. Switch the project execution_context to worktree for code projects, or run this task manually.'
      },
      actor: 'system'
    });
  }
}

function contextFor(task: TaskRecord, runId?: string): ActivityEventInput['context'] {
  return {
    ...(task.project_uid ? { project_uid: task.project_uid } : {}),
    ...(task.area_uid ? { area_uid: task.area_uid } : {}),
    ...(task.uid ? { task_uid: task.uid } : {}),
    ...(runId ? { run_id: runId } : {})
  };
}
