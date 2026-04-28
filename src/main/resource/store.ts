import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  CreateResourceFromSuggestionInput,
  CreateResourceInput,
  LinkResourceRefInput,
  Resource,
  ResourceCounts,
  ResourceEngagement,
  ResourceEngagementInput,
  ResourceFilter,
  ResourceFrontmatter,
  ResourceRef,
  ResourceSection,
  ResourceSuggestion,
  ResourceSuggestionOptions,
  ResourceSummary,
  ResourceTimelineEntry,
  UpdateResourceInput
} from '@shared/resource';
import type { Note } from '@shared/note';
import * as frontmatter from '../frontmatter';
import { toPosix } from '../pathGuard';
import { createNoteStore } from '../note/store';
import type { ResourceEmergencePayload } from '@shared/synthesis';
import { createSynthesisJob, SynthesisRunner } from '../synthesis/runner';
import { createSynthesisStore } from '../synthesis/store';

interface ResourceIndexFile {
  version: 1;
  refs: ResourceRef[];
  timeline: ResourceTimelineEntry[];
}

const RESOURCE_ROOT = 'resources';
const ARCHIVE_ROOT = path.posix.join('archives', 'resources');

const SECTION_DIRS: Record<ResourceSection, string> = {
  canonical: '_canonical',
  distilled: '_distilled',
  related: '_related',
  people: '_people',
  projects_touched: '_projects-touched'
};

export class ResourceStore {
  constructor(private readonly vaultPath: string) {}

  async list(filter: ResourceFilter = {}): Promise<ResourceSummary[]> {
    await this.ensureRoot();
    const summaries = await Promise.all((await this.resourceIndexPaths(filter.include_archived)).map((file) => this.readSummary(file)));
    return summaries
      .filter((resource): resource is ResourceSummary => resource !== null)
      .filter((resource) => !filter.status || resource.frontmatter.status === filter.status)
      .filter((resource) => !filter.tag || resource.frontmatter.tags.includes(filter.tag))
      .sort((a, b) => (b.frontmatter.last_engaged ?? b.frontmatter.updated).localeCompare(a.frontmatter.last_engaged ?? a.frontmatter.updated));
  }

  async get(resourceIdOrSlug: string): Promise<Resource | null> {
    const summaries = await this.list({ include_archived: true });
    const summary =
      summaries.find((item) => item.frontmatter.id === resourceIdOrSlug) ??
      summaries.find((item) => item.frontmatter.slug === resourceIdOrSlug);
    if (!summary) return null;
    return this.readResource(path.join(this.vaultPath, summary.path));
  }

  async create(input: CreateResourceInput): Promise<Resource> {
    await this.ensureRoot();
    const now = new Date().toISOString();
    const title = input.title.trim();
    if (!title) throw new Error('resource title is required');
    const slug = await this.nextSlug(input.slug ?? title);
    const fm: ResourceFrontmatter = {
      id: `resource-${randomUUID()}`,
      type: 'resource',
      title,
      slug,
      status: 'active',
      depth: input.depth ?? 'exploring',
      created: now,
      updated: now,
      engagement_count: 0,
      tags: normalizeTags(input.tags ?? [])
    };
    const dir = path.join(this.vaultPath, RESOURCE_ROOT, slug);
    await fs.mkdir(dir, { recursive: true });
    await Promise.all(Object.values(SECTION_DIRS).map((sectionDir) => this.writeSectionReadme(dir, sectionDir)));
    await this.writeSectionReadme(dir, '_timeline');
    await this.writeIndex(dir, fm, input.body ?? defaultResourceBody(title));
    await this.writeMeta(dir, {
      version: 1,
      refs: [],
      timeline: [
        {
          id: `resource-event-${randomUUID()}`,
          at: now,
          kind: 'created',
          title: 'Resource created',
          summary: title
        }
      ]
    });
    await this.refreshSectionReadmes(dir);
    return this.requireResource(slug);
  }

