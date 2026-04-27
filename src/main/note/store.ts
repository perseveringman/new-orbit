import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  CreateNoteInput,
  Note,
  NoteFilter,
  NoteFrontmatter,
  NotePARAKind,
  NoteType,
  SearchOptions,
  UpdateNoteInput
} from '@shared/note';
import { assertInsideVault, toPosix } from '../pathGuard';
import * as frontmatter from '../frontmatter';

const NOTE_DIR_BY_TYPE: Record<NoteType, string> = {
  thought: 'thoughts',
  longform: 'longforms',
  capture: 'captures',
  voice_log: 'voice_logs',
  daily_summary: 'daily-summaries'
};

const NOTE_ROOT = 'notes';

export class NoteStore {
  constructor(private readonly vaultPath: string) {}

  async ensureDirs(): Promise<void> {
    await Promise.all(
      Object.values(NOTE_DIR_BY_TYPE).map((dir) =>
        fs.mkdir(path.join(this.vaultPath, NOTE_ROOT, dir), { recursive: true })
      )
    );
  }

  async list(filter: NoteFilter = {}): Promise<Note[]> {
    await this.ensureDirs();
    const files = await walkMarkdown(path.join(this.vaultPath, NOTE_ROOT));
    const notes = await Promise.all(files.map((file) => this.readNoteFile(file)));
    return notes
      .filter((note): note is Note => note !== null)
      .filter((note) => matchesFilter(note, filter))
      .sort((a, b) => b.frontmatter.updated.localeCompare(a.frontmatter.updated));
  }

  async get(noteId: string): Promise<Note | null> {
    const notes = await this.list({ include_archived: true });
    return notes.find((note) => note.frontmatter.id === noteId) ?? null;
  }

  async getByPath(notePath: string): Promise<Note | null> {
    const abs = assertInsideVault(this.vaultPath, notePath);
    return this.readNoteFile(abs);
  }

  async create(input: CreateNoteInput): Promise<Note> {
    await this.ensureDirs();
    const now = new Date().toISOString();
    const id = `note-${randomUUID()}`;
    const title = input.title?.trim() || titleFromBody(input.body) || labelForType(input.type);
    const relPath = await this.nextPath(input.type, title, now);
    const body = normalizeBody(input.body, title);
    const fm: NoteFrontmatter = normalizeFrontmatter({
      id,
      type: input.type,
      title,
      created: now,
      updated: now,
      para_kind: input.para_kind ?? 'floating',
      ...(input.para_ref ? { para_ref: input.para_ref } : {}),
      tags: normalizeTags(input.tags ?? []),
      ...(input.source ? { source: input.source } : {}),
      ...(input.audio ? { audio: input.audio } : {}),
      links_out: extractWikilinks(body),
      backlinks: [],
      word_count: wordCount(body),
      ...(input.special_marker ? { special_marker: input.special_marker } : {})
    });
    await writeNoteFile(path.join(this.vaultPath, relPath), fm, body);
    return this.requireByPath(relPath);
  }

  async update(noteId: string, patch: UpdateNoteInput): Promise<Note> {
    const note = await this.get(noteId);
    if (!note) throw new Error(`note not found: ${noteId}`);
    const body = patch.body ?? note.body;
    const fm: NoteFrontmatter = normalizeFrontmatter({
      ...note.frontmatter,
      ...patch,
      id: note.frontmatter.id,
      created: note.frontmatter.created,
      updated: new Date().toISOString(),
      tags: normalizeTags(patch.tags ?? note.frontmatter.tags),
      links_out: extractWikilinks(body),
      word_count: wordCount(body)
    });
    await writeNoteFile(path.join(this.vaultPath, note.path), fm, body);
    return this.requireByPath(note.path);
  }

  async delete(noteId: string): Promise<void> {
    const note = await this.get(noteId);
    if (!note) throw new Error(`note not found: ${noteId}`);
    await fs.rm(path.join(this.vaultPath, note.path), { force: true });
  }

  async archive(noteId: string): Promise<Note> {
    const note = await this.get(noteId);
    if (!note) throw new Error(`note not found: ${noteId}`);
    const archived = await this.update(noteId, { para_kind: 'archive' });
    const targetRel = toPosix(path.join('04_Archives', 'notes', archived.path.slice(`${NOTE_ROOT}/`.length)));
    const targetAbs = path.join(this.vaultPath, targetRel);
    await fs.mkdir(path.dirname(targetAbs), { recursive: true });
    await fs.rename(path.join(this.vaultPath, archived.path), targetAbs);
    return { ...archived, path: targetRel };
  }

