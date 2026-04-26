import { describe, expect, it } from 'vitest';
import {
  launchCapacity,
  schedulerDecision,
  startsInCurrentHour
} from '../src/main/auto_runner/scheduler';
import { DEFAULT_AUTO_RUNNER_SETTINGS, type AutoRunnerSettings } from '../src/shared/schemas';

const settings: AutoRunnerSettings = {
  ...DEFAULT_AUTO_RUNNER_SETTINGS,
  enabled: true,
  maxConcurrent: 2,
  hourlyTaskLimit: 3,
  tickIntervalMs: 5000
};

describe('auto-runner scheduler', () => {
  it('keeps only starts from the last hour', () => {
    const now = new Date('2026-04-26T02:00:00.000Z');
    expect(
      startsInCurrentHour(
        ['2026-04-26T00:59:59.000Z', '2026-04-26T01:00:00.000Z', '2026-04-26T01:30:00.000Z'],
        now
      )
    ).toEqual(['2026-04-26T01:00:00.000Z', '2026-04-26T01:30:00.000Z']);
  });

  it('limits by enabled state, concurrency, and hourly quota', () => {
    expect(
      schedulerDecision({ ...settings, enabled: false }, { runningCount: 0, startedAt: [] }).reason
    ).toBe('disabled');
    expect(schedulerDecision(settings, { runningCount: 2, startedAt: [] }).reason).toBe(
      'concurrency_limit'
    );
    expect(
      schedulerDecision(
        settings,
        {
          runningCount: 0,
          startedAt: [
            new Date().toISOString(),
            new Date().toISOString(),
            new Date().toISOString()
          ]
        },
        new Date()
      ).reason
    ).toBe('hourly_limit');
  });

  it('computes launch capacity as the stricter remaining limit', () => {
    const decision = schedulerDecision(
      settings,
      { runningCount: 0, startedAt: ['2026-04-26T01:30:00.000Z', '2026-04-26T01:40:00.000Z'] },
      new Date('2026-04-26T02:00:00.000Z')
    );
    expect(decision).toMatchObject({ allowed: true, availableSlots: 2, hourlyRemaining: 1 });
    expect(launchCapacity(decision)).toBe(1);
  });
});