  async update(resourceIdOrSlug: string, patch: UpdateResourceInput): Promise<Resource> {
    const resource = await this.requireExisting(resourceIdOrSlug);
    const dir = this.resourceDir(resource);
    const now = new Date().toISOString();
    const fm: ResourceFrontmatter = {
      ...resource.frontmatter,
      ...(patch.title ? { title: patch.title.trim() } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.depth ? { depth: patch.depth } : {}),
      ...(patch.tags ? { tags: normalizeTags(patch.tags) } : {}),
      ...(patch.evolved_to ? { evolved_to: patch.evolved_to } : {}),
      updated: now
    };
    await this.writeIndex(dir, fm, patch.body ?? resource.body);
    await this.appendTimeline(dir, {
      id: `resource-event-${randomUUID()}`,
      at: now,
      kind: 'updated',
      title: 'Resource updated',
      summary: fm.title
    });
    return this.readResourceFromDir(dir);
  }

  async archive(resourceIdOrSlug: string): Promise<Resource> {
    const resource = await this.requireExisting(resourceIdOrSlug);
    const dir = this.resourceDir(resource);
    const now = new Date().toISOString();
    const fm: ResourceFrontmatter = {
      ...resource.frontmatter,
      status: 'archived',
      updated: now
    };
    await this.writeIndex(dir, fm, resource.body);
    await this.appendTimeline(dir, {
      id: `resource-event-${randomUUID()}`,
      at: now,
      kind: 'archived',
      title: 'Resource archived',
      summary: resource.frontmatter.title
    });
    const target = path.join(this.vaultPath, ARCHIVE_ROOT, resource.frontmatter.slug);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.rm(target, { recursive: true, force: true });
    await fs.rename(dir, target);
    return this.readResourceFromDir(target);
  }

  async linkRef(resourceIdOrSlug: string, input: LinkResourceRefInput): Promise<Resource> {
    const resource = await this.requireExisting(resourceIdOrSlug);
    const dir = this.resourceDir(resource);
    const now = new Date().toISOString();
    const meta = await this.readMeta(dir);
    const section = input.section ?? defaultSection(input.kind);
    const ref: ResourceRef = {
      id: `resource-ref-${randomUUID()}`,
      kind: input.kind,
      ref: input.ref,
      ...(input.title ? { title: input.title } : {}),
      ...(input.summary ? { summary: input.summary } : {}),
      section,
      added_at: now,
      source: input.source ?? 'manual'
    };
    const refs = [...meta.refs.filter((item) => !(item.kind === ref.kind && item.ref === ref.ref && item.section === ref.section)), ref];
    await this.writeMeta(dir, {
      ...meta,
      refs,
      timeline: [
        ...meta.timeline,
        {
          id: `resource-event-${randomUUID()}`,
          at: now,
          kind: 'linked',
          title: `Linked ${ref.kind}`,
          summary: ref.title ?? ref.ref,
          ref_id: ref.id
        }
      ]
    });
    await this.touch(dir, resource.frontmatter, now, true);
    await this.refreshSectionReadmes(dir);
    return this.readResourceFromDir(dir);
  }

  async unlinkRef(resourceIdOrSlug: string, refId: string): Promise<Resource> {
    const resource = await this.requireExisting(resourceIdOrSlug);
    const dir = this.resourceDir(resource);
    const meta = await this.readMeta(dir);
    await this.writeMeta(dir, { ...meta, refs: meta.refs.filter((ref) => ref.id !== refId) });
    await this.touch(dir, resource.frontmatter, new Date().toISOString(), false);
    await this.refreshSectionReadmes(dir);
    return this.readResourceFromDir(dir);
  }

