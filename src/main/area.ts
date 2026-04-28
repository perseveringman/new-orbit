import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { spawn as nodeSpawn } from 'node:child_process';
import path from 'node:path';
import {
  AREAS_DIR,
  AREA_ORBIT_DIR,
  AREA_ORBIT_CONFIG,
  AREA_ORBIT_AGENT_DIR,
  AREA_ORBIT_SESSIONS_DIR,
  AREA_ORBIT_TASKS_DIR,
  AREA_ORBIT_MEMORIES_DIR,
  VISION_AREA_SLUG
} from '@shared/constants';
import type {
  AreaAssignmentInput,
  AreaAssignmentSuggestion,
  AreaConfig,
  AreaDashboardData,
  AreaEntityRef,
  AreaHealth,
  AreaRef,
  AreaUnassignmentInput
} from '@shared/area';
import type { AreaClassificationPayload, SynthesisSource } from '@shared/synthesis';
import type { AreaSummaryDTO, CreateAreaArgsDTO, CreateAreaResultDTO, UpdateAreaArgsDTO } from '@shared/ipc';
import type { FeedSource } from '@shared/feed';
import type { NoteAreaRef } from '@shared/note';
import type { TaskRecord } from '@shared/schemas';
import { newUid as generateUid } from './uid';
import { getVisionAreaTemplateFiles } from './templates/vision-area';
import { createNoteStore } from './note/store';
import { createLibraryStore } from './library/store';
import { createResourceStore } from './resource/store';
import { createFeedStore } from './feed/store';
import { createScheduledTaskStore } from './scheduled-task/store';
import { createSynthesisStore } from './synthesis/store';
import { listProjects, type ProjectSummary } from './project';
import { tasksOfFile } from './tasks';
import { walkMarkdown } from './walk';
import * as frontmatter from './frontmatter';
import { toPosix, vaultRel } from './pathGuard';

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

async function runGh(args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let output = '';
    const child = nodeSpawn('gh', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(output.trim() || `gh exited with code ${code ?? 1}`));
    });
  });
}

async function ensureAreaOrbitDirs(areaPath: string): Promise<void> {
  await fs.mkdir(path.join(areaPath, AREA_ORBIT_DIR, AREA_ORBIT_AGENT_DIR, AREA_ORBIT_SESSIONS_DIR), {
    recursive: true
  });
  await fs.mkdir(path.join(areaPath, AREA_ORBIT_DIR, AREA_ORBIT_AGENT_DIR, AREA_ORBIT_TASKS_DIR), {
    recursive: true
  });
  await fs.mkdir(path.join(areaPath, AREA_ORBIT_DIR, AREA_ORBIT_AGENT_DIR, AREA_ORBIT_MEMORIES_DIR), {
    recursive: true
  });
}

async function writeBlankAreaReadme(areaPath: string, name: string): Promise<void> {
  await fs.writeFile(
    path.join(areaPath, 'README.md'),
    `# ${name}\n\n`,
    'utf8'
  );
}

async function cloneAreaGitHubRepository(
  parentDir: string,
  areaPath: string,
  owner: string,
  repo: string
): Promise<void> {
  await runGh(['repo', 'clone', `${owner}/${repo}`, areaPath], parentDir);
  await fs.rm(path.join(areaPath, '.git'), { recursive: true, force: true });
}

function parseAreaConfig(raw: unknown): AreaConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid area config');
  }
  const r = raw as Record<string, unknown>;
  const createdAt = typeof r['created_at'] === 'string' ? r['created_at'] : new Date().toISOString();
  const status = r['status'] === 'dormant' || r['status'] === 'archived' ? r['status'] : 'active';
  return {
    uid: typeof r['uid'] === 'string' ? r['uid'] : '',
    slug: typeof r['slug'] === 'string' ? r['slug'] : '',
    name: typeof r['name'] === 'string' ? r['name'] : '',
    ...(typeof r['description'] === 'string' ? { description: r['description'] } : {}),
    status,
    ...(typeof r['template'] === 'string' ? { template: r['template'] } : {}),
    tags: normalizeTags(Array.isArray(r['tags']) ? (r['tags'] as unknown[]) : []),
    created_at: createdAt,
    updated_at: typeof r['updated_at'] === 'string' ? r['updated_at'] : createdAt,
    ...(Array.isArray(r['vision_refs']) ? { vision_refs: normalizeTags(r['vision_refs']) } : {})
  };
}

