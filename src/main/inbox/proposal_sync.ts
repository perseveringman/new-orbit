import { createApprovalServiceForVault, type ApprovalServiceOptions } from '../approval/service';
import { createInboxServiceForVault, type InboxServiceOptions } from './service';
import { createProposalInboxSync } from './proposal';
import type { InboxDismissInput, InboxItem, InboxResolveInput } from './types';

export interface InboxProposalSyncOptions {
  inbox?: InboxServiceOptions;
  approval?: Omit<ApprovalServiceOptions, 'syncInbox'>;
}

export interface InboxProposalResolveResult {
  item: InboxItem;
  proposal?: Awaited<ReturnType<ReturnType<typeof createApprovalServiceForVault>['get']>>;
}

export async function resolveInboxItemWithProposalSync(
  vaultPath: string,
  id: string,
  input: InboxResolveInput = {},
  options: InboxProposalSyncOptions = {}
): Promise<InboxProposalResolveResult> {
  const inbox = createInboxServiceForVault(vaultPath, options.inbox);
  const item = await inbox.get(id);
  if (!item) throw new Error(`inbox item not found: ${id}`);
  const proposalId = item.context.proposal_id;
  if (!proposalId) return { item: await inbox.resolve(id, input) };

  const approval = createApprovalServiceForVault(vaultPath, {
    ...options.approval,
    syncInbox: createProposalInboxSync(vaultPath, options.inbox)
  });
  const decision = input.decision ?? 'done';
  const status = decision === 'reject' ? 'rejected' : 'approved';
  const result = await approval.resolve(proposalId, {
    status,
    resolution_source: input.source ?? 'inbox',
    resolution_note: input.note,
    resolved_at: input.resolved_at
  });
  const synced = await inbox.get(id);
  if (!synced) throw new Error(`inbox item disappeared after proposal sync: ${id}`);
  return { item: synced, proposal: result.proposal };
}

export async function dismissInboxItemWithProposalSync(
  vaultPath: string,
  id: string,
  input: InboxDismissInput = {},
  options: InboxProposalSyncOptions = {}
): Promise<InboxProposalResolveResult> {
  const inbox = createInboxServiceForVault(vaultPath, options.inbox);
  const item = await inbox.get(id);
  if (!item) throw new Error(`inbox item not found: ${id}`);
  const proposalId = item.context.proposal_id;
  if (!proposalId) return { item: await inbox.dismiss(id, input) };

  const approval = createApprovalServiceForVault(vaultPath, {
    ...options.approval,
    syncInbox: createProposalInboxSync(vaultPath, options.inbox)
  });
  const result = await approval.resolve(proposalId, {
    status: 'dismissed',
    resolution_source: input.source ?? 'inbox',
    resolution_note: input.note,
    resolved_at: input.resolved_at
  });
  const synced = await inbox.get(id);
  if (!synced) throw new Error(`inbox item disappeared after proposal sync: ${id}`);
  return { item: synced, proposal: result.proposal };
}
