import { describe, expect, it } from 'vitest';
import type { RuntimeDescriptor } from '../src/shared/orchestration';
import {
  isNonRetryableRuntimeError,
  selectFallbackRuntime,
  shouldFallbackAfterRun
} from '../src/main/agent/fallback/rules';
import {
  isTaskBudgetExceeded,
  isTaskBudgetWarning,
  resolveTaskBudgetLimit
} from '../src/main/agent/fallback/budget_guard';

function runtime(provider: RuntimeDescriptor['provider'], runtimeId = provider): RuntimeDescriptor {
  return {
    runtimeId,
    mode: 'local',
    provider,
    name: provider,
    binaryPath: `/bin/${provider}`,
    version: null,
    status: 'online',
    discoveredAt: '2026-04-27T00:00:00.000Z',
    lastSeenAt: '2026-04-27T00:00:00.000Z',
    capabilities: {
      supportsResume: provider !== 'copilot',
      supportsHooks: provider === 'claude',
      supportsWorktree: true,
      supportsBackgroundRuns: provider === 'claude'
    },
    limits: { maxConcurrentRuns: 1 }
  };
}

describe('runtime fallback rules', () => {
  it('blocks fallback for non-retryable runtime errors', () => {
    expect(isNonRetryableRuntimeError('invalid API key')).toBe(true);
    expect(
      shouldFallbackAfterRun({
        status: 'error',
        message: 'billing error'
      })
    ).toBe(false);
  });

  it('selects the next runtime by configured priority', () => {
    expect(
      selectFallbackRuntime(
        [runtime('claude'), runtime('codex'), runtime('copilot')],
        {
          runtimePriority: ['claude', 'codex', 'copilot']
        },
        'claude'
      )?.provider
    ).toBe('codex');
  });

  it('resolves per-task budget limits and warning thresholds', () => {
    expect(resolveTaskBudgetLimit({ budget_limit: 7 }, { defaultBudgetPerTask: 20 })).toBe(7);
    expect(resolveTaskBudgetLimit({}, { defaultBudgetPerTask: 20 })).toBe(20);
    expect(isTaskBudgetWarning(16, 20)).toBe(true);
    expect(isTaskBudgetExceeded(20, 20)).toBe(true);
  });
});
