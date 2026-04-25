import { parseProposalPayload, type NewTaskProposalPayload, type Proposal } from './types';
import { createTask, type CreateTaskResult } from '../project';

export interface NewTaskApprovalResult extends CreateTaskResult {
  type: 'task_created';
}

export async function createTaskFromApprovedProposal(
  vaultPath: string,
  proposal: Proposal,
  approvedAt: string
): Promise<NewTaskApprovalResult> {
  if (proposal.type !== 'new_task') {
    throw new Error(`proposal ${proposal.id} is not a new_task proposal`);
  }
  const payload = parseProposalPayload(proposal.type, proposal.payload) as NewTaskProposalPayload;
  const createdBy =
    proposal.submitted_by === 'agent' ? `agent_run:${proposal.submitted_by_agent_run}` : 'user';
  const frontmatter: Record<string, unknown> = {
    ...(payload.frontmatter ?? {}),
    status: payload.status ?? payload.frontmatter?.['status'] ?? 'todo',
    created_by: createdBy,
    approved_by: 'user',
    approved_at: approvedAt,
    proposed_by_agent_run: proposal.submitted_by_agent_run ?? null,
    proposed_during_task: proposal.submitted_during_task ?? null,
    proposal_id: proposal.id,
    approval_decision_note: proposal.resolution_note ?? null,
    derived_from: proposal.submitted_during_task ?? payload.frontmatter?.['derived_from'] ?? null
  };
  const created = await createTask(vaultPath, {
    project_uid: payload.project_uid,
    area_uid: payload.area_uid,
    title: payload.title,
    description: payload.description,
    uid: payload.uid,
    frontmatter
  });
  return { type: 'task_created', ...created };
}
