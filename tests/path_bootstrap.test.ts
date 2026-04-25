import { describe, expect, it, vi } from 'vitest';
import { bootstrapMainProcessPath, buildBootstrappedPath } from '../src/main/path_bootstrap';

describe('path bootstrap', () => {
  it('prepends common GUI fallback directories without duplicating entries', () => {
    const next = buildBootstrappedPath(
      ['/usr/local/bin', '/bin', '/opt/homebrew/bin', '/Users/test/.local/bin'].join(':'),
      '/Users/test',
      ':'
    );

    expect(next).toBe(['/opt/homebrew/bin', '/usr/local/bin', '/Users/test/.local/bin', '/bin'].join(':'));
  });

  it('repairs PATH on non-Windows environments before applying fallbacks', () => {
    const env: NodeJS.ProcessEnv = { PATH: '/bin' };
    const repairPath = vi.fn(() => {
      env.PATH = ['/Users/test/.nvm/versions/node/v22/bin', '/bin'].join(':');
    });

    bootstrapMainProcessPath({
      env,
      platform: 'darwin',
      homeDir: '/Users/test',
      repairPath
    });

    expect(repairPath).toHaveBeenCalledOnce();
    expect(env.PATH).toBe(
      [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/Users/test/.local/bin',
        '/Users/test/.nvm/versions/node/v22/bin',
        '/bin'
      ].join(':')
    );
  });

  it('skips PATH repair on Windows', () => {
    const env: NodeJS.ProcessEnv = { PATH: 'C:\\Windows\\System32' };
    const repairPath = vi.fn();

    bootstrapMainProcessPath({
      env,
      platform: 'win32',
      homeDir: 'C:\\Users\\test',
      repairPath
    });

    expect(repairPath).not.toHaveBeenCalled();
    expect(env.PATH).toBe('C:\\Windows\\System32');
  });
});
