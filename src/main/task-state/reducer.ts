import type { AgentSessionStatus, RunSegment } from '@shared/orchestration';
import type { TaskRecord, TaskStatus } from '@shared/schemas';

export interface TaskStateContext {
  task: Pick<TaskRecord, 'id' | 'status'>;
  activeRunSegment: Pick<RunSegment, 'sessionStatus'> | null;
  pendingDependencies: readonly string[];
}

export type UserReviewAction = 'return_to_doing' | 'reject_merge' | 'approve_merge';

export type TaskStateInput =
  | { source: 'dispatcher'; kind: 'agent_session_started'; payload?: { sessionStatus?: AgentSessionStatus } }
  | { source: 'agent'; kind: 'agent_awaiting_user'; payload?: unknown }
  | { source: 'user'; kind: 'user_message_in_chat'; payload?: unknown }
  | { source: 'agent'; kind: 'agent_completed'; payload?: { taskCompleted?: boolean } }
  | { source: 'agent' | 'dispatcher' | 'system'; kind: 'agent_failed'; payload?: { retryable?: boolean } }
  | { source: 'dispatcher' | 'system'; kind: 'dispatcher_dispatch_failed'; payload?: { retryable?: boolean } }
  | { source: 'system'; kind: 'dependency_blocked'; payload?: unknown }
  | { source: 'system'; kind: 'dependency_resolved'; payload?: unknown }
  | { source: 'user'; kind: 'user_set_status'; payload: { status: TaskStatus } }
  | { source: 'user'; kind: 'user_review_action'; payload: { action: UserReviewAction } };

export type TaskStateSideEffect =
  | { kind: 'emit_inbox'; subtype: 'B3'; reason: string }
  | { kind: 'clear_blocked_reason' };

export interface TaskStateTransition {
  newTaskStatus: TaskStatus;
  newSessionStatus: AgentSessionStatus;
  sideEffects: TaskStateSideEffect[];
}

function currentSessionStatus(ctx: TaskStateContext): AgentSessionStatus {
  return ctx.activeRunSegment?.sessionStatus ?? 'idle';
}

function dependenciesReady(ctx: TaskStateContext): boolean {
  return ctx.pendingDependencies.length === 0;
}

export function reduceTaskState(ctx: TaskStateContext, input: TaskStateInput): TaskStateTransition {
  let newTaskStatus = ctx.task.status;
  let newSessionStatus = currentSessionStatus(ctx);
  const sideEffects: TaskStateSideEffect[] = [];

  switch (input.kind) {
    case 'agent_session_started':
      newTaskStatus = dependenciesReady(ctx) ? 'doing' : 'blocked';
      newSessionStatus = input.payload?.sessionStatus ?? 'running';
      if (dependenciesReady(ctx)) sideEffects.push({ kind: 'clear_blocked_reason' });
      break;

    case 'agent_awaiting_user':
      newSessionStatus = 'awaiting_user';
      break;

    case 'user_message_in_chat':
      newTaskStatus = dependenciesReady(ctx) ? 'doing' : ctx.task.status === 'blocked' ? 'blocked' : 'doing';
      newSessionStatus = 'running';
      if (dependenciesReady(ctx)) sideEffects.push({ kind: 'clear_blocked_reason' });
      break;

    case 'agent_completed':
      newTaskStatus = input.payload?.taskCompleted || ctx.task.status === 'done' ? 'done' : ctx.task.status;
      newSessionStatus = 'completed';
      break;

    case 'agent_failed':
      newSessionStatus = input.payload?.retryable ? 'failed_retryable' : 'failed_terminal';
      break;

    case 'dispatcher_dispatch_failed':
      newSessionStatus = input.payload?.retryable ? 'failed_retryable' : 'failed_terminal';
      break;

    case 'dependency_blocked':
      if (ctx.task.status !== 'doing' && ctx.task.status !== 'done') newTaskStatus = 'blocked';
      break;

    case 'dependency_resolved':
      if (ctx.task.status === 'blocked' && dependenciesReady(ctx)) {
        newTaskStatus = 'todo';
        sideEffects.push({ kind: 'clear_blocked_reason' });
      }
      break;

    case 'user_set_status':
      newTaskStatus = input.payload.status;
      if (newTaskStatus === 'doing') newSessionStatus = 'idle';
      if (newTaskStatus !== 'blocked') sideEffects.push({ kind: 'clear_blocked_reason' });
      break;

    case 'user_review_action':
      if (input.payload.action === 'return_to_doing') {
        newTaskStatus = 'doing';
        newSessionStatus = 'idle';
      } else if (input.payload.action === 'reject_merge' || input.payload.action === 'approve_merge') {
        newTaskStatus = 'done';
      }
      break;
  }

  return { newTaskStatus, newSessionStatus, sideEffects };
}
