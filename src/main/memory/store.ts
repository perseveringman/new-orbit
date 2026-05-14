import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import type {
  CreateMemoryInput,
  MemoryCluster,
  MemoryFilter,
  MemoryNode,
  PromoteMemoryToProjectResult,
  PromoteMemoryToResourceResult,
  RecallEvent,
  RecallStats,
  UpdateMemoryInput
} from '@shared/memory';
import { deriveMemoryLayer, deriveMemoryStability, isMemoryKind, isMemoryLayer, isMemoryStability } from '@shared/memory';
import type { SynthesisSource } from '@shared/synthesis';
import { publishTraceableEvent } from '../events/bus';
import { createProject, listProjects } from '../project';
import { createResourceStore } from '../resource/store';

interface MemoryIndexFile {
  version: 1;
  ids: string[];
}

export class MemoryStore {
  constructor(private readonly vaultPath: string) {}

  async list(filter: MemoryFilter = {}): Promise<MemoryNode[]> {
    const index = await this.readIndex();
    const nodes = (await Promise.all(index.ids.map((id) => this.get(id)))).filter((node): node is MemoryNode => Boolean(node));
    const query = filter.query?.trim().toLowerCase();
    return nodes
      .filter((node) => filter.include_archived || !node.archived)
      .filter((node) => !filter.layer || filter.layer === 'all' || node.layer === filter.layer)
      .filter((node) => !filter.kind || filter.kind === 'all' || node.kind === filter.kind)
      .filter((node) => !filter.stability || filter.stability === 'all' || node.stability === filter.stability)
      .filter((node) => !query || memoryText(node).toLowerCase().includes(query))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async get(id: string): Promise<MemoryNode | null> {
    try {
      return normalizeMemory(JSON.parse(await fs.readFile(this.nodePath(id), 'utf8')));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async create(input: CreateMemoryInput): Promise<MemoryNode> {
    const existing = await this.findReusableMemory(input);
    if (existing) {
      return this.update(existing.id, {
        sources: mergeSources(existing.sources, input.sources ?? []),
        evidence_count: Math.max(existing.evidence_count + 1, input.evidence_count ?? 1),
        confidence: Math.max(existing.confidence, input.confidence ?? existing.confidence),
        related_entities: unique([...(existing.related_entities ?? []), ...(input.related_entities ?? [])])
      });
    }

    validateMemoryInput(input);
    const now = new Date().toISOString();
    const node: MemoryNode = {
      id: `mem-${randomUUID()}`,
      layer: input.layer ?? deriveMemoryLayer(input.kind),
      kind: input.kind,
      title: input.title.trim(),
      summary: input.summary.trim(),
      ...(input.detail?.trim() ? { detail: input.detail.trim() } : {}),
      sources: input.sources ?? [],
      evidence_count: input.evidence_count ?? Math.max(1, input.sources?.length ?? 1),
      confidence: clamp01(input.confidence ?? 0.55),
      stability: 'volatile',
      ...(input.related_entities?.length ? { related_entities: unique(input.related_entities) } : {}),
      recall_count: 0,
      created_at: now,
      updated_at: now,
      ...(input.user_confirmed ? { user_confirmed: true } : {})
    };
    node.stability = deriveMemoryStability(node);
    await this.writeNode(node);
    const index = await this.readIndex();
    if (!index.ids.includes(node.id)) index.ids.push(node.id);
    await this.writeIndex(index);
    publishMemoryEvent('memory.created', node);
    return node;
  }

  async update(id: string, patch: UpdateMemoryInput): Promise<MemoryNode> {
    const current = await this.get(id);
    if (!current) throw new Error(`memory_not_found:${id}`);
    if (patch.layer && !isMemoryLayer(patch.layer)) throw new Error(`invalid_memory_layer:${patch.layer}`);
    if (patch.kind && !isMemoryKind(patch.kind)) throw new Error(`invalid_memory_kind:${patch.kind}`);
    if (patch.stability && !isMemoryStability(patch.stability)) throw new Error(`invalid_memory_stability:${patch.stability}`);
    const nextKind = patch.kind ?? current.kind;
    const next: MemoryNode = {
      ...current,
      ...patch,
      layer: patch.layer ?? (patch.kind ? deriveMemoryLayer(nextKind) : current.layer),
      kind: nextKind,
      title: patch.title?.trim() ?? current.title,
      summary: patch.summary?.trim() ?? current.summary,
      confidence: patch.confidence === undefined ? current.confidence : clamp01(patch.confidence),
      evidence_count: patch.evidence_count === undefined ? current.evidence_count : Math.max(0, Math.floor(patch.evidence_count)),
      sources: patch.sources ?? current.sources,
      updated_at: new Date().toISOString()
    };
    next.stability = patch.stability ?? deriveMemoryStability(next);
    await this.writeNode(next);
    publishMemoryEvent('memory.updated', next);
    return next;
  }

  async archive(id: string): Promise<void> {
    const node = await this.update(id, { archived: true });
    publishMemoryEvent('memory.archived', node);
  }

  async merge(fromId: string, toId: string): Promise<MemoryNode> {
    if (fromId === toId) throw new Error('memory_merge_same_id');
    const from = await this.get(fromId);
    const to = await this.get(toId);
    if (!from || !to) throw new Error('memory_not_found');
    const merged = await this.update(toId, {
      summary: [to.summary, from.summary].filter(Boolean).join(' / '),
      detail: [to.detail, from.detail].filter(Boolean).join('\n\n'),
      sources: mergeSources(to.sources, from.sources),
      evidence_count: to.evidence_count + from.evidence_count,
      confidence: Math.max(to.confidence, from.confidence),
      related_entities: unique([...(to.related_entities ?? []), ...(from.related_entities ?? [])])
    });
    await this.archive(fromId);
    publishMemoryEvent('memory.merged', merged, { from_id: fromId, to_id: toId });
    return merged;
  }

  async promoteToResource(memoryId: string): Promise<PromoteMemoryToResourceResult> {
    const memory = await this.requireMemory(memoryId);
    const resource = await createResourceStore(this.vaultPath).create({
      title: memory.title,
      body: `# ${memory.title}\n\n${memory.summary}\n\n${memory.detail ?? ''}`.trim(),
      tags: ['memory', memory.layer, memory.kind]
    });
    const updated = await this.update(memory.id, {
      related_entities: unique([...(memory.related_entities ?? []), `resource:${resource.frontmatter.slug}`])
    });
    publishMemoryEvent('memory.promoted.resource', updated, { resource_slug: resource.frontmatter.slug });
    return { resource, memory: updated };
  }

  async promoteToProject(memoryId: string): Promise<PromoteMemoryToProjectResult> {
    const memory = await this.requireMemory(memoryId);
    const slug = await this.nextProjectSlug(slugify(memory.title));
    const created = await createProject(this.vaultPath, {
      slug,
      template: 'blank',
      name: memory.title,
      description: memory.summary
    });
    const project = (await listProjects(this.vaultPath)).find((item) => item.uid === created.uid);
    const updated = await this.update(memory.id, {
      related_entities: unique([...(memory.related_entities ?? []), `project:${created.uid}`])
    });
    publishMemoryEvent('memory.promoted.project', updated, { project_uid: created.uid });
    return {
      project: {
        uid: created.uid,
        slug,
        name: memory.title,
        relPath: project?.relPath ?? created.relPath
      },
      memory: updated
    };
  }

  async recordRecall(memoryId: string, event: Omit<RecallEvent, 'id' | 'memory_id' | 'occurred_at'> & Partial<Pick<RecallEvent, 'id' | 'occurred_at'>>): Promise<RecallEvent> {
    const node = await this.requireMemory(memoryId);
    const occurredAt = event.occurred_at ?? new Date().toISOString();
    const recall: RecallEvent = {
      id: event.id ?? `recall-${randomUUID()}`,
      memory_id: memoryId,
      triggered_by: event.triggered_by,
      used_in: event.used_in,
      ...(event.was_helpful !== undefined ? { was_helpful: event.was_helpful } : {}),
      occurred_at: occurredAt
    };
    await fs.mkdir(this.recallsDir(), { recursive: true });
    await fs.appendFile(this.recallPath(occurredAt), `${JSON.stringify(recall)}\n`, 'utf8');
    const next: MemoryNode = {
      ...node,
      recall_count: node.recall_count + 1,
      last_recalled_at: occurredAt,
      updated_at: occurredAt
    };
    next.stability = deriveMemoryStability(next);
    await this.writeNode(next);
    publishMemoryEvent('memory.recalled', next, { recall_id: recall.id, used_in: recall.used_in });
    return recall;
  }

  async getRecallStats(memoryId: string): Promise<RecallStats> {
    const events = await this.readRecallEvents();
    const mine = events.filter((event) => event.memory_id === memoryId);
    const byKind: Record<string, number> = {};
    for (const event of mine) byKind[event.triggered_by.kind] = (byKind[event.triggered_by.kind] ?? 0) + 1;
    return { total: mine.length, by_kind: byKind };
  }

  async listClusters(): Promise<MemoryCluster[]> {
    const nodes = await this.list();
    const groups = new Map<string, MemoryNode[]>();
    for (const node of nodes) groups.set(clusterKey(node), [...(groups.get(clusterKey(node)) ?? []), node]);
    return Array.from(groups.entries()).map(([key, memories]) => ({
      id: `cluster-${key}`,
      layer: memories[0]?.layer ?? 'semantic',
      theme: key.split(':')[1]?.replace('_', ' ') ?? key,
      memories: memories.map((memory) => memory.id),
      coherence: Math.min(1, 0.4 + memories.length * 0.1)
    }));
  }

  private async findReusableMemory(input: CreateMemoryInput): Promise<MemoryNode | null> {
    const all = await this.list({ include_archived: false });
    const title = input.title.trim().toLowerCase();
    return all.find((node) => node.kind === input.kind && node.title.toLowerCase() === title) ?? null;
  }

  private async requireMemory(id: string): Promise<MemoryNode> {
    const node = await this.get(id);
    if (!node) throw new Error(`memory_not_found:${id}`);
    return node;
  }

  private memoryDir(): string {
    return path.join(this.vaultPath, ORBIT_DIR, 'memory');
  }

  private nodesDir(): string {
    return path.join(this.memoryDir(), 'nodes');
  }

  private recallsDir(): string {
    return path.join(this.memoryDir(), 'recalls');
  }

  private indexPath(): string {
    return path.join(this.memoryDir(), 'index.json');
  }

  private nodePath(id: string): string {
    return path.join(this.nodesDir(), `${id}.json`);
  }

  private recallPath(iso: string): string {
    return path.join(this.recallsDir(), `${iso.slice(0, 10)}.ndjson`);
  }

  private async readIndex(): Promise<MemoryIndexFile> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.indexPath(), 'utf8')) as Partial<MemoryIndexFile>;
      return { version: 1, ids: Array.isArray(parsed.ids) ? parsed.ids.filter((id): id is string => typeof id === 'string') : [] };
    } catch (error) {
      if (isNotFound(error)) return { version: 1, ids: [] };
      throw error;
    }
  }

  private async writeIndex(index: MemoryIndexFile): Promise<void> {
    await fs.mkdir(this.memoryDir(), { recursive: true });
    await fs.writeFile(this.indexPath(), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  }

  private async writeNode(node: MemoryNode): Promise<void> {
    validateMemoryNode(node);
    await fs.mkdir(this.nodesDir(), { recursive: true });
    await fs.writeFile(this.nodePath(node.id), `${JSON.stringify(node, null, 2)}\n`, 'utf8');
  }

  private async readRecallEvents(): Promise<RecallEvent[]> {
    const files = await fs.readdir(this.recallsDir()).catch((error: unknown) => {
      if (isNotFound(error)) return [];
      throw error;
    });
    const events: RecallEvent[] = [];
    for (const file of files.filter((item) => item.endsWith('.ndjson'))) {
      const raw = await fs.readFile(path.join(this.recallsDir(), file), 'utf8');
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        events.push(JSON.parse(line) as RecallEvent);
      }
    }
    return events;
  }

  private async nextProjectSlug(base: string): Promise<string> {
    const existing = new Set((await listProjects(this.vaultPath)).map((project) => project.slug));
    if (!existing.has(base)) return base;
    for (let i = 2; i < 1000; i += 1) {
      const candidate = `${base}-${i}`;
      if (!existing.has(candidate)) return candidate;
    }
    throw new Error(`project_slug_unavailable:${base}`);
  }
}

