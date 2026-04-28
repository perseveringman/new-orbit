import { app } from 'electron';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { maskSecret, type SDKEndpointSecretState } from '@shared/runtime';

const execFileAsync = promisify(execFile);
const SERVICE = 'Orbit SDK Runtime';

export interface SDKKeyVault {
  get(keyRef: string): Promise<string | null>;
  set(keyRef: string, value: string): Promise<void>;
  delete(keyRef: string): Promise<void>;
  state(keyRef: string): Promise<SDKEndpointSecretState>;
}

export class FileSDKKeyVault implements SDKKeyVault {
  constructor(private readonly filePath: string) {}

  async get(keyRef: string): Promise<string | null> {
    const map = await this.read();
    return map[keyRef] ?? null;
  }

  async set(keyRef: string, value: string): Promise<void> {
    const trimmed = value.trim();
    if (!trimmed) throw new Error('sdk_key_empty');
    const map = await this.read();
    map[keyRef] = trimmed;
    await this.write(map);
  }

  async delete(keyRef: string): Promise<void> {
    const map = await this.read();
    delete map[keyRef];
    await this.write(map);
  }

  async state(keyRef: string): Promise<SDKEndpointSecretState> {
    const secret = await this.get(keyRef);
    return {
      configured: Boolean(secret),
      ...(secret ? { masked: maskSecret(secret) } : {})
    };
  }

  private async read(): Promise<Record<string, string>> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return {};
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string'
        )
      );
    } catch (error) {
      if (isNotFound(error)) return {};
      throw error;
    }
  }

  private async write(map: Record<string, string>): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    await fs.writeFile(this.filePath, `${JSON.stringify(map, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  }
}

export class MacOSKeychainVault implements SDKKeyVault {
  constructor(private readonly fallback: SDKKeyVault) {}

  async get(keyRef: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('/usr/bin/security', [
        'find-generic-password',
        '-s',
        SERVICE,
        '-a',
        keyRef,
        '-w'
      ]);
      return stdout.trim() || null;
    } catch (error) {
      if (isSecurityMissingPassword(error)) return this.fallback.get(keyRef);
      throw error;
    }
  }

  async set(keyRef: string, value: string): Promise<void> {
    const trimmed = value.trim();
    if (!trimmed) throw new Error('sdk_key_empty');
    try {
      await execFileAsync('/usr/bin/security', [
        'add-generic-password',
        '-U',
        '-s',
        SERVICE,
        '-a',
        keyRef,
        '-w',
        trimmed
      ]);
      await this.fallback.delete(keyRef);
    } catch (error) {
      if (!isSecurityUnavailable(error)) throw error;
      await this.fallback.set(keyRef, trimmed);
    }
  }

  async delete(keyRef: string): Promise<void> {
    try {
      await execFileAsync('/usr/bin/security', ['delete-generic-password', '-s', SERVICE, '-a', keyRef]);
    } catch (error) {
      if (!isSecurityMissingPassword(error)) throw error;
    }
    await this.fallback.delete(keyRef);
  }

  async state(keyRef: string): Promise<SDKEndpointSecretState> {
    const secret = await this.get(keyRef);
    return {
      configured: Boolean(secret),
      ...(secret ? { masked: maskSecret(secret) } : {})
    };
  }
}

export function createSDKKeyVault(options: { preferSystem?: boolean; filePath?: string } = {}): SDKKeyVault {
  const fallback = new FileSDKKeyVault(
    options.filePath ?? path.join(app.getPath('userData'), 'sdk-key-vault.json')
  );
  if (options.preferSystem ?? (process.platform === 'darwin' && process.env['NODE_ENV'] !== 'test')) {
    return new MacOSKeychainVault(fallback);
  }
  return fallback;
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT');
}

function isSecurityMissingPassword(error: unknown): boolean {
  const err = error as { code?: number; stderr?: string } | undefined;
  return err?.code === 44 || Boolean(err?.stderr?.includes('could not be found'));
}

function isSecurityUnavailable(error: unknown): boolean {
  const err = error as { code?: string | number } | undefined;
  return err?.code === 'ENOENT' || isSecurityMissingPassword(error);
}

