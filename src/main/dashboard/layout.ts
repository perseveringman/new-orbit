import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import {
  DASHBOARD_WIDGET_DEFINITIONS,
  createDefaultDashboardLayout,
  type DashboardLayout,
  type DashboardLayoutPreset,
  type DashboardWidgetId,
  type DashboardWidgetInstance,
  type DashboardWidgetRegistry,
  type DashboardWidgetSize
} from '@shared/dashboard';

const DASHBOARD_LAYOUT_VERSION = 1;
const DASHBOARD_DIR = 'dashboard';
const DASHBOARD_LAYOUT_FILE = 'layout.json';
const VALID_PRESETS = new Set<DashboardLayoutPreset>(['strategic', 'today', 'custom']);

export function getDashboardWidgetRegistry(): DashboardWidgetRegistry {
  return {
    widgets: DASHBOARD_WIDGET_DEFINITIONS,
    defaultLayout: createDefaultDashboardLayout(new Date().toISOString())
  };
}

export async function getDashboardLayout(vaultPath: string): Promise<DashboardLayout> {
  const filePath = dashboardLayoutPath(vaultPath);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeDashboardLayout(JSON.parse(raw));
  } catch (error) {
    if (isNotFoundError(error)) return createDefaultDashboardLayout(new Date().toISOString());
    throw error;
  }
}

export async function saveDashboardLayout(
  vaultPath: string,
  input: DashboardLayout
): Promise<DashboardLayout> {
  const next = normalizeDashboardLayout(input, { forcePreset: input.preset === 'strategic' ? 'strategic' : 'custom' });
  await fs.mkdir(path.dirname(dashboardLayoutPath(vaultPath)), { recursive: true });
  await fs.writeFile(dashboardLayoutPath(vaultPath), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export async function resetDashboardLayout(vaultPath: string): Promise<DashboardLayout> {
  const next = createDefaultDashboardLayout(new Date().toISOString());
  await fs.mkdir(path.dirname(dashboardLayoutPath(vaultPath)), { recursive: true });
  await fs.writeFile(dashboardLayoutPath(vaultPath), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export function normalizeDashboardLayout(
  input: unknown,
  options: { forcePreset?: DashboardLayoutPreset } = {}
): DashboardLayout {
  const fallback = createDefaultDashboardLayout(new Date().toISOString());
  if (!isRecord(input)) return fallback;

  const preset = options.forcePreset ?? (VALID_PRESETS.has(input.preset as DashboardLayoutPreset) ? input.preset as DashboardLayoutPreset : 'custom');
  const rawWidgets = Array.isArray(input.widgets) ? input.widgets : [];
  const widgets = normalizeWidgetInstances(rawWidgets);

  return {
    version: DASHBOARD_LAYOUT_VERSION,
    preset,
    widgets: widgets.length > 0 ? widgets : fallback.widgets,
    updatedAt: new Date().toISOString()
  };
}

function normalizeWidgetInstances(input: unknown[]): DashboardWidgetInstance[] {
  const definitions = new Map(DASHBOARD_WIDGET_DEFINITIONS.map((definition) => [definition.id, definition]));
  const seen = new Set<DashboardWidgetId>();
  const rows: DashboardWidgetInstance[] = [];

  for (const raw of input) {
    if (!isRecord(raw) || typeof raw.widgetId !== 'string') continue;
    if (!definitions.has(raw.widgetId as DashboardWidgetId)) continue;
    const widgetId = raw.widgetId as DashboardWidgetId;
    if (seen.has(widgetId)) continue;
    seen.add(widgetId);

    const definition = definitions.get(widgetId);
    const size = normalizeWidgetSize(raw.size, definition?.sizes ?? [], definition?.defaultSize ?? 'wide');
    rows.push({
      instanceId: typeof raw.instanceId === 'string' && raw.instanceId.trim() ? raw.instanceId : `${widgetId}:default`,
      widgetId,
      size,
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
      order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : rows.length
    });
  }

  return rows.sort((a, b) => a.order - b.order).map((row, order) => ({ ...row, order }));
}

function normalizeWidgetSize(
  raw: unknown,
  allowed: DashboardWidgetSize[],
  fallback: DashboardWidgetSize
): DashboardWidgetSize {
  return typeof raw === 'string' && allowed.includes(raw as DashboardWidgetSize)
    ? raw as DashboardWidgetSize
    : fallback;
}

function dashboardLayoutPath(vaultPath: string): string {
  return path.join(vaultPath, ORBIT_DIR, DASHBOARD_DIR, DASHBOARD_LAYOUT_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
