import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  CreateMemoryInput,
  HyMemoryBackendConfig,
  MemoryBackendDescriptor,
  MemoryFilter,
  MemoryKind,
  MemoryLayer,
  MemoryNode,
  RecallOptions,
  RecallResult,
  UpdateMemoryInput
} from '@shared/memory';
import type { SynthesisSource } from '@shared/synthesis';
import { createProject, listProjects } from '../project';
import { createResourceStore } from '../resource/store';
import { buildHyMemoryServerEnv } from '../ai-config/hy-memory-env';
import type { MemoryBackend } from './backend-types';
import { resolveHyMemoryPython } from './hy-memory-runtime';

interface HyManifest {
  id?: string;
  name?: string;
  version?: string;
  kind?: string;
  contracts?: { tools?: string[] };
}

interface HyMemoryRaw {
  memory_id?: string;
  id?: string;
  content?: string;
  text?: string;
  layer?: string;
  score?: number;
  confidence?: number;
  created_at?: string;
  updated_at?: string;
  gmt_created?: number;
  metadata?: Record<string, unknown>;
}

interface HyListResponse {
  total?: number;
  memories?: HyMemoryRaw[] | Record<string, HyMemoryRaw[]>;
}

interface HyAddResponse {
  success?: boolean;
  memory_id?: string;
  id?: string;
  error_message?: string;
}

interface HyUpdateResponse {
  success?: boolean;
  error_message?: string;
}

let serverProcess: ChildProcessWithoutNullStreams | null = null;

export class HyMemoryBackend implements MemoryBackend {
  private readonly baseUrl: string;

  constructor(
    private readonly vaultPath: string,
    private readonly config: HyMemoryBackendConfig
  ) {
    this.baseUrl = config.serverUrl.replace(/\/+$/, '');
  }

  async descriptor(): Promise<MemoryBackendDescriptor> {
    const [manifest, ready] = await Promise.all([this.readManifest(), this.healthCheck()]);
    return this.buildDescriptor(manifest, ready);
  }

  async test(): Promise<MemoryBackendDescriptor> {
    if (!(await this.healthCheck())) await this.ensureServerReady();
    const [manifest, ready] = await Promise.all([this.readManifest(), this.healthCheck()]);
    return this.buildDescriptor(manifest, ready);
  }

  async dispose(): Promise<void> {
    if (!serverProcess) return;
    serverProcess.kill();
    serverProcess = null;
  }

  async list(filter: MemoryFilter = {}): Promise<MemoryNode[]> {
    if (filter.query?.trim()) {
      return (await this.recall(filter.query, { max_memories: 50 })).memories.filter((memory) => matchesFilter(memory, { ...filter, query: undefined }));
    }
    const result = await this.request<HyListResponse>('POST', '/api/v1/list', {
      user_id: this.config.userId,
      agent_id: this.config.agentId,
      limit: 200
    });
    const direct = flattenHyMemories(result.memories).map((memory) => this.toMemoryNode(memory)).filter((memory) => matchesFilter(memory, filter));
    if (direct.length) return direct;
    return (await this.syncedMemories()).filter((memory) => matchesFilter(memory, filter));
  }

  async get(id: string): Promise<MemoryNode | null> {
    try {
      const raw = await this.request<HyMemoryRaw>('GET', `/api/v1/memories/${encodeURIComponent(stripHyId(id))}`);
      return this.toMemoryNode(raw);
    } catch (error) {
      if (String(error).includes('HTTP 404')) return null;
      throw error;
    }
  }

  async create(input: CreateMemoryInput): Promise<MemoryNode> {
    const text = withOrbitSourceMarkers([input.title, input.summary, input.detail].filter(Boolean).join('\n\n'), input.sources);
    const result = await this.request<HyAddResponse>('POST', '/api/v1/add', {
      user_id: this.config.userId,
      agent_id: this.config.agentId,
      session_id: this.config.sessionId,
      enable_agent: true,
      text
    });
    if (result.success === false) throw new Error(result.error_message ?? 'hy_memory_add_failed');
    const id = result.memory_id ?? result.id;
    if (id) {
      const stored = await this.get(id);
      if (stored) return stored;
    }
    return fallbackMemoryNode(`hy:${id ?? Date.now()}`, text, input);
  }