  async engage(resourceIdOrSlug: string, input: ResourceEngagementInput = {}): Promise<ResourceEngagement> {
    const resource = await this.requireExisting(resourceIdOrSlug);
    const dir = this.resourceDir(resource);
    const now = new Date().toISOString();
    const entry: ResourceTimelineEntry = {
      id: `resource-event-${randomUUID()}`,
      at: now,
      kind: 'engaged',
      title: input.title?.trim() || 'Resource engaged',
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.ref_id ? { ref_id: input.ref_id } : {})
    };
    await this.appendTimeline(dir, entry);
    await this.touch(dir, resource.frontmatter, now, true);
    await this.refreshSectionReadmes(dir);
    return { resource: await this.readResourceFromDir(dir), entry };
  }

  async suggestFromNotes(options: ResourceSuggestionOptions = {}): Promise<ResourceSuggestion[]> {
    const suggestions = await this.suggestFromNotesHeuristic(options);
    const artifact = await new SynthesisRunner(createSynthesisStore(this.vaultPath)).run(
      createSynthesisJob({
        kind: 'emerge.resource',
        scope_key: `emerge:notes:${JSON.stringify({ minNotes: options.minNotes ?? 3, limit: options.limit ?? 12 })}`,
        priority: 'interactive',
        reason: 'manual',
        force: true,
        sources: [{ kind: 'raw', ref: 'resource-suggestions-from-notes', metadata: { suggestions } }]
      })
    );
    const payload = artifact.payload as ResourceEmergencePayload;
    return payload.suggestions.map((suggestion) => ({ ...suggestion, synthesis_ref: artifact.id }));
  }

  private async suggestFromNotesHeuristic(options: ResourceSuggestionOptions = {}): Promise<ResourceSuggestion[]> {
    const minNotes = Math.max(2, options.minNotes ?? 3);
    const limit = Math.max(1, options.limit ?? 12);
    const existingSlugs = new Set((await this.list({ include_archived: true })).map((resource) => resource.frontmatter.slug));
    const notes = await createNoteStore(this.vaultPath).list();
    const byTag = new Map<string, Note[]>();
    for (const note of notes) {
      for (const tag of note.frontmatter.tags) {
        const normalized = normalizeTag(tag);
        if (!normalized || isWeakTag(normalized)) continue;
        byTag.set(normalized, [...(byTag.get(normalized) ?? []), note]);
      }
    }
    return [...byTag.entries()]
      .filter(([tag, taggedNotes]) => taggedNotes.length >= minNotes && !existingSlugs.has(slugify(tag)))
      .map(([tag, taggedNotes]) => ({
        topic: titleizeTag(tag),
        tag,
        note_count: taggedNotes.length,
        sample_notes: taggedNotes.slice(0, 5).map((note) => ({
          id: note.frontmatter.id,
          title: note.frontmatter.title,
          path: note.path,
          excerpt: note.body.replace(/\s+/g, ' ').trim().slice(0, 180)
        })),
        confidence: Math.min(0.95, 0.45 + taggedNotes.length * 0.08)
      }))
      .sort((a, b) => b.note_count - a.note_count || b.confidence - a.confidence)
      .slice(0, limit);
  }

  async createFromSuggestion(input: CreateResourceFromSuggestionInput): Promise<Resource> {
    const suggestion = input.suggestion;
    const resource = await this.create({
      title: input.title ?? suggestion.topic,
      tags: [suggestion.tag],
      body: `# ${input.title ?? suggestion.topic}\n\nThis Resource emerged from ${suggestion.note_count} related note(s) tagged #${suggestion.tag}.\n\n## Current understanding\n\nCapture your evolving understanding of this topic here.\n`
    });
    let next = resource;
    for (const note of suggestion.sample_notes) {
      next = await this.linkRef(next.frontmatter.id, {
        kind: 'note',
        ref: note.path,
        title: note.title,
        summary: note.excerpt,
        section: 'distilled',
        source: 'suggestion'
      });
    }
    await this.engage(next.frontmatter.id, {
      title: 'Resource emerged from Notes',
      summary: `${suggestion.note_count} note(s) tagged #${suggestion.tag}`
    });
    return this.requireExisting(next.frontmatter.id);
  }

  private async ensureRoot(): Promise<void> {
    await fs.mkdir(path.join(this.vaultPath, RESOURCE_ROOT), { recursive: true });
  }

  private async resourceIndexPaths(includeArchived = false): Promise<string[]> {
    const roots = [path.join(this.vaultPath, RESOURCE_ROOT)];
    if (includeArchived) roots.push(path.join(this.vaultPath, ARCHIVE_ROOT));
    const files: string[] = [];
    for (const root of roots) files.push(...(await findIndexFiles(root)));
    return files;
  }

  private async readSummary(indexPath: string): Promise<ResourceSummary | null> {
    const resource = await this.readResource(indexPath);
    if (!resource) return null;
    return { frontmatter: resource.frontmatter, path: resource.path, counts: resource.counts };
  }

  private async readResource(indexPath: string): Promise<Resource | null> {
    const raw = await fs.readFile(indexPath, 'utf8').catch((error: unknown) => {
      if (isNotFound(error)) return null;
      throw error;
    });
    if (raw === null) return null;
    const parsed = frontmatter.read(raw);
    const dir = path.dirname(indexPath);
    const fm = normalizeFrontmatter(parsed.data, dir);
    const meta = await this.readMeta(dir);
    return {
      frontmatter: fm,
      body: parsed.body,
      path: toPosix(path.relative(this.vaultPath, indexPath)),
      refs: meta.refs,
      timeline: meta.timeline,
      counts: countsFor(meta)
    };
  }

  private async requireResource(slug: string): Promise<Resource> {
    return this.readResourceFromDir(path.join(this.vaultPath, RESOURCE_ROOT, slug));
  }

  private async readResourceFromDir(dir: string): Promise<Resource> {
    const resource = await this.readResource(path.join(dir, 'index.md'));
    if (!resource) throw new Error(`failed to read resource: ${toPosix(path.relative(this.vaultPath, dir))}`);
    return resource;
  }

  private async requireExisting(resourceIdOrSlug: string): Promise<Resource> {
    const resource = await this.get(resourceIdOrSlug);
    if (!resource) throw new Error(`resource not found: ${resourceIdOrSlug}`);
    return resource;
  }

  private resourceDir(resource: Resource | ResourceSummary): string {
    return path.join(this.vaultPath, path.dirname(resource.path));
  }

  private async nextSlug(value: string): Promise<string> {
    const base = slugify(value) || `resource-${randomUUID().slice(0, 8)}`;
    let candidate = base;
    let index = 1;
    while (await exists(path.join(this.vaultPath, RESOURCE_ROOT, candidate))) {
      index += 1;
      candidate = `${base}-${index}`;
    }
    return candidate;
  }

  private async writeIndex(dir: string, fm: ResourceFrontmatter, body: string): Promise<void> {
    await fs.writeFile(path.join(dir, 'index.md'), frontmatter.write(fm as unknown as Record<string, unknown>, body), 'utf8');
  }

  private async readMeta(dir: string): Promise<ResourceIndexFile> {
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(dir, '.orbit-resource.json'), 'utf8')) as Partial<ResourceIndexFile>;
      return {
        version: 1,
        refs: Array.isArray(parsed.refs) ? parsed.refs : [],
        timeline: Array.isArray(parsed.timeline) ? parsed.timeline : []
      };
    } catch (error) {
      if (!isNotFound(error)) throw error;
      return { version: 1, refs: [], timeline: [] };
    }
  }

  private async writeMeta(dir: string, meta: ResourceIndexFile): Promise<void> {
    await fs.writeFile(path.join(dir, '.orbit-resource.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  }

  private async appendTimeline(dir: string, entry: ResourceTimelineEntry): Promise<void> {
    const meta = await this.readMeta(dir);
    await this.writeMeta(dir, { ...meta, timeline: [...meta.timeline, entry] });
  }

  private async touch(dir: string, current: ResourceFrontmatter, at: string, engaged: boolean): Promise<void> {
    const raw = await fs.readFile(path.join(dir, 'index.md'), 'utf8');
    const parsed = frontmatter.read(raw);
    const fm = normalizeFrontmatter(parsed.data, dir);
    const next: ResourceFrontmatter = {
      ...fm,
      updated: at,
      ...(engaged ? { last_engaged: at, engagement_count: current.engagement_count + 1 } : {})
    };
    await this.writeIndex(dir, next, parsed.body);
  }

  private async writeSectionReadme(resourceDir: string, sectionDir: string): Promise<void> {
    const dir = path.join(resourceDir, sectionDir);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, 'README.md');
    if (!(await exists(file))) {
      await fs.writeFile(file, `# ${sectionDir.replace(/^_/, '').replace(/-/g, ' ')}\n\nOrbit keeps Resource references for this section here.\n`, 'utf8');
    }
  }

  private async refreshSectionReadmes(dir: string): Promise<void> {
    const resource = await this.readResourceFromDir(dir);
    await Promise.all(
      Object.entries(SECTION_DIRS).map(async ([section, sectionDir]) => {
        const refs = resource.refs.filter((ref) => ref.section === section);
        const content = `# ${sectionTitle(section as ResourceSection)}\n\n${refs.map(renderRef).join('\n') || 'No references yet.'}\n`;
        await fs.writeFile(path.join(dir, sectionDir, 'README.md'), content, 'utf8');
      })
    );
    const timeline = resource.timeline
      .slice()
      .reverse()
      .map((entry) => `- ${entry.at} — **${entry.title}**${entry.summary ? `: ${entry.summary}` : ''}`)
      .join('\n');
    await fs.writeFile(path.join(dir, '_timeline', 'README.md'), `# Timeline\n\n${timeline || 'No timeline yet.'}\n`, 'utf8');
  }
}

export function createResourceStore(vaultPath: string): ResourceStore {
  return new ResourceStore(vaultPath);
}

async function findIndexFiles(root: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const indexPath = path.join(root, entry.name, 'index.md');
    if (await exists(indexPath)) files.push(indexPath);
  }
  return files;
}

