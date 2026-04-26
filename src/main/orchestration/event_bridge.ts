import type { TaskRecord } from '@shared/schemas';
import { createInboxServiceForVault, type InboxService } from '../inbox';
import { broadcastInboxEvent } from '../inbox/events';

export interface DispatchNeedsAttentionEvent {
  vaultPath: string;
  task: TaskRecord;
  runId: string;
  summary: string;
  failed: boolean;
}

type AttentionInbox = Pick<InboxService, 'emitMessage'> &
  Partial<Pick<InboxService, 'resolvePendingTaskAttention'>>;

export interface OrchestrationEventBridgeOptions {
  inboxForVault?: (vaultPath: string) => AttentionInbox;
}

export class OrchestrationEventBridge {
  private readonly inboxForVault: (vaultPath: string) => AttentionInbox;

  constructor(options: OrchestrationEventBridgeOptions = {}) {
    this.inboxForVault =
      options.inboxForVault ??
      ((vaultPath) => createInboxServiceForVault(vaultPath, { onEvent: broadcastInboxEvent }));
  }

  async dispatchNeedsAttention(event: DispatchNeedsAttentionEvent): Promise<void> {
    const summary = event.summary.trim() || 'Agent run requires attention.';
    const inbox = this.inboxForVault(event.vaultPath);
    if (event.task.uid) {
      await inbox.resolvePendingTaskAttention?.({
        taskUid: event.task.uid,
        source: 'inbox',
        note: 'Superseded by a newer agent attention request.',
        resolved_by: 'agent'
      });
    }
    await inbox.emitMessage({
      subtype: event.failed ? 'B3' : 'B1',
      title: event.failed
        ? `Agent run failed: ${event.task.title}`
        : `Agent needs input: ${event.task.title}`,
      summary,
      context: contextFor(event.task, event.runId),
      payload: {
        task_uid: event.task.uid,
        task_id: event.task.id,
        run_id: event.runId,
        message: summary,
        ...(event.failed
          ? {}
          : {
              help: 'Open the linked task conversation, answer the agent, then retry the task.'
            })
      },
      actor: 'agent'
    });
  }
}

function contextFor(task: TaskRecord, runId: string): { project_uid?: string; area_uid?: string; task_uid?: string; run_id: string } {
  return {
    ...(task.project_uid ? { project_uid: task.project_uid } : {}),
    ...(task.area_uid ? { area_uid: task.area_uid } : {}),
    ...(task.uid ? { task_uid: task.uid } : {}),
    run_id: runId
  };
}
