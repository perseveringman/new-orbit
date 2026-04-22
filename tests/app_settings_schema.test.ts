import { describe, it, expect } from 'vitest';
import {
  DEFAULT_APP_SETTINGS,
  parseAppSettings,
  AppSettingsSchema
} from '../src/shared/schemas';

describe('AppSettings schema (M8)', () => {
  it('yields defaults when given {}', () => {
    expect(parseAppSettings({})).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('yields defaults when given null/undefined', () => {
    expect(parseAppSettings(null)).toEqual(DEFAULT_APP_SETTINGS);
    expect(parseAppSettings(undefined)).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('accepts legacy shape (no new fields)', () => {
    const legacy = {
      lastVaultPath: '/tmp/v',
      theme: 'dark',
      budget: DEFAULT_APP_SETTINGS.budget
    };
    const parsed = parseAppSettings(legacy);
    expect(parsed.lastVaultPath).toBe('/tmp/v');
    expect(parsed.reopenLastVault).toBe(true);
    expect(parsed.claudePath).toBe('');
    expect(parsed.anthropicApiKey).toBe('');
    expect(parsed.vectorWakeThreshold).toBe(0.2);
  });

  it('clamps vectorWakeThreshold into [0, 1]', () => {
    expect(parseAppSettings({ vectorWakeThreshold: 5 }).vectorWakeThreshold).toBe(1);
    expect(parseAppSettings({ vectorWakeThreshold: -3 }).vectorWakeThreshold).toBe(0);
    expect(parseAppSettings({ vectorWakeThreshold: 0.42 }).vectorWakeThreshold).toBe(0.42);
  });

  it('falls back to default theme on unknown values', () => {
    expect(parseAppSettings({ theme: 'neon' }).theme).toBe('dark');
    expect(parseAppSettings({ theme: 'system' }).theme).toBe('system');
    expect(parseAppSettings({ theme: 'light' }).theme).toBe('light');
  });

  it('roundtrips through AppSettingsSchema', () => {
    const out = AppSettingsSchema.parse({
      lastVaultPath: null,
      theme: 'system',
      budget: DEFAULT_APP_SETTINGS.budget,
      reopenLastVault: false,
      claudePath: '/x/claude',
      anthropicApiKey: 'sk-test',
      vectorWakeThreshold: 0.3
    });
    expect(out.reopenLastVault).toBe(false);
    expect(out.claudePath).toBe('/x/claude');
  });
});
