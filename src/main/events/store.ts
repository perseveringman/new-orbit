import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import type { TraceableEvent, TraceableEventFilter, TraceableEventQueryResult } from '@shared/events';

export function eventStoreDir(vaultPath: string): string {
  return path.join(vaultPath, ORBIT_DIR, 'events');
}

export function eventStoreFile(vaultPath: string, dateKey: string): string {
  return path.join(eventStoreDir(vaultPath), `${dateKey}.ndjson`);
}

export function dateKeyFromEvent(event: Pick<TraceableEvent, 'at'>): string {
  return event.at.slice(0, 10);
}

export class TraceableEventStore {
  constructor(private readonly vaultPath: string) {}

  async append(event: TraceableEvent): Promise<void> {
    const filePath = eventStoreFile(this.vaultPath, dateKeyFromEvent(event));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
  }

  async query(filter: TraceableEventFilter = {}): Promise<TraceableEventQueryResult> {
    const dir = eventStoreDir(this.vaultPath);
    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      return { events: [], count: 0 };
    }
    const files = entries.filter((entry) => entry.endsWith('.ndjson')).sort().reverse();
    const events: TraceableEvent[] = [];
    for (const file of files) {
      const raw = await fs.readFile(path.join(dir, file), 'utf8');
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as TraceableEvent;
        if (matchesFilter(event, filter)) events.push(event);
      }
    }
    events.sort((a, b) => b.at.localeCompare(a.at));
    const limit = filter.limit ?? 200;
    return { events: events.slice(0, limit), count: events.length };
  }

  async gc(maxFiles = 14): Promise<number> {
    const dir = eventStoreDir(this.vaultPath);
    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      return 0;
    }
    const files = entries.filter((entry) => entry.endsWith('.ndjson')).sort().reverse();
    const stale = files.slice(maxFiles);
    await Promise.all(stale.map((file) => fs.rm(path.join(dir, file), { force: true })));
    return stale.length;
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function matchesFilter(event: TraceableEvent, filter: TraceableEventFilter): boolean {
  if (filter.source && event.source !== filter.source) return false;
  if (filter.type && event.type !== filter.type) return false;
  if (filter.traceId && event.traceId !== filter.traceId) return false;
  if (filter.runId && event.runId !== filter.runId) return false;
  if (filter.taskId && event.taskId !== filter.taskId) return false;
  if (filter.taskUid && event.taskUid !== filter.taskUid) return false;
  return true;
}
