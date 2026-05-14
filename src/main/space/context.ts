import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SpaceContextBundle, SpaceContextOptions, SpaceFrontmatter, SpaceOutputSummary, SpaceSummary, SpaceType } from '@shared/space';
import type { TaskRecord } from '@shared/schemas';
import { SPACE_OUTPUTS_DIR } from '@shared/constants';
import { listProjects } from '../project';
import { listAreas } from '../area';
import { createResourceStore } from '../resource/store';
import { currentSession } from '../fs';
import { materializeTaskGraph } from '../orchestration/task_graph';
import * as frontmatter from '../frontmatter';
import { toPosix, vaultRel } from '../pathGuard';
import { ensureSpaceLayout } from './layout';
import { readAssetManifest } from '../assets/manifest';

interface ResolvedSpace {
  root: string;
  relPath: string;
  frontmatter: SpaceFrontmatter;
  descriptionPath?: string;
}

export async function buildSpaceContext(
  vaultPath: string,
  spaceId: string,
  options: SpaceContextOptions = {}
): Promise<SpaceContextBundle> {
  const resolved = await resolveSpace(vaultPath, spaceId);
  if (!resolved) throw new Error(`space not found: ${spaceId}`);
  await ensureSpaceLayout(resolved.root);
  const sections = new Set(options.sections ?? ['info', 'tasks', 'materials', 'outputs', 'conversations', 'relations']);
  const materials = sections.has('materials')
    ? await readAssetManifest(resolved.root)
    : { schema_version: 1 as const, scopes: [], pins: [] };
  const tasks = sections.has('tasks') ? taskBucket(resolved.frontmatter) : taskBucket(resolved.frontmatter, []);
  return {
    space: resolved.frontmatter,
    info: sections.has('info')
      ? {
          description: await readDescription(resolved.descriptionPath),
          notes: await listMarkdownNotes(vaultPath, resolved.root, options.summary ? 6 : 20)
        }
      : { description: '', notes: [] },
    tasks,
    materials: {
      scopes: options.summary ? materials.scopes.slice(0, 10) : materials.scopes,
      pins: options.summary ? materials.pins.slice(0, 10) : materials.pins
    },
    outputs: sections.has('outputs') ? await listOutputs(resolved.root, options.summary ? 10 : 50) : [],
    recent_conversations: [],
    linked_from: [],
    related_spaces: relatedSpaces(resolved.frontmatter)
  };
}

export async function listSpaces(vaultPath: string, filter: { type?: SpaceType } = {}): Promise<SpaceSummary[]> {
  const projects = filter.type && filter.type !== 'project' ? [] : await listProjects(vaultPath);
  const areas = filter.type && filter.type !== 'area' ? [] : await listAreas(vaultPath, { includeArchived: true });
  const resources = filter.type && filter.type !== 'resource' ? [] : await createResourceStore(vaultPath).list({ include_archived: true });
  return [
    ...projects.map((project): SpaceSummary => ({
      space: {
        uid: project.uid,
        slug: project.slug,
        name: project.name,
        type: 'project',
        status: project.status === 'archived' ? 'archived' : project.status === 'done' ? 'done' : 'active',
        created_at: project.created_at ?? new Date(0).toISOString(),
        updated_at: project.created_at ?? new Date(0).toISOString(),
        tags: project.tags ?? [],
        ...(project.area_uid ? { primary_area_uid: project.area_uid } : {}),
        execution_context: project.execution_context ?? 'worktree',
        workdir: {
          path: project.workdirPath,
          ...(project.workdirMissing ? { missing: true } : {})
        }
      },
      path: project.path,
      relPath: project.relPath
    })),
    ...areas.map((area): SpaceSummary => ({
      space: {
        uid: area.uid,
        slug: area.slug,
        name: area.name,
        type: 'area',
        status: area.status === 'archived' ? 'archived' : area.status === 'dormant' ? 'dormant' : 'active',
        created_at: area.created_at,
        updated_at: area.updated_at,
        tags: area.tags ?? [],
        review_cadence: 'monthly'
      },
      path: area.path,
      relPath: area.relPath
    })),
    ...resources.map((resource): SpaceSummary => ({
      space: {
        uid: resource.frontmatter.id,
        slug: resource.frontmatter.slug,
        name: resource.frontmatter.title,
        type: 'resource',
        status: resource.frontmatter.status === 'archived' ? 'archived' : resource.frontmatter.status === 'dormant' ? 'dormant' : 'active',
        created_at: resource.frontmatter.created,
        updated_at: resource.frontmatter.updated,
        tags: resource.frontmatter.tags,
        depth_stage: resource.frontmatter.depth
      },
      path: path.join(vaultPath, resource.path),
      relPath: resource.path
    }))
  ].sort((a, b) => a.space.name.localeCompare(b.space.name));
}

export async function getSpace(vaultPath: string, spaceId: string): Promise<SpaceSummary | null> {
  const resolved = await resolveSpace(vaultPath, spaceId);
  if (!resolved) return null;
  return {
    space: resolved.frontmatter,
    path: resolved.root,
    relPath: resolved.relPath
  };
}

