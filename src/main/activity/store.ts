import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_SCHEMA_VERSION,
  type ActivityEvent,
  type ActivitySchemaFile
} from './types';

export interface ActivityStoreOptions {
  writeSchema?: boolean;
}

export class ActivityStore {
  private readonly writeQueue = new Map<string, Promise<void>>();
  private readonly schemaEnsured = new Set<string>();
  private readonly writeSchema: boolean;

  constructor(readonly vaultPath: string, options: ActivityStoreOptions = {}) {
    this.writeSchema = options.writeSchema ?? true;
  }

  activityDir(): string {
    return path.join(this.vaultPath, '.orbit', 'activity');
  }

  filePathForDate(dateKey: string): string {
    return path.join(this.activityDir(), `${dateKey}.ndjson`);
  }

  filePathForEvent(event: ActivityEvent): string {
    return this.filePathForDate(dateKeyFromIso(event.at));
  }

  async append(event: ActivityEvent): Promise<void> {
    const filePath = this.filePathForEvent(event);
    const line = `${JSON.stringify(event)}\n`;
    const prev = this.writeQueue.get(filePath) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      if (this.writeSchema) await this.ensureSchema(path.dirname(filePath));
      await fs.appendFile(filePath, line, 'utf8');
    });
    const tail = next.catch(() => undefined);
    this.writeQueue.set(filePath, tail);
    void tail.finally(() => {
      if (this.writeQueue.get(filePath) === tail) this.writeQueue.delete(filePath);
    });
    return next;
  }

  async drain(): Promise<void> {
    await Promise.all([...this.writeQueue.values()]);
  }

  private async ensureSchema(activityDir: string): Promise<void> {
    if (this.schemaEnsured.has(activityDir)) return;
    const schema: ActivitySchemaFile = {
      version: ACTIVITY_SCHEMA_VERSION,
      storage: 'daily-ndjson',
      event_schema: 'ActivityEvent',
      actions: ACTIVITY_ACTIONS
    };
    await fs.writeFile(
      path.join(activityDir, 'schema.json'),
      `${JSON.stringify(schema, null, 2)}\n`,
      'utf8'
    );
    this.schemaEnsured.add(activityDir);
  }
}

export function createActivityStore(
  vaultPath: string,
  options?: ActivityStoreOptions
): ActivityStore {
  return new ActivityStore(vaultPath, options);
}

export function dateKeyFromIso(value: string): string {
  const key = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || Number.isNaN(Date.parse(value))) {
    throw new Error(`invalid activity timestamp: ${value}`);
  }
  return key;
}
