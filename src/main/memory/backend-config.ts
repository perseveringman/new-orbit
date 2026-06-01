import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import type {
  HyMemoryBackendConfig,
  MemoryBackendConfig,
  MemoryBackendId,
  UpdateMemoryBackendConfigInput
} from '@shared/memory';

const CONFIG_VERSION = 1;

interface MemoryBackendConfigFile extends MemoryBackendConfig {
  version: typeof CONFIG_VERSION;
}

export function defaultHyMemoryPluginPath(): string {
  return path.join(os.homedir(), 'Downloads', 'package');
}

export function defaultMemoryBackendConfig(): MemoryBackendConfig {
  return {
    active: 'orbit',
    hyMemory: {
      pluginPath: defaultHyMemoryPluginPath(),
      serverUrl: 'http://127.0.0.1:19527',
      userId: defaultUserId(),
      agentId: 'orbit',
      sessionId: 'orbit-default',
      topK: 10,
      searchThreshold: 0.3,
      autoStartServer: true,
      autoInstallRuntime: true,
      pythonPath: 'python3',
      serverPort: 19527,
      installDirectory: path.join(os.homedir(), '.orbit', 'hy-memory-venv'),
      sdkPackage: 'hy-mem-internal',
      pipIndexUrl: 'https://mirrors.tencent.com/pypi/simple/',
      embeddingProxyPort: 19528,
      logLevel: 'INFO'
    }
  };
}

export function memoryBackendConfigPath(vaultPath: string): string {
  return path.join(vaultPath, ORBIT_DIR, 'memory', 'backend.json');
}

export async function readMemoryBackendConfig(vaultPath: string): Promise<MemoryBackendConfig> {
  try {
    const parsed = JSON.parse(await fs.readFile(memoryBackendConfigPath(vaultPath), 'utf8')) as Partial<MemoryBackendConfigFile>;
    return normalizeMemoryBackendConfig(parsed);
  } catch (error) {
    if (isNotFound(error)) return defaultMemoryBackendConfig();
    throw error;
  }
}

export async function updateMemoryBackendConfig(
  vaultPath: string,
  patch: UpdateMemoryBackendConfigInput
): Promise<MemoryBackendConfig> {
  const current = await readMemoryBackendConfig(vaultPath);
  const next = normalizeMemoryBackendConfig({
    ...current,
    ...(patch.active ? { active: patch.active } : {}),
    hyMemory: {
      ...current.hyMemory,
      ...(patch.hyMemory ?? {})
    }
  });
  await writeMemoryBackendConfig(vaultPath, next);
  return next;
}

async function writeMemoryBackendConfig(vaultPath: string, config: MemoryBackendConfig): Promise<void> {
  const file = memoryBackendConfigPath(vaultPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify({ version: CONFIG_VERSION, ...config }, null, 2)}\n`, 'utf8');
}

function normalizeMemoryBackendConfig(input: Partial<MemoryBackendConfigFile>): MemoryBackendConfig {
  const defaults = defaultMemoryBackendConfig();
  const active = normalizeBackendId(input.active) ?? defaults.active;
  const hy = input.hyMemory ?? {};
  return {
    active,
    hyMemory: normalizeHyMemoryConfig({ ...defaults.hyMemory, ...hy })
  };
}

function normalizeBackendId(value: unknown): MemoryBackendId | null {
  return value === 'orbit' || value === 'hy-memory' ? value : null;
}

function normalizeHyMemoryConfig(input: Partial<HyMemoryBackendConfig>): HyMemoryBackendConfig {
  const defaults = defaultMemoryBackendConfig().hyMemory;
  const serverPort = numberOr(input.serverPort, defaults.serverPort);
  return {
    pluginPath: stringOr(input.pluginPath, defaults.pluginPath),
    serverUrl: stringOr(input.serverUrl, `http://127.0.0.1:${serverPort}`),
    userId: stringOr(input.userId, defaults.userId),
    agentId: stringOr(input.agentId, defaults.agentId),
    sessionId: stringOr(input.sessionId, defaults.sessionId),
    topK: clamp(numberOr(input.topK, defaults.topK), 1, 50),
    searchThreshold: clamp(numberOr(input.searchThreshold, defaults.searchThreshold), 0, 1),
    autoStartServer: input.autoStartServer !== false,
    autoInstallRuntime: input.autoInstallRuntime !== false,
    pythonPath: stringOr(input.pythonPath, defaults.pythonPath),
    serverPort,
    installDirectory: stringOr(input.installDirectory, defaults.installDirectory),
    sdkPackage: stringOr(input.sdkPackage, defaults.sdkPackage),
    pipIndexUrl: stringOr(input.pipIndexUrl, defaults.pipIndexUrl),
    embeddingProxyPort: clamp(numberOr(input.embeddingProxyPort, defaults.embeddingProxyPort), 1, 65535),
    logLevel: stringOr(input.logLevel, defaults.logLevel).toUpperCase()
  };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function defaultUserId(): string {
  try {
    return os.userInfo().username || 'default';
  } catch {
    return 'default';
  }
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT');
}