  async update(id: string, patch: UpdateMemoryInput): Promise<MemoryNode> {
    const current = await this.get(id);
    if (!current) throw new Error(`memory_not_found:${id}`);
    const content = [
      patch.title ?? current.title,
      patch.summary ?? current.summary,
      patch.detail ?? current.detail
    ].filter(Boolean).join('\n\n');
    const result = await this.request<HyUpdateResponse>('PUT', `/api/v1/memories/${encodeURIComponent(stripHyId(id))}`, {
      content: withOrbitSourceMarkers(content, patch.sources ?? current.sources)
    });
    if (result.success === false) throw new Error(result.error_message ?? 'hy_memory_update_failed');
    return (await this.get(id)) ?? { ...current, summary: patch.summary ?? current.summary, updated_at: new Date().toISOString() };
  }

  async archive(id: string): Promise<void> {
    await this.request<unknown>('DELETE', `/api/v1/memories/${encodeURIComponent(stripHyId(id))}`);
  }

  async merge(fromId: string, toId: string): Promise<MemoryNode> {
    if (fromId === toId) throw new Error('memory_merge_same_id');
    const from = await this.get(fromId);
    const to = await this.get(toId);
    if (!from || !to) throw new Error('memory_not_found');
    const updated = await this.update(to.id, {
      summary: [to.summary, from.summary].filter(Boolean).join(' / '),
      detail: [to.detail, from.detail].filter(Boolean).join('\n\n')
    });
    await this.archive(from.id);
    return updated;
  }

  async promoteToResource(id: string) {
    const memory = await this.requireMemory(id);
    const resource = await createResourceStore(this.vaultPath).create({
      title: memory.title,
      body: `# ${memory.title}\n\n${memory.summary}\n\n${memory.detail ?? ''}`.trim(),
      tags: ['memory', 'hy-memory', memory.layer, memory.kind]
    });
    return { resource, memory };
  }

  async promoteToProject(id: string) {
    const memory = await this.requireMemory(id);
    const slug = await this.nextProjectSlug(slugify(memory.title));
    const created = await createProject(this.vaultPath, {
      slug,
      template: 'blank',
      name: memory.title,
      description: memory.summary
    });
    const project = (await listProjects(this.vaultPath)).find((item) => item.uid === created.uid);
    return {
      project: {
        uid: created.uid,
        slug,
        name: memory.title,
        relPath: project?.relPath ?? created.relPath
      },
      memory
    };
  }

  async recall(query: string, options: RecallOptions = {}): Promise<RecallResult> {
    const result = await this.request<HyListResponse>('POST', '/api/v1/search', {
      query,
      user_ids: [options.user_id ?? this.config.userId],
      limit: options.max_memories ?? this.config.topK,
      min_score: options.min_confidence ?? this.config.searchThreshold,
      agent_ids: [this.config.agentId]
    });
    const rawMemories = flattenHyMemories(result.memories);
    const memories = rawMemories.length
      ? rawMemories.map((memory) => this.toMemoryNode(memory))
      : await this.fallbackRecall(query, options);
    return {
      memories,
      matches: memories.map((memory, index) => {
        const raw = rawMemories[index];
        const score = normalizeScore(raw?.score);
        return {
          memory_id: memory.id,
          score: rawMemories.length ? score : fallbackMatchScore(memory, query, index),
          matched_terms: [],
          signals: {
            keyword_overlap: 0,
            entity_overlap: 0,
            confidence: score,
            stability_boost: 0,
            recall_boost: 0,
            layer_boost: 0
          },
          reasons: rawMemories.length
            ? [`HY Memory semantic score ${Math.round(score * 100)}%`]
            : [`Orbit source-backed fallback score ${Math.round(fallbackMatchScore(memory, query, index) * 100)}%`]
        };
      }),
      explanation: memories.length
        ? rawMemories.length
          ? `HY Memory recalled ${memories.length} item(s) from ${this.config.serverUrl}.`
          : `HY Memory raw recall returned no processed items; Orbit recalled ${memories.length} synced HY item(s) by source-backed fallback.`
        : 'HY Memory did not return relevant memories.'
    };
  }

