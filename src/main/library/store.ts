import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  AcceptLibraryDistillationInput,
  AddLibraryAnnotationInput,
  LibraryAcceptDistillationResult,
  LibraryAnnotation,
  LibraryDistillationResult,
  LibraryFilter,
  LibraryItem,
  LibraryItemFrontmatter,
  LibraryKind,
  LibraryReadingUpdateInputV2,
  LibraryStatus,
  SaveLibraryItemInput,
  UpdateLibraryItemInput
} from '@shared/library';
import type { LibraryDistillPayload, SynthesisArtifact } from '@shared/synthesis';
import { createNoteStore } from '../note/store';
import { assertInsideVault, toPosix } from '../pathGuard';
import * as frontmatter from '../frontmatter';
import { createSynthesisStore } from '../synthesis/store';

const LIBRARY_ROOT = 'library';

const DIR_BY_KIND: Record<LibraryKind, string> = {
  article: 'articles',
  pdf: 'pdfs',
  video: 'videos',
  bookmark: 'bookmarks'
};

export class LibraryStore {
  constructor(private readonly vaultPath: string) {}

  async ensureDirs(): Promise<void> {
    await Promise.all(
      Object.values(DIR_BY_KIND).map((dir) =>
        fs.mkdir(path.join(this.vaultPath, LIBRARY_ROOT, dir), { recursive: true })
      )
    );
  }

  async save(input: SaveLibraryItemInput): Promise<LibraryItem> {
    await this.ensureDirs();
    const now = new Date().toISOString();
    const kind = input.kind ?? inferKind(input.url, input.local_path);
    const title = input.title?.trim() || titleFromUrl(input.url) || labelForKind(kind);
    const body = normalizeBody(input.body ?? defaultBody(title, input.url), title);
    const fm: LibraryItemFrontmatter = normalizeFrontmatter({
      id: `lib-${randomUUID()}`,
      kind,
      title,
      ...(input.url ? { url: input.url } : {}),
      ...(input.local_path ? { local_path: input.local_path } : {}),
      status: 'saved',
      created: now,
      updated: now,
      tags: normalizeTags(input.tags ?? []),
      areas: input.areas ?? [],
      resource_refs: normalizeRefs(input.resource_refs ?? []),
      source: input.source ?? (input.url ? { kind: 'url', url: input.url } : { kind: 'manual' }),
      reading_progress: 0,
      total_reading_seconds: 0,
      annotations: [],
      ...(input.source_snapshot_ref ? { source_snapshot_ref: input.source_snapshot_ref } : {}),
      ...(input.promoted_enrichment_artifact_ids
        ? { promoted_enrichment_artifact_ids: input.promoted_enrichment_artifact_ids }
        : {}),
      ...(input.feed_collection_artifact_ids ? { feed_collection_artifact_ids: input.feed_collection_artifact_ids } : {}),
      ...(input.preferred_display_artifact_id ? { preferred_display_artifact_id: input.preferred_display_artifact_id } : {})
    });
    const relPath = await this.nextPath(kind, title);
    await writeLibraryFile(path.join(this.vaultPath, relPath), fm, body);
    return this.requireByPath(relPath);
  }

  async list(filter: LibraryFilter = {}): Promise<LibraryItem[]> {
    await this.ensureDirs();
    const roots = [path.join(this.vaultPath, LIBRARY_ROOT)];
    if (filter.include_archived) roots.push(path.join(this.vaultPath, '04_Archives', 'library'));
    const files = (await Promise.all(roots.map((root) => walkMarkdown(root)))).flat();
    const items = await Promise.all(files.map((file) => this.readLibraryFile(file)));
    return items
      .filter((item): item is LibraryItem => item !== null)
      .filter((item) => matchesFilter(item, filter))
      .sort((a, b) => b.frontmatter.updated.localeCompare(a.frontmatter.updated));
  }

  async get(id: string): Promise<LibraryItem | null> {
    const items = await this.list({ include_archived: true });
    return items.find((item) => item.frontmatter.id === id) ?? null;
  }

  async update(id: string, patch: UpdateLibraryItemInput): Promise<LibraryItem> {
    const item = await this.get(id);
    if (!item) throw new Error(`library_item_not_found:${id}`);
    const body = patch.body ?? item.body;
    const fm = normalizeFrontmatter({
      ...item.frontmatter,
      ...patch,
      id: item.frontmatter.id,
      created: item.frontmatter.created,
      updated: new Date().toISOString(),
      tags: normalizeTags(patch.tags ?? item.frontmatter.tags),
      resource_refs: normalizeRefs(patch.resource_refs ?? item.frontmatter.resource_refs ?? []),
      annotations: patch.annotations ?? item.frontmatter.annotations ?? []
    });
    await writeLibraryFile(path.join(this.vaultPath, item.path), fm, body);
    return this.requireByPath(item.path);
  }

