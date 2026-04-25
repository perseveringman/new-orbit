import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTO_RUNNER_SETTINGS,
  parseAppSettings,
  parseAutoRunnerSettings
} from '../src/shared/schemas';

describe('auto-runner settings', () => {
  it('default to disabled for user safety', () => {
    expect(parseAutoRunnerSettings(undefined)).toEqual(DEFAULT_AUTO_RUNNER_SETTINGS);
    expect(parseAppSettings({}).autoRunner).toEqual({
      enabled: false,
      maxConcurrent: 2,
      hourlyTaskLimit: 10,
      tickIntervalMs: 5000
    });
  });

  it('accepts partial persisted settings and backfills defaults', () => {
    expect(parseAutoRunnerSettings({ enabled: true, maxConcurrent: 4 })).toEqual({
      enabled: true,
      maxConcurrent: 4,
      hourlyTaskLimit: 10,
      tickIntervalMs: 5000
    });
  });

  it('rejects invalid persisted limits as a safe default bundle', () => {
    expect(
      parseAutoRunnerSettings({
        enabled: true,
        maxConcurrent: 0,
        hourlyTaskLimit: -1,
        tickIntervalMs: 1
      })
    ).toEqual(DEFAULT_AUTO_RUNNER_SETTINGS);
  });
});
