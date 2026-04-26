import { describe, expect, it } from 'vitest';
import { classifyDispatchCompletion } from '../src/main/orchestration/dispatch_completion';

describe('dispatch completion classification', () => {
  it('keeps a successful run open when the task was not marked done', () => {
    const result = classifyDispatchCompletion({
      processOutcome: 'done',
      taskStatus: 'doing',
      summary: 'Waiting for a product clarification'
    });

    expect(result.segmentStatus).toBe('needs_attention');
    expect(result.sessionStatus).toBe('awaiting_user');
    expect(result.leaseStatus).toBe('needs_attention');
    expect(result.reportStatus).toBe('needs_attention');
    expect(result.taskStatus).toBe('doing');
    expect(result.blockedReason).toBeUndefined();
    expect(result.bindingHealth).toBe('healthy');
    expect(result.eventType).toBe('dispatch:needs_attention');
  });

  it('treats a successful run as completed only after MCP marked the task done', () => {
    const result = classifyDispatchCompletion({
      processOutcome: 'done',
      taskStatus: 'done',
      blockedReason: 'stale',
      summary: 'Finished all requested work'
    });

    expect(result.segmentStatus).toBe('completed');
    expect(result.sessionStatus).toBe('completed');
    expect(result.leaseStatus).toBe('completed');
    expect(result.reportStatus).toBe('completed');
    expect(result.taskStatus).toBe('done');
    expect(result.blockedReason).toBeUndefined();
    expect(result.eventType).toBe('dispatch:completed');
  });

  it('preserves waiting when the agent exits after asking for clarification', () => {
    const result = classifyDispatchCompletion({
      processOutcome: 'done',
      taskStatus: 'waiting',
      summary: 'Asked user to confirm rollout scope'
    });

    expect(result.segmentStatus).toBe('needs_attention');
    expect(result.sessionStatus).toBe('awaiting_user');
    expect(result.reportStatus).toBe('needs_attention');
    expect(result.taskStatus).toBe('waiting');
    expect(result.blockedReason).toBeUndefined();
    expect(result.bindingHealth).toBe('healthy');
  });
});
