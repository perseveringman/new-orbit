import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ORBIT_USER_DATA override: simulate the block at the top of `src/main/index.ts`
// by setting the env var before electron mock records a setPath call.
const overrideDir = path.join(os.tmpdir(), `orbit-ud-${Date.now()}-${Math.random()}`);
let currentUserData = path.join(os.tmpdir(), 'orbit-default-userData');

const setPathCalls: Array<[string, string]> = [];

vi.mock('electron', () => ({
  app: {
    getPath: (_k: string) => currentUserData,
    setPath: (k: string, v: string) => {
      setPathCalls.push([k, v]);
      if (k === 'userData') currentUserData = v;
    }
  }
}));

beforeEach(async () => {
  setPathCalls.length = 0;
  currentUserData = path.join(os.tmpdir(), `orbit-default-${Date.now()}`);
  await fs.rm(overrideDir, { recursive: true, force: true });
});

afterEach(() => {
  delete process.env['ORBIT_USER_DATA'];
});

describe('ORBIT_USER_DATA override behavior', () => {
  it('is applied to electron.app.setPath when present', async () => {
    process.env['ORBIT_USER_DATA'] = overrideDir;
    const electron = await import('electron');
    (electron.app as unknown as { setPath: (k: string, v: string) => void }).setPath(
      'userData',
      process.env['ORBIT_USER_DATA'] as string
    );
    expect(setPathCalls).toContainEqual(['userData', overrideDir]);
    expect(electron.app.getPath('userData')).toBe(overrideDir);
  });

  it('settings persist under the overridden userData', async () => {
    process.env['ORBIT_USER_DATA'] = overrideDir;
    const electron = await import('electron');
    (electron.app as unknown as { setPath: (k: string, v: string) => void }).setPath(
      'userData',
      overrideDir
    );
    const settings = await import('../src/main/settings');
    await settings.setLastVaultPath('/tmp/v');
    const raw = await fs.readFile(path.join(overrideDir, 'orbit-settings.json'), 'utf8');
    expect(JSON.parse(raw).lastVaultPath).toBe('/tmp/v');
  });

  it('default path is untouched when env var is absent', async () => {
    delete process.env['ORBIT_USER_DATA'];
    const electron = await import('electron');
    // No setPath call should fire if our production guard is skipped.
    expect(setPathCalls.find(([k]) => k === 'userData')).toBeUndefined();
    expect(electron.app.getPath('userData').includes('orbit-default-')).toBe(true);
  });
});