export async function readAreaConfig(areaPath: string): Promise<AreaConfig | null> {
  const cfgPath = path.join(areaPath, AREA_ORBIT_DIR, AREA_ORBIT_CONFIG);
  try {
    const raw = await fs.readFile(cfgPath, 'utf8');
    return parseAreaConfig(JSON.parse(raw));
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeAreaConfig(areaPath: string, config: AreaConfig): Promise<void> {
  const cfgPath = path.join(areaPath, AREA_ORBIT_DIR, AREA_ORBIT_CONFIG);
  await fs.mkdir(path.dirname(cfgPath), { recursive: true });
  await fs.writeFile(cfgPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

export async function listAreas(vaultPath: string, opts: { includeArchived?: boolean } = {}): Promise<AreaSummaryDTO[]> {
  const areasDir = path.join(vaultPath, AREAS_DIR);
  const results: AreaSummaryDTO[] = [];
  let entries: string[];
  try {
    const dirents = await fs.readdir(areasDir, { withFileTypes: true });
    entries = dirents
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return [];
    throw error;
  }
  for (const entry of entries) {
    const areaPath = path.join(areasDir, entry);
    const config = await readAreaConfig(areaPath);
    if (!config) continue;
    if (!opts.includeArchived && config.status === 'archived') continue;
    const hasVision = await fileExists(path.join(areaPath, 'VISION.md'));
    results.push({
      uid: config.uid,
      slug: config.slug,
      name: config.name,
      description: config.description,
      status: config.status,
      template: config.template,
      tags: config.tags,
      created_at: config.created_at,
      updated_at: config.updated_at,
      path: areaPath,
      relPath: `${AREAS_DIR}/${entry}`,
      hasVision
    });
  }
  return results;
}

export async function createArea(
  vaultPath: string,
  args: CreateAreaArgsDTO
): Promise<CreateAreaResultDTO> {
  const slug = args.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const areasDir = path.join(vaultPath, AREAS_DIR);
  const areaPath = path.join(areasDir, slug);

  if (await fileExists(areaPath)) {
    throw new Error(`Area already exists: ${slug}`);
  }

  const uid = args.uid ?? generateUid();
  const createdAt = new Date().toISOString();

  if (args.github) {
    await fs.mkdir(areasDir, { recursive: true });
    try {
      await cloneAreaGitHubRepository(areasDir, areaPath, args.github.owner, args.github.repo);
    } catch (error) {
      await fs.rm(areaPath, { recursive: true, force: true });
      throw error;
    }
  } else {
    await fs.mkdir(areaPath, { recursive: true });
  }

  await ensureAreaOrbitDirs(areaPath);

  const config: AreaConfig = {
    uid,
    slug,
    name: args.name,
    ...(args.description ? { description: args.description } : {}),
    status: 'active',
    template: args.template,
    tags: normalizeTags(args.tags ?? []),
    created_at: createdAt,
    updated_at: createdAt
  };
  await writeAreaConfig(areaPath, config);

  if (args.github) {
    if (!(await fileExists(path.join(areaPath, 'README.md')))) {
      await writeBlankAreaReadme(areaPath, args.name);
    }
  } else if (args.template === VISION_AREA_SLUG) {
    await scaffoldVisionFiles(areaPath, { name: args.name, slug, uid });
  } else {
    await writeBlankAreaReadme(areaPath, args.name);
  }

  return {
    areaPath,
    relPath: `${AREAS_DIR}/${slug}`,
    uid,
    slug
  };
}

async function scaffoldVisionFiles(
  areaPath: string,
  vars: { name: string; slug: string; uid: string }
): Promise<void> {
  const files = getVisionAreaTemplateFiles(vars);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(areaPath, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf8');
  }
}

export async function scaffoldVisionArea(vaultPath: string): Promise<void> {
  const areasDir = path.join(vaultPath, AREAS_DIR);
  const areaPath = path.join(areasDir, VISION_AREA_SLUG);
  if (await fileExists(areaPath)) return;

  const uid = generateUid();
  const createdAt = new Date().toISOString();
  const name = 'Vision';
  const vars = { name, slug: VISION_AREA_SLUG, uid };

  await fs.mkdir(areaPath, { recursive: true });
  await ensureAreaOrbitDirs(areaPath);

  const config: AreaConfig = {
    uid,
    slug: VISION_AREA_SLUG,
    name,
    status: 'active',
    template: VISION_AREA_SLUG,
    tags: [],
    created_at: createdAt,
    updated_at: createdAt
  };
  await writeAreaConfig(areaPath, config);
  await scaffoldVisionFiles(areaPath, vars);
}

export async function getAreaConfig(areaPath: string): Promise<AreaConfig> {
  const config = await readAreaConfig(areaPath);
  if (!config) throw new Error(`Area config not found at ${areaPath}`);
  return config;
}

export async function setAreaConfig(
  areaPath: string,
  patch: Partial<AreaConfig>
): Promise<AreaConfig> {
  const current = await getAreaConfig(areaPath);
  const updated: AreaConfig = normalizeAreaConfig({
    ...current,
    ...patch,
    uid: current.uid,
    slug: current.slug,
    created_at: current.created_at,
    updated_at: new Date().toISOString()
  });
  await writeAreaConfig(areaPath, updated);
  return updated;
}

export async function getArea(vaultPath: string, slugOrUid: string): Promise<AreaConfig | null> {
  const match = await findAreaSummary(vaultPath, slugOrUid, true);
  return match ? getAreaConfig(match.path) : null;
}

export async function updateArea(vaultPath: string, slugOrUid: string, patch: UpdateAreaArgsDTO): Promise<AreaConfig> {
  const match = await requireAreaSummary(vaultPath, slugOrUid, true);
  return setAreaConfig(match.path, patch);
}

export async function archiveArea(vaultPath: string, slugOrUid: string): Promise<AreaConfig> {
  return updateArea(vaultPath, slugOrUid, { status: 'archived' });
}

export async function getAreaDashboard(vaultPath: string, slugOrUid: string): Promise<AreaDashboardData> {
  const summary = await requireAreaSummary(vaultPath, slugOrUid, true);
  const area = await getAreaConfig(summary.path);
  const [projects, allTasks, resources, notes, libraryItems, feedSources, scheduledTasks, synthesis] = await Promise.all([
    listProjects(vaultPath),
    listAllTasks(vaultPath),
    createResourceStore(vaultPath).list({ area_ref: area.slug }),
    createNoteStore(vaultPath).list({ area_slug: area.slug, include_archived: true }),
    createLibraryStore(vaultPath).list({ area_slug: area.slug, include_archived: true }),
    createFeedStore(vaultPath).listSources(),
    createScheduledTaskStore(vaultPath).list(),
    createSynthesisStore(vaultPath).latest(`area.dashboard:${area.slug}`)
  ]);
  const openTasks = allTasks.filter((task) => task.area_uid === area.uid && task.status !== 'done');
  const activeProjects = projects
    .filter((project) => project.status !== 'archived')
    .filter((project) => project.area_uid === area.uid || (project.area_slugs ?? []).includes(area.slug))
    .map((project) => ({
      uid: project.uid,
      slug: project.slug,
      name: project.name,
      status: project.status,
      relPath: project.relPath,
      task_count: allTasks.filter((task) => task.project_uid === project.uid && task.status !== 'done').length
    }));
  const relatedFeeds = feedSources.filter((source) => hasArea(source.areas, area.slug));
  const areaScheduled = scheduledTasks.filter(
    (task) => task.para_ref === `area:${area.slug}` || task.tags?.includes(`area:${area.slug}`) || (task.tags?.includes('area') && task.tags?.includes('review'))
  );
  const unassignedQueue = await buildUnassignedQueue(vaultPath, projects, feedSources);
  const stats = {
    active_projects: activeProjects.length,
    open_tasks: openTasks.length,
    resources: resources.length,
    recent_notes: notes.length,
    library_items: libraryItems.length,
    feed_sources: relatedFeeds.length,
    scheduled_reviews: areaScheduled.length,
    unassigned_candidates: unassignedQueue.length
  };

  return {
    area,
    health: computeAreaHealth(stats, notes[0]?.frontmatter.updated, resources[0]?.frontmatter.last_engaged),
    active_projects: activeProjects,
    resources,
    recent_notes: notes.slice(0, 8),
    library_items: libraryItems.slice(0, 8),
    feed_sources: relatedFeeds,
    scheduled_reviews: areaScheduled,
    open_tasks: openTasks.slice(0, 20),
    stats,
    synthesis,
    unassigned_queue: unassignedQueue
  };
}

export async function assignArea(vaultPath: string, input: AreaAssignmentInput): Promise<AreaConfig | null> {
  const area = await getArea(vaultPath, input.area.area_slug);
  if (!area) throw new Error(`area_not_found:${input.area.area_slug}`);
  const ref = normalizeAreaRef({ ...input.area, area_slug: area.slug });
  await updateEntityAreas(vaultPath, input.entity, (areas) => addAreaRef(areas, ref), area);
  return area;
}

export async function unassignArea(vaultPath: string, input: AreaUnassignmentInput): Promise<AreaConfig | null> {
  const area = await getArea(vaultPath, input.area_slug);
  if (!area) throw new Error(`area_not_found:${input.area_slug}`);
  await updateEntityAreas(vaultPath, input.entity, (areas) => areas.filter((item) => item.area_slug !== area.slug), area);
  return area;
}

export async function suggestAreaAssignments(
  vaultPath: string,
  entity: AreaEntityRef
): Promise<AreaAssignmentSuggestion[]> {
  const areas = await listAreas(vaultPath);
  const entityContext = await resolveEntityContext(vaultPath, entity);
  const suggestions = areas
    .map((area) => {
      const { confidence, reason } = scoreAreaSuggestion(area, entityContext);
      return {
        entity,
        area_slug: area.slug,
        confidence,
        reason,
        primary: confidence >= 0.72
      };
    })
    .filter((item) => item.confidence >= 0.25)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
  const payload: AreaClassificationPayload = {
    suggestions: suggestions.map(({ area_slug, confidence, reason, primary }) => ({
      area_slug,
      confidence,
      reason,
      primary
    }))
  };
  const artifact = await createSynthesisStore(vaultPath).writeFresh({
    kind: 'classify.area',
    scope_key: `area-classify:${entity.kind}:${entity.id}`,
    sources: [
      entityContext.source,
      ...areas.map((area): SynthesisSource => ({
        kind: 'area',
        ref: area.slug,
        title: area.name,
        metadata: { tags: area.tags }
      }))
    ],
    provenance: {
      runtime: 'local:heuristic',
      model: 'area-assignment-heuristic',
      prompt_version: 'classify.area.v1',
      generated_at: new Date().toISOString(),
      cost_usd: 0,
      tokens: { input: 0, output: 0 }
    },
    payload
  });
  return suggestions.map((suggestion) => ({ ...suggestion, synthesis_ref: artifact.id }));
}

export async function findAreaByUid(
  vaultPath: string,
  uid: string
): Promise<AreaSummaryDTO | null> {
  const areas = await listAreas(vaultPath);
  return areas.find((area) => area.uid === uid) ?? null;
}

async function findAreaSummary(vaultPath: string, slugOrUid: string, includeArchived = false): Promise<AreaSummaryDTO | null> {
  const areas = await listAreas(vaultPath, { includeArchived });
  return areas.find((area) => area.uid === slugOrUid || area.slug === slugOrUid) ?? null;
}

async function requireAreaSummary(vaultPath: string, slugOrUid: string, includeArchived = false): Promise<AreaSummaryDTO> {
  const area = await findAreaSummary(vaultPath, slugOrUid, includeArchived);
  if (!area) throw new Error(`area_not_found:${slugOrUid}`);
  return area;
}

function normalizeAreaConfig(config: AreaConfig): AreaConfig {
  return {
    uid: config.uid,
    slug: config.slug,
    name: config.name.trim(),
    ...(config.description?.trim() ? { description: config.description.trim() } : {}),
    status: config.status === 'dormant' || config.status === 'archived' ? config.status : 'active',
    ...(config.template ? { template: config.template } : {}),
    tags: normalizeTags(config.tags),
    created_at: config.created_at,
    updated_at: config.updated_at,
    ...(config.vision_refs?.length ? { vision_refs: normalizeTags(config.vision_refs) } : {})
  };
}

function normalizeTags(value: unknown[]): string[] {
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
}

function normalizeAreaRef(area: AreaRef): AreaRef {
  return {
    area_slug: area.area_slug.trim(),
    ...(area.primary ? { primary: true } : {}),
    assigned_at: area.assigned_at || new Date().toISOString(),
    assigned_by: area.assigned_by === 'synthesis' ? 'synthesis' : 'user'
  };
}

function addAreaRef(areas: AreaRef[], ref: AreaRef): AreaRef[] {
  const next = areas.filter((area) => area.area_slug !== ref.area_slug);
  if (ref.primary) {
    return [...next.map((area) => ({ ...area, primary: false })), ref];
  }
  return [...next, ref];
}

function hasArea(areas: NoteAreaRef[] | undefined, slug: string): boolean {
  return Boolean(areas?.some((area) => area.area_slug === slug));
}

async function updateEntityAreas(
  vaultPath: string,
  entity: AreaEntityRef,
  update: (areas: AreaRef[]) => AreaRef[],
  area: AreaConfig
): Promise<void> {
  if (entity.kind === 'note') {
    const store = createNoteStore(vaultPath);
    const note = await store.get(entity.id);
    if (!note) throw new Error(`note_not_found:${entity.id}`);
    await store.update(entity.id, { areas: update(note.frontmatter.areas ?? []) });
    return;
  }
  if (entity.kind === 'library_item') {
    const store = createLibraryStore(vaultPath);
    const item = await store.get(entity.id);
    if (!item) throw new Error(`library_item_not_found:${entity.id}`);
    await store.update(entity.id, { areas: update(item.frontmatter.areas ?? []) });
    return;
  }
  if (entity.kind === 'resource') {
    const store = createResourceStore(vaultPath);
    const resource = await store.get(entity.id);
    if (!resource) throw new Error(`resource_not_found:${entity.id}`);
    await store.update(entity.id, { areas: update(resource.frontmatter.areas ?? []) });
    return;
  }
  if (entity.kind === 'feed_source') {
    const store = createFeedStore(vaultPath);
    const source = (await store.listSources()).find((item) => item.id === entity.id);
    if (!source) throw new Error(`feed_source_not_found:${entity.id}`);
    await store.updateSource(entity.id, { areas: update(source.areas ?? []) });
    return;
  }
  if (entity.kind === 'project') {
    await updateProjectArea(vaultPath, entity.id, update, area);
    return;
  }
  if (entity.kind === 'task') {
    await updateTaskArea(vaultPath, entity.id, update, area);
    return;
  }
  if (entity.kind === 'scheduled_task') {
    const store = createScheduledTaskStore(vaultPath);
    const task = await store.get(entity.id);
    if (!task) throw new Error(`scheduled_task_not_found:${entity.id}`);
    const nextAreas = update(task.para_ref?.startsWith('area:') ? [{ area_slug: task.para_ref.slice('area:'.length), assigned_at: task.updated_at, assigned_by: 'user' }] : []);
    await store.update(entity.id, { para_ref: nextAreas[0] ? `area:${nextAreas[0].area_slug}` : undefined });
    return;
  }
  throw new Error(`area_assignment_unsupported_entity:${entity.kind}`);
}

async function updateProjectArea(
  vaultPath: string,
  id: string,
  update: (areas: AreaRef[]) => AreaRef[],
  area: AreaConfig
): Promise<void> {
  const project = (await listProjects(vaultPath)).find((item) => item.uid === id || item.slug === id);
  if (!project) throw new Error(`project_not_found:${id}`);
  const raw = await fs.readFile(project.readmePath, 'utf8');
  const parsed = frontmatter.read(raw);
  const currentAreas = areaRefsFromUnknown(parsed.data['areas']);
  if (typeof parsed.data['area_uid'] === 'string') {
    const existing = await findAreaByUid(vaultPath, parsed.data['area_uid']);
    if (existing && !currentAreas.some((ref) => ref.area_slug === existing.slug)) {
      currentAreas.push({ area_slug: existing.slug, primary: true, assigned_at: new Date(0).toISOString(), assigned_by: 'user' });
    }
  }
  const nextAreas = update(currentAreas);
  const primary = nextAreas.find((ref) => ref.primary) ?? nextAreas.find((ref) => ref.area_slug === area.slug) ?? nextAreas[0];
  const primaryArea = primary ? await findAreaSummary(vaultPath, primary.area_slug) : null;
  const upd = frontmatter.update(raw, {
    area_uid: primaryArea?.uid,
    areas: nextAreas.length ? nextAreas : undefined
  });
  if (upd.changed) await fs.writeFile(project.readmePath, upd.content, 'utf8');
}

async function updateTaskArea(
  vaultPath: string,
  id: string,
  update: (areas: AreaRef[]) => AreaRef[],
  area: AreaConfig
): Promise<void> {
  const tasks = await listAllTasks(vaultPath);
  const task = tasks.find((item) => item.uid === id || item.id === id);
  if (!task || task.source !== 'file') throw new Error(`task_not_found:${id}`);
  const raw = await fs.readFile(task.filePath, 'utf8');
  const parsed = frontmatter.read(raw);
  const currentAreas = areaRefsFromUnknown(parsed.data['areas']);
  if (typeof parsed.data['area_uid'] === 'string') {
    const existing = await findAreaByUid(vaultPath, parsed.data['area_uid']);
    if (existing && !currentAreas.some((ref) => ref.area_slug === existing.slug)) {
      currentAreas.push({ area_slug: existing.slug, primary: true, assigned_at: new Date(0).toISOString(), assigned_by: 'user' });
    }
  }
  const nextAreas = update(currentAreas);
  const primary = nextAreas.find((ref) => ref.primary) ?? nextAreas.find((ref) => ref.area_slug === area.slug) ?? nextAreas[0];
  const primaryArea = primary ? await findAreaSummary(vaultPath, primary.area_slug) : null;
  const upd = frontmatter.update(raw, {
    area_uid: primaryArea?.uid,
    areas: nextAreas.length ? nextAreas : undefined
  });
  if (upd.changed) await fs.writeFile(task.filePath, upd.content, 'utf8');
}

function areaRefsFromUnknown(value: unknown): AreaRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AreaRef[] => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record['area_slug'] !== 'string' || !record['area_slug'].trim()) return [];
    return [
      {
        area_slug: record['area_slug'].trim(),
        ...(record['primary'] === true ? { primary: true } : {}),
        assigned_at: typeof record['assigned_at'] === 'string' ? record['assigned_at'] : new Date().toISOString(),
        assigned_by: record['assigned_by'] === 'synthesis' ? 'synthesis' : 'user'
      }
    ];
  });
}

