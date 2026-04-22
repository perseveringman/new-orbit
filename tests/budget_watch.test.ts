import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { BudgetWatch } from '../src/main/agent/budget_watch';
import type { AgentEvent, CostRecord } from '../src/shared/agent';
import { DEFAULT_BUDGET, type BudgetSettings } from '../src/shared/schemas';

class FakePool extends EventEmitter {
  public killed: Array<{ runId: string; reason?: string }> = [];
  public get(_id: string): undefined {
    return undefined;
  }
  public async kill(runId: string, reason?: string): Promise<void> {
    this.killed.push({ runId, reason });
  }
}

function cost(partial: Partial<AgentEvent>): AgentEvent {
  return {
    idx: partial.idx ?? 0,
    at: new Date().toISOString(),
    kind: 'cost',
    ...partial
  };
}

function budget(overrides: Partial<BudgetSettings> = {}): BudgetSettings {
  return { ...DEFAULT_BUDGET, ...overrides };
}

describe('BudgetWatch', () => {
  it('halts a run once when per-run token cap is crossed', async () => {
    const pool = new FakePool();
    const killSpy = vi.spyOn(pool, 'kill');
    const appended: CostRecord[] = [];
    const b: BudgetSettings = budget({
      perRunTokens: 1000,
      perRunUSD: null,
      dailyTokens: null,
      dailyUSD: null
    });
    const halts: Array<{ runId: string; event: AgentEvent }> = [];
    pool.on('event', (ev: { runId: string; event: AgentEvent }) => {
      if (ev.event.kind === 'budget_halt') halts.push(ev);
    });
    const watch = new BudgetWatch({
      pool: pool as unknown as import('../src/main/agent/pool').RunnerPool,
      vaultPath: '/tmp/fake',
      budget: { get: async () => b },
      readCostToday: async () => ({
        tokens: { in: 0, out: 0, cached: 0 },
        estUSD: 0
      }),
      appendRecord: async (_v, rec) => {
        appended.push(rec);
      },
      taskIdOf: () => null,
      now: () => new Date('2025-06-15T12:00:00Z')
    });
    watch.attach();

    // Emit an incremental cost event below the cap.
    pool.emit('event', {
      runId: 'r1',
      event: cost({ input_tokens: 400, output_tokens: 100 })
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(killSpy).not.toHaveBeenCalled();

    // Now cross the cap.
    pool.emit('event', {
      runId: 'r1',
      event: cost({ input_tokens: 800, output_tokens: 300 })
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(killSpy).toHaveBeenCalledTimes(1);
    expect(killSpy).toHaveBeenCalledWith('r1', expect.stringContaining('budget_halt'));
    expect(halts.length).toBe(1);
    expect((halts[0]!.event.data as { reason: string }).reason).toBe('per_run_token_limit');
    expect(appended.length).toBe(1);
    expect(appended[0]!.reason).toBe('budget_halt');

    // A further cost event should NOT trigger a second kill.
    pool.emit('event', {
      runId: 'r1',
      event: cost({ input_tokens: 2000, output_tokens: 500 })
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(killSpy).toHaveBeenCalledTimes(1);
  });

  it('emits budget_warn only once when warn threshold is crossed repeatedly', async () => {
    const pool = new FakePool();
    const b: BudgetSettings = budget({
      perRunTokens: 1000,
      perRunUSD: null,
      dailyTokens: null,
      dailyUSD: null,
      warnAtPercent: 50
    });
    const warns: Array<{ runId: string; event: AgentEvent }> = [];
    pool.on('event', (ev: { runId: string; event: AgentEvent }) => {
      if (ev.event.kind === 'budget_warn') warns.push(ev);
    });
    const watch = new BudgetWatch({
      pool: pool as unknown as import('../src/main/agent/pool').RunnerPool,
      vaultPath: '/tmp/fake',
      budget: { get: async () => b },
      readCostToday: async () => ({
        tokens: { in: 0, out: 0, cached: 0 },
        estUSD: 0
      }),
      appendRecord: async () => {},
      taskIdOf: () => null
    });
    watch.attach();

    pool.emit('event', {
      runId: 'r2',
      event: cost({ input_tokens: 400, output_tokens: 200 }) // 60% of 1000
    });
    await new Promise((r) => setTimeout(r, 0));
    pool.emit('event', {
      runId: 'r2',
      event: cost({ input_tokens: 500, output_tokens: 300 }) // 80%
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(warns.length).toBe(1);
  });

  it('soft mode (hardStop=false) does not kill but still warns once', async () => {
    const pool = new FakePool();
    const killSpy = vi.spyOn(pool, 'kill');
    const b: BudgetSettings = budget({
      perRunTokens: 500,
      perRunUSD: null,
      dailyTokens: null,
      dailyUSD: null,
      hardStop: false
    });
    const warns: AgentEvent[] = [];
    pool.on('event', (ev: { runId: string; event: AgentEvent }) => {
      if (ev.event.kind === 'budget_warn') warns.push(ev.event);
    });
    const watch = new BudgetWatch({
      pool: pool as unknown as import('../src/main/agent/pool').RunnerPool,
      vaultPath: '/tmp/fake',
      budget: { get: async () => b },
      readCostToday: async () => ({
        tokens: { in: 0, out: 0, cached: 0 },
        estUSD: 0
      }),
      appendRecord: async () => {},
      taskIdOf: () => null
    });
    watch.attach();

    pool.emit('event', {
      runId: 'r3',
      event: cost({ input_tokens: 300, output_tokens: 300 })
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(killSpy).not.toHaveBeenCalled();
    expect(warns.length).toBe(1);
  });
});
