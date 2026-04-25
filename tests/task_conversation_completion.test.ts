import { describe, expect, it } from 'vitest';
import { resolveConversationCompletion } from '../src/main/orchestration/conversation';

describe('task conversation completion resolution', () => {
  it('downgrades completed runs when the task was not marked done', () => {
    const result = resolveConversationCompletion({
      resultStatus: 'completed',
      taskStatus: 'doing',
      summary: 'exit 0'
    });

    expect(result.status).toBe('needs_attention');
    expect(result.summary).toBe('Run exited before the task was marked done.');
  });

  it('uses blocked reasons for clarification runs', () => {
    const result = resolveConversationCompletion({
      resultStatus: 'completed',
      taskStatus: 'blocked',
      blockedReason: 'Need product confirmation for the rollout scope.',
      summary: 'exit 0'
    });

    expect(result.status).toBe('needs_attention');
    expect(result.summary).toBe('Need product confirmation for the rollout scope.');
  });

  it('keeps completed when the task is explicitly done', () => {
    const result = resolveConversationCompletion({
      resultStatus: 'completed',
      taskStatus: 'done',
      summary: 'Implemented the requested feature.'
    });

    expect(result.status).toBe('completed');
    expect(result.summary).toBe('Implemented the requested feature.');
  });
});