export function createMemoryStore(vaultPath: string): MemoryStore {
  return new MemoryStore(vaultPath);
}

function normalizeMemory(value: unknown): MemoryNode {
  const raw = value as MemoryNode;
  const node: MemoryNode = {
    ...raw,
    layer: raw.layer ?? deriveMemoryLayer(raw.kind)
  };
  validateMemoryNode(node);
  return node;
}

function validateMemoryInput(input: CreateMemoryInput): void {
  if (input.layer && !isMemoryLayer(input.layer)) throw new Error(`invalid_memory_layer:${String(input.layer)}`);
  if (!isMemoryKind(input.kind)) throw new Error(`invalid_memory_kind:${String(input.kind)}`);
  if (!input.title.trim()) throw new Error('memory_title_required');
  if (!input.summary.trim()) throw new Error('memory_summary_required');
}

function validateMemoryNode(node: MemoryNode): void {
  if (!node?.id?.startsWith('mem-')) throw new Error('invalid_memory_id');
  if (!isMemoryLayer(node.layer)) throw new Error(`invalid_memory_layer:${String(node.layer)}`);
  if (!isMemoryKind(node.kind)) throw new Error(`invalid_memory_kind:${String(node.kind)}`);
  if (!isMemoryStability(node.stability)) throw new Error(`invalid_memory_stability:${String(node.stability)}`);
  if (!node.title.trim()) throw new Error('memory_title_required');
  if (!node.summary.trim()) throw new Error('memory_summary_required');
  if (node.confidence < 0 || node.confidence > 1) throw new Error('memory_confidence_out_of_range');
}

function mergeSources(a: SynthesisSource[], b: SynthesisSource[]): SynthesisSource[] {
  const seen = new Set<string>();
  return [...a, ...b].filter((source) => {
    const key = `${source.kind}:${source.ref ?? ''}:${source.title ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function memoryText(node: MemoryNode): string {
  return [node.layer, node.kind, node.title, node.summary, node.detail, node.related_entities?.join(' ')].filter(Boolean).join('\n');
}

function clusterKey(node: MemoryNode): string {
  return `${node.layer}:${node.kind}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-')
    .slice(0, 48) || 'memory-project';
}

function publishMemoryEvent(type: string, memory: MemoryNode, extra: Record<string, unknown> = {}): void {
  publishTraceableEvent({
    source: 'synthesis',
    type,
    summary: `${memory.kind}: ${memory.title}`,
    payload: { memory_id: memory.id, layer: memory.layer, kind: memory.kind, stability: memory.stability, ...extra }
  });
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT');
}
