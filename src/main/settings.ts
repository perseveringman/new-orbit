import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppSettings, Theme } from '@shared/types';
import {
  type AutoRunnerSettings,
  type BudgetSettings,
  DEFAULT_BUDGET,
  parseAutoRunnerSettings,
  parseAppSettings,
  parseBudgetSettings
} from '@shared/schemas';

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'orbit-settings.json');
}

async function readRaw(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(settingsFile(), 'utf8');
    const parsed = JSON.parse(raw);
    return parseAppSettings(parsed) as AppSettings;
  } catch {
    return parseAppSettings({}) as AppSettings;
  }
}

async function writeRaw(s: AppSettings): Promise<void> {
  await fs.mkdir(path.dirname(settingsFile()), { recursive: true });
  await fs.writeFile(settingsFile(), JSON.stringify(s, null, 2), 'utf8');
}

export async function getSettings(): Promise<AppSettings> {
  return readRaw();
}

export async function setLastVaultPath(p: string | null): Promise<AppSettings> {
  const s = await readRaw();
  s.lastVaultPath = p;
  await writeRaw(s);
  return s;
}

export async function setTheme(theme: Theme): Promise<AppSettings> {
  const s = await readRaw();
  s.theme = theme;
  await writeRaw(s);
  return s;
}

export async function getBudget(): Promise<BudgetSettings> {
  const s = await readRaw();
  return s.budget;
}

export async function updateBudget(
  partial: Partial<BudgetSettings>
): Promise<BudgetSettings> {
  const s = await readRaw();
  s.budget = parseBudgetSettings({ ...s.budget, ...partial });
  await writeRaw(s);
  return s.budget;
}

export async function getAutoRunnerSettings(): Promise<AutoRunnerSettings> {
  const s = await readRaw();
  return parseAutoRunnerSettings(s.autoRunner);
}

export async function updateAutoRunnerSettings(
  partial: Partial<AutoRunnerSettings>
): Promise<AutoRunnerSettings> {
  const s = await readRaw();
  s.autoRunner = parseAutoRunnerSettings({ ...s.autoRunner, ...partial });
  await writeRaw(s);
  return s.autoRunner;
}

/**
 * Update an arbitrary subset of top-level AppSettings. Re-parses so
 * invalid values fall back to defaults rather than corrupting state.
 */
export async function updateSettings(
  partial: Partial<AppSettings>
): Promise<AppSettings> {
  const s = await readRaw();
  const next = parseAppSettings({ ...s, ...partial }) as AppSettings;
  await writeRaw(next);
  return next;
}

// Re-export for tests/back-compat.
export { DEFAULT_BUDGET };
