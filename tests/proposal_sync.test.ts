import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createApprovalStore,
  monthKeyFromIso,
  proposalTypeToInboxSubtype,
  readProposalNdjson,
  resolveProposalState,
  toProposalSyncSnapshot,
  withProposalSyncRefs,
  type Proposal
} from '../src/main/approval';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'proposal-sync', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('proposal store and sync helpers', () => {
  it('persists pending proposals and archives resolved history by month', async () => {
    const store = createApprovalStore(vaultPath);
    const pending = withProposalSyncRefs(proposal('prop_store'));

    await store.submit(pending);
    expect(await store.list({ includeArchived: false })).toEqual([pending]);

    const resolved = await store.resolve(pending.id, (current) =>
      resolveProposalState(
        current,
        { status: 'rejected', resolution_source: 'inbox', resolved_by: 'user' },
        '2026-04-26T11:00:00.000Z'
      )
    );

    expect(resolved.status).toBe('rejected');
    expect(await store.list({ includeArchived: false })).toEqual([]);
    expect(await store.get(pending.id)).toEqual(resolved);

    const pendingRaw = await fs.readFile(
      path.join(vaultPath, '.orbit', 'approvals', 'pending.ndjson'),
      'utf8'
    );
    expect(pendingRaw).toBe('');

    const archived = await readProposalNdjson(
      path.join(vaultPath, '.orbit', 'approvals', 'archive', '2026-04.ndjson')
    );
    expect(archived).toEqual([resolved]);
    expect(monthKeyFromIso(resolved.resolved_at!)).toBe('2026-04');
  });

  it('maps proposal ids to shared chat and Inbox sync snapshots', () => {
    const pending = withProposalSyncRefs(proposal('prop_sync'));
    const snapshot = toProposalSyncSnapshot(pending);

    expect(proposalTypeToInboxSubtype('new_task')).toBe('A2');
    expect(snapshot).toEqual({
      proposal_id: 'prop_sync',
      status: 'pending',
      inbox_item_id: 'inbox_prop_sync',
      chat_card_id: 'chat_prop_sync',
      inbox_subtype: 'A2',
      inbox_status: 'pending'
    });

    const dismissed = resolveProposalState(
      pending,
      { status: 'dismissed', resolution_source: 'chat', resolved_by: 'user' },
      '2026-04-26T11:00:00.000Z'
    );
    expect(toProposalSyncSnapshot(dismissed).inbox_status).toBe('dismissed');
  });

  it('rejects double resolution with a clear error', async () => {
    const store = createApprovalStore(vaultPath);
    const pending = withProposalSyncRefs(proposal('prop_double'));
    await store.submit(pending);
    await store.resolve(pending.id, (current) =>
      resolveProposalState(
        current,
        { status: 'approved', resolution_source: 'cli', resolved_by: 'user' },
        '2026-04-26T11:00:00.000Z'
      )
    );

    await expect(
      store.resolve(pending.id, (current) =>
        resolveProposalState(
          current,
          { status: 'rejected', resolution_source: 'cli', resolved_by: 'user' },
          '2026-04-26T12:00:00.000Z'
        )
      )
    ).rejects.toThrow(/already approved/);
  });
});

function proposal(id: string): Proposal {
  return {
    id,
    type: 'new_task',
    status: 'pending',
    submitted_by: 'agent',
    submitted_at: '2026-04-26T10:00:00.000Z',
    submitted_by_agent_run: 'run_1',
    subject: 'Create follow-up task',
    payload: {
      project_uid: 'proj_1',
      title: 'Follow-up task'
    }
  };
}
