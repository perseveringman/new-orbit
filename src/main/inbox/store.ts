import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  InboxItemSchema,
  isInboxCaptureSubtype,
  isInboxMessageSubtype,
  summarizeInboxCounts,
  type InboxCaptureSubtype,
  type InboxItem,
  type InboxListFilter,
  type InboxListResult,
  type InboxStatus
} from './types';

export class InboxStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(readonly vaultPath: string) {}

  inboxDir(): string {
    return path.join(this.vaultPath, '.orbit', 'inbox');
  }

  messagesPendingPath(): string {
    return path.join(this.inboxDir(), 'messages', 'pending.ndjson');
  }

  messagesArchiveDir(): string {
    return path.join(this.inboxDir(), 'messages', 'archive');
  }

  capturePendingPath(subtype: InboxCaptureSubtype): string {
    return path.join(this.inboxDir(), 'capture', captureDir(subtype), 'pending.ndjson');
  }

  captureArchiveDir(subtype: InboxCaptureSubtype): string {
    if (subtype === 'feed_item') return path.join(this.inboxDir(), 'capture', 'feed', 'history');
    return path.join(this.inboxDir(), 'capture', captureDir(subtype), 'archive');
  }

  async add(item: InboxItem): Promise<InboxItem> {
    return this.withWriteLock(async () => {
      const parsed = InboxItemSchema.parse(item);
      const existing = await this.getUnlocked(parsed.id, true);
      if (existing) throw new Error(`inbox item already exists: ${parsed.id}`);
      await appendNdjson(this.pendingPathFor(parsed), parsed);
      return parsed;
    });
  }

  async get(id: string): Promise<InboxItem | null> {
    return this.getUnlocked(id, true);
  }

  async list(filter: InboxListFilter = {}): Promise<InboxListResult> {
    const active = await this.readActiveUnlocked();
    const archived = filter.includeArchived === false ? [] : await this.readArchivesUnlocked();
    const items = [...active, ...archived]
      .filter((item) => matchesFilter(item, filter))
      .sort(compareInboxItems);
    return { items, counts: summarizeInboxCounts(active) };
  }

  async resolve(id: string, next: InboxItem): Promise<InboxItem> {
    return this.finalize(id, next);
  }

  async dismiss(id: string, next: InboxItem): Promise<InboxItem> {
    return this.finalize(id, next);
  }

  async update(id: string, next: InboxItem): Promise<InboxItem> {
    return this.withWriteLock(async () => {
      const pending = await this.readActiveWithPathUnlocked();
      const match = pending.find((entry) => entry.item.id === id);
      if (!match) throw new Error(`inbox item not found: ${id}`);
      const parsed = InboxItemSchema.parse(next);
      if (parsed.id !== id) throw new Error(`inbox update changed id: ${id} -> ${parsed.id}`);
      if (parsed.category !== match.item.category || parsed.subtype !== match.item.subtype) {
        throw new Error(`inbox update changed item kind: ${id}`);
      }
      await this.replacePendingFileUnlocked(
        match.filePath,
        match.items.map((item) => (item.id === id ? parsed : item))
      );
      return parsed;
    });
  }

  async archive(id: string, at: string): Promise<InboxItem> {
    return this.withWriteLock(async () => {
      const pending = await this.readActiveWithPathUnlocked();
      const match = pending.find((entry) => entry.item.id === id);
      if (!match) {
        const archived = await this.getArchivedUnlocked(id);
        if (!archived) throw new Error(`inbox item not found: ${id}`);
        return archived;
      }
      const next = InboxItemSchema.parse({
        ...match.item,
        status: 'archived' satisfies InboxStatus,
        updated_at: at,
        resolved_at: match.item.resolved_at ?? at
      });
      await this.replacePendingFileUnlocked(match.filePath, match.items.filter((item) => item.id !== id));
      await appendNdjson(this.archivePathFor(next), next);
      return next;
    });
  }

  private async finalize(id: string, next: InboxItem): Promise<InboxItem> {
    return this.withWriteLock(async () => {
      const pending = await this.readActiveWithPathUnlocked();
      const match = pending.find((entry) => entry.item.id === id);
      if (!match) {
        const archived = await this.getArchivedUnlocked(id);
        if (archived) throw new Error(`cannot update inbox item ${id}: already ${archived.status}`);
        throw new Error(`inbox item not found: ${id}`);
      }
      const parsed = InboxItemSchema.parse(next);
      if (parsed.id !== id) throw new Error(`inbox update changed id: ${id} -> ${parsed.id}`);
      if (parsed.category !== match.item.category || parsed.subtype !== match.item.subtype) {
        throw new Error(`inbox update changed item kind: ${id}`);
      }
      const remaining = match.items.filter((item) => item.id !== id);
      await appendNdjson(this.archivePathFor(parsed), parsed);
      await this.replacePendingFileUnlocked(match.filePath, remaining);
      return parsed;
    });
  }

  private pendingPathFor(item: InboxItem): string {
    if (item.category === 'message') return this.messagesPendingPath();
    if (!isInboxCaptureSubtype(item.subtype)) throw new Error(`invalid capture subtype: ${item.subtype}`);
    return this.capturePendingPath(item.subtype);
  }

  private archivePathFor(item: InboxItem): string {
    const at = item.resolved_at ?? item.updated_at ?? item.created_at;
    if (item.category === 'message') return path.join(this.messagesArchiveDir(), `${monthKeyFromIso(at)}.ndjson`);
    if (!isInboxCaptureSubtype(item.subtype)) throw new Error(`invalid capture subtype: ${item.subtype}`);
    return path.join(this.captureArchiveDir(item.subtype), `${monthKeyFromIso(at)}.ndjson`);
  }

  private async getUnlocked(id: string, includeArchived: boolean): Promise<InboxItem | null> {
    const active = await this.readActiveUnlocked();
    const activeMatch = active.find((item) => item.id === id);
    if (activeMatch) return activeMatch;
    if (!includeArchived) return null;
    return this.getArchivedUnlocked(id);
  }

  private async getArchivedUnlocked(id: string): Promise<InboxItem | null> {
    const archived = await this.readArchivesUnlocked();
    return archived.find((item) => item.id === id) ?? null;
  }

  private async readActiveUnlocked(): Promise<InboxItem[]> {
    const entries = await this.readActiveWithPathUnlocked();
    return entries.map((entry) => entry.item);
  }

  private async readActiveWithPathUnlocked(): Promise<PendingEntry[]> {
    const specs = [
      this.messagesPendingPath(),
      this.capturePendingPath('feed_item'),
      this.capturePendingPath('library_article'),
      this.capturePendingPath('thought')
    ];
    const groups = await Promise.all(
      specs.map(async (filePath) => ({ filePath, items: await readInboxNdjson(filePath) }))
    );
    return groups.flatMap((group) => group.items.map((item) => ({ ...group, item })));
  }

  private async readArchivesUnlocked(): Promise<InboxItem[]> {
    const dirs = [
      this.messagesArchiveDir(),
      this.captureArchiveDir('library_article'),
      this.captureArchiveDir('thought')
    ];
    const chunks = await Promise.all(dirs.map((dir) => readArchiveDir(dir)));
    return chunks.flat();
  }

  private async replacePendingFileUnlocked(filePath: string, items: InboxItem[]): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const content = items.map((item) => JSON.stringify(item)).join('\n');
    await fs.writeFile(filePath, content ? `${content}\n` : '', 'utf8');
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.catch(() => undefined).then(operation);
    this.writeQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

