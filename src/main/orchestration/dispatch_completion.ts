import type {
  AgentSessionStatus,
  BindingHealth,
  ImplementationReportStatus,
  RunSegment,
  TaskLeaseStatus
} from '@shared/orchestration';
import type { TaskStatus } from '@shared/schemas';
import { reduceTaskState } from '../task-state/reducer';

export interface DispatchCompletionInput {
  processOutcome: 'done' | 'error' | 'cancelled';
  taskStatus: TaskStatus | null;
  blockedReason?: string;
  summary: string;
}

export interface DispatchCompletion {
  segmentStatus: RunSegment['status'];
  sessionStatus: AgentSessionStatus;
  leaseStatus: TaskLeaseStatus;
  reportStatus: ImplementationReportStatus;
  direction: 'completed' | 'cancelled' | 'needs attention';
  taskStatus: TaskStatus;
  blockedReason?: string;
  bindingHealth: BindingHealth;
  eventType: 'dispatch:completed' | 'dispatch:released' | 'dispatch:needs_attention';
}

function preserveOpenTaskStatus(status: TaskStatus | null): TaskStatus {
  return status ?? 'doing';
}

export function classifyDispatchCompletion({
  processOutcome,
  taskStatus,
  blockedReason,
  summary
}: DispatchCompletionInput): DispatchCompletion {
  if (processOutcome === 'cancelled') {
    const transition = reduceTaskState(
      {
        task: { id: 'dispatch-completion', status: preserveOpenTaskStatus(taskStatus) },
        activeRunSegment: { sessionStatus: 'running' },
        pendingDependencies: []
      },
      { source: 'agent', kind: 'agent_failed', payload: { retryable: true } }
    );
    const nextStatus = taskStatus === 'done' ? 'done' : transition.newTaskStatus;
    return {
      segmentStatus: 'cancelled',
      sessionStatus: transition.newSessionStatus,
      leaseStatus: 'released',
      reportStatus: 'released',
      direction: 'cancelled',
      taskStatus: nextStatus,
      blockedReason: nextStatus === 'blocked' ? blockedReason || summary : undefined,
      bindingHealth: 'paused',
      eventType: 'dispatch:released'
    };
  }

  if (processOutcome === 'error') {
    const transition = reduceTaskState(
      {
        task: { id: 'dispatch-completion', status: preserveOpenTaskStatus(taskStatus) },
        activeRunSegment: { sessionStatus: 'running' },
        pendingDependencies: []
      },
      { source: 'agent', kind: 'agent_failed', payload: { retryable: false } }
    );
    return {
      segmentStatus: 'failed',
      sessionStatus: transition.newSessionStatus,
      leaseStatus: 'needs_attention',
      reportStatus: 'failed',
      direction: 'needs attention',
      taskStatus: taskStatus === 'done' ? 'done' : transition.newTaskStatus,
      blockedReason: taskStatus === 'blocked' ? blockedReason || summary : undefined,
      bindingHealth: 'degraded',
      eventType: 'dispatch:needs_attention'
    };
  }

  if (taskStatus === 'done') {
    return {
      segmentStatus: 'completed',
      sessionStatus: 'completed',
      leaseStatus: 'completed',
      reportStatus: 'completed',
      direction: 'completed',
      taskStatus: 'done',
      blockedReason: undefined,
      bindingHealth: 'healthy',
      eventType: 'dispatch:completed'
    };
  }

  const nextStatus = preserveOpenTaskStatus(taskStatus);
  const transition = reduceTaskState(
    {
      task: { id: 'dispatch-completion', status: nextStatus },
      activeRunSegment: { sessionStatus: 'running' },
      pendingDependencies: []
    },
    { source: 'agent', kind: 'agent_awaiting_user' }
  );
  return {
    segmentStatus: 'needs_attention',
    sessionStatus: transition.newSessionStatus,
    leaseStatus: 'needs_attention',
    reportStatus: 'needs_attention',
    direction: 'needs attention',
    taskStatus: transition.newTaskStatus,
    blockedReason: transition.newTaskStatus === 'blocked' ? blockedReason || summary : undefined,
    bindingHealth: 'healthy',
    eventType: 'dispatch:needs_attention'
  };
}
