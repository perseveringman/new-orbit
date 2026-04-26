import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInboxService, createInboxStore, type InboxEvent } from '../src/main/inbox';
import type { ActivityEventInput } from '../src/main/activity';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = path.join(process.cwd(), 'test-results', 'inbox-emitter', randomUUID());
  await fs.mkdir(vaultPath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('inbox service emitter', () => {
  it('emits message lifecycle events with Activity Log inputs', async () => {
    const activities: ActivityEventInput[] = [];
    const events: InboxEvent[] = [];
    const service = createInboxService(createInboxStore(vaultPath), {
      id: () => 'inbox_emit_msg',
      now: () => new Date('2026-04-26T10:00:00.000Z'),
      emitActivity: (event) => activities.push(event),
      onEvent: (event) => events.push(event)
    });

    const item = await service.emitMessage({
      subtype: 'B1',
      title: 'Need missing API key',
      summary: 'Agent cannot continue without user input.',
      context: { task_uid: 'task_1', run_id: 'run_1' },
      payload: { question: 'Which API key should I use?' },
      actor: 'agent'
    });
    const resolved = await service.resolve(item.id, { source: 'inbox', note: 'Answered in chat' });

    expect(item.id).toBe('inbox_emit_msg');
    expect(resolved.status).toBe('resolved');
    expect(activities.map((event) => event.action)).toEqual([
      'inbox.message_created',
      'inbox.message_resolved'
    ]);
    expect(events.map((event) => event.type)).toEqual(['created', 'resolved']);
  });

  it('emits Capture items with subtype-specific activity actions', async () => {
    const activities: ActivityEventInput[] = [];
    const service = createInboxService(createInboxStore(vaultPath), {
      id: () => 'thought_emit_1',
      now: () => new Date('2026-04-26T10:00:00.000Z'),
      emitActivity: (event) => activities.push(event)
    });

    const thought = await service.emitCapture({
      subtype: 'thought',
      title: 'Inbox architecture idea',
      summary: 'A concise captured thought.',
      payload: { content: 'Stage View should stay generic.', tags: ['inbox'], created_from: 'manual' }
    });

    expect(thought.status).toBe('pending');
    expect(activities.map((event) => event.action)).toEqual(['thought.created']);
  });

  it('resolves pending task attention messages by task context', async () => {
    const events: InboxEvent[] = [];
    const service = createInboxService(createInboxStore(vaultPath), {
      id: () => `inbox_${events.length}`,
      now: () => new Date('2026-04-26T10:00:00.000Z'),
      emitActivity: () => undefined,
      onEvent: (event) => events.push(event)
    });

    const help = await service.emitMessage({
      subtype: 'B1',
      title: 'Agent needs input',
      summary: 'Need one more detail.',
      context: { task_uid: 'task_1', run_id: 'run_1' },
      payload: {}
    });
    const failure = await service.emitMessage({
      subtype: 'B3',
      title: 'Agent failed',
      summary: 'Runtime failed.',
      context: { task_uid: 'task_1', run_id: 'run_2' },
      payload: {}
    });
    await service.emitMessage({
      subtype: 'C1',
      title: 'Dependency warning',
      summary: 'Dependency changed.',
      context: { task_uid: 'task_1' },
      payload: {}
    });
    await service.emitMessage({
      subtype: 'B1',
      title: 'Other task needs input',
      summary: 'Different task.',
      context: { task_uid: 'task_2' },
      payload: {}
    });

    const resolved = await service.resolvePendingTaskAttention({
      taskUid: 'task_1',
      source: 'chat',
      note: 'User replied in chat.'
    });

    expect(resolved.map((item) => item.id)).toEqual([help.id, failure.id]);
    expect(resolved.every((item) => item.status === 'resolved')).toBe(true);
    const active = await service.list({ category: 'message', status: 'pending', includeArchived: false });
    expect(active.items.map((item) => item.subtype).sort()).toEqual(['B1', 'C1']);
    expect(events.filter((event) => event.type === 'resolved')).toHaveLength(2);
  });
});