  async recallStats() {
    return { total: 0, by_kind: {}, recent: [] };
  }

  async clusters() {
    const nodes = await this.list();
    const byLayer = new Map<MemoryLayer, string[]>();
    for (const node of nodes) byLayer.set(node.layer, [...(byLayer.get(node.layer) ?? []), node.id]);
    return Array.from(byLayer.entries()).map(([layer, memories]) => ({
      id: `hy-cluster-${layer}`,
      layer,
      theme: `HY ${layer}`,
      memories,
      coherence: Math.min(1, 0.4 + memories.length * 0.05)
    }));
  }

  async graph(filter?: MemoryFilter) {
    return {
      nodes: await this.list(filter),
      relations: [],
      generated_at: new Date().toISOString()
    };
  }

  async feedback(id: string, helpful: boolean): Promise<MemoryNode> {
    const node = await this.get(id);
    if (!node) throw new Error(`memory_not_found:${id}`);
    return {
      ...node,
      confidence: helpful ? Math.min(1, node.confidence + 0.03) : Math.max(0, node.confidence - 0.05),
      user_confirmed: helpful ? true : node.user_confirmed
    };
  }

  private async request<T>(method: string, route: string, json?: unknown): Promise<T> {
    await this.ensureServerReady();
    const response = await fetch(`${this.baseUrl}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
      signal: AbortSignal.timeout(120_000)
    });
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = await response.json() as { error?: unknown; detail?: unknown };
        detail = String(body.error ?? body.detail ?? detail);
      } catch {
        /* keep status text */
      }
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  private async ensureServerReady(): Promise<void> {
    if (await this.healthCheck()) return;
    if (!this.config.autoStartServer) throw new Error(`hy_memory_unavailable:${this.config.serverUrl}`);
    if (!serverProcess) {
      const [pythonPath, serverEnv] = await Promise.all([
        resolveHyMemoryPython(this.config),
        buildHyMemoryServerEnv(this.vaultPath, this.config)
      ]);
      serverProcess = spawn(pythonPath, ['-m', 'hy_memory.server', '--port', String(this.config.serverPort)], {
        env: { ...process.env, ...serverEnv }
      });
      serverProcess.once('exit', () => {
        serverProcess = null;
      });
    }
    await waitFor(async () => this.healthCheck(), 15_000);
  }

  private async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`, { signal: AbortSignal.timeout(800) });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async readManifest(): Promise<HyManifest | null> {
    try {
      const raw = await fs.readFile(path.join(this.config.pluginPath, 'openclaw.plugin.json'), 'utf8');
      const parsed = JSON.parse(raw) as HyManifest;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  private buildDescriptor(manifest: HyManifest | null, ready: boolean): MemoryBackendDescriptor {
    const manifestOk = manifest?.id === 'openclaw-hy-memory' && manifest.kind === 'memory';
    return {
      id: 'hy-memory',
      label: 'HY Memory（OpenClaw 插件）',
      description: '通过 OpenClaw HY Memory 插件契约连接本地 HY Memory HTTP 服务。',
      capabilities: ['list', 'create', 'update', 'archive', 'recall', 'feedback', 'graph'],
      active: false,
      configured: Boolean(manifestOk && this.config.serverUrl && this.config.userId),
      health: ready ? 'ready' : 'unavailable',
      details: ready
        ? `已连接 ${this.config.serverUrl}`
        : manifestOk
          ? `未连接 ${this.config.serverUrl}；${this.config.autoInstallRuntime ? 'Orbit 会自动安装并启动 HY runtime' : '未启用自动安装'}`
          : `未找到有效 HY Memory manifest：${path.join(this.config.pluginPath, 'openclaw.plugin.json')}`,
      ...(manifest
        ? {
            plugin: {
              id: manifest.id ?? 'unknown',
              name: manifest.name ?? 'HY Memory',
              ...(manifest.version ? { version: manifest.version } : {}),
              ...(manifest.kind ? { kind: manifest.kind } : {}),
              path: this.config.pluginPath
            }
          }
        : {})
    };
  }

  private toMemoryNode(raw: HyMemoryRaw): MemoryNode {
    const rawId = raw.memory_id ?? raw.id ?? String(Date.now());
    const content = String(raw.content ?? raw.text ?? '').trim() || 'HY Memory';
    const visibleContent = stripOrbitSourceMarkers(content);
    const orbitSources = extractOrbitSourceMarkers(content, raw.metadata);
    const layer = normalizeLayer(raw.layer);
    const kind = inferKind(visibleContent, layer);
    const timestamp = hyTimestamp(raw);
    const score = normalizeScore(raw.score ?? raw.confidence);
    return {
      id: `hy:${rawId}`,
      layer,
      kind,
      title: titleFromContent(visibleContent),
      summary: visibleContent.slice(0, 600),
      detail: visibleContent,
      sources: orbitSources.length ? orbitSources : [hySource(rawId, visibleContent, raw.metadata)],
      evidence_count: 1,
      confidence: score,
      stability: score >= 0.75 ? 'stable' : 'volatile',
      recall_count: 0,
      created_at: raw.created_at ?? raw.updated_at ?? timestamp,
      updated_at: raw.updated_at ?? raw.created_at ?? timestamp
    };
  }

  private async requireMemory(id: string): Promise<MemoryNode> {
    const memory = await this.get(id);
    if (!memory) throw new Error(`memory_not_found:${id}`);
    return memory;
  }

  private async syncedMemories(): Promise<MemoryNode[]> {
    const ids = await this.syncedMemoryIds();
    const memories = await Promise.all(ids.map((id) => this.get(id).catch(() => null)));
    return memories.filter((memory): memory is MemoryNode => Boolean(memory));
  }

  private async fallbackRecall(query: string, options: RecallOptions): Promise<MemoryNode[]> {
    const q = query.trim();
    if (!q) return [];
    const minScore = options.min_confidence ?? 0.01;
    const candidates = await this.syncedMemories();
    let scored = candidates
      .map((memory, index) => ({ memory, score: fallbackRecallScore(memory, q, index) }))
      .filter((item) => item.score >= minScore);
    if (!scored.length && isBroadRecallProbe(q)) {
      scored = candidates.map((memory, index) => ({ memory, score: broadRecallScore(memory, index) }));
    }
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, options.max_memories ?? this.config.topK)
      .map((item) => item.memory);
  }

  private async syncedMemoryIds(): Promise<string[]> {
    try {
      const file = path.join(this.vaultPath, '.orbit', 'memory', 'source-sync.json');
      const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as {
        records?: Record<string, { backend?: string; memory_ids?: unknown[] }>;
      };
      const ids = Object.values(parsed.records ?? {})
        .filter((record) => record.backend === 'hy-memory')
        .flatMap((record) => record.memory_ids ?? [])
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
      return Array.from(new Set(ids));
    } catch {
      return [];
    }
  }

  private async nextProjectSlug(base: string): Promise<string> {
    const projects = await listProjects(this.vaultPath);
    const used = new Set(projects.map((project) => project.slug));
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }
}

const ORBIT_SOURCE_MARKER = 'orbit-memory-sources:';

function withOrbitSourceMarkers(text: string, sources: SynthesisSource[] | undefined): string {
  if (!sources?.length) return text;
  const encoded = Buffer.from(JSON.stringify(sources), 'utf8').toString('base64');
  return `${text}\n\n<!-- ${ORBIT_SOURCE_MARKER}${encoded} -->`;
}

function stripOrbitSourceMarkers(content: string): string {
  return content.replace(/<!--\s*orbit-memory-sources:[A-Za-z0-9+/=]+\s*-->/gu, '').trim();
}

function extractOrbitSourceMarkers(content: string, metadata?: Record<string, unknown>): SynthesisSource[] {
  const fromMetadata = metadata?.['orbit_sources'];
  if (Array.isArray(fromMetadata)) return fromMetadata.filter(isSynthesisSourceLike);
  const match = content.match(/<!--\s*orbit-memory-sources:([A-Za-z0-9+/=]+)\s*-->/u);
  if (!match?.[1]) return [];
  try {
    const parsed = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isSynthesisSourceLike) : [];
  } catch {
    return [];
  }
}

function flattenHyMemories(value: HyListResponse['memories']): HyMemoryRaw[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap((items) => Array.isArray(items) ? items : []);
  }
  return [];
}