  async annotate(id: string, input: AddLibraryAnnotationInput): Promise<LibraryItem> {
    const item = await this.get(id);
    if (!item) throw new Error(`library_item_not_found:${id}`);
    const annotation: LibraryAnnotation = {
      id: `ann-${randomUUID()}`,
      at: new Date().toISOString(),
      type: input.type ?? (input.comment ? 'comment' : 'highlight'),
      text: input.text,
      ...(input.comment ? { comment: input.comment } : {}),
      ...(input.color ? { color: input.color } : {})
    };
    return this.update(id, {
      annotations: [...(item.frontmatter.annotations ?? []), annotation]
    });
  }

  async markRead(id: string, input: LibraryReadingUpdateInputV2 = {}): Promise<LibraryItem> {
    const item = await this.get(id);
    if (!item) throw new Error(`library_item_not_found:${id}`);
    const progress = input.markRead ? 1 : clamp(input.progress ?? item.frontmatter.reading_progress ?? 0, 0, 1);
    const status: LibraryStatus = input.markRead || progress >= 0.99 ? 'read' : progress > 0 ? 'reading' : item.frontmatter.status;
    return this.update(id, {
      status,
      reading_progress: progress,
      total_reading_seconds:
        (item.frontmatter.total_reading_seconds ?? 0) + Math.max(0, input.readingSecondsDelta ?? 0)
    });
  }

  async archive(id: string): Promise<LibraryItem> {
    const archived = await this.update(id, { status: 'archived' });
    const targetRel = toPosix(path.join('04_Archives', 'library', archived.path.slice(`${LIBRARY_ROOT}/`.length)));
    const targetAbs = path.join(this.vaultPath, targetRel);
    await fs.mkdir(path.dirname(targetAbs), { recursive: true });
    await fs.rename(path.join(this.vaultPath, archived.path), targetAbs);
    return { ...archived, path: targetRel };
  }

  async distill(id: string): Promise<LibraryDistillationResult> {
    const item = await this.get(id);
    if (!item) throw new Error(`library_item_not_found:${id}`);
    const payload = distillPayload(item);
    const artifact = await createSynthesisStore(this.vaultPath).writeFresh({
      kind: 'distill.library',
      scope_key: `library:${id}`,
      sources: [
        {
          kind: 'library',
          ref: id,
          title: item.frontmatter.title,
          excerpt: item.body.slice(0, 500)
        }
      ],
      provenance: {
        runtime: 'local:heuristic',
        model: 'library-distill-fallback',
        prompt_version: 'distill.library.v1',
        generated_at: new Date().toISOString(),
        cost_usd: 0,
        tokens: { input: 0, output: 0 }
      },
      payload
    });
    const updated = await this.update(id, {
      distillation_artifact_ids: [...(item.frontmatter.distillation_artifact_ids ?? []), artifact.id]
    });
    return { artifact, item: updated };
  }

  async acceptDistillation(input: AcceptLibraryDistillationInput): Promise<LibraryAcceptDistillationResult> {
    const artifact = await createSynthesisStore(this.vaultPath).get(input.artifact_id);
    if (!artifact || artifact.kind !== 'distill.library') {
      throw new Error(`library_distillation_artifact_not_found:${input.artifact_id}`);
    }
    const itemId = artifact.sources.find((source) => source.kind === 'library')?.ref;
    if (!itemId) throw new Error('library_distillation_missing_source');
    const item = await this.get(itemId);
    if (!item) throw new Error(`library_item_not_found:${itemId}`);
    const payload = artifact.payload as LibraryDistillPayload;
    const note = await createNoteStore(this.vaultPath).create({
      type: input.target_type ?? payload.suggested_note_type,
      title: payload.title || item.frontmatter.title,
      body: input.user_body ?? noteBodyFromDistillation(payload, item),
      tags: item.frontmatter.tags,
      areas: item.frontmatter.areas,
      resource_refs: item.frontmatter.resource_refs,
      source: {
        kind: 'library',
        ref: item.frontmatter.id,
        excerpt: payload.summary
      },
      synthesis_ref: artifact.id
    });
    const updated = await this.update(item.frontmatter.id, {
      status: 'distilled',
      distilled_note_ids: [...(item.frontmatter.distilled_note_ids ?? []), note.frontmatter.id],
      distillation_artifact_ids: [...new Set([...(item.frontmatter.distillation_artifact_ids ?? []), artifact.id])]
    });
    return { item: updated, note_id: note.frontmatter.id, note_path: note.path };
  }

