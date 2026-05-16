import type { Proposal, ProposalResolutionStatus } from '@shared/approval';

export interface ApprovalCardActionState {
  decision: ProposalResolutionStatus;
  label: string;
  disabled: boolean;
}

export interface ApprovalCardState {
  proposalId: string;
  statusLabel: string;
  isPending: boolean;
  actions: ApprovalCardActionState[];
}

export function getApprovalCardState(proposal: Proposal): ApprovalCardState {
  const isPending = proposal.status === 'pending';
  return {
    proposalId: proposal.id,
    statusLabel: labelForStatus(proposal.status),
    isPending,
    actions: [
      { decision: 'approved', label: '批准', disabled: !isPending },
      { decision: 'rejected', label: '拒绝', disabled: !isPending },
      { decision: 'dismissed', label: '忽略', disabled: !isPending }
    ]
  };
}

function labelForStatus(status: Proposal['status']): string {
  switch (status) {
    case 'pending':
      return '待审批';
    case 'approved':
      return '已批准';
    case 'rejected':
      return '已拒绝';
    case 'dismissed':
      return '已忽略';
  }
}
