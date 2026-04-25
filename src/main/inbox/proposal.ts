import { PROPOSAL_INBOX_SUBTYPES, parseProposalPayload, type Proposal } from '@shared/approval';
import { createInboxServiceForVault, type InboxServiceOptions } from './service';
import type { InboxMessageInput, InboxResolutionSource } from './types';

export interface ProposalInboxSync {
  submit(proposal: Proposal): Promise<void>;
  resolve(proposal: Proposal): Promise<void>;
}

export function createProposalInboxSync(
  vaultPath: string,
  options: InboxServiceOptions = {}
): ProposalInboxSync {
  return {
    submit: async (proposal) => {
      const service = createInboxServiceForVault(vaultPath, options);
      await service.emitMessage(inboxMessageForProposal(proposal));
    },
    resolve: async (proposal) => {
      const service = createInboxServiceForVault(vaultPath, options);
      const itemId = proposal.inbox_item_id ?? `inbox_${proposal.id}`;
      const existing = await service.get(itemId);
      if (!existing || existing.status !== 'pending') return;
      if (proposal.status === 'dismissed') {
        await service.dismiss(itemId, {
          source: (proposal.resolution_source ?? 'chat') as InboxResolutionSource,
          note: proposal.resolution_note,
          resolved_at: proposal.resolved_at
        });
        return;
      }
      if (proposal.status === 'approved' || proposal.status === 'rejected') {
        await service.resolve(itemId, {
          decision: proposal.status === 'approved' ? 'approve' : 'reject',
          source: (proposal.resolution_source ?? 'chat') as InboxResolutionSource,
          note: proposal.resolution_note,
          resolved_at: proposal.resolved_at
        });
      }
    }
  };
}

export function inboxMessageForProposal(proposal: Proposal): InboxMessageInput {
  const payload = parseProposalPayload(proposal.type, proposal.payload);
  const context = proposalContext(proposal, payload);
  const subtype = PROPOSAL_INBOX_SUBTYPES[proposal.type];
  return {
    id: proposal.inbox_item_id ?? `inbox_${proposal.id}`,
    subtype,
    title: proposal.subject,
    summary: proposalSummary(proposal.type, proposal.subject),
    context,
    payload: {
      proposal_id: proposal.id,
      proposal_type: proposal.type,
      proposal_status: proposal.status,
      payload
    },
    actor: proposal.submitted_by,
    created_at: proposal.submitted_at
  };
}

function proposalContext(
  proposal: Proposal,
  payload: Record<string, unknown>
): InboxMessageInput['context'] {
  return {
    proposal_id: proposal.id,
    ...(proposal.submitted_by_agent_run ? { run_id: proposal.submitted_by_agent_run } : {}),
    ...(proposal.submitted_during_task ? { task_uid: proposal.submitted_during_task } : {}),
    ...(typeof payload['project_uid'] === 'string' ? { project_uid: payload['project_uid'] } : {}),
    ...(typeof payload['area_uid'] === 'string' ? { area_uid: payload['area_uid'] } : {})
  };
}

function proposalSummary(type: Proposal['type'], subject: string): string {
  if (type === 'merge') return `Merge approval requested: ${subject}`;
  if (type === 'new_task') return `New task proposal: ${subject}`;
  if (type === 'planner_publish') return `Planner publish proposal: ${subject}`;
  if (type === 'scope_expansion') return `Scope expansion proposal: ${subject}`;
  return `Project archive proposal: ${subject}`;
}
