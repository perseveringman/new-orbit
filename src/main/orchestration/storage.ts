import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { ORBIT_DIR, PROJECT_ORBIT_AGENT_DIR, PROJECT_ORBIT_DIR } from '@shared/constants';

export const ORBIT_ORCHESTRATION_DIR = 'orchestration';
export const ORBIT_PLANS_DIR = 'plans';

export function vaultOrchestrationDir(vaultPath: string): string {
  return path.join(vaultPath, ORBIT_DIR, ORBIT_ORCHESTRATION_DIR);
}

export function vaultRuntimeRegistryFile(vaultPath: string): string {
  return path.join(vaultOrchestrationDir(vaultPath), 'runtime-registry.json');
}

export function vaultLeasesFile(vaultPath: string): string {
  return path.join(vaultOrchestrationDir(vaultPath), 'leases.json');
}

export function vaultReportsFile(vaultPath: string): string {
  return path.join(vaultOrchestrationDir(vaultPath), 'reports.json');
}

export function vaultPlansDir(vaultPath: string, projectUid: string): string {
  return path.join(vaultPath, ORBIT_DIR, ORBIT_PLANS_DIR, projectUid);
}

export function projectRoleBindingsFile(projectPath: string): string {
  return path.join(projectPath, PROJECT_ORBIT_DIR, PROJECT_ORBIT_AGENT_DIR, 'role-bindings.json');
}

export function globalRoleTemplatesFile(): string {
  return path.join(app.getPath('userData'), 'orchestration', 'role-templates.json');
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export async function listJsonFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(dirPath, entry.name))
      .sort();
  } catch {
    return [];
  }
}
