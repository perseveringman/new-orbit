import type {
  BindingHealth,
  ImplementationReportStatus,
  RunSegment,
  TaskLeaseStatus
} from '@shared/orchestration';
import type { TaskStatus } from '@shared/schemas';

export interface DispatchCompletionInput {
  processOutcome: 'done' | 'error' | 'cancelled';
  taskStatus: TaskStatus | null;
  blockedReason?: string;
  summary: string;
}

export interface DispatchCompletion {
  segmentStatus: RunSegment['status'];
  leaseStatus: TaskLeaseStatus;
  reportStatus: ImplementationReportStatus;
  direction: 'completed' | 'cancelled' | 'needs attention';
  taskStatus: TaskStatus;
  blockedReason?: string;
  bindingHealth: BindingHealth;
  eventType: 'dispatch:completed' | 'dispatch:released' | 'dispatch:needs_attention';
}

function preserveOpenTaskStatus(status: TaskStatus | null): TaskStatus {
  if (status && status !== 'doing' && status !== 'done') return status;
  return 'blocked';
}

export function classifyDispatchCompletion({
  processOutcome,
  taskStatus,
  blockedReason,
  summary
}: DispatchCompletionInput): DispatchCompletion {
  if (processOutcome === 'cancelled') {
    const nextStatus = taskStatus === 'done' ? 'done' : preserveOpenTaskStatus(taskStatus);
    return {
      segmentStatus: 'cancelled',
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
    return {
      segmentStatus: 'failed',
      leaseStatus: 'needs_attention',
      reportStatus: 'failed',
      direction: 'needs attention',
      taskStatus: taskStatus === 'done' ? 'done' : 'blocked',
      blockedReason: taskStatus === 'done' ? undefined : blockedReason || summary,
      bindingHealth: 'degraded',
      eventType: 'dispatch:needs_attention'
    };
  }

  if (taskStatus === 'done') {
    return {
      segmentStatus: 'completed',
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
  return {
    segmentStatus: 'needs_attention',
    leaseStatus: 'needs_attention',
    reportStatus: 'needs_attention',
    direction: 'needs attention',
    taskStatus: nextStatus,
    blockedReason: nextStatus === 'blocked' ? blockedReason || summary : undefined,
    bindingHealth: 'healthy',
    eventType: 'dispatch:needs_attention'
  };
}
