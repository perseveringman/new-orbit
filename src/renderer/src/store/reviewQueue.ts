import { create } from 'zustand';
import type { AgentEvent } from '@shared/agent';
import type { NightShiftRunDTO } from '@shared/ipc';

export interface ReviewQueueItem {
  id: string;
  source: 'night-shift' | 'permission';
  title: string;
  detail?: string;
  runId?: string;
  taskUid?: string;
  worktreeId?: string;
  createdAt: string;
  status: 'pending' | 'dismissed';
}

interface ReviewQueueStore {
  items: ReviewQueueItem[];
  seedFromNightShift(runs: NightShiftRunDTO[]): void;
  ingestAgentEvent(runId: string, event: AgentEvent): void;
  dismiss(id: string): void;
  reset(): void;
}

function upsert(
  items: ReviewQueueItem[],
  incoming: ReviewQueueItem
): ReviewQueueItem[] {
  if (items.some((item) => item.id === incoming.id)) return items;
  return [...items, incoming];
}

export const useReviewQueue = create<ReviewQueueStore>((set) => ({
  items: [],
  seedFromNightShift(runs) {
    set((state) => {
      let next = state.items.filter((item) => item.status === 'pending');
      for (const run of runs) {
        for (const task of run.tasks) {
          if (task.phase !== 'done' && task.phase !== 'blocked') continue;
          next = upsert(next, {
            id: `ns:${run.runId}:${task.taskUid}`,
            source: 'night-shift',
            title: task.title,
            detail: task.detail ?? task.phase,
            runId: run.runId,
            taskUid: task.taskUid,
            createdAt: task.endedAt ?? run.startedAt,
            status: 'pending'
          });
        }
      }
      return { items: next };
    });
  },
  ingestAgentEvent(runId, event) {
    const data = (event.data ?? {}) as Record<string, unknown>;
    if (data.hookEventType !== 'PermissionRequest') return;
    const worktreeId =
      typeof data.worktreeId === 'string' ? data.worktreeId : undefined;
    const payload =
      data.payload && typeof data.payload === 'object'
        ? (data.payload as Record<string, unknown>)
        : {};
    const detail =
      typeof payload.reason === 'string'
        ? payload.reason
        : typeof payload.tool_name === 'string'
          ? payload.tool_name
          : 'Permission request';
    set((state) => ({
      items: upsert(state.items, {
        id: `perm:${runId}:${worktreeId ?? ''}`,
        source: 'permission',
        title: `Agent permission request`,
        detail,
        runId,
        worktreeId,
        createdAt: event.at,
        status: 'pending'
      })
    }));
  },
  dismiss(id) {
    set((state) => ({
      items: state.items.filter((item) => item.id !== id)
    }));
  },
  reset() {
    set({ items: [] });
  }
}));