function isSynthesisSourceLike(value: unknown): value is SynthesisSource {
  return Boolean(value && typeof value === 'object' && typeof (value as SynthesisSource).kind === 'string');
}

function stripHyId(id: string): string {
  return id.startsWith('hy:') ? id.slice(3) : id;
}

function hySource(memoryId: string, content: string, metadata?: Record<string, unknown>): SynthesisSource {
  return {
    kind: 'raw',
    ref: `hy-memory:${memoryId}`,
    title: 'HY Memory',
    excerpt: content.slice(0, 500),
    metadata: { provider: 'hy-memory', memory_id: memoryId, ...(metadata ?? {}) }
  };
}

function fallbackMemoryNode(id: string, text: string, input: CreateMemoryInput): MemoryNode {
  const now = new Date().toISOString();
  return {
    id,
    layer: input.layer ?? 'semantic',
    kind: input.kind,
    title: input.title,
    summary: input.summary || text.slice(0, 600),
    ...(input.detail ? { detail: input.detail } : {}),
    sources: input.sources ?? [hySource(stripHyId(id), text)],
    evidence_count: input.evidence_count ?? 1,
    confidence: input.confidence ?? 0.55,
    stability: 'volatile',
    ...(input.related_entities?.length ? { related_entities: input.related_entities } : {}),
    recall_count: 0,
    created_at: now,
    updated_at: now,
    ...(input.user_confirmed ? { user_confirmed: true } : {})
  };
}

