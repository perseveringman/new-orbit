import { create } from 'zustand';
import type { AgentEvent } from '@shared/agent';
import type { NightShiftRunDTO, TerminalAgentEventDTO } from '@shared/ipc';
import { getStoredTerminalTitle } from '../components/Terminal/terminalManagerState';

export interface ReviewQueueItem {
  id: string;
  source: 'night-shift' | 'permission';
  title: string;
  detail?: string;
  runId?: string;
  taskUid?: string;
  worktreeId?: string;
  projectUid?: string;
  paneId?: string;
  terminalTitle?: string;
  sessionId?: string;
  createdAt: string;
  status: 'pending' | 'dismissed';
}

interface ReviewQueueStore {
  items: ReviewQueueItem[];
  seedFromNightShift(runs: NightShiftRunDTO[]): void;
  ingestAgentEvent(runId: string, event: AgentEvent): void;
  ingestTerminalEvent(event: TerminalAgentEventDTO): void;
  dismiss(id: string): void;
  reset(): void;
}

function upsert(items: ReviewQueueItem[], incoming: ReviewQueueItem): ReviewQueueItem[] {
  if (items.some((item) => item.id === incoming.id)) return items;
  return [...items, incoming];
}

function getTerminalPermissionItemIds(
  event: Pick<TerminalAgentEventDTO, 'sessionId' | 'projectUid' | 'paneId'>
): string[] {
  const ids: string[] = [];
  if (event.sessionId) ids.push(`term-perm:${event.sessionId}`);
  if (event.projectUid && event.paneId) ids.push(`term-perm:${event.projectUid}:${event.paneId}`);
  return Array.from(new Set(ids));
}

function removeItemsById(items: ReviewQueueItem[], ids: string[]): ReviewQueueItem[] {
  if (ids.length === 0) return items;
  const blocked = new Set(ids);
  return items.filter((item) => !blocked.has(item.id));
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
    const worktreeId = typeof data.worktreeId === 'string' ? data.worktreeId : undefined;
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
  ingestTerminalEvent(event) {
    const relatedIds = getTerminalPermissionItemIds(event);
    if (event.eventType !== 'PermissionRequest') {
      set((state) => ({
        items: removeItemsById(state.items, relatedIds)
      }));
      return;
    }
    if (!event.projectUid || !event.paneId) return;
    const projectUid = event.projectUid;
    const paneId = event.paneId;
    const id = relatedIds[0];
    if (!id) return;
    const payload =
      event.payload && typeof event.payload === 'object'
        ? (event.payload as Record<string, unknown>)
        : {};
    const detail =
      typeof payload.reason === 'string'
        ? payload.reason
        : typeof payload.tool_name === 'string'
          ? payload.tool_name
          : event.agentType
            ? `${event.agentType} waiting for approval`
            : 'Approval needed';
    set((state) => ({
      items: upsert(
        removeItemsById(
          state.items,
          relatedIds.filter((candidate) => candidate !== id)
        ),
        {
          id,
          source: 'permission',
          title: 'Terminal permission request',
          detail,
          runId: event.sessionId,
          projectUid,
          paneId,
          terminalTitle: getStoredTerminalTitle(projectUid, paneId),
          sessionId: event.sessionId,
          createdAt: event.ts,
          status: 'pending'
        }
      )
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
