import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ActivityAction, ActivityEvent, ActivityQueryFilter } from './types';
import { ActivityStore, createActivityStore } from './store';

export async function queryActivities(
  vaultPath: string,
  filter: ActivityQueryFilter = {}
): Promise<ActivityEvent[]> {
  return queryActivityStore(createActivityStore(vaultPath), filter);
}

export async function queryActivityStore(
  store: ActivityStore,
  filter: ActivityQueryFilter = {}
): Promise<ActivityEvent[]> {
  if (filter.limit !== undefined && filter.limit <= 0) return [];
  await store.drain();
  const bounds = buildBounds(filter);
  const files = await listActivityFiles(store.activityDir(), bounds.fromDateKey, bounds.toDateKey);
  const actionSet = buildActionSet(filter);
  const results: ActivityEvent[] = [];

  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8').catch(() => '');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      const event = parseEventLine(line);
      if (!event) continue;
      if (!matches(event, filter, actionSet, bounds)) continue;
      results.push(event);
      if (filter.limit !== undefined && results.length >= filter.limit) return results;
    }
  }

  return results;
}

interface QueryBounds {
  fromTime?: number;
  toTime?: number;
  fromDateKey?: string;
  toDateKey?: string;
}

function buildBounds(filter: ActivityQueryFilter): QueryBounds {
  const bounds: QueryBounds = {};
  if (filter.from !== undefined) {
    bounds.fromTime = parseBoundary(filter.from, 'from');
    bounds.fromDateKey = dateKeyForBoundary(filter.from);
  }
  if (filter.to !== undefined) {
    bounds.toTime = parseBoundary(filter.to, 'to');
    bounds.toDateKey = dateKeyForBoundary(filter.to);
  }
  return bounds;
}

async function listActivityFiles(
  activityDir: string,
  fromDateKey?: string,
  toDateKey?: string
): Promise<string[]> {
  const entries = await fs.readdir(activityDir).catch(() => []);
  return entries
    .filter((entry) => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(entry))
    .map((entry) => ({ entry, dateKey: entry.slice(0, 10) }))
    .filter(({ dateKey }) => fromDateKey === undefined || dateKey >= fromDateKey)
    .filter(({ dateKey }) => toDateKey === undefined || dateKey <= toDateKey)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .map(({ entry }) => path.join(activityDir, entry));
}

function buildActionSet(filter: ActivityQueryFilter): Set<ActivityAction> | null {
  const actions: ActivityAction[] = [];
  if (Array.isArray(filter.action)) actions.push(...filter.action);
  else if (filter.action !== undefined) actions.push(filter.action);
  if (filter.actions !== undefined) actions.push(...filter.actions);
  return actions.length > 0 ? new Set(actions) : null;
}

function matches(
  event: ActivityEvent,
  filter: ActivityQueryFilter,
  actionSet: Set<ActivityAction> | null,
  bounds: QueryBounds
): boolean {
  const eventTime = Date.parse(event.at);
  if (Number.isNaN(eventTime)) return false;
  if (bounds.fromTime !== undefined && eventTime < bounds.fromTime) return false;
  if (bounds.toTime !== undefined && eventTime > bounds.toTime) return false;
  if (filter.actor !== undefined && event.actor !== filter.actor) return false;
  if (actionSet && !actionSet.has(event.action)) return false;
  if (filter.project_uid !== undefined && event.context.project_uid !== filter.project_uid) {
    return false;
  }
  if (filter.task_uid !== undefined && event.context.task_uid !== filter.task_uid) return false;
  return true;
}

function parseEventLine(line: string): ActivityEvent | null {
  try {
    const parsed = JSON.parse(line) as ActivityEvent;
    if (typeof parsed.id !== 'string') return null;
    if (typeof parsed.at !== 'string') return null;
    if (typeof parsed.actor !== 'string') return null;
    if (typeof parsed.action !== 'string') return null;
    if (typeof parsed.summary !== 'string') return null;
    if (typeof parsed.context !== 'object' || parsed.context === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseBoundary(value: string, kind: 'from' | 'to'): number {
  const source = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${kind === 'from' ? '00:00:00.000' : '23:59:59.999'}Z`
    : value;
  const time = Date.parse(source);
  if (Number.isNaN(time)) throw new Error(`invalid activity ${kind} date: ${value}`);
  return time;
}

function dateKeyForBoundary(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid activity date: ${value}`);
  return date.toISOString().slice(0, 10);
}
