import { parseProposalPayload, type NewTaskProposalPayload, type Proposal } from './types';
import { createTask, resolveProjectReference, type CreateTaskResult } from '../project';
import { normalizeTaskExecutionMode } from '@shared/schemas';
import { ConversationStore } from '../conversation/store';

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
  const projectUid = payload.project_uid
    ? await resolveApprovedProjectUid(vaultPath, payload.project_uid)
    : undefined;
  const createdBy =
    proposal.submitted_by === 'agent' ? `agent_run:${proposal.submitted_by_agent_run}` : 'user';
  const executionMode =
    payload.execution_mode ?? normalizeTaskExecutionMode(payload.frontmatter?.['execution_mode']) ?? 'human';
  const frontmatter: Record<string, unknown> = {
    ...(payload.frontmatter ?? {}),
    status: payload.status ?? payload.frontmatter?.['status'] ?? 'todo',
    execution_mode: executionMode,
    execution_strategy: executionMode === 'agent' ? 'autonomous' : 'manual',
    ...(payload.conversation_id
      ? {
          source_conversation_id: payload.conversation_id,
          conversation_ids: uniqueStrings([
            payload.conversation_id,
            ...(Array.isArray(payload.frontmatter?.['conversation_ids'])
              ? (payload.frontmatter['conversation_ids'] as unknown[]).filter(
                  (entry): entry is string => typeof entry === 'string'
                )
              : [])
          ])
        }
      : {}),
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
    project_uid: projectUid,
    area_uid: payload.area_uid,
    resource_uid: payload.resource_uid,
    title: payload.title,
    description: payload.description,
    uid: payload.uid,
    frontmatter
  });
  if (payload.conversation_id) {
    await new ConversationStore(vaultPath).addAnchor(payload.conversation_id, {
      kind: 'task',
      refId: created.uid,
      addedAt: approvedAt
    });
  }
  return { type: 'task_created', ...created };
}

async function resolveApprovedProjectUid(vaultPath: string, projectRef: string): Promise<string> {
  const project = await resolveProjectReference(vaultPath, projectRef);
  if (!project) {
    throw new Error(`project reference not found for approved task proposal: ${projectRef}`);
  }
  return project.uid;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
