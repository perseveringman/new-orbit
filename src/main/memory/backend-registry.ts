import type {
  CreateMemoryInput,
  MemoryBackendDescriptor,
  MemoryBackendId,
  MemoryBackendStatus,
  RecallOptions,
  RecallResult,
  UpdateMemoryBackendConfigInput
} from '@shared/memory';
import { HyMemoryBackend } from './hy-memory-backend';
import { OrbitMemoryBackend } from './orbit-backend';
import type { MemoryBackend } from './backend-types';
import { readMemoryBackendConfig, updateMemoryBackendConfig } from './backend-config';

let current: { vaultPath: string; active: MemoryBackendId; backend: MemoryBackend } | null = null;

export async function getActiveMemoryBackend(vaultPath: string): Promise<MemoryBackend> {
  const config = await readMemoryBackendConfig(vaultPath);
  if (current?.vaultPath === vaultPath && current.active === config.active) return current.backend;
  await current?.backend.dispose?.();
  const backend = config.active === 'hy-memory'
    ? new HyMemoryBackend(vaultPath, config.hyMemory)
    : new OrbitMemoryBackend(vaultPath);
  current = { vaultPath, active: config.active, backend };
  return backend;
}

export async function getMemoryBackendStatus(vaultPath: string): Promise<MemoryBackendStatus> {
  const config = await readMemoryBackendConfig(vaultPath);
  const backends = await Promise.all([
    withActive(new OrbitMemoryBackend(vaultPath).descriptor(), config.active),
    withActive(new HyMemoryBackend(vaultPath, config.hyMemory).descriptor(), config.active)
  ]);
  return { active: config.active, config, backends };
}

export async function updateActiveMemoryBackendConfig(
  vaultPath: string,
  patch: UpdateMemoryBackendConfigInput
): Promise<MemoryBackendStatus> {
  const previous = await readMemoryBackendConfig(vaultPath);
  const next = await updateMemoryBackendConfig(vaultPath, patch);
  if (previous.active !== next.active || patch.hyMemory) {
    await current?.backend.dispose?.();
    current = null;
  }
  return getMemoryBackendStatus(vaultPath);
}

export async function testMemoryBackend(vaultPath: string, id?: MemoryBackendId): Promise<MemoryBackendDescriptor> {
  const config = await readMemoryBackendConfig(vaultPath);
  const backend = (id ?? config.active) === 'hy-memory'
    ? new HyMemoryBackend(vaultPath, config.hyMemory)
    : new OrbitMemoryBackend(vaultPath);
  const descriptor = backend instanceof HyMemoryBackend ? await backend.test() : await backend.descriptor();
  return { ...descriptor, active: descriptor.id === config.active };
}

export async function recallActiveMemoryContext(
  vaultPath: string,
  query: string,
  options?: RecallOptions
): Promise<RecallResult> {
  return (await getActiveMemoryBackend(vaultPath)).recall(query, options);
}

export async function createActiveMemory(vaultPath: string, input: CreateMemoryInput) {
  return (await getActiveMemoryBackend(vaultPath)).create(input);
}

export async function shutdownMemoryBackends(): Promise<void> {
  await current?.backend.dispose?.();
  current = null;
}

async function withActive(
  descriptorPromise: Promise<MemoryBackendDescriptor>,
  active: MemoryBackendId
): Promise<MemoryBackendDescriptor> {
  const descriptor = await descriptorPromise;
  return { ...descriptor, active: descriptor.id === active };
}
