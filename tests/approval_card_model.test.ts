import { describe, expect, it } from 'vitest';
import { getApprovalCardState } from '../src/renderer/src/components/approval/approvalCardModel';
import type { Proposal } from '../src/shared/approval';

describe('approval card renderer model', () => {
  it('enables decisions only while a shared proposal is pending', () => {
    const pending = proposal('pending');
    expect(getApprovalCardState(pending)).toMatchObject({
      proposalId: 'prop_card',
      statusLabel: 'Pending approval',
      isPending: true,
      actions: [
        { decision: 'approved', disabled: false },
        { decision: 'rejected', disabled: false },
        { decision: 'dismissed', disabled: false }
      ]
    });

    const approved = { ...pending, status: 'approved' as const };
    expect(getApprovalCardState(approved).actions.every((action) => action.disabled)).toBe(true);
  });
});

function proposal(status: Proposal['status']): Proposal {
  return {
    id: 'prop_card',
    type: 'merge',
    status,
    submitted_by: 'agent',
    submitted_at: '2026-04-26T10:00:00.000Z',
    submitted_by_agent_run: 'run_card',
    subject: 'Merge worktree result',
    payload: {}
  };
}
