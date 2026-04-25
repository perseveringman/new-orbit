import { randomUUID } from 'node:crypto';
import type { ActivityEventInput } from '../activity';
import { emitActivity } from '../activity';
import { createTaskFromApprovedProposal, type NewTaskApprovalResult } from './actions';
import { resolveProposalState } from './state';
import { createApprovalStore, type ApprovalStore } from './store';
import {
  ProposalResolveInputSchema,
  ProposalSchema,
  ProposalSubmitInputSchema,
  parseProposalPayload,
  type Proposal,
  type ProposalListFilter,
  type ProposalResolveInput,
  type ProposalSubmitInput,
  type ProposalSyncSnapshot
} from './types';
import {
  syncEventTypeForStatus,
  toProposalSyncSnapshot,
  withProposalSyncRefs,
  type ProposalSyncEvent
} from './sync';

export type ProposalActivityEmitter = (input: ActivityEventInput) => unknown;
export type NewTaskMaterializer = (
  proposal: Proposal,
  approvedAt: string
) => Promise<NewTaskApprovalResult>;
export type ProposalSyncListener = (event: ProposalSyncEvent) => void;

export interface ApprovalServiceOptions {
  now?: () => Date;
  id?: () => string;
  emitActivity?: ProposalActivityEmitter;
  materializeNewTask?: NewTaskMaterializer;
  onSync?: ProposalSyncListener;
}

export interface ResolveProposalResult {
  proposal: Proposal;
  sync: ProposalSyncSnapshot;
}

export class ApprovalService {
  private readonly now: () => Date;
  private readonly id: () => string;
  private readonly activity: ProposalActivityEmitter;
  private readonly materializeNewTask?: NewTaskMaterializer;
  private readonly onSync?: ProposalSyncListener;

  constructor(
    private readonly store: ApprovalStore,
    options: ApprovalServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? randomUUID;
    this.activity = options.emitActivity ?? emitActivity;
    this.materializeNewTask = options.materializeNewTask;
    this.onSync = options.onSync;
  }

  async submit(input: ProposalSubmitInput): Promise<Proposal> {
    const parsed = ProposalSubmitInputSchema.parse(input);
    const proposal = ProposalSchema.parse(
      withProposalSyncRefs({
        id: parsed.id ?? this.id(),
        type: parsed.type,
        status: 'pending',
        submitted_by: parsed.submitted_by,
        submitted_at: parsed.submitted_at ?? this.now().toISOString(),
        ...(parsed.submitted_by_agent_run
          ? { submitted_by_agent_run: parsed.submitted_by_agent_run }
          : {}),
        ...(parsed.submitted_during_task
          ? { submitted_during_task: parsed.submitted_during_task }
          : {}),
        subject: parsed.subject,
        payload: parseProposalPayload(parsed.type, parsed.payload)
      })
    );
    const stored = await this.store.submit(proposal);
    this.emitSubmitted(stored);
    this.emitSync(stored);
    return stored;
  }

  async resolve(id: string, input: ProposalResolveInput): Promise<ResolveProposalResult> {
    const parsed = ProposalResolveInputSchema.parse(input);
    const fallbackResolvedAt = parsed.resolved_at ?? this.now().toISOString();
    let materialized: NewTaskApprovalResult | undefined;
    const proposal = await this.store.resolve(id, async (current) => {
      const draft = resolveProposalState(current, parsed, fallbackResolvedAt);
      if (draft.status === 'approved' && draft.type === 'new_task') {
        if (!this.materializeNewTask) {
          throw new Error(
            `new_task approval materializer is not configured; proposal ${current.id} was not approved`
          );
        }
        materialized = await this.materializeNewTask(
          draft,
          draft.resolved_at ?? fallbackResolvedAt
        );
        return resolveProposalState(current, parsed, fallbackResolvedAt, materialized);
      }
      return draft;
    });
    this.emitResolved(proposal);
    this.emitSync(proposal);
    return { proposal, sync: toProposalSyncSnapshot(proposal) };
  }

  async list(filter?: ProposalListFilter): Promise<Proposal[]> {
    return this.store.list(filter);
  }

  async get(id: string): Promise<Proposal | null> {
    return this.store.get(id);
  }

  private emitSubmitted(proposal: Proposal): void {
    this.activity({
      actor: proposal.submitted_by,
      ...(proposal.submitted_by_agent_run ? { actor_id: proposal.submitted_by_agent_run } : {}),
      action: 'agent.proposal_submitted',
      context: activityContextFor(proposal),
      payload: { type: proposal.type, subject: proposal.subject },
      summary: `Submitted proposal: ${proposal.subject}`
    });
  }

  private emitResolved(proposal: Proposal): void {
    if (proposal.status === 'dismissed') return;
    this.activity({
      actor: 'user',
      action:
        proposal.status === 'approved' ? 'agent.proposal_approved' : 'agent.proposal_rejected',
      context: activityContextFor(proposal),
      payload: {
        type: proposal.type,
        subject: proposal.subject,
        result: proposal.result
      },
      summary:
        proposal.status === 'approved'
          ? `Approved proposal: ${proposal.subject}`
          : `Rejected proposal: ${proposal.subject}`
    });
  }

  private emitSync(proposal: Proposal): void {
    this.onSync?.({
      type: syncEventTypeForStatus(proposal.status),
      proposal,
      snapshot: toProposalSyncSnapshot(proposal)
    });
  }
}

export function createApprovalService(
  store: ApprovalStore,
  options?: ApprovalServiceOptions
): ApprovalService {
  return new ApprovalService(store, options);
}

export function createApprovalServiceForVault(
  vaultPath: string,
  options: Omit<ApprovalServiceOptions, 'materializeNewTask'> = {}
): ApprovalService {
  return new ApprovalService(createApprovalStore(vaultPath), {
    ...options,
    materializeNewTask: (proposal, approvedAt) =>
      createTaskFromApprovedProposal(vaultPath, proposal, approvedAt)
  });
}

function activityContextFor(proposal: Proposal): ActivityEventInput['context'] {
  return {
    proposal_id: proposal.id,
    ...(proposal.submitted_by_agent_run ? { run_id: proposal.submitted_by_agent_run } : {}),
    ...(proposal.submitted_during_task ? { task_uid: proposal.submitted_during_task } : {}),
    ...(proposal.inbox_item_id ? { inbox_item_id: proposal.inbox_item_id } : {})
  };
}