  private async nextPath(kind: LibraryKind, title: string): Promise<string> {
    const base = slugify(title) || randomUUID().slice(0, 8);
    const dir = path.posix.join(LIBRARY_ROOT, DIR_BY_KIND[kind]);
    let candidate = path.posix.join(dir, `${base}.md`);
    let index = 1;
    while (await exists(path.join(this.vaultPath, candidate))) {
      index += 1;
      candidate = path.posix.join(dir, `${base}-${index}.md`);
    }
    return candidate;
  }

  private async requireByPath(relPath: string): Promise<LibraryItem> {
    const item = await this.readLibraryFile(path.join(this.vaultPath, relPath));
    if (!item) throw new Error(`failed_to_read_library_item:${relPath}`);
    return item;
  }

  private async readLibraryFile(absPath: string): Promise<LibraryItem | null> {
    if (!absPath.endsWith('.md')) return null;
    const safe = assertInsideVault(this.vaultPath, absPath);
    const raw = await fs.readFile(safe, 'utf8').catch((error: unknown) => {
      if (isNotFound(error)) return null;
      throw error;
    });
    if (raw === null) return null;
    const parsed = frontmatter.read(raw);
    const rel = toPosix(path.relative(this.vaultPath, safe));
    const kind = kindFromPath(rel) ?? libraryKindValue(parsed.data['kind']) ?? 'article';
    const fm = normalizeFrontmatter({
      id: stringValue(parsed.data['id']) ?? `lib-${rel}`,
      kind,
      title: stringValue(parsed.data['title']) ?? titleFromBody(parsed.body),
      url: stringValue(parsed.data['url']),
      local_path: stringValue(parsed.data['local_path']),
      status: libraryStatusValue(parsed.data['status']) ?? 'saved',
      created: stringValue(parsed.data['created']) ?? new Date(0).toISOString(),
      updated: stringValue(parsed.data['updated']) ?? new Date(0).toISOString(),
      tags: arrayOfStrings(parsed.data['tags']),
      areas: Array.isArray(parsed.data['areas']) ? (parsed.data['areas'] as LibraryItemFrontmatter['areas']) : [],
      resource_refs: normalizeRefs(arrayOfStrings(parsed.data['resource_refs'])),
      source: typeof parsed.data['source'] === 'object' ? (parsed.data['source'] as LibraryItemFrontmatter['source']) : undefined,
      reading_progress: numberValue(parsed.data['reading_progress']) ?? 0,
      total_reading_seconds: numberValue(parsed.data['total_reading_seconds']) ?? 0,
      annotations: Array.isArray(parsed.data['annotations']) ? (parsed.data['annotations'] as LibraryAnnotation[]) : [],
      source_snapshot_ref: stringValue(parsed.data['source_snapshot_ref']),
      promoted_enrichment_artifact_ids: arrayOfStrings(parsed.data['promoted_enrichment_artifact_ids']),
      feed_collection_artifact_ids: arrayOfStrings(parsed.data['feed_collection_artifact_ids']),
      preferred_display_artifact_id: stringValue(parsed.data['preferred_display_artifact_id']),
      distillation_artifact_ids: arrayOfStrings(parsed.data['distillation_artifact_ids']),
      distilled_note_ids: arrayOfStrings(parsed.data['distilled_note_ids'])
    });
    return { frontmatter: fm, body: parsed.body, path: rel };
  }
}

export function createLibraryStore(vaultPath: string): LibraryStore {
  return new LibraryStore(vaultPath);
}