function normalizeFrontmatter(data: Record<string, unknown>, dir: string): ResourceFrontmatter {
  const now = new Date(0).toISOString();
  const slug = String(data['slug'] ?? path.basename(dir));
  return {
    id: stringValue(data['id']) ?? `resource-${slug}`,
    type: 'resource',
    title: stringValue(data['title']) ?? titleizeTag(slug),
    slug,
    status: ['active', 'dormant', 'evolved', 'archived'].includes(String(data['status'])) ? (data['status'] as ResourceFrontmatter['status']) : 'active',
    depth: ['exploring', 'practicing', 'mastered', 'teaching'].includes(String(data['depth'])) ? (data['depth'] as ResourceFrontmatter['depth']) : 'exploring',
    created: stringValue(data['created']) ?? now,
    updated: stringValue(data['updated']) ?? now,
    last_engaged: stringValue(data['last_engaged']),
    engagement_count: numberValue(data['engagement_count']) ?? 0,
    tags: Array.isArray(data['tags']) ? normalizeTags(data['tags'].filter((tag): tag is string => typeof tag === 'string')) : [],
    evolved_to: stringValue(data['evolved_to'])
  };
}

function countsFor(meta: ResourceIndexFile): ResourceCounts {
  return {
    canonical: meta.refs.filter((ref) => ref.section === 'canonical').length,
    distilled: meta.refs.filter((ref) => ref.section === 'distilled').length,
    related: meta.refs.filter((ref) => ref.section === 'related').length,
    people: meta.refs.filter((ref) => ref.section === 'people').length,
    projects_touched: meta.refs.filter((ref) => ref.section === 'projects_touched').length,
    timeline: meta.timeline.length
  };
}