async function resolveSpace(vaultPath: string, spaceId: string): Promise<ResolvedSpace | null> {
  const projects = await listProjects(vaultPath);
  const project = projects.find((item) => item.uid === spaceId || item.slug === spaceId);
  if (project) {
    return {
      root: project.path,
      relPath: project.relPath,
      descriptionPath: project.readmePath,
      frontmatter: {
        uid: project.uid,
        slug: project.slug,
        name: project.name,
        type: 'project',
        status: project.status === 'archived' ? 'archived' : project.status === 'done' ? 'done' : 'active',
        created_at: project.created_at ?? new Date(0).toISOString(),
        updated_at: project.created_at ?? new Date(0).toISOString(),
        ...(project.archived_at ? { archived_at: project.archived_at } : {}),
        ...(project.area_uid ? { primary_area_uid: project.area_uid } : {}),
        tags: project.tags ?? [],
        execution_context: project.execution_context ?? 'worktree',
        workdir: {
          path: project.workdirPath,
          ...(project.workdirMissing ? { missing: true } : {})
        }
      }
    };
  }

  const area = (await listAreas(vaultPath, { includeArchived: true })).find(
    (item) => item.uid === spaceId || item.slug === spaceId
  );
  if (area) {
    return {
      root: area.path,
      relPath: area.relPath,
      descriptionPath: path.join(area.path, 'README.md'),
      frontmatter: {
        uid: area.uid,
        slug: area.slug,
        name: area.name,
        type: 'area',
        status: area.status === 'archived' ? 'archived' : area.status === 'dormant' ? 'dormant' : 'active',
        created_at: area.created_at,
        updated_at: area.updated_at,
        tags: area.tags ?? [],
        review_cadence: 'monthly'
      }
    };
  }

  const resource = await createResourceStore(vaultPath).get(spaceId);
  if (resource) {
    const root = path.dirname(path.join(vaultPath, resource.path));
    return {
      root,
      relPath: toPosix(vaultRel(vaultPath, root)),
      descriptionPath: path.join(root, 'index.md'),
      frontmatter: {
        uid: resource.frontmatter.id,
        slug: resource.frontmatter.slug,
        name: resource.frontmatter.title,
        type: 'resource',
        status: resource.frontmatter.status === 'archived' ? 'archived' : resource.frontmatter.status === 'dormant' ? 'dormant' : 'active',
        created_at: resource.frontmatter.created,
        updated_at: resource.frontmatter.updated,
        tags: resource.frontmatter.tags,
        depth_stage: resource.frontmatter.depth
      }
    };
  }

  return null;
}

function taskBucket(space: SpaceFrontmatter, sourceTasks?: TaskRecord[]): SpaceContextBundle['tasks'] {
  const session = currentSession();
  const all = sourceTasks ?? (session ? materializeTaskGraph(session.tasks.allTasks()) : []);
  const scoped = all.filter((task) => {
    if (space.type === 'project') return task.project_uid === space.uid;
    if (space.type === 'area') return task.area_uid === space.uid;
    if (space.type === 'resource') return task.resource_uid === space.uid || task.resource_uid === space.slug;
    return false;
  });
  return {
    todo: scoped.filter((task) => task.status === 'todo' || task.status === 'backlog' || task.status === 'waiting'),
    doing: scoped.filter((task) => task.status === 'doing'),
    awaiting_user: scoped.filter((task) => task.status === 'blocked'),
    done_recent: scoped.filter((task) => task.status === 'done').slice(-10)
  };
}

async function readDescription(descriptionPath?: string): Promise<string> {
  if (!descriptionPath) return '';
  try {
    const raw = await fs.readFile(descriptionPath, 'utf8');
    return frontmatter.read(raw).body.trim().slice(0, 4_000);
  } catch {
    return '';
  }
}

async function listMarkdownNotes(vaultPath: string, root: string, limit: number) {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !['README.md', 'index.md'].includes(entry.name))
    .slice(0, limit)
    .map((entry) => ({
      title: entry.name.replace(/\.md$/, ''),
      path: toPosix(vaultRel(vaultPath, path.join(root, entry.name)))
    }));
}

async function listOutputs(root: string, limit: number): Promise<SpaceOutputSummary[]> {
  const manifestPath = path.join(root, SPACE_OUTPUTS_DIR, '_manifest.md');
  const raw = await fs.readFile(manifestPath, 'utf8').catch(() => '');
  if (raw) {
    const { data } = frontmatter.read(raw);
    if (Array.isArray(data['outputs'])) {
      return data['outputs'].slice(0, limit).filter(isRecord).map((item, index) => ({
        id: stringValue(item['id']) ?? `output-${index + 1}`,
        title: stringValue(item['title']) ?? stringValue(item['path']) ?? `Output ${index + 1}`,
        ...(typeof item['kind'] === 'string' ? { kind: item['kind'] } : {}),
        ...(typeof item['status'] === 'string' ? { status: item['status'] } : {}),
        path: stringValue(item['path']) ?? '',
        ...(typeof item['created_at'] === 'string' ? { created_at: item['created_at'] } : {}),
        ...(typeof item['published_at'] === 'string' ? { published_at: item['published_at'] } : {}),
        ...(Array.isArray(item['tags']) ? { tags: item['tags'].filter((tag): tag is string => typeof tag === 'string') } : {})
      }));
    }
  }
  const outputDir = path.join(root, SPACE_OUTPUTS_DIR);
  const entries = await fs.readdir(outputDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => !entry.name.startsWith('_') && !entry.name.startsWith('.'))
    .slice(0, limit)
    .map((entry) => ({
      id: entry.name.replace(/\.[^.]+$/, ''),
      title: entry.name,
      path: path.posix.join(SPACE_OUTPUTS_DIR, entry.name)
    }));
}

function relatedSpaces(space: SpaceFrontmatter): SpaceContextBundle['related_spaces'] {
  const related: SpaceContextBundle['related_spaces'] = [];
  if (space.primary_area_uid) {
    related.push({
      space_uid: space.primary_area_uid,
      type: 'area',
      relation: 'primary_area'
    });
  }
  for (const areaUid of space.secondary_area_uids ?? []) {
    related.push({ space_uid: areaUid, type: 'area', relation: 'secondary_area' });
  }
  return related;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