async function listAllTasks(vaultPath: string): Promise<TaskRecord[]> {
  const tasks: TaskRecord[] = [];
  for await (const abs of walkMarkdown(vaultPath)) {
    try {
      const content = await fs.readFile(abs, 'utf8');
      tasks.push(...tasksOfFile(abs, toPosix(vaultRel(vaultPath, abs)), content));
    } catch {
      // Ignore unreadable markdown files during dashboard projection.
    }
  }
  return tasks;
}

async function buildUnassignedQueue(
  vaultPath: string,
  projects: ProjectSummary[],
  feedSources: FeedSource[]
): Promise<AreaEntityRef[]> {
  const [notes, libraryItems, resources] = await Promise.all([
    createNoteStore(vaultPath).list(),
    createLibraryStore(vaultPath).list(),
    createResourceStore(vaultPath).list()
  ]);
  return [
    ...notes.filter((note) => (note.frontmatter.areas ?? []).length === 0).slice(0, 6).map((note) => ({
      kind: 'note' as const,
      id: note.frontmatter.id,
      title: note.frontmatter.title
    })),
    ...libraryItems.filter((item) => (item.frontmatter.areas ?? []).length === 0).slice(0, 6).map((item) => ({
      kind: 'library_item' as const,
      id: item.frontmatter.id,
      title: item.frontmatter.title
    })),
    ...resources.filter((resource) => (resource.frontmatter.areas ?? []).length === 0).slice(0, 6).map((resource) => ({
      kind: 'resource' as const,
      id: resource.frontmatter.slug,
      title: resource.frontmatter.title
    })),
    ...projects.filter((project) => !project.area_uid && !(project.area_slugs ?? []).length).slice(0, 6).map((project) => ({
      kind: 'project' as const,
      id: project.uid,
      title: project.name
    })),
    ...feedSources.filter((source) => (source.areas ?? []).length === 0).slice(0, 6).map((source) => ({
      kind: 'feed_source' as const,
      id: source.id,
      title: source.title
    }))
  ].slice(0, 20);
}

