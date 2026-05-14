import { EventEmitter } from 'node:events';
import { execFile, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  RuntimeDescriptor,
  RuntimeModelOption,
  RuntimeProvider,
  RuntimeRegistrySnapshot
} from '@shared/orchestration';
import { getSettings } from '../settings';
import { readJsonFile, vaultRuntimeRegistryFile, writeJsonFile } from './storage';

function whichBinary(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn(process.platform === 'win32' ? 'where' : 'which', [command], {
      env: process.env
    });
    let out = '';
    proc.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8');
    });
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      const first = out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      resolve(first ?? null);
    });
  });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export interface RuntimeVersionProbe {
  ok: boolean;
  version: string | null;
  error: string | null;
}

export function summarizeVersionProbeError(message: string): string {
  const normalized = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
  if (!normalized) return 'Version probe failed.';
  if (/\bENOENT\b/.test(normalized)) {
    return 'Version probe failed: missing executable referenced by CLI wrapper (ENOENT).';
  }
  if (/\bEACCES\b/.test(normalized)) {
    return 'Version probe failed: CLI is not executable (EACCES).';
  }
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}

export function probeVersion(
  binaryPath: string,
  args: string[] = ['--version']
): Promise<RuntimeVersionProbe> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: RuntimeVersionProbe): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const child = execFile(binaryPath, args, { timeout: 3000 }, (error, stdout, stderr) => {
      const out = (stdout || '').trim();
      const err = (stderr || '').trim();
      if (error) {
        finish({
          ok: false,
          version: null,
          error: summarizeVersionProbeError([err, out, error.message].filter(Boolean).join('\n'))
        });
        return;
      }
      finish({ ok: true, version: out || err || null, error: null });
    });
    child.on('error', (error: Error) =>
      finish({
        ok: false,
        version: null,
        error: summarizeVersionProbeError(error.message)
      })
    );
  });
}

