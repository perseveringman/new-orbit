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
      { decision: 'approved', label: 'Approve', disabled: !isPending },
      { decision: 'rejected', label: 'Reject', disabled: !isPending },
      { decision: 'dismissed', label: 'Dismiss', disabled: !isPending }
    ]
  };
}

function labelForStatus(status: Proposal['status']): string {
  switch (status) {
    case 'pending':
      return 'Pending approval';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'dismissed':
      return 'Dismissed';
  }
}
