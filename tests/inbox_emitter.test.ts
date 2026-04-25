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
});
