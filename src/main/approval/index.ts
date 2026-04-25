export { createTaskFromApprovedProposal, type NewTaskApprovalResult } from './actions';
export { registerApprovalIpc } from './ipc';
export { ApprovalService, createApprovalService, createApprovalServiceForVault } from './service';
export type {
  ApprovalServiceOptions,
  NewTaskMaterializer,
  ProposalActivityEmitter,
  ProposalSyncListener,
  ResolveProposalResult
} from './service';
export { assertCanResolve, resolveProposalState } from './state';
export { ApprovalStore, createApprovalStore, monthKeyFromIso, readProposalNdjson } from './store';
export {
  proposalTypeToInboxSubtype,
  syncEventTypeForStatus,
  toProposalSyncSnapshot,
  withProposalSyncRefs,
  type ProposalSyncEvent,
  type ProposalSyncEventType
} from './sync';
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
} from './types';
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
} from './types';
