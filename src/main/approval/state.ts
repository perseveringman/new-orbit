import type { Proposal, ProposalResolutionStatus, ProposalResolveInput } from './types';
import { ProposalResolveInputSchema, ProposalSchema } from './types';

export function assertCanResolve(proposal: Proposal, nextStatus: ProposalResolutionStatus): void {
  if (proposal.status !== 'pending') {
    throw new Error(
      `invalid proposal transition: ${proposal.status} -> ${nextStatus}; only pending proposals can be resolved`
    );
  }
}

export function resolveProposalState(
  proposal: Proposal,
  input: ProposalResolveInput,
  resolvedAt: string,
  result?: unknown
): Proposal {
  const parsed = ProposalResolveInputSchema.parse({
    ...input,
    resolved_at: input.resolved_at ?? resolvedAt
  });
  assertCanResolve(proposal, parsed.status);
  const next: Proposal = {
    ...proposal,
    status: parsed.status,
    resolved_at: parsed.resolved_at ?? resolvedAt,
    resolved_by: parsed.resolved_by,
    resolution_source: parsed.resolution_source
  };
  if (parsed.resolution_note !== undefined) next.resolution_note = parsed.resolution_note;
  if (result !== undefined) next.result = result;
  return ProposalSchema.parse(next);
}
