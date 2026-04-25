export type {
  NewTaskProposalPayload,
  Proposal,
  ProposalListFilter,
  ProposalResolutionSource,
  ProposalResolutionStatus,
  ProposalResolveInput,
  ProposalStatus,
  ProposalSubmitInput,
  ProposalSubmitter,
  ProposalSyncSnapshot,
  ProposalType
} from '@shared/approval';

export {
  NewTaskProposalPayloadSchema,
  PROPOSAL_INBOX_SUBTYPES,
  PROPOSAL_RESOLUTION_SOURCES,
  PROPOSAL_STATUSES,
  PROPOSAL_SUBMITTERS,
  PROPOSAL_TYPES,
  ProposalResolveInputSchema,
  ProposalSchema,
  ProposalStatusSchema,
  ProposalSubmitInputSchema,
  ProposalTypeSchema,
  parseProposalPayload
} from '@shared/approval';
