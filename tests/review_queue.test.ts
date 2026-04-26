import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../src/shared/agent';
import { useReviewQueue } from '../src/renderer/src/store/reviewQueue';

describe('review queue store', () => {
  it('deduplicates repeated permission requests', () => {
    useReviewQueue.getState().reset();
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
      'perm:run-1:wt-1'
    ]);
  });

  it('dismisses items by id', () => {
    useReviewQueue.getState().reset();
    useReviewQueue.getState().ingestAgentEvent('run-1', {
      idx: -1,
      at: new Date().toISOString(),
      kind: 'text',
      text: '[hook] PermissionRequest',
      data: {
        hookEventType: 'PermissionRequest',
        worktreeId: 'wt-1'
      }
    });
    useReviewQueue.getState().dismiss('perm:run-1:wt-1');
    expect(useReviewQueue.getState().items).toEqual([]);
  });

  it('stores terminal permission requests with project and pane routing details', () => {
    useReviewQueue.getState().reset();
    const originalLocalStorage = globalThis.localStorage;
    const memoryStorage = {
      getItem(key: string): string | null {
        if (key !== 'orbit.termmgr.project-1') return null;
        return JSON.stringify({
          tabs: [
            {
              id: 'tab-1',
              title: 'Planning Terminal',
              root: { kind: 'leaf', id: 'pane-7' },
              focusedLeafId: 'pane-7',
              zoomedLeafId: null
            }
          ],
          activeTabId: 'tab-1'
        });
      }
    } as Storage;
    globalThis.localStorage = memoryStorage;

    useReviewQueue.getState().ingestTerminalEvent({
      eventType: 'PermissionRequest',
      projectUid: 'project-1',
      paneId: 'pane-7',
      sessionId: 'sess-9',
      ts: '2026-04-23T03:32:00Z',
      reason: 'hook',
      payload: {
        tool_name: 'Edit',
        reason: 'Edit README.md'
      }
    });

    expect(useReviewQueue.getState().items).toContainEqual(
      expect.objectContaining({
        id: 'term-perm:sess-9',
        source: 'permission',
        detail: 'Edit README.md',
        projectUid: 'project-1',
        paneId: 'pane-7',
        sessionId: 'sess-9',
        terminalTitle: 'Planning Terminal'
      })
    );
    globalThis.localStorage = originalLocalStorage;
  });

  it('clears terminal permission requests after follow-up terminal activity', () => {
    useReviewQueue.getState().reset();

    useReviewQueue.getState().ingestTerminalEvent({
      eventType: 'PermissionRequest',
      projectUid: 'project-1',
      paneId: 'pane-7',
      sessionId: 'sess-9',
      ts: '2026-04-23T03:32:00Z',
      reason: 'hook',
      payload: {
        tool_name: 'Edit',
        reason: 'Edit README.md'
      }
    });
    useReviewQueue.getState().ingestTerminalEvent({
      eventType: 'Progress',
      projectUid: 'project-1',
      paneId: 'pane-7',
      sessionId: 'sess-9',
      ts: '2026-04-23T03:33:00Z',
      reason: 'hook',
      rawEventType: 'Notification'
    });

    expect(useReviewQueue.getState().items).toEqual([]);
  });

  it('clears pane-keyed terminal approvals when a later session event includes a session id', () => {
    useReviewQueue.getState().reset();

    useReviewQueue.getState().ingestTerminalEvent({
      eventType: 'PermissionRequest',
      projectUid: 'project-1',
      paneId: 'pane-7',
      ts: '2026-04-23T03:32:00Z',
      reason: 'hook',
      payload: {
        tool_name: 'Edit'
      }
    });
    useReviewQueue.getState().ingestTerminalEvent({
      eventType: 'Start',
      projectUid: 'project-1',
      paneId: 'pane-7',
      sessionId: 'sess-10',
      ts: '2026-04-23T03:33:00Z',
      reason: 'hook',
      rawEventType: 'PostToolUse'
    });

    expect(useReviewQueue.getState().items).toEqual([]);
  });
});
