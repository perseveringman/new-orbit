import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  publishTraceableEvent,
  configureEventReplay,
  eventReplayBus
} from '../src/main/events/bus';
import { isTraceableEventKind, TRACEABLE_EVENT_KINDS } from '@shared/events';

describe('M1: TraceableEvent kind/type 双通道', () => {
  let vault: string;

  beforeEach(async () => {
    vault = await mkdtemp(path.join(os.tmpdir(), 'orbit-events-kind-'));
    configureEventReplay(vault);
  });

  afterEach(async () => {
    configureEventReplay(null);
    await rm(vault, { recursive: true, force: true });
  });

  it('提供 kind 时自动镜像到 type', () => {
    const ev = publishTraceableEvent({
      source: 'agent',
      kind: 'agent.run.started',
      runId: 'run-x',
      payload: {
        runId: 'run-x',
        runtime: { provider: 'claude' }
      }
    });
    expect(ev.kind).toBe('agent.run.started');
    expect(ev.type).toBe('agent.run.started');
  });

  it('只提供 type 且为合法 kind 时自动回填 kind', () => {
    const ev = publishTraceableEvent({
      source: 'inbox',
      type: 'inbox.item.created',
      payload: { itemId: 'i-1' }
    });
    expect(ev.kind).toBe('inbox.item.created');
  });

  it('只提供 type 但不是合法 kind 时保持 kind 为空（向后兼容）', () => {
    const ev = publishTraceableEvent({
      source: 'agent',
      type: 'thinking',
      runId: 'run-y',
      payload: { text: 'pondering' }
    });
    expect(ev.kind).toBeUndefined();
    expect(ev.type).toBe('thinking');
  });

  it('按 kind 单播订阅', async () => {
    const received: string[] = [];
    const handler = (ev: { kind?: string }) => {
      if (ev.kind) received.push(ev.kind);
    };
    eventReplayBus.on('agent.run.completed', handler);
    publishTraceableEvent({
      source: 'agent',
      kind: 'agent.run.completed',
      runId: 'run-z',
      payload: { runId: 'run-z' }
    });
    eventReplayBus.off('agent.run.completed', handler);
    expect(received).toEqual(['agent.run.completed']);
  });

  it('isTraceableEventKind 守卫函数工作正常', () => {
    expect(isTraceableEventKind('agent.run.started')).toBe(true);
    expect(isTraceableEventKind('totally.fake')).toBe(false);
    // 枚举至少包含若干预期项
    expect(TRACEABLE_EVENT_KINDS).toContain('conversation.started');
    expect(TRACEABLE_EVENT_KINDS).toContain('channel.inbound.message');
  });
});