  async search(query: string, options: SearchOptions = {}): Promise<Note[]> {
    const q = query.trim().toLowerCase();
    if (!q) return this.list();
    const limit = options.limit ?? 50;
    return (await this.list({ include_archived: true }))
      .map((note) => ({ note, score: scoreNote(note, q) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.note);
  }

  private async nextPath(type: NoteType, title: string, nowIso: string): Promise<string> {
    const dir = path.posix.join(NOTE_ROOT, NOTE_DIR_BY_TYPE[type]);
    const base =
      type === 'daily_summary'
        ? nowIso.slice(0, 10)
        : `${nowIso.slice(0, 16).replace(/[:]/g, '-')}-${
            slugify(title).slice(0, 42) || randomUUID().slice(0, 8)
          }`;
    let candidate = path.posix.join(dir, `${base}.md`);
    let index = 1;
    while (await exists(path.join(this.vaultPath, candidate))) {
      index += 1;
      candidate = path.posix.join(dir, `${base}-${index}.md`);
    }
    return candidate;
  }

  private async requireByPath(relPath: string): Promise<Note> {
    const note = await this.readNoteFile(path.join(this.vaultPath, relPath));
    if (!note) throw new Error(`failed to read note: ${relPath}`);
    return note;
  }

  private async readNoteFile(absPath: string): Promise<Note | null> {
    if (!absPath.endsWith('.md')) return null;
    const raw = await fs.readFile(absPath, 'utf8').catch((error: unknown) => {
      if (isNotFound(error)) return null;
      throw error;
    });
    if (raw === null) return null;
    const parsed = frontmatter.read(raw);
    const rel = toPosix(path.relative(this.vaultPath, absPath));
    const dirType = typeFromPath(rel);
    const fm = normalizeFrontmatter({
      id: stringValue(parsed.data['id']) ?? `note-${rel}`,
      type: noteTypeValue(parsed.data['type']) ?? dirType ?? 'thought',
      title: stringValue(parsed.data['title']) ?? titleFromBody(parsed.body),
      created: stringValue(parsed.data['created']) ?? new Date(0).toISOString(),
      updated: stringValue(parsed.data['updated']) ?? new Date(0).toISOString(),
      para_kind: paraKindValue(parsed.data['para_kind']) ?? 'floating',
      para_ref: stringValue(parsed.data['para_ref']),
      tags: arrayOfStrings(parsed.data['tags']),
      source: typeof parsed.data['source'] === 'object' ? (parsed.data['source'] as NoteFrontmatter['source']) : undefined,
      audio: typeof parsed.data['audio'] === 'object' ? (parsed.data['audio'] as NoteFrontmatter['audio']) : undefined,
      links_out: arrayOfStrings(parsed.data['links_out']).length ? arrayOfStrings(parsed.data['links_out']) : extractWikilinks(parsed.body),
      backlinks: arrayOfStrings(parsed.data['backlinks']),
      word_count: numberValue(parsed.data['word_count']) ?? wordCount(parsed.body),
      author: stringValue(parsed.data['author']),
      visibility: parsed.data['visibility'] === 'private' ? 'private' : 'normal',
      special_marker:
        typeof parsed.data['special_marker'] === 'object'
          ? (parsed.data['special_marker'] as NoteFrontmatter['special_marker'])
          : undefined
    });
    return { frontmatter: fm, body: parsed.body, path: rel };
  }
}

export function createNoteStore(vaultPath: string): NoteStore {
  return new NoteStore(vaultPath);
}

async function writeNoteFile(filePath: string, fm: NoteFrontmatter, body: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, frontmatter.write(fm as unknown as Record<string, unknown>, body), 'utf8');
}

async function walkMarkdown(root: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const next = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await walkMarkdown(next)));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(next);
  }
  return files;
}

function matchesFilter(note: Note, filter: NoteFilter): boolean {
  if (!filter.include_archived && note.frontmatter.para_kind === 'archive') return false;
  if (filter.type && note.frontmatter.type !== filter.type) return false;
  if (filter.para_kind && note.frontmatter.para_kind !== filter.para_kind) return false;
  if (filter.para_ref && note.frontmatter.para_ref !== filter.para_ref) return false;
  if (filter.tag && !note.frontmatter.tags.includes(filter.tag)) return false;
  return true;
}

function normalizeFrontmatter(value: NoteFrontmatter): NoteFrontmatter {
  return {
    ...value,
    tags: normalizeTags(value.tags),
    links_out: [...new Set(value.links_out ?? [])],
    backlinks: [...new Set(value.backlinks ?? [])]
  };
}

function normalizeBody(body: string, title: string): string {
  const trimmed = body.trim();
  if (trimmed.startsWith('# ')) return `${trimmed}\n`;
  return `# ${title}\n\n${trimmed}\n`;
}

function titleFromBody(body: string): string {
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 80);
  return body.trim().split(/\r?\n/)[0]?.trim().slice(0, 80) || 'Untitled';
}

function labelForType(type: NoteType): string {
  if (type === 'voice_log') return 'Voice log';
  if (type === 'daily_summary') return 'Daily summary';
  return type[0].toUpperCase() + type.slice(1);
}

function typeFromPath(rel: string): NoteType | null {
  const part = rel.split('/')[1];
  const match = Object.entries(NOTE_DIR_BY_TYPE).find(([, dir]) => dir === part);
  return (match?.[0] as NoteType | undefined) ?? null;
}

function extractWikilinks(body: string): string[] {
  const links = new Set<string>();
  for (const match of body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
    const target = match[1]?.trim();
    if (target) links.add(target);
  }
  return [...links];
}

function wordCount(value: string): number {
  const latin = value.match(/[A-Za-z0-9_]+/g)?.length ?? 0;
  const cjk = value.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  return latin + cjk;
}

function scoreNote(note: Note, query: string): number {
  const title = note.frontmatter.title?.toLowerCase() ?? '';
  const body = note.body.toLowerCase();
  const tags = note.frontmatter.tags.join(' ').toLowerCase();
  return (title.includes(query) ? 5 : 0) + (tags.includes(query) ? 3 : 0) + (body.includes(query) ? 1 : 0);
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean))];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function noteTypeValue(value: unknown): NoteType | undefined {
  return typeof value === 'string' && value in NOTE_DIR_BY_TYPE ? (value as NoteType) : undefined;
}

function paraKindValue(value: unknown): NotePARAKind | undefined {
  return ['floating', 'project', 'area', 'resource', 'archive'].includes(String(value))
    ? (value as NotePARAKind)
    : undefined;
}

async function exists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(
    () => true,
    () => false
  );
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

