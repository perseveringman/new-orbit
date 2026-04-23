import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR, ORBIT_CONFIG } from '@shared/constants';
import type { VaultExtConfig } from '@shared/schemas';

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function parseVaultExtConfig(raw: unknown): VaultExtConfig {
  if (!raw || typeof raw !== 'object') return { external_notes_paths: [] };
  const r = raw as Record<string, unknown>;
  const paths = Array.isArray(r['external_notes_paths'])
    ? (r['external_notes_paths'] as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];
  return { external_notes_paths: paths };
}

async function readVaultRawConfig(vaultPath: string): Promise<Record<string, unknown>> {
  const cfgPath = path.join(vaultPath, ORBIT_DIR, ORBIT_CONFIG);
  try {
    const raw = await fs.readFile(cfgPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function writeVaultRawConfig(
  vaultPath: string,
  config: Record<string, unknown>
): Promise<void> {
  const cfgPath = path.join(vaultPath, ORBIT_DIR, ORBIT_CONFIG);
  if (!(await fileExists(path.dirname(cfgPath)))) {
    await fs.mkdir(path.dirname(cfgPath), { recursive: true });
  }
  await fs.writeFile(cfgPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

export async function getVaultExtConfig(vaultPath: string): Promise<VaultExtConfig> {
  const raw = await readVaultRawConfig(vaultPath);
  return parseVaultExtConfig(raw);
}

export async function updateVaultExtConfig(
  vaultPath: string,
  patch: Partial<VaultExtConfig>
): Promise<VaultExtConfig> {
  const raw = await readVaultRawConfig(vaultPath);
  const current = parseVaultExtConfig(raw);
  const updated: VaultExtConfig = { ...current, ...patch };
  await writeVaultRawConfig(vaultPath, { ...raw, ...updated });
  return updated;
}
