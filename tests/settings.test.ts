import { describe, expect, it, beforeEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mock electron's `app.getPath('userData')` to a temp dir so settings persist there.
const userData = path.join(os.tmpdir(), `orbit-settings-${Date.now()}-${Math.random()}`);

vi.mock('electron', () => ({
  app: {
    getPath: (_k: string) => userData
  }
}));

describe('settings persistence', () => {
  beforeEach(async () => {
    await fs.rm(userData, { recursive: true, force: true });
  });

  it('getSettings returns defaults when no file exists; setTheme persists', async () => {
    const { getSettings, setTheme, setLastVaultPath } = await import('../src/main/settings');
    const { DEFAULT_APP_SETTINGS } = await import('../src/shared/schemas');
    const defaults = await getSettings();
    expect(defaults).toEqual({ ...DEFAULT_APP_SETTINGS });

    const s1 = await setTheme('light');
    expect(s1.theme).toBe('light');

    const s2 = await setLastVaultPath('/tmp/my-vault');
    expect(s2.lastVaultPath).toBe('/tmp/my-vault');
    expect(s2.theme).toBe('light');

    // Read back from disk via a fresh getSettings.
    const s3 = await getSettings();
    expect(s3).toEqual({
      ...DEFAULT_APP_SETTINGS,
      lastVaultPath: '/tmp/my-vault',
      theme: 'light'
    });
  });
});
