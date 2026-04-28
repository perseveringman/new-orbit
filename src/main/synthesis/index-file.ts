import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import type { SynthesisIndexFile } from '@shared/synthesis';

export function synthesisRoot(vaultPath: string): string {
  return path.join(vaultPath, ORBIT_DIR, 'synthesis');
}

export function synthesisArtifactsDir(vaultPath: string): string {
  return path.join(synthesisRoot(vaultPath), 'artifacts');
}

export function synthesisDlqDir(vaultPath: string): string {
  return path.join(synthesisRoot(vaultPath), 'dlq');
}

export function synthesisIndexPath(vaultPath: string): string {
  return path.join(synthesisRoot(vaultPath), 'index.json');
}

export async function readSynthesisIndex(vaultPath: string): Promise<SynthesisIndexFile> {
  try {
    const parsed = JSON.parse(await fs.readFile(synthesisIndexPath(vaultPath), 'utf8')) as Partial<SynthesisIndexFile>;
    return { version: 1, latest: isRecord(parsed.latest) ? parsed.latest : {} };
  } catch (error) {
    if (isNotFound(error)) return { version: 1, latest: {} };
    throw error;
  }
}

export async function writeSynthesisIndex(vaultPath: string, index: SynthesisIndexFile): Promise<void> {
  const target = synthesisIndexPath(vaultPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify({ version: 1, latest: index.latest }, null, 2)}\n`, 'utf8');
}

export function scopePointerKey(scopeKey: string): string {
  return scopeKey.trim();
}

export function artifactPath(vaultPath: string, artifactId: string): string {
  return path.join(synthesisArtifactsDir(vaultPath), `${artifactId}.json`);
}

export function dlqPath(vaultPath: string, entryId: string): string {
  return path.join(synthesisDlqDir(vaultPath), `${entryId}.json`);
}

function isRecord(value: unknown): value is Record<string, string> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT');
}