function defaultSection(kind: LinkResourceRefInput['kind']): ResourceSection {
  if (kind === 'person') return 'people';
  if (kind === 'project') return 'projects_touched';
  if (kind === 'note') return 'distilled';
  return 'related';
}

function renderRef(ref: ResourceRef): string {
  const label = ref.title ?? ref.ref;
  if (ref.kind === 'url') return `- [${label}](${ref.ref})${ref.summary ? ` — ${ref.summary}` : ''}`;
  return `- ${ref.kind}: ${label} (${ref.ref})${ref.summary ? ` — ${ref.summary}` : ''}`;
}

function sectionTitle(section: ResourceSection): string {
  if (section === 'projects_touched') return 'projects touched';
  return section;
}

function defaultResourceBody(title: string): string {
  return `# ${title}\n\n## Current understanding\n\nCapture your evolving understanding of this topic here.\n\n## Open questions\n\n- \n`;
}

function titleizeTag(value: string): string {
  return value
    .split(/[-_\s/]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map(normalizeTag).filter(Boolean))];
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase();
}

function isWeakTag(tag: string): boolean {
  return ['note', 'notes', 'todo', 'daily', 'capture', 'thought', 'misc'].includes(tag);
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

async function exists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(
    () => true,
    () => false
  );
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