function computeAreaHealth(
  stats: AreaDashboardData['stats'],
  latestNoteUpdated?: string,
  latestResourceEngaged?: string
): AreaHealth {
  let score = 45;
  const reasons: string[] = [];
  if (stats.active_projects > 0) {
    score += 15;
    reasons.push(`${stats.active_projects} active project(s)`);
  }
  if (stats.resources > 0) {
    score += 12;
    reasons.push(`${stats.resources} related resource(s)`);
  }
  if (stats.recent_notes > 0) {
    score += 10;
    reasons.push(`${stats.recent_notes} note(s) assigned`);
  }
  if (stats.scheduled_reviews > 0) {
    score += 8;
    reasons.push('scheduled review exists');
  }
  if (latestNoteUpdated || latestResourceEngaged) reasons.push('recent activity present');
  if (stats.unassigned_candidates > 0) {
    score -= Math.min(15, stats.unassigned_candidates);
    reasons.push(`${stats.unassigned_candidates} unassigned candidate(s) to triage`);
  }
  const clamped = Math.max(0, Math.min(100, score));
  return {
    score: clamped,
    state: clamped >= 70 ? 'healthy' : clamped >= 45 ? 'watch' : 'stale',
    reasons: reasons.length ? reasons : ['Area has little linked activity yet']
  };
}

