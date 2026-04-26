import { describe, expect, it } from 'vitest';
import { reduceTaskState, type TaskStateContext } from '../src/main/task-state/reducer';

function ctx(overrides: Partial<TaskStateContext> = {}): TaskStateContext {
  return {
    task: { id: 'task_1', status: 'todo' },
    activeRunSegment: { sessionStatus: 'idle' },
    pendingDependencies: [],
    ...overrides
  };
}

describe('task state reducer', () => {
  it('moves a ready task to doing when a session starts', () => {
    const next = reduceTaskState(ctx(), { source: 'dispatcher', kind: 'agent_session_started' });

    expect(next).toMatchObject({ newTaskStatus: 'doing', newSessionStatus: 'running' });
  });

  it('keeps task doing when the agent asks the user for more information', () => {
    const next = reduceTaskState(
      ctx({ task: { id: 'task_1', status: 'doing' }, activeRunSegment: { sessionStatus: 'running' } }),
      { source: 'agent', kind: 'agent_awaiting_user' }
    );

    expect(next).toMatchObject({ newTaskStatus: 'doing', newSessionStatus: 'awaiting_user' });
  });

  it('restarts a session from awaiting_user when the user replies', () => {
    const next = reduceTaskState(
      ctx({ task: { id: 'task_1', status: 'doing' }, activeRunSegment: { sessionStatus: 'awaiting_user' } }),
      { source: 'user', kind: 'user_message_in_chat' }
    );

    expect(next).toMatchObject({ newTaskStatus: 'doing', newSessionStatus: 'running' });
  });

  it('keeps dependency-blocked tasks blocked when the user replies before dependencies are ready', () => {
    const next = reduceTaskState(
      ctx({
        task: { id: 'task_1', status: 'blocked' },
        activeRunSegment: { sessionStatus: 'awaiting_user' },
        pendingDependencies: ['task_dep']
      }),
      { source: 'user', kind: 'user_message_in_chat' }
    );

    expect(next).toMatchObject({ newTaskStatus: 'blocked', newSessionStatus: 'running' });
  });

  it('marks the session completed without inventing a task block', () => {
    const next = reduceTaskState(
      ctx({ task: { id: 'task_1', status: 'doing' }, activeRunSegment: { sessionStatus: 'running' } }),
      { source: 'agent', kind: 'agent_completed' }
    );

    expect(next).toMatchObject({ newTaskStatus: 'doing', newSessionStatus: 'completed' });
  });

  it('preserves task state for terminal agent failure', () => {
    const next = reduceTaskState(
      ctx({ task: { id: 'task_1', status: 'doing' }, activeRunSegment: { sessionStatus: 'running' } }),
      { source: 'agent', kind: 'agent_failed', payload: { retryable: false } }
    );

    expect(next).toMatchObject({ newTaskStatus: 'doing', newSessionStatus: 'failed_terminal' });
  });

  it('preserves task state for retryable fallback failure', () => {
    const next = reduceTaskState(
      ctx({ task: { id: 'task_1', status: 'doing' }, activeRunSegment: { sessionStatus: 'failed_terminal' } }),
      { source: 'agent', kind: 'agent_failed', payload: { retryable: true } }
    );

    expect(next).toMatchObject({ newTaskStatus: 'doing', newSessionStatus: 'failed_retryable' });
  });

  it('uses blocked only for unmet dependencies', () => {
    const next = reduceTaskState(
      ctx({ task: { id: 'task_1', status: 'todo' }, pendingDependencies: ['task_dep'] }),
      { source: 'system', kind: 'dependency_blocked' }
    );

    expect(next).toMatchObject({ newTaskStatus: 'blocked', newSessionStatus: 'idle' });
  });

  it('returns dependency-blocked tasks to ready when dependencies resolve', () => {
    const next = reduceTaskState(
      ctx({ task: { id: 'task_1', status: 'blocked' }, pendingDependencies: [] }),
      { source: 'system', kind: 'dependency_resolved' }
    );

    expect(next).toMatchObject({ newTaskStatus: 'todo', newSessionStatus: 'idle' });
  });

  it('lets review actions return work to doing or close it as done', () => {
    expect(
      reduceTaskState(
        ctx({ task: { id: 'task_1', status: 'done' }, activeRunSegment: { sessionStatus: 'completed' } }),
        { source: 'user', kind: 'user_review_action', payload: { action: 'return_to_doing' } }
      )
    ).toMatchObject({ newTaskStatus: 'doing', newSessionStatus: 'idle' });

    expect(
      reduceTaskState(
        ctx({ task: { id: 'task_1', status: 'doing' } }),
        { source: 'user', kind: 'user_review_action', payload: { action: 'reject_merge' } }
      ).newTaskStatus
    ).toBe('done');
  });
});