function normalizeLayer(value: unknown): MemoryLayer {
  return value === 'episodic' || value === 'procedural' || value === 'semantic' ? value : 'semantic';
}

function inferKind(content: string, layer: MemoryLayer): MemoryKind {
  const lower = content.toLowerCase();
  if (/\b(prefer|preference|likes?|希望|偏好)\b/u.test(lower)) return 'preference';
  if (/\b(goal|objective|目标|想完成)\b/u.test(lower)) return 'goal';
  if (/\b(lesson|learned|avoid|next time|教训|下次)\b/u.test(lower)) return 'lesson';
  if (/\b(always|usually|pattern|habit|通常|模式)\b/u.test(lower)) return 'pattern';
  if (/\b(interested in|关注|curious about)\b/u.test(lower)) return 'interest';
  return layer === 'procedural' ? 'pattern' : layer === 'episodic' ? 'lesson' : 'entity_memory';
}

function normalizeScore(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.6;
}

function hyTimestamp(raw: HyMemoryRaw): string {
  if (typeof raw.updated_at === 'string' && raw.updated_at) return raw.updated_at;
  if (typeof raw.created_at === 'string' && raw.created_at) return raw.created_at;
  if (typeof raw.gmt_created === 'number' && Number.isFinite(raw.gmt_created)) {
    return new Date(raw.gmt_created * 1000).toISOString();
  }
  return new Date().toISOString();
}

function titleFromContent(content: string): string {
  return content.replace(/\s+/gu, ' ').trim().slice(0, 80) || 'HY Memory';
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-')
    .slice(0, 48) || 'hy-memory-project';
}

