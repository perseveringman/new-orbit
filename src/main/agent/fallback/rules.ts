import type { RuntimeDescriptor } from '@shared/orchestration';
import type { AutoRunnerSettings } from '@shared/schemas';

export const NON_RETRYABLE_ERROR_PATTERNS = [
  /rate limit/i,
  /quota/i,
  /auth/i,
  /invalid api key/i,
  /model unavailable/i,
  /billing/i
] as const;

export function isNonRetryableRuntimeError(message: string): boolean {
  return NON_RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function shouldFallbackAfterRun(args: {
  status: 'done' | 'error' | 'killed';
  reason?: string;
  message?: string;
}): boolean {
  const message = [args.reason, args.message].filter(Boolean).join('\n');
  if (message && isNonRetryableRuntimeError(message)) return false;
  if (args.reason === 'idle_timeout' || args.reason === 'stale') return true;
  if (args.status === 'killed') return true;
  return args.status === 'error';
}

export function selectFallbackRuntime(
  runtimes: RuntimeDescriptor[],
  settings: Pick<AutoRunnerSettings, 'runtimePriority'>,
  failedRuntimeId?: string
): RuntimeDescriptor | null {
  const online = runtimes.filter(
    (runtime) =>
      runtime.status === 'online' &&
      runtime.runtimeId !== failedRuntimeId &&
      runtime.capabilities.supportsWorktree
  );
  for (const provider of settings.runtimePriority) {
    const match = online.find((runtime) => runtime.provider === provider);
    if (match) return match;
  }
  return online[0] ?? null;
}
