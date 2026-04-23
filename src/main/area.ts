import { promises as fs } from 'node:fs';
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
import type { AreaConfig } from '@shared/schemas';
import type { AreaSummaryDTO, CreateAreaArgsDTO, CreateAreaResultDTO } from '@shared/ipc';
import { newUid as generateUid } from './uid';
import { getVisionAreaTemplateFiles } from './templates/vision-area';

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function parseAreaConfig(raw: unknown): AreaConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid area config');
  }
  const r = raw as Record<string, unknown>;
  return {
    uid: typeof r['uid'] === 'string' ? r['uid'] : '',
    slug: typeof r['slug'] === 'string' ? r['slug'] : '',
    name: typeof r['name'] === 'string' ? r['name'] : '',
    template: typeof r['template'] === 'string' ? r['template'] : undefined,
    tags: Array.isArray(r['tags']) ? (r['tags'] as string[]).filter((t) => typeof t === 'string') : [],
    created_at: typeof r['created_at'] === 'string' ? r['created_at'] : new Date().toISOString()
  };
}

export async function readAreaConfig(areaPath: string): Promise<AreaConfig | null> {
  const cfgPath = path.join(areaPath, AREA_ORBIT_DIR, AREA_ORBIT_CONFIG);
  try {
    const raw = await fs.readFile(cfgPath, 'utf8');
    return parseAreaConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeAreaConfig(areaPath: string, config: AreaConfig): Promise<void> {
  const cfgPath = path.join(areaPath, AREA_ORBIT_DIR, AREA_ORBIT_CONFIG);
  await fs.mkdir(path.dirname(cfgPath), { recursive: true });
  await fs.writeFile(cfgPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

export async function listAreas(vaultPath: string): Promise<AreaSummaryDTO[]> {
  const areasDir = path.join(vaultPath, AREAS_DIR);
  const results: AreaSummaryDTO[] = [];
  let entries: string[];
  try {
    const dirents = await fs.readdir(areasDir, { withFileTypes: true });
    entries = dirents
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name);
  } catch {
    return [];
  }
  for (const entry of entries) {
    const areaPath = path.join(areasDir, entry);
    const config = await readAreaConfig(areaPath);
    if (!config) continue;
    const hasVision = await fileExists(path.join(areaPath, 'VISION.md'));
    results.push({
      uid: config.uid,
      slug: config.slug,
      name: config.name,
      template: config.template,
      tags: config.tags,
      created_at: config.created_at,
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

  await fs.mkdir(areaPath, { recursive: true });
  await fs.mkdir(path.join(areaPath, AREA_ORBIT_DIR, AREA_ORBIT_AGENT_DIR, AREA_ORBIT_SESSIONS_DIR), { recursive: true });
  await fs.mkdir(path.join(areaPath, AREA_ORBIT_DIR, AREA_ORBIT_AGENT_DIR, AREA_ORBIT_TASKS_DIR), { recursive: true });
  await fs.mkdir(path.join(areaPath, AREA_ORBIT_DIR, AREA_ORBIT_AGENT_DIR, AREA_ORBIT_MEMORIES_DIR), { recursive: true });

  const config: AreaConfig = {
    uid,
    slug,
    name: args.name,
    template: args.template,
    tags: args.tags ?? [],
    created_at: createdAt
  };
  await writeAreaConfig(areaPath, config);

  if (args.template === VISION_AREA_SLUG) {
    await scaffoldVisionFiles(areaPath, { name: args.name, slug, uid });
  } else {
    await fs.writeFile(
      path.join(areaPath, 'README.md'),
      `# ${args.name}\n\n`,
      'utf8'
    );
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
  await fs.mkdir(path.join(areaPath, AREA_ORBIT_DIR, AREA_ORBIT_AGENT_DIR, AREA_ORBIT_SESSIONS_DIR), { recursive: true });
  await fs.mkdir(path.join(areaPath, AREA_ORBIT_DIR, AREA_ORBIT_AGENT_DIR, AREA_ORBIT_TASKS_DIR), { recursive: true });
  await fs.mkdir(path.join(areaPath, AREA_ORBIT_DIR, AREA_ORBIT_AGENT_DIR, AREA_ORBIT_MEMORIES_DIR), { recursive: true });

  const config: AreaConfig = {
    uid,
    slug: VISION_AREA_SLUG,
    name,
    template: VISION_AREA_SLUG,
    tags: [],
    created_at: createdAt
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
  const updated: AreaConfig = { ...current, ...patch };
  await writeAreaConfig(areaPath, updated);
  return updated;
}
