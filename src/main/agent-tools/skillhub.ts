import type {
  SkillStoreDetail,
  SkillStoreItem,
  SkillStoreSearchInput,
  SkillStoreSearchResult
} from '@shared/agent-tools';

const SKILLHUB_API_BASE = 'https://api.skillhub.cn';
const DEFAULT_PAGE_SIZE = 24;

export async function searchSkillHub(
  input: SkillStoreSearchInput = {}
): Promise<SkillStoreSearchResult> {
  const page = clampInteger(input.page ?? 1, 1, 1000);
  const pageSize = clampInteger(input.pageSize ?? DEFAULT_PAGE_SIZE, 1, 60);
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize)
  });
  if (input.sortBy) params.set('sortBy', input.sortBy);
  if (input.order) params.set('order', input.order);
  if (input.keyword?.trim()) params.set('keyword', input.keyword.trim());
  if (input.category) params.set('category', input.category);
  if (input.source && input.source !== 'all') params.set('source', input.source);
  if (input.labels) params.set('labels', input.labels);

  const payload = await fetchJson(`${SKILLHUB_API_BASE}/api/skills?${params.toString()}`);
  const root = asRecord(payload);
  if (root['code'] !== 0) {
    throw new Error(`skillhub_error:${String(root['message'] ?? 'unknown')}`);
  }
  const data = asRecord(root['data']);
  const skills = Array.isArray(data['skills']) ? data['skills'] : [];
  return {
    source: 'skillhub',
    page,
    pageSize,
    total: numberValue(data['total']) ?? 0,
    items: skills.map(mapStoreItem).filter((item): item is SkillStoreItem => item !== null)
  };
}

export async function getSkillHubDetail(slug: string): Promise<SkillStoreDetail> {
  const safeSlug = assertStoreSlug(slug);
  const [detail, files, skillMarkdown, readme] = await Promise.all([
    fetchJson(`${SKILLHUB_API_BASE}/api/v1/skills/${encodeURIComponent(safeSlug)}`),
    fetchJson(`${SKILLHUB_API_BASE}/api/v1/skills/${encodeURIComponent(safeSlug)}/files`).catch(
      () => null
    ),
    fetchText(
      `${SKILLHUB_API_BASE}/api/v1/skills/${encodeURIComponent(safeSlug)}/file?path=${encodeURIComponent('SKILL.md')}`
    ).catch(() => undefined),
    fetchText(
      `${SKILLHUB_API_BASE}/api/v1/skills/${encodeURIComponent(safeSlug)}/file?path=${encodeURIComponent('README.md')}`
    ).catch(() => undefined)
  ]);
  const root = asRecord(detail);
  const skillRecord = asRecord(root['skill']);
  const latestVersion = stringValue(asRecord(root['latestVersion'])['version']);
  const item =
    mapStoreItem({
      slug: safeSlug,
      name: skillRecord['displayName'],
      description: skillRecord['summary'],
      description_zh: skillRecord['summary_zh'],
      source: skillRecord['source'],
      iconUrl: skillRecord['iconUrl'],
      category: skillRecord['category'],
      updated_at: skillRecord['updatedAt'],
      version: latestVersion,
      tags: tagsFromRecord(skillRecord['tags']),
      downloads: asRecord(skillRecord['stats'])['downloads'],
      installs: asRecord(skillRecord['stats'])['installs'],
      stars: asRecord(skillRecord['stats'])['stars'],
      score: 0,
      ownerName: asRecord(root['owner'])['handle']
    }) ?? {
      slug: safeSlug,
      name: safeSlug,
      description: '',
      tags: [],
      downloads: 0,
      installs: 0,
      stars: 0,
      score: 0
    };
  const securityReports = asRecord(root['securityReports']);
  const securityStatus =
    stringValue(asRecord(securityReports['keen'])['statusText']) ??
    stringValue(asRecord(securityReports['sanbu'])['statusText']);
  return {
    item,
    ...(readme ? { readme } : {}),
    ...(skillMarkdown ? { skillMarkdown } : {}),
    fileCount: numberValue(asRecord(files)['count']),
    ...(latestVersion ? { latestVersion } : {}),
    ...(securityStatus ? { securityStatus } : {})
  };
}

export function assertStoreSlug(value: string): string {
  const slug = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,160}$/.test(slug) || slug.includes('..')) {
    throw new Error('invalid_skillhub_slug');
  }
  return slug;
}

function mapStoreItem(value: unknown): SkillStoreItem | null {
  const item = asRecord(value);
  const slug = stringValue(item['slug']);
  if (!slug) return null;
  return {
    slug,
    name: stringValue(item['name']) ?? slug,
    description: stringValue(item['description']) ?? '',
    ...(stringValue(item['description_zh']) ? { descriptionZh: stringValue(item['description_zh']) } : {}),
    ...(stringValue(item['ownerName']) ? { ownerName: stringValue(item['ownerName']) } : {}),
    ...(stringValue(item['source']) ? { source: stringValue(item['source']) } : {}),
    ...(stringValue(item['homepage']) ? { homepage: stringValue(item['homepage']) } : {}),
    ...(stringValue(item['iconUrl']) ? { iconUrl: stringValue(item['iconUrl']) } : {}),
    ...(stringValue(item['version']) ? { version: stringValue(item['version']) } : {}),
    ...(stringValue(item['category']) ? { category: stringValue(item['category']) } : {}),
    tags: tagsFromRecord(item['tags']),
    downloads: numberValue(item['downloads']) ?? 0,
    installs: numberValue(item['installs']) ?? 0,
    stars: numberValue(item['stars']) ?? 0,
    score: numberValue(item['score']) ?? 0,
    ...(numberValue(item['updated_at']) ? { updatedAt: numberValue(item['updated_at']) } : {})
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Orbit Skill Store/1.0'
    },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`skillhub_request_failed:${response.status}`);
  return response.json();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: 'text/markdown,text/plain,*/*;q=0.5',
      'user-agent': 'Orbit Skill Store/1.0'
    },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`skillhub_request_failed:${response.status}`);
  return response.text();
}

function tagsFromRecord(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (value && typeof value === 'object') return Object.keys(value);
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value)) return min;
  return Math.max(min, Math.min(max, value));
}
