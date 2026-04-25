import type { AutoRunnerSettings } from '@shared/schemas';

const HOUR_MS = 60 * 60 * 1000;

export interface SchedulerState {
  runningCount: number;
  startedAt: readonly string[];
}

export interface SchedulerDecision {
  allowed: boolean;
  availableSlots: number;
  hourlyStarted: number;
  hourlyRemaining: number;
  reason?: 'disabled' | 'concurrency_limit' | 'hourly_limit';
}

export function startsInCurrentHour(
  startedAt: readonly string[],
  now: Date = new Date()
): string[] {
  const cutoff = now.getTime() - HOUR_MS;
  return startedAt.filter((iso) => {
    const ts = Date.parse(iso);
    return Number.isFinite(ts) && ts >= cutoff;
  });
}

export function schedulerDecision(
  settings: AutoRunnerSettings,
  state: SchedulerState,
  now: Date = new Date()
): SchedulerDecision {
  const recentStarts = startsInCurrentHour(state.startedAt, now);
  const availableSlots = Math.max(0, settings.maxConcurrent - state.runningCount);
  const hourlyRemaining = Math.max(0, settings.hourlyTaskLimit - recentStarts.length);
  if (!settings.enabled) {
    return {
      allowed: false,
      availableSlots,
      hourlyStarted: recentStarts.length,
      hourlyRemaining,
      reason: 'disabled'
    };
  }
  if (availableSlots === 0) {
    return {
      allowed: false,
      availableSlots,
      hourlyStarted: recentStarts.length,
      hourlyRemaining,
      reason: 'concurrency_limit'
    };
  }
  if (hourlyRemaining === 0) {
    return {
      allowed: false,
      availableSlots,
      hourlyStarted: recentStarts.length,
      hourlyRemaining,
      reason: 'hourly_limit'
    };
  }
  return {
    allowed: true,
    availableSlots,
    hourlyStarted: recentStarts.length,
    hourlyRemaining
  };
}

export function launchCapacity(decision: SchedulerDecision): number {
  if (!decision.allowed) return 0;
  return Math.min(decision.availableSlots, decision.hourlyRemaining);
}
