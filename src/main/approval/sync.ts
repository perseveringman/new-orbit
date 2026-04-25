import {
  PROPOSAL_INBOX_SUBTYPES,
  type Proposal,
  type ProposalStatus,
  type ProposalSyncSnapshot,
  type ProposalType
} from './types';

export type ProposalSyncEventType = 'submitted' | 'approved' | 'rejected' | 'dismissed';

export interface ProposalSyncEvent {
  type: ProposalSyncEventType;
  proposal: Proposal;
  snapshot: ProposalSyncSnapshot;
}

export function proposalTypeToInboxSubtype(
  type: ProposalType
): (typeof PROPOSAL_INBOX_SUBTYPES)[ProposalType] {
  return PROPOSAL_INBOX_SUBTYPES[type];
}

export function withProposalSyncRefs(proposal: Proposal): Proposal {
  return {
    ...proposal,
    inbox_item_id: proposal.inbox_item_id ?? `inbox_${proposal.id}`,
    chat_card_id: proposal.chat_card_id ?? `chat_${proposal.id}`
  };
}

export function toProposalSyncSnapshot(proposal: Proposal): ProposalSyncSnapshot {
  return {
    proposal_id: proposal.id,
    status: proposal.status,
    inbox_item_id: proposal.inbox_item_id ?? `inbox_${proposal.id}`,
    chat_card_id: proposal.chat_card_id ?? `chat_${proposal.id}`,
    inbox_subtype: proposalTypeToInboxSubtype(proposal.type),
    inbox_status: toInboxStatus(proposal.status)
  };
}

export function syncEventTypeForStatus(status: ProposalStatus): ProposalSyncEventType {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'dismissed') return 'dismissed';
  return 'submitted';
}

function toInboxStatus(status: ProposalStatus): ProposalSyncSnapshot['inbox_status'] {
  if (status === 'pending') return 'pending';
  if (status === 'dismissed') return 'dismissed';
  return 'resolved';
}