interface EntityContext {
  source: SynthesisSource;
  title: string;
  text: string;
  tags: string[];
}

async function resolveEntityContext(vaultPath: string, entity: AreaEntityRef): Promise<EntityContext> {
  if (entity.kind === 'note') {
    const note = await createNoteStore(vaultPath).get(entity.id);
    if (!note) throw new Error(`note_not_found:${entity.id}`);
    return {
      source: { kind: 'note', ref: note.frontmatter.id, title: note.frontmatter.title, excerpt: note.body.slice(0, 500), metadata: { tags: note.frontmatter.tags } },
      title: note.frontmatter.title ?? entity.title ?? entity.id,
      text: note.body,
      tags: note.frontmatter.tags
    };
  }
  if (entity.kind === 'library_item') {
    const item = await createLibraryStore(vaultPath).get(entity.id);
    if (!item) throw new Error(`library_item_not_found:${entity.id}`);
    return {
      source: { kind: 'library', ref: item.frontmatter.id, title: item.frontmatter.title, excerpt: item.body.slice(0, 500), metadata: { tags: item.frontmatter.tags } },
      title: item.frontmatter.title,
      text: item.body,
      tags: item.frontmatter.tags
    };
  }
  if (entity.kind === 'resource') {
    const resource = await createResourceStore(vaultPath).get(entity.id);
    if (!resource) throw new Error(`resource_not_found:${entity.id}`);
    return {
      source: { kind: 'resource', ref: resource.frontmatter.slug, title: resource.frontmatter.title, excerpt: resource.body.slice(0, 500), metadata: { tags: resource.frontmatter.tags } },
      title: resource.frontmatter.title,
      text: resource.body,
      tags: resource.frontmatter.tags
    };
  }
  if (entity.kind === 'project') {
    const project = (await listProjects(vaultPath)).find((item) => item.uid === entity.id || item.slug === entity.id);
    if (!project) throw new Error(`project_not_found:${entity.id}`);
    const body = await fs.readFile(project.readmePath, 'utf8').catch(() => '');
    return {
      source: { kind: 'project', ref: project.uid, title: project.name, excerpt: body.slice(0, 500), metadata: { tags: project.tags ?? [] } },
      title: project.name,
      text: body,
      tags: project.tags ?? []
    };
  }
  if (entity.kind === 'feed_source') {
    const source = (await createFeedStore(vaultPath).listSources()).find((item) => item.id === entity.id);
    if (!source) throw new Error(`feed_source_not_found:${entity.id}`);
    return {
      source: { kind: 'feed', ref: source.id, title: source.title, excerpt: source.url, metadata: { kind: source.kind } },
      title: source.title,
      text: `${source.title} ${source.url}`,
      tags: []
    };
  }
  return {
    source: { kind: 'raw', ref: entity.id, title: entity.title, metadata: { entity_kind: entity.kind } },
    title: entity.title ?? entity.id,
    text: entity.title ?? entity.id,
    tags: []
  };
}

function scoreAreaSuggestion(area: AreaSummaryDTO, entity: EntityContext): { confidence: number; reason: string } {
  const haystack = `${entity.title} ${entity.text} ${entity.tags.join(' ')}`.toLowerCase();
  const tokens = [area.slug, area.name, ...area.tags].map((item) => item.toLowerCase()).filter((item) => item.length >= 3);
  const hits = tokens.filter((token) => haystack.includes(token));
  if (hits.length === 0) return { confidence: 0, reason: 'No visible overlap with area name or tags.' };
  const confidence = Math.min(0.95, 0.35 + hits.length * 0.18 + (entity.tags.some((tag) => area.tags.includes(tag)) ? 0.18 : 0));
  return {
    confidence: Number(confidence.toFixed(2)),
    reason: `Matched ${hits.slice(0, 3).join(', ')} in title/body/tags.`
  };
}
