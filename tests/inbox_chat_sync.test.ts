import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createApprovalService,
  createApprovalStore,
  type ProposalSyncEvent
} from '../src/main/approval';
import {
  createInboxStore,
  createProposalInboxSync,
  resolveInboxItemWithProposalSync
} from '../src/main/inbox';
import type { ActivityEventInput } from '../src/main/activity';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'inbox-chat-sync', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('inbox proposal/chat sync model', () => {
  it('creates an A-type Inbox item when a proposal is submitted', async () => {
    const activities: ActivityEventInput[] = [];
    const syncEvents: ProposalSyncEvent[] = [];
    const approval = createApprovalService(createApprovalStore(vaultPath), {
      id: () => 'prop_scope',
      now: () => new Date('2026-04-26T10:00:00.000Z'),
      emitActivity: (event) => activities.push(event),
      onSync: (event) => syncEvents.push(event),
      syncInbox: createProposalInboxSync(vaultPath, {
        now: () => new Date('2026-04-26T10:00:00.000Z'),
        emitActivity: (event) => activities.push(event)
      })
    });

    const proposal = await approval.submit({
      type: 'scope_expansion',
      submitted_by: 'agent',
      submitted_by_agent_run: 'run_scope',
      subject: 'Edit shared helper',
      payload: { reason: 'Helper is required to complete the task' }
    });

    const inbox = await createInboxStore(vaultPath).get(proposal.inbox_item_id!);
    expect(inbox?.subtype).toBe('A4');
    expect(inbox?.context.proposal_id).toBe('prop_scope');
    expect(syncEvents.map((event) => event.type)).toEqual(['submitted']);
    expect(activities.map((event) => event.action)).toEqual([
      'inbox.message_created',
      'agent.proposal_submitted'
    ]);
  });

  it('resolving an Inbox proposal item resolves the shared proposal store', async () => {
    const approval = createApprovalService(createApprovalStore(vaultPath), {
      id: () => 'prop_archive',
      now: () => new Date('2026-04-26T10:00:00.000Z'),
      emitActivity: () => undefined,
      syncInbox: createProposalInboxSync(vaultPath, {
        now: () => new Date('2026-04-26T10:00:00.000Z'),
        emitActivity: () => undefined
      })
    });
    const proposal = await approval.submit({
      type: 'archive_project',
      submitted_by: 'agent',
      submitted_by_agent_run: 'run_archive',
      subject: 'Archive dormant project',
      payload: { project_uid: 'proj_1' }
    });

    const result = await resolveInboxItemWithProposalSync(
      vaultPath,
      proposal.inbox_item_id!,
      { decision: 'reject', source: 'inbox', note: 'Keep it visible' },
      {
        inbox: { now: () => new Date('2026-04-26T11:00:00.000Z'), emitActivity: () => undefined },
        approval: { now: () => new Date('2026-04-26T11:00:00.000Z'), emitActivity: () => undefined }
      }
    );

    expect(result.item.status).toBe('resolved');
    expect(result.proposal?.status).toBe('rejected');
    expect(result.proposal?.resolution_source).toBe('inbox');
  });

  it('resolving in chat updates the linked Inbox item from the same proposal state', async () => {
    const approval = createApprovalService(createApprovalStore(vaultPath), {
      id: () => 'prop_chat',
      now: () => new Date('2026-04-26T10:00:00.000Z'),
      emitActivity: () => undefined,
      syncInbox: createProposalInboxSync(vaultPath, {
        now: () => new Date('2026-04-26T10:00:00.000Z'),
        emitActivity: () => undefined
      })
    });
    const proposal = await approval.submit({
      type: 'planner_publish',
      submitted_by: 'agent',
      submitted_by_agent_run: 'run_plan',
      subject: 'Publish planner proposal',
      payload: { project_uid: 'proj_plan' }
    });

    await approval.resolve(proposal.id, {
      status: 'approved',
      resolution_source: 'chat',
      resolved_at: '2026-04-26T11:00:00.000Z'
    });

    const inbox = await createInboxStore(vaultPath).get(proposal.inbox_item_id!);
    expect(inbox?.status).toBe('resolved');
    expect(inbox?.resolution_source).toBe('chat');
  });
});