const MODEL_OPTIONS_BY_PROVIDER: Record<RuntimeProvider, RuntimeModelOption[]> = {
  claude: [
    { id: 'sonnet', label: 'Sonnet' },
    { id: 'opus', label: 'Opus' },
    { id: 'haiku', label: 'Haiku' }
  ],
  codex: [
    { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
    { id: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark' },
    { id: 'gpt-5.4', label: 'GPT-5.4' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    { id: 'gpt-5.5', label: 'GPT-5.5' }
  ],
  copilot: [
    { id: 'gpt-5.2', label: 'GPT-5.2' },
    { id: 'gpt-5.1', label: 'GPT-5.1' },
    { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' }
  ],
  gemini: [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' }
  ],
  opencode: [
    { id: 'anthropic/claude-sonnet-4-5', label: 'Anthropic Claude Sonnet 4.5' },
    { id: 'openai/gpt-5.3-codex', label: 'OpenAI GPT-5.3 Codex' },
    { id: 'google/gemini-2.5-pro', label: 'Google Gemini 2.5 Pro' }
  ],
  custom: []
};

async function resolveBinary(
  command: string,
  fallbackPaths: string[] = [],
  overridePath?: string
): Promise<string | null> {
  if (overridePath && (await exists(overridePath))) return overridePath;
  const fromPath = await whichBinary(command);
  if (fromPath) return fromPath;
  for (const candidate of fallbackPaths) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

async function probeRuntimes(): Promise<RuntimeDescriptor[]> {
  const settings = await getSettings();
  const home = os.homedir();
  const providers: Array<{
    provider: RuntimeDescriptor['provider'];
    command: string;
    overridePath?: string;
    fallbackPaths?: string[];
    capabilities: RuntimeDescriptor['capabilities'];
    maxConcurrentRuns: number;
  }> = [
    {
      provider: 'claude',
      command: 'claude',
      overridePath: settings.claudePath || undefined,
      fallbackPaths: [
        path.join(home, '.claude', 'local', 'claude'),
        '/usr/local/bin/claude',
        '/opt/homebrew/bin/claude'
      ],
      capabilities: {
        supportsResume: true,
        supportsHooks: true,
        supportsWorktree: true,
        supportsBackgroundRuns: true,
        supportsLongContext: true
      },
      maxConcurrentRuns: 4
    },
    {
      provider: 'codex',
      command: 'codex',
      fallbackPaths: [path.join(home, '.codex', 'local', 'codex')],
      capabilities: {
        supportsResume: true,
        supportsHooks: false,
        supportsWorktree: true,
        supportsBackgroundRuns: true
      },
      maxConcurrentRuns: 1
    },
    {
      provider: 'copilot',
      command: 'copilot',
      capabilities: {
        supportsResume: true,
        supportsHooks: false,
        supportsWorktree: true,
        supportsBackgroundRuns: true
      },
      maxConcurrentRuns: 1
    },
    {
      provider: 'gemini',
      command: 'gemini',
      capabilities: {
        supportsResume: true,
        supportsHooks: false,
        supportsWorktree: true,
        supportsBackgroundRuns: true
      },
      maxConcurrentRuns: 1
    },
    {
      provider: 'opencode',
      command: 'opencode',
      capabilities: {
        supportsResume: true,
        supportsHooks: false,
        supportsWorktree: true,
        supportsBackgroundRuns: true
      },
      maxConcurrentRuns: 1
    }
  ];

  const now = new Date().toISOString();
  const descriptors = await Promise.all(
    providers.map(async (provider) => {
      const binaryPath = await resolveBinary(
        provider.command,
        provider.fallbackPaths,
        provider.overridePath
      );
      if (!binaryPath) return null;
      const versionProbe = await probeVersion(binaryPath);
      return {
        runtimeId: `${provider.provider}:${binaryPath}`,
        mode: 'local',
        provider: provider.provider,
        name: `${provider.provider} local runtime`,
        binaryPath,
        version: versionProbe.version,
        status: versionProbe.ok ? 'online' : 'degraded',
        discoveredAt: now,
        lastSeenAt: now,
        capabilities: provider.capabilities,
        limits: {
          maxConcurrentRuns: provider.maxConcurrentRuns
        },
        defaultModel: null,
        modelOptions: MODEL_OPTIONS_BY_PROVIDER[provider.provider] ?? [],
        ...(versionProbe.error ? { metadata: { versionProbeError: versionProbe.error } } : {})
      } satisfies RuntimeDescriptor;
    })
  );
  return descriptors.filter((descriptor) => descriptor !== null) as RuntimeDescriptor[];
}

function shouldRefreshRuntimeSnapshot(snapshot: RuntimeRegistrySnapshot): boolean {
  if (snapshot.runtimes.length === 0) return true;
  return snapshot.runtimes.some((runtime) => {
    if (!runtime.modelOptions) return true;
    if (runtime.provider === 'custom') return false;
    return !runtime.capabilities.supportsBackgroundRuns;
  });
}

export class LocalRuntimeManager extends EventEmitter {
  private vaultPath: string | null = null;
  private snapshot: RuntimeRegistrySnapshot = { refreshedAt: '', runtimes: [] };

  async attach(vaultPath: string): Promise<void> {
    this.vaultPath = vaultPath;
    this.snapshot = await readJsonFile<RuntimeRegistrySnapshot>(vaultRuntimeRegistryFile(vaultPath), {
      refreshedAt: '',
      runtimes: []
    });
    if (shouldRefreshRuntimeSnapshot(this.snapshot)) {
      await this.refresh();
    }
  }

  detach(): void {
    this.vaultPath = null;
    this.snapshot = { refreshedAt: '', runtimes: [] };
  }

  list(): RuntimeDescriptor[] {
    return this.snapshot.runtimes;
  }

  get(runtimeId: string): RuntimeDescriptor | null {
    return this.snapshot.runtimes.find((runtime) => runtime.runtimeId === runtimeId) ?? null;
  }

  async refresh(): Promise<RuntimeRegistrySnapshot> {
    if (!this.vaultPath) return this.snapshot;
    const runtimes = await probeRuntimes();
    this.snapshot = {
      refreshedAt: new Date().toISOString(),
      runtimes
    };
    await writeJsonFile(vaultRuntimeRegistryFile(this.vaultPath), this.snapshot);
    this.emit('event', {
      at: this.snapshot.refreshedAt,
      type: 'runtime:refreshed',
      snapshot: this.snapshot
    });
    return this.snapshot;
  }
}

let singleton: LocalRuntimeManager | null = null;

export function getLocalRuntimeManager(): LocalRuntimeManager {
  if (!singleton) singleton = new LocalRuntimeManager();
  return singleton;
}