async function writeLibraryFile(filePath: string, fm: LibraryItemFrontmatter, body: string): Promise<void> {
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

function matchesFilter(item: LibraryItem, filter: LibraryFilter): boolean {
  if (!filter.include_archived && item.frontmatter.status === 'archived') return false;
  if (filter.kind && item.frontmatter.kind !== filter.kind) return false;
  if (filter.status && item.frontmatter.status !== filter.status) return false;
  if (filter.tag && !item.frontmatter.tags.includes(filter.tag)) return false;
  if (filter.area_slug && !(item.frontmatter.areas ?? []).some((area) => area.area_slug === filter.area_slug)) return false;
  if (filter.resource_ref && !(item.frontmatter.resource_refs ?? []).includes(filter.resource_ref)) return false;
  return true;
}

function normalizeFrontmatter(value: LibraryItemFrontmatter): LibraryItemFrontmatter {
  return {
    ...value,
    tags: normalizeTags(value.tags ?? []),
    resource_refs: normalizeRefs(value.resource_refs ?? []),
    annotations: value.annotations ?? [],
    promoted_enrichment_artifact_ids: [...new Set(value.promoted_enrichment_artifact_ids ?? [])],
    feed_collection_artifact_ids: [...new Set(value.feed_collection_artifact_ids ?? [])],
    distillation_artifact_ids: [...new Set(value.distillation_artifact_ids ?? [])],
    distilled_note_ids: [...new Set(value.distilled_note_ids ?? [])]
  };
}

function distillPayload(item: LibraryItem): LibraryDistillPayload {
  const paragraphs = item.body
    .replace(/^---[\s\S]*?---\s*/, '')
    .split(/\n{2,}/)
    .map((part) => part.replace(/^#+\s*/, '').trim())
    .filter(Boolean);
  return {
    title: `Distilled: ${item.frontmatter.title}`,
    summary: paragraphs[0]?.slice(0, 500) || `Saved material from ${item.frontmatter.title}.`,
    key_points: paragraphs.slice(0, 5).map((part) => part.slice(0, 180)),
    quotes: (item.frontmatter.annotations ?? []).slice(0, 5).map((annotation) => annotation.text),
    suggested_note_type: item.frontmatter.kind === 'article' ? 'longform' : 'capture'
  };
}

function noteBodyFromDistillation(payload: LibraryDistillPayload, item: LibraryItem): string {
  const points = payload.key_points.map((point) => `- ${point}`).join('\n');
  const quotes = payload.quotes?.length ? `\n\n## Quotes\n\n${payload.quotes.map((quote) => `> ${quote}`).join('\n\n')}` : '';
  return `# ${payload.title || item.frontmatter.title}\n\n${payload.summary}\n\n## Key points\n\n${points || '- No key points generated.'}${quotes}\n\n## Source\n\n${item.frontmatter.url ?? item.path}\n`;
}

function normalizeBody(body: string, title: string): string {
  const trimmed = body.trim();
  if (trimmed.startsWith('# ')) return `${trimmed}\n`;
  return `# ${title}\n\n${trimmed}\n`;
}

function defaultBody(title: string, url?: string): string {
  return url ? `# ${title}\n\nSource: ${url}\n` : `# ${title}\n`;
}

function titleFromBody(body: string): string {
  return body.match(/^#\s+(.+)$/m)?.[1]?.trim().slice(0, 80) || body.trim().split(/\r?\n/)[0]?.trim().slice(0, 80) || 'Untitled';
}

function inferKind(url?: string, localPath?: string): LibraryKind {
  const value = `${url ?? ''} ${localPath ?? ''}`.toLowerCase();
  if (/\.pdf(\?|$)/.test(value)) return 'pdf';
  if (/youtube\.com|youtu\.be|vimeo\.com|\.mp4(\?|$)/.test(value)) return 'video';
  return url ? 'article' : 'bookmark';
}

function labelForKind(kind: LibraryKind): string {
  if (kind === 'pdf') return 'PDF';
  return kind[0].toUpperCase() + kind.slice(1);
}

function kindFromPath(rel: string): LibraryKind | null {
  const part = rel.split('/')[1];
  const match = Object.entries(DIR_BY_KIND).find(([, dir]) => dir === part);
  return (match?.[0] as LibraryKind | undefined) ?? null;
}

function titleFromUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const lastSegment = url.pathname.replace(/\/$/, '').split('/').pop()?.replace(/[-_]+/g, ' ').trim();
    return lastSegment ? `${url.hostname} - ${lastSegment}` : url.hostname;
  } catch {
    return null;
  }
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean))];
}

function normalizeRefs(refs: string[]): string[] {
  return [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))];
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

function libraryKindValue(value: unknown): LibraryKind | undefined {
  return typeof value === 'string' && value in DIR_BY_KIND ? (value as LibraryKind) : undefined;
}

function libraryStatusValue(value: unknown): LibraryStatus | undefined {
  return ['saved', 'reading', 'read', 'distilled', 'archived'].includes(String(value)) ? (value as LibraryStatus) : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