interface PendingEntry {
  filePath: string;
  items: InboxItem[];
  item: InboxItem;
}

export function createInboxStore(vaultPath: string): InboxStore {
  return new InboxStore(vaultPath);
}

export async function readInboxNdjson(filePath: string): Promise<InboxItem[]> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  const items: InboxItem[] = [];
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) continue;
    try {
      items.push(InboxItemSchema.parse(JSON.parse(line)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`invalid inbox record in ${filePath}:${index + 1}: ${message}`);
    }
  }
  return items;
}

export function monthKeyFromIso(value: string): string {
  const key = value.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(key) || Number.isNaN(Date.parse(value))) {
    throw new Error(`invalid inbox timestamp: ${value}`);
  }
  return key;
}

function captureDir(subtype: InboxCaptureSubtype): string {
  if (subtype === 'feed_item') return 'feed';
  if (subtype === 'library_article') return 'library';
  return 'thoughts';
}

async function appendNdjson(filePath: string, item: InboxItem): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(item)}\n`, 'utf8');
}

async function readArchiveDir(dir: string): Promise<InboxItem[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  const files = entries
    .filter((entry) => /^\d{4}-\d{2}\.ndjson$/.test(entry))
    .sort()
    .map((entry) => path.join(dir, entry));
  const chunks = await Promise.all(files.map((file) => readInboxNdjson(file)));
  return chunks.flat();
}

function matchesFilter(item: InboxItem, filter: InboxListFilter): boolean {
  if (filter.category && item.category !== filter.category) return false;
  if (filter.subtype && item.subtype !== filter.subtype) return false;
  if (filter.status && item.status !== filter.status) return false;
  return true;
}

function compareInboxItems(a: InboxItem, b: InboxItem): number {
  const aPending = isActive(a) ? 0 : 1;
  const bPending = isActive(b) ? 0 : 1;
  if (aPending !== bPending) return aPending - bPending;
  return b.created_at.localeCompare(a.created_at);
}

function isActive(item: InboxItem): boolean {
  if (item.category === 'message') return item.status === 'pending';
  if (!isInboxCaptureSubtype(item.subtype)) return false;
  if (isInboxMessageSubtype(item.subtype)) return false;
  return !['processed', 'dismissed', 'archived'].includes(item.status);
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}