function matchesFilter(memory: MemoryNode, filter: MemoryFilter): boolean {
  if (!filter.include_archived && memory.archived) return false;
  if (filter.layer && filter.layer !== 'all' && memory.layer !== filter.layer) return false;
  if (filter.kind && filter.kind !== 'all' && memory.kind !== filter.kind) return false;
  if (filter.stability && filter.stability !== 'all' && memory.stability !== filter.stability) return false;
  if (filter.query?.trim()) {
    const query = filter.query.trim().toLowerCase();
    return [memory.title, memory.summary, memory.detail].filter(Boolean).join('\n').toLowerCase().includes(query);
  }
  return true;
}

function fallbackRecallScore(memory: MemoryNode, query: string, index = 0): number {
  const queryTokens = textTokens(query);
  if (!queryTokens.size) return 0;
  const memoryTokens = textTokens([memory.title, memory.summary, memory.detail, memory.related_entities?.join(' ')].filter(Boolean).join('\n'));
  let overlap = 0;
  for (const token of queryTokens) if (memoryTokens.has(token)) overlap += 1;
  const exact = [memory.title, memory.summary, memory.detail].filter(Boolean).join('\n').toLowerCase().includes(query.toLowerCase()) ? 0.4 : 0;
  const lexical = exact + overlap / Math.max(1, queryTokens.size);
  const sourceBoost = sourceBackedBoost(memory);
  const recency = recencyBoost(memory, index);
  return Math.min(1, lexical + (lexical > 0 ? sourceBoost + recency : 0));
}

function fallbackMatchScore(memory: MemoryNode, query: string, index: number): number {
  const lexical = fallbackRecallScore(memory, query, index);
  if (lexical > 0) return lexical;
  return isBroadRecallProbe(query) ? broadRecallScore(memory, index) : 0;
}

function textTokens(value: string): Set<string> {
  const normalized = value.toLowerCase().normalize('NFKC');
  const tokens = new Set<string>();
  for (const token of normalized.match(/[a-z0-9]+/gu) ?? []) {
    if (token.length >= 2) tokens.add(token);
  }
  for (const run of normalized.match(/[\u4e00-\u9fff]+/gu) ?? []) {
    if (run.length >= 2) tokens.add(run);
    for (const gram of chineseNgrams(run, 2)) tokens.add(gram);
    for (const gram of chineseNgrams(run, 3)) tokens.add(gram);
  }
  return tokens;
}

function chineseNgrams(value: string, size: number): string[] {
  if (value.length < size) return [];
  const out: string[] = [];
  for (let index = 0; index <= value.length - size; index += 1) {
    const gram = value.slice(index, index + size);
    if (!isWeakChineseGram(gram)) out.push(gram);
  }
  return out;
}

function isWeakChineseGram(value: string): boolean {
  return /^[的是了在和与或我你他她它们这个那个什么怎么为何是否]+$/u.test(value);
}

function isBroadRecallProbe(query: string): boolean {
  return /\b(recent|current|focus|working on|progress|open loops?|next steps?|remember|know about)\b|最近|当前|现在|推进|在做|进展|焦点|开放回路|下一步|记得什么|知道什么/u.test(query.toLowerCase());
}

function broadRecallScore(memory: MemoryNode, index: number): number {
  return Math.min(0.78, 0.42 + sourceBackedBoost(memory) + recencyBoost(memory, index) + (memory.user_confirmed ? 0.04 : 0));
}

function sourceBackedBoost(memory: MemoryNode): number {
  const kind = memory.sources[0]?.kind;
  if (kind === 'external_ai_session' || kind === 'project' || kind === 'task' || kind === 'conversation') return 0.08;
  if (kind === 'note' || kind === 'resource' || kind === 'library') return 0.05;
  return 0.02;
}

function recencyBoost(memory: MemoryNode, index: number): number {
  const ageMs = Date.now() - Date.parse(memory.updated_at);
  if (Number.isFinite(ageMs) && ageMs >= 0) {
    const days = ageMs / 86_400_000;
    if (days <= 2) return 0.12;
    if (days <= 14) return 0.08;
    if (days <= 45) return 0.04;
  }
  return Math.max(0, 0.05 - index * 0.005);
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('hy_memory_server_start_timeout');
}
