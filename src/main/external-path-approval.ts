import path from 'node:path';
import type { Proposal, ProposalStatus } from '@shared/approval';
import type { RuntimeEvent } from '@shared/chat-protocol';
import { cliServerError } from './cli_server/errors';
import {
  isExternalPathApproved,
  rememberExternalPathApproval,
  resolveReadablePathKind,
  type ExternalPathAccessKind
} from './external-path-access';
import { isInsideRoot } from './pathGuard';
import { createApprovalServiceForVault, type ApprovalService } from './approval/service';
import { broadcastApprovalSyncEvent } from './approval/ipc';
import { createProposalInboxSync } from './inbox/proposal';
import { broadcastInboxEvent } from './inbox/events';
import type { AgentRuntimeEventSink } from './agent-tools/llm-client';

const APPROVAL_POLL_INTERVAL_MS = 250;

export interface ExternalPathApprovalGateInput {
  vaultPath: string;
  requestedTarget: string;
  targetPath: string;
  conversationId: string;
  runId: string;
  toolUseId: string;
  toolName: string;
  emit: AgentRuntimeEventSink;
}

export interface ExternalPathApprovalGate {
  request(input: ExternalPathApprovalGateInput): Promise<void>;
}

export function createExternalPathApprovalGate(): ExternalPathApprovalGate {
  return {
    request: requestExternalPathReadApproval
  };
}

export async function requestExternalPathReadApproval(
  input: ExternalPathApprovalGateInput
): Promise<void> {
  const vaultPath = path.resolve(input.vaultPath);
  const targetPath = path.resolve(input.targetPath);

  if (isInsideRoot(vaultPath, targetPath) || isExternalPathApproved(vaultPath, targetPath)) {
    return;
  }

  const pathKind = await resolveReadablePathKind(targetPath);
  const approval = createApprovalServiceForVault(vaultPath, {
    onSync: broadcastApprovalSyncEvent,
    syncInbox: createProposalInboxSync(vaultPath, { onEvent: broadcastInboxEvent })
  });
  const proposal = await approval.submit({
    type: 'external_path_access',
    submitted_by: 'agent',
    submitted_by_agent_run: input.runId,
    subject: `Allow Ask Anywhere to read ${targetPath}`,
    payload: {
      title: 'Allow external path read?',
      description: buildApprovalDescription(targetPath, pathKind),
      access: 'read',
      target_path: targetPath,
      requested_target: input.requestedTarget,
      path_kind: pathKind,
      conversation_id: input.conversationId,
      run_id: input.runId,
      tool_use_id: input.toolUseId,
      tool_name: input.toolName
    }
  });

  await emitExternalPathApprovalEvent(input, proposal, pathKind, 'pending');
  const resolved = await waitForProposalResolution(approval, proposal.id);
  await emitExternalPathApprovalEvent(input, resolved, pathKind, resolved.status);

  if (resolved.status !== 'approved') {
    throw cliServerError(
      resolved.status === 'dismissed' ? 'external_path_dismissed' : 'external_path_denied',
      `external path access ${resolved.status}: ${targetPath}`
    );
  }

  rememberExternalPathApproval(vaultPath, targetPath);
}

async function waitForProposalResolution(
  approval: ApprovalService,
  proposalId: string
): Promise<Proposal> {
  for (;;) {
    const proposal = await approval.get(proposalId);
    if (!proposal) {
      throw cliServerError(
        'external_path_approval_missing',
        `external path approval disappeared: ${proposalId}`
      );
    }
    if (proposal.status !== 'pending') return proposal;
    await delay(APPROVAL_POLL_INTERVAL_MS);
  }
}

async function emitExternalPathApprovalEvent(
  input: ExternalPathApprovalGateInput,
  proposal: Proposal,
  pathKind: ExternalPathAccessKind,
  status: ProposalStatus
): Promise<void> {
  const payload = proposal.payload as Record<string, unknown>;
  const targetPath =
    typeof payload['target_path'] === 'string' ? payload['target_path'] : input.targetPath;
  const event: RuntimeEvent<'runtime.awaiting_user'> = {
    id: `${input.runId}:external-path-approval-${proposal.id}-${status}`,
    at: new Date().toISOString(),
    kind: 'runtime.awaiting_user',
    conversationId: input.conversationId,
    runId: input.runId,
    spanId: proposal.id,
    parentSpanId: input.toolUseId,
    payload: {
      kind: 'external_path_access',
      status,
      proposalId: proposal.id,
      title: 'Allow external path read?',
      hint:
        status === 'pending'
          ? 'Approve in this chat or Inbox to continue.'
          : status === 'approved'
            ? 'Approved. Continuing.'
            : 'Denied. The read will not run.',
      targetPath,
      requestedTarget: input.requestedTarget,
      pathKind,
      ...(proposal.inbox_item_id ? { inboxItemId: proposal.inbox_item_id } : {}),
      ...(proposal.chat_card_id ? { chatCardId: proposal.chat_card_id } : {})
    }
  };
  await input.emit(event);
}

function buildApprovalDescription(targetPath: string, pathKind: ExternalPathAccessKind): string {
  const scope = pathKind === 'directory' ? 'this folder and files inside it' : 'this file';
  return [
    targetPath,
    '',
    'This path is outside the current Orbit vault.',
    `If you allow it, Orbit will remember access to ${scope} for this app session.`
  ].join('\n');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
