import { describe, expect, it } from 'vitest';
import {
  ProposalSchema,
  assertCanResolve,
  resolveProposalState,
  type Proposal
} from '../src/main/approval';

describe('proposal state machine', () => {
  it('accepts pending proposals and resolves them once', () => {
    const pending = proposal();
    expect(ProposalSchema.parse(pending).status).toBe('pending');

    const approved = resolveProposalState(
      pending,
      { status: 'approved', resolution_source: 'chat', resolved_by: 'user' },
      '2026-04-26T10:05:00.000Z',
      { type: 'task_created', uid: 'task_1' }
    );

    expect(approved.status).toBe('approved');
    expect(approved.resolved_at).toBe('2026-04-26T10:05:00.000Z');
    expect(approved.resolved_by).toBe('user');
    expect(approved.resolution_source).toBe('chat');
    expect(approved.result).toEqual({ type: 'task_created', uid: 'task_1' });
  });

  it('rejects invalid transitions from terminal states', () => {
    const approved = resolveProposalState(
      proposal(),
      { status: 'approved', resolution_source: 'inbox', resolved_by: 'user' },
      '2026-04-26T10:05:00.000Z'
    );

    expect(() => assertCanResolve(approved, 'rejected')).toThrow(
      /invalid proposal transition: approved -> rejected/
    );
    expect(() =>
      resolveProposalState(
        approved,
        { status: 'dismissed', resolution_source: 'inbox', resolved_by: 'user' },
        '2026-04-26T10:06:00.000Z'
      )
    ).toThrow(/only pending proposals can be resolved/);
  });

  it('validates new_task payload ownership and agent run authorization', () => {
    expect(() =>
      ProposalSchema.parse({
        ...proposal(),
        payload: { title: 'Missing owner' }
      })
    ).toThrow(/project_uid, area_uid, or resource_uid/);

    expect(() =>
      ProposalSchema.parse({
        ...proposal(),
        submitted_by_agent_run: undefined
      })
    ).toThrow(/submitted_by_agent_run/);
  });
});

function proposal(): Proposal {
  return {
    id: 'prop_1',
    type: 'new_task',
    status: 'pending',
    submitted_by: 'agent',
    submitted_at: '2026-04-26T10:00:00.000Z',
    submitted_by_agent_run: 'run_1',
    submitted_during_task: 'task_parent',
    subject: 'Create follow-up task',
    payload: {
      project_uid: 'proj_1',
      title: 'Follow-up task'
    },
    inbox_item_id: 'inbox_prop_1',
    chat_card_id: 'chat_prop_1'
  };
}
