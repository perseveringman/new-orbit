import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../src/shared/agent';
import { useReviewQueue } from '../src/renderer/src/store/reviewQueue';

describe('review queue store', () => {
  it('seeds done and blocked Night Shift tasks into the queue', () => {
    useReviewQueue.getState().reset();
    useReviewQueue.getState().seedFromNightShift([
      {
        runId: 'ns-1',
        startedAt: new Date().toISOString(),
        status: 'done',
        concurrency: 2,
        createPR: false,
        tasks: [
          { taskUid: 't-1', title: 'Done task', projectUid: 'p-1', phase: 'done' },
          { taskUid: 't-2', title: 'Blocked task', projectUid: 'p-1', phase: 'blocked' },
          { taskUid: 't-3', title: 'Pending task', projectUid: 'p-1', phase: 'pending' }
        ]
      }
    ]);

    expect(useReviewQueue.getState().items.map((item) => item.id)).toEqual([
      'ns:ns-1:t-1',
      'ns:ns-1:t-2'
    ]);
  });

  it('deduplicates repeated seeds and permission requests', () => {
    useReviewQueue.getState().reset();
    useReviewQueue.getState().seedFromNightShift([
      {
        runId: 'ns-1',
        startedAt: new Date().toISOString(),
        status: 'done',
        concurrency: 2,
        createPR: false,
        tasks: [{ taskUid: 't-1', title: 'Done task', projectUid: 'p-1', phase: 'done' }]
      }
    ]);
    useReviewQueue.getState().seedFromNightShift([
      {
        runId: 'ns-1',
        startedAt: new Date().toISOString(),
        status: 'done',
        concurrency: 2,
        createPR: false,
        tasks: [{ taskUid: 't-1', title: 'Done task', projectUid: 'p-1', phase: 'done' }]
      }
    ]);

    const permissionEvent: AgentEvent = {
      idx: -1,
      at: new Date().toISOString(),
      kind: 'text',
      text: '[hook] PermissionRequest',
      data: {
        hookEventType: 'PermissionRequest',
        worktreeId: 'wt-1',
        payload: { reason: 'write-vault' }
      }
    };
    useReviewQueue.getState().ingestAgentEvent('run-1', permissionEvent);
    useReviewQueue.getState().ingestAgentEvent('run-1', permissionEvent);

    expect(useReviewQueue.getState().items.map((item) => item.id)).toEqual([
      'ns:ns-1:t-1',
      'perm:run-1:wt-1'
    ]);
  });

  it('dismisses items by id', () => {
    useReviewQueue.getState().reset();
    useReviewQueue.getState().seedFromNightShift([
      {
        runId: 'ns-1',
        startedAt: new Date().toISOString(),
        status: 'done',
        concurrency: 2,
        createPR: false,
        tasks: [{ taskUid: 't-1', title: 'Done task', projectUid: 'p-1', phase: 'done' }]
      }
    ]);
    useReviewQueue.getState().dismiss('ns:ns-1:t-1');
    expect(useReviewQueue.getState().items).toEqual([]);
  });
});
