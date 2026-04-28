import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConversationStore, conversationsDir } from '../src/main/conversation/store';
import { ConversationOrchestrator } from '../src/main/conversation/orchestrator';
import {
  anchorToConversationScope,
  conversationScopeKey,
  turnToMessage
} from '../src/shared/conversation';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-conv-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('ConversationStore', () => {
  it('creates a conversation and persists meta + ndjson', async () => {
    const store = new ConversationStore(tmp);
    const conv = await store.create({
      id: 'c1',
      anchors: [{ kind: 'task', refId: 't1', addedAt: '2026-04-29T00:00:00Z' }]
    });
    expect(conv.id).toBe('c1');
    expect(conv.turns).toEqual([]);
    expect(conv.status).toBe('active');

    const dir = conversationsDir(tmp);
    const meta = JSON.parse(await readFile(path.join(dir, 'c1.meta.json'), 'utf8'));
    expect(meta.anchors[0].refId).toBe('t1');
  });

  it('appends turns and reads them back ordered', async () => {
    const store = new ConversationStore(tmp);
    await store.create({ id: 'c2', anchors: [] });
    await store.appendTurn('c2', {
      id: 'turn-1',
      at: '2026-04-29T00:00:01Z',
      role: 'user',
      content: 'hello'
    });
    await store.appendTurn('c2', {
      id: 'turn-2',
      at: '2026-04-29T00:00:02Z',
      role: 'assistant',
      content: 'world'
    });
    const got = await store.get('c2');
    expect(got?.turns.map((t) => t.content)).toEqual(['hello', 'world']);
  });

  it('addAnchor dedupes by (kind, refId)', async () => {
    const store = new ConversationStore(tmp);
    await store.create({
      id: 'c3',
      anchors: [{ kind: 'task', refId: 't1', addedAt: '2026-04-29T00:00:00Z' }]
    });
    await store.addAnchor('c3', { kind: 'task', refId: 't1', addedAt: '2026-04-29T00:01:00Z' });
    await store.addAnchor('c3', {
      kind: 'inbox_item',
      refId: 'i1',
      addedAt: '2026-04-29T00:02:00Z'
    });
    const got = await store.get('c3');
    expect(got?.anchors).toHaveLength(2);
  });

  it('findByAnchor returns matching conversations sorted by updatedAt desc', async () => {
    const store = new ConversationStore(tmp);
    await store.create({
      id: 'c-a',
      anchors: [{ kind: 'task', refId: 't1', addedAt: '2026-04-29T00:00:00Z' }]
    });
    await store.create({
      id: 'c-b',
      anchors: [{ kind: 'task', refId: 't1', addedAt: '2026-04-29T00:00:00Z' }]
    });
    await store.appendTurn('c-a', {
      id: 'x',
      at: '2026-04-29T01:00:00Z',
      role: 'user',
      content: 'a'
    });
    const list = await store.findByAnchor('task', 't1');
    expect(list.map((m) => m.id)).toEqual(['c-a', 'c-b']);
  });

  it('persists scoped last-active conversations and archives without deleting history', async () => {
    const store = new ConversationStore(tmp);
    await store.create({
      id: 'global-1',
      anchors: [{ kind: 'ask_anywhere_session', refId: 's1', addedAt: '2026-04-29T00:00:00Z' }],
      scope: { kind: 'global' }
    });
    await store.create({
      id: 'task-1',
      anchors: [{ kind: 'task', refId: 'task-1', addedAt: '2026-04-29T00:00:00Z' }]
    });

    expect((await store.lastActive({ kind: 'global' }))?.id).toBe('global-1');
    expect((await store.lastActive({ kind: 'task', task_id: 'task-1' }))?.id).toBe('task-1');

    const archived = await store.archive('global-1');
    expect(archived?.archived).toBe(true);
    expect(archived?.status).toBe('ended');
    expect((await store.get('global-1'))?.anchors[0].refId).toBe('s1');
  });
});

describe('ConversationOrchestrator', () => {
  it('creates conversation with anchor and appends turns', async () => {
    const orch = new ConversationOrchestrator(tmp);
    const conv = await orch.createConversation({
      anchor: { kind: 'task', refId: 'task-x', addedAt: '2026-04-29T00:00:00Z' },
      runtimeHint: 'claude'
    });
    expect(conv.runtimeHint).toBe('claude');
    const turn = await orch.appendTurn({
      conversationId: conv.id,
      role: 'user',
      content: 'plan it'
    });
    expect(turn.role).toBe('user');
    const got = await orch.getConversation(conv.id);
    expect(got?.turns).toHaveLength(1);
  });

  it('bindRuntime updates currentRunId / vendorSessionId', async () => {
    const orch = new ConversationOrchestrator(tmp);
    const conv = await orch.createConversation({
      anchor: { kind: 'ask_anywhere_session', refId: 's1', addedAt: '2026-04-29T00:00:00Z' }
    });
    await orch.bindRuntime(conv.id, { currentRunId: 'run-9', vendorSessionId: 'v-99' });
    const got = await orch.getConversation(conv.id);
    expect(got?.currentRunId).toBe('run-9');
    expect(got?.vendorSessionId).toBe('v-99');
  });

  it('updates last active by scope through the orchestrator', async () => {
    const orch = new ConversationOrchestrator(tmp);
    const first = await orch.createConversation({
      anchor: { kind: 'ask_anywhere_session', refId: 's1', addedAt: '2026-04-29T00:00:00Z' },
      scope: { kind: 'global' }
    });
    const second = await orch.createConversation({
      anchor: { kind: 'ask_anywhere_session', refId: 's2', addedAt: '2026-04-29T00:01:00Z' },
      scope: { kind: 'global' }
    });

    expect((await orch.getLastActive({ kind: 'global' }))?.id).toBe(second.id);
    await orch.setLastActive({ kind: 'global' }, first.id);
    expect((await orch.getLastActive({ kind: 'global' }))?.id).toBe(first.id);
  });
});

describe('Conversation shared helpers', () => {
  it('maps legacy anchors to first-class scopes and stable keys', () => {
    expect(
      anchorToConversationScope({
        kind: 'task',
        refId: 'task-42',
        addedAt: '2026-04-29T00:00:00Z'
      })
    ).toEqual({ kind: 'task', task_id: 'task-42' });
    expect(conversationScopeKey({ kind: 'task', task_id: 'task-42', project_id: 'proj' })).toBe(
      'task:proj:task-42'
    );
    expect(conversationScopeKey({ kind: 'resource', resource_slug: 'orbit' })).toBe(
      'resource:orbit'
    );
  });

  it('converts persisted turns to renderer messages with event and artifact refs', () => {
    expect(
      turnToMessage({
        id: 'turn-1',
        at: '2026-04-29T00:00:00Z',
        role: 'assistant',
        content: 'Done',
        runtimeEventIds: ['evt-1'],
        artifactRefs: ['artifact-1']
      })
    ).toEqual({
      id: 'turn-1',
      role: 'assistant',
      content: 'Done',
      created_at: '2026-04-29T00:00:00Z',
      event_refs: ['evt-1'],
      artifact_refs: ['artifact-1']
    });
  });
});
