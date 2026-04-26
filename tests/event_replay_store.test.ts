import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { publishTraceableEvent, configureEventReplay, currentEventReplayStore } from '../src/main/events/bus';

describe('traceable event replay store', () => {
  let vault: string;

  beforeEach(async () => {
    vault = await mkdtemp(path.join(os.tmpdir(), 'orbit-events-'));
    configureEventReplay(vault);
  });

  afterEach(async () => {
    configureEventReplay(null);
    await rm(vault, { recursive: true, force: true });
  });

  it('persists and filters four-source trace events', async () => {
    const agent = publishTraceableEvent({
      source: 'agent',
      type: 'assistant_message',
      traceId: 'trace-1',
      runId: 'run-1',
      taskId: 'task-1',
      summary: 'Agent answered',
      payload: { text: 'done' }
    });
    publishTraceableEvent({
      source: 'inbox',
      type: 'created',
      traceId: 'trace-2',
      taskUid: 'task-2',
      summary: 'Needs decision'
    });

    const store = currentEventReplayStore();
    expect(store).not.toBeNull();
    const byTrace = await waitForTrace('trace-1');
    expect(byTrace.events).toHaveLength(1);
    expect(byTrace.events[0]).toMatchObject({ id: agent.id, source: 'agent', runId: 'run-1' });

    const bySource = await store!.query({ source: 'inbox' });
    expect(bySource.events[0]?.summary).toBe('Needs decision');
  });
});

async function waitForTrace(traceId: string) {
  const store = currentEventReplayStore();
  if (!store) throw new Error('event store not configured');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await store.query({ traceId });
    if (result.events.length > 0) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return store.query({ traceId });
}
