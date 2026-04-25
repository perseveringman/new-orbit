import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createApprovalService,
  createApprovalStore,
  type Proposal,
  type ProposalSyncEvent
} from '../src/main/approval';
import type { ActivityEventInput } from '../src/main/activity';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'proposal-service', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('approval service submit/resolve APIs', () => {
  it('submits, lists, gets and rejects proposals with activity + sync events', async () => {
    const activities: ActivityEventInput[] = [];
    const syncEvents: ProposalSyncEvent[] = [];
    const service = createApprovalService(createApprovalStore(vaultPath), {
      id: () => 'prop_service',
      now: () => new Date('2026-04-26T10:00:00.000Z'),
      emitActivity: (event) => activities.push(event),
      onSync: (event) => syncEvents.push(event)
    });

    const submitted = await service.submit({
      type: 'scope_expansion',
      submitted_by: 'agent',
      submitted_by_agent_run: 'run_scope',
      subject: 'Need to edit adjacent module',
      payload: { reason: 'shared helper is broken' }
    });

    expect(submitted.id).toBe('prop_service');
    expect(submitted.inbox_item_id).toBe('inbox_prop_service');
    expect(await service.get(submitted.id)).toEqual(submitted);
    expect(await service.list({ status: 'pending' })).toEqual([submitted]);

    const resolved = await service.resolve(submitted.id, {
      status: 'rejected',
      resolution_source: 'chat',
      resolution_note: 'Keep current scope small'
    });

    expect(resolved.proposal.status).toBe('rejected');
    expect(resolved.sync.inbox_status).toBe('resolved');
    expect(await service.list({ status: 'pending', includeArchived: false })).toEqual([]);
    expect(activities.map((event) => event.action)).toEqual([
      'agent.proposal_submitted',
      'agent.proposal_rejected'
    ]);
    expect(syncEvents.map((event) => event.type)).toEqual(['submitted', 'rejected']);
  });

  it('does not fake approved new_task success without a materializer', async () => {
    const service = createApprovalService(createApprovalStore(vaultPath), {
      id: () => 'prop_no_materializer',
      now: () => new Date('2026-04-26T10:00:00.000Z'),
      emitActivity: () => undefined
    });
    const submitted = await service.submit({
      type: 'new_task',
      submitted_by: 'agent',
      submitted_by_agent_run: 'run_task',
      subject: 'Create authorized task',
      payload: { project_uid: 'proj_1', title: 'Authorized task' }
    });

    await expect(
      service.resolve(submitted.id, { status: 'approved', resolution_source: 'inbox' })
    ).rejects.toThrow(/materializer is not configured/);

    const stillPending = (await service.get(submitted.id)) as Proposal;
    expect(stillPending.status).toBe('pending');
  });
});
