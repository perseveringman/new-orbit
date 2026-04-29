# Phase 7–8 Expanded Plan — Memory, Search, Review, Vision, Gateway, Automation

> **Status**: ready for implementation
> **Depends on**: Phase 5 SDK + Synthesis + Conversation; Phase 6 Notes/Library/Feeds/Timeline/Resource/Area
> **Target**: 一次实现 Phase 7 和 Phase 8 全部子系统

---

## 0. 前置依赖清单

实施前必须确认以下已存在：

- [x] `SDKEndpoint` / endpoint registry / key vault
- [x] `SynthesisArtifact` store + scheduler + invalidator
- [x] `Conversation` store + overlay/full-page unification
- [x] `Note` store with type directories & areas
- [x] `LibraryItem` store with status & annotations
- [x] `FeedSource` / `FeedItem` store + promotion gate
- [x] `TimelineEntry` projection + day/week/month/year views
- [x] `ResourceFrontmatter` / `ResourceRef` / 6-section workstation
- [x] `AreaConfig` / `AreaRef` / dashboard assembly

没有则先补齐 Phase 5/6。

---

## Phase 7.1 — Real Semantic Search

### 7.1.1 设计目标

替换当前 `hash-trick` 向量存储，建立真正的语义索引，支持全库跨实体检索。

### 7.1.2 数据模型

```typescript
// src/shared/semantic/types.ts

export type IndexableEntityKind =
  | 'note'
  | 'library_item'
  | 'resource'
  | 'project'
  | 'area'
  | 'conversation'
  | 'synthesis_artifact'
  | 'kb_doc';

export interface SemanticDocument {
  id: string;                    // doc-<nanoid>
  entity_kind: IndexableEntityKind;
  entity_ref: string;            // 实体路径或 id
  title: string;
  content: string;               // 索引正文（markdown stripped + 关键 metadata）
  tags?: string[];
  areas?: string[];
  resource_refs?: string[];
  layer: 1 | 2;                 // 1=true data, 2=synthesis
  updated_at: string;
}

export interface EmbeddingRecord {
  doc_id: string;
  model: string;                 // 'openai/text-embedding-3-small' | 'local/all-MiniLM-L6-v2'
  dimensions: number;
  vector_file: string;           // .orbit/semantic/vectors/<doc_id>.bin
  content_hash: string;          // 用于增量更新判断
  embedded_at: string;
}

export interface SearchResult {
  doc: SemanticDocument;
  score: number;                 // 0..1
  match_type: 'semantic' | 'keyword' | 'both';
  snippets?: string[];           // 匹配片段
  entity_label: string;          // 'Note · thought' | 'Library · article' | 'Resource' ...
  entity_url?: string;           // 跳转链接（前端路由）
}

export interface SearchQuery {
  text: string;
  entity_kinds?: IndexableEntityKind[];
  layers?: (1 | 2)[];
  areas?: string[];
  resources?: string[];
  date_from?: string;
  date_to?: string;
  match_mode: 'semantic' | 'keyword' | 'hybrid';
  top_k?: number;
  min_score?: number;
}

export interface SearchSession {
  id: string;
  query: SearchQuery;
  results: SearchResult[];
  artifact_id?: string;          // search.answer synthesis
  created_at: string;
}
```

### 7.1.3 存储结构

```text
<vault>/.orbit/semantic/
├── index.json                   # SemanticIndex meta
├── docs/
│   └── <doc-id>.json            # SemanticDocument 快照
├── vectors/
│   └── <doc-id>.bin             # Float32Array 二进制
├── hnsw/
│   └── graph.bin                # HNSW 图（可选，先用 brute-force）
└── keyword/
    └── inverted.json            # 倒排索引（补充 keyword 搜索）
```

### 7.1.4 Main Process 组件

#### `semantic/document-projectors.ts`

每个实体 kind 有一个 projector，负责从实体 → `SemanticDocument`：

```typescript
export function projectNote(note: Note): SemanticDocument {
  return {
    id: `doc-${note.frontmatter.id}`,
    entity_kind: 'note',
    entity_ref: note.path,
    title: note.frontmatter.title,
    content: [
      `type: ${note.frontmatter.type}`,
      `tags: ${note.frontmatter.tags.join(', ')}`,
      `areas: ${note.frontmatter.areas?.map(a => a.area_slug).join(', ') ?? ''}`,
      note.body,
    ].join('\n'),
    tags: note.frontmatter.tags,
    areas: note.frontmatter.areas?.map(a => a.area_slug),
    resource_refs: note.frontmatter.resource_refs,
    layer: 1,
    updated_at: note.frontmatter.updated,
  };
}
```

同样实现 `projectLibraryItem`、`projectResource`、`projectConversation`、`projectSynthesisArtifact`、`projectProject` 等。

#### `semantic/index-store.ts`

核心功能：

- 增量索引：订阅 `TraceableEvent`，实体变更时 upsert document
- 删除：实体被删除或归档时标记 doc 为 removed
- `markStale(entityRef): void`
- `rebuildAll()`: 全量重建
- `getDocument(docId)`, `listDocuments(filter)`

#### `semantic/embedder.ts`

两级嵌入方案：

**方案 A：本地模型**（默认，离线可用）

```typescript
// 使用 @xenova/transformers (Transformers.js)
import { pipeline } from '@xenova/transformers';

let embedder: ReturnType<typeof pipeline> | null = null;

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedder;
}

export async function embed(texts: string[]): Promise<Float32Array[]> {
  const pipe = await getEmbedder();
  const outputs = await pipe(texts, { pooling: 'mean', normalize: true });
  return outputs.map((o: any) => new Float32Array(o.data));
}
```

**方案 B：API 模型**（精度更高，用户可配）

```typescript
// 调用各 embedding API
export async function embedRemote(texts: string[], model: string): Promise<Float32Array[]> {
  // 根据 model 选择 Anthropic-compatible embedding 或 OpenAI embedding API
}
```

默认用方案 A，Settings 里可切换。

嵌入维度：384（all-MiniLM-L6-v2）或 1536（OpenAI）。

#### `semantic/hybrid-search.ts`

```
用户输入 query
  │
  ├──→ semantic_search(query)     # cosine similarity over vectors
  │      └→ top 50
  │
  ├──→ keyword_search(query)      # inverted index
  │      └→ top 50
  │
  └──→ merge + dedupe + re-rank
         └→ top_k results
```

```typescript
export async function hybridSearch(query: SearchQuery): Promise<SearchResult[]> {
  const [semanticHits, keywordHits] = await Promise.all([
    semanticSearch(query.text, query.entity_kinds, query.layers, query.areas, 50),
    keywordSearch(query.text, query.entity_kinds, query.layers, 50),
  ]);

  const merged = mergeResults(semanticHits, keywordHits);
  const filtered = applyFilters(merged, query);
  const ranked = filtered.sort((a, b) => b.score - a.score);

  return ranked.slice(0, query.top_k ?? 20);
}
```

#### `semantic/search-answer.ts`

搜索结果可以触发 Synthesis `search.answer` kind：

```typescript
export async function synthesizeSearchAnswer(query: string, results: SearchResult[]): Promise<SynthesisArtifact> {
  return synthesis.ensure({
    kind: 'search.answer',
    scope_key: `search-answer:${hashQuery(query)}`,
    sources: results.map(r => ({ kind: r.doc.entity_kind, ref: r.doc.entity_ref })),
    priority: 'user-blocking',
  });
}
```

### 7.1.5 IPC

```typescript
IPC.semantic = {
  search(query: SearchQuery): Promise<{ results: SearchResult[]; total: number }>;
  getDocument(docId: string): Promise<SemanticDocument | null>;
  indexStatus(): Promise<{ total_docs: number; indexed_docs: number; last_indexed_at?: string }>;
  rebuildIndex(): Promise<void>;
  searchAndAnswer(query: SearchQuery): Promise<{ results: SearchResult[]; answer?: SynthesisArtifact }>;
};
```

### 7.1.6 Renderer UI

#### Search 一级入口

- 位置：左侧栏中上部，icon `Search`
- 路由：`/search`

#### 页面布局

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍 [________________________________________]  [搜索] [⚙️]      │
│                                                                 │
│  筛选：[全部实体 ▼] [全部层级 ▼] [Area ▼] [时间 📅]              │
│                                                                 │
│  ╭── AI 综合回答（基于搜索结果） ─────────────────────────╮    │
│  │  根据你的笔记、资源和对话，关于「MCP 协议」...              │    │
│  │  → 3 条笔记     → 1 个项目     → 2 篇 Library 文章       │    │
│  │  [展开完整回答]  [在新会话中追问]                         │    │
│  ╰────────────────────────────────────────────────────────╯    │
│                                                                 │
│  搜索结果 (23)                                                   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 💭 Note · thought                                       │   │
│  │ MCP 协议的 SSE 传输层优化想法          relevance: 92%   │   │
│  │ MCP 协议的 SSE 传输层必须支持 binary 帧...              │   │
│  │ tags: mcp, protocol  · area: Orbit 项目  · 2026-04-28  │   │
│  │ [打开] [在上下文中查看]                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 📚 Library · article                                     │   │
│  │ Anthropic MCP Specification              relevance: 87%  │   │
│  │ Official MCP protocol transportation spec...            │   │
│  │ 状态: read  · 标注: 3 处  · saved: 2026-04-20            │   │
│  │ [打开] [提炼]                                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🗂️ Resource                                              │   │
│  │ MCP 生态                                 relevance: 84%  │   │
│  │ 17 个 note, 5 个 library, 3 个项目...                    │   │
│  │ depth: practicing  · last engaged: 2 天前                │   │
│  │ [打开工作站]                                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 搜索结果卡片（每种实体专用渲染）

| 实体 | icon | 显示字段 |
|---|---|---|
| Note · thought | 💭 | title, first 80 chars, tags, area, date |
| Note · longform | ✍️ | title, word count, tags, area, date |
| Note · capture | 📌 | title, source, tags, date |
| Library · article | 📖 | title, status, annotation count, domain |
| Resource | 🗂️ | title, depth, ref counts, last_engaged |
| Project | 🎯 | title, status, task_count, area |
| Area | 🏠 | name, entity counts, health |
| Conversation | 💬 | title, message_count, last_active |
| Synthesis | ⚡ | kind label, generated_at, freshness |

每个卡片都有 hover 展开更多信息 + click 跳转到实体详情页。

#### 搜索时行为

- 输入即搜（debounce 300ms），不等待回车
- loading 状态：搜索框下方 skeleton 卡片
- empty 状态：「没有找到匹配的结果。尝试换一个关键词，或点击"用 Ask-Anywhere 探索这个话题"」
- error 状态：嵌入模型未加载、索引尚未构建等提示

#### 语义搜索 vs 关键词搜索切换

Search bar 右侧有 toggle：
```
[语义 ▼]  选项：语义 / 关键词 / 混合
```

#### Ask across results

搜索结果顶部有"用 Ask-Anywhere 追问这些结果"按钮：
- 点击 → 打开 Ask-Anywhere overlay
- 自动注入搜索结果作为 context
- scope = `search` with session id

### 7.1.7 索引更新机制

订阅以下 TraceableEvent：

| Event | 动作 |
|---|---|
| `note.created` / `note.updated` | upsert document |
| `note.archived` | remove document |
| `library.item.added` / `library.item.annotated` | upsert |
| `library.item.archived` | remove |
| `resource.created` / `resource.updated` / `resource.ref.linked` | upsert |
| `resource.archived` | remove |
| `project.created` / `project.completed` | upsert |
| `area.created` / `area.updated` | upsert |
| `conversation.message.added` | debounced upsert (每 50 条消息一次) |
| `synthesis.artifact.created` | upsert |
| `kb.doc.activated` | upsert |

增量更新是异步的，不阻塞事件流。

### 7.1.8 测试

| 测试类型 | 测试内容 |
|---|---|
| unit | `SemanticDocument` projector 正确性 |
| unit | `embedder.ts` 本地模型加载、输出维度、归一化 |
| unit | `hybrid-search` 排序、去重、分数合并 |
| unit | `search-answer` synthesis scope key 幂等 |
| integration | `note.created` → document indexed → searchable |
| integration | full-text fallback 当 embedder 未就绪 |
| integration | 搜索结果 filter by area/resource/date |
| integration | 增量更新不丢失文档 |
| e2e | 输入 search → 看到结果 → 点击打开目标实体 |
| e2e | "Ask across results" → overlay 打开 → context 包含搜索结果 |
| e2e | empty state 展示 |

### 7.1.9 验收

- [ ] 能用自然语言搜索笔记和资源
- [ ] 结果标签化：truth / synthesis / feed-only
- [ ] 搜索结果按相关性排序
- [ ] 索引增量更新不过期
- [ ] Ask across results 工作

---
## Phase 7.2 — Memory Layer

### 7.2.1 设计目标

在语义索引和 TraceableEvent 之上构建持久记忆系统，让 AI 真正"记住"用户的偏好、模式、教训和长期兴趣。

### 7.2.2 数据模型

```typescript
// src/shared/memory/types.ts

export type MemoryKind =
  | 'interest'       // 长期兴趣（"用户对 MCP 协议持续关注"）
  | 'preference'     // 偏好（"用户喜欢先看源码再读文档"）
  | 'pattern'        // 行为模式（"用户通常在周末整理笔记"）
  | 'lesson'         // 教训（"上次用 worktree 时忘了指定 branch"）
  | 'entity_memory'  // 实体记忆（"用户对 resource:mcp 的最新认知"）
  | 'goal'           // 目标记忆（"本季度想完成写作"）
  ;

export type MemoryStability = 'volatile' | 'stable' | 'core';

export interface MemoryNode {
  id: string;                      // mem-<nanoid>
  kind: MemoryKind;
  title: string;                   // 简短标题（10~20字）
  summary: string;                 // 50~150字描述
  detail?: string;                 // 完整记忆内容（可选）
  sources: SynthesisSource[];      // 记忆从哪些数据提取
  evidence_count: number;          // 被多少独立事件/实体支撑
  confidence: number;              // 0..1
  stability: MemoryStability;
  related_entities?: string[];     // 关联的 entity_ref 列表
  recall_count: number;
  created_at: string;
  updated_at: string;
  last_recalled_at?: string;
  archived?: boolean;
}

export interface RecallEvent {
  id: string;                      // recall-<nanoid>
  memory_id: string;
  triggered_by: {                  // 什么触发了记忆唤回
    kind: 'search' | 'ask' | 'task' | 'review' | 'manual';
    ref?: string;                  // conversation_id / task_id / ...
  };
  used_in: 'context_injection' | 'suggestion' | 'question_answer';
  was_helpful?: boolean;
  occurred_at: string;
}

export interface MemoryCluster {
  id: string;
  theme: string;                   // 聚类主题
  memories: string[];              // memory ids
  coherence: number;               // 0..1，聚类内聚度
}

export interface MemoryExtractionInput {
  source_kind: 'conversation' | 'review' | 'timeline_span' | 'manual';
  source_ref: string;
  content: string;                 // 提取原文
}
```

### 7.2.3 存储结构

```text
<vault>/.orbit/memory/
├── index.json                    # 所有 MemoryNode 列表
├── nodes/
│   └── <memory-id>.json
├── clusters/
│   └── <cluster-id>.json
└── recalls/
    └── YYYY-MM-DD.ndjson         # 每天的 recall 事件
```

### 7.2.4 Main Process 组件

#### `memory/extractor.ts`

从不同数据源提取记忆：

```typescript
export async function extractFromConversation(
  conversation: Conversation
): Promise<MemoryExtractionInput> {
  // 取最近 30 条消息，构建 prompt
  // 调用 Synthesis memory.extract kind
}

export async function extractFromReview(
  reviewRun: ReviewRun
): Promise<MemoryExtractionInput> {
  // 从复盘 findings 中提取教训、模式
}

export async function extractFromTimelineSpan(
  from: string, to: string
): Promise<MemoryExtractionInput> {
  // 从一段时间内的 timeline 事件中提取行为模式
}
```

#### `memory/digest-synthesis.ts`

Memory Digest 是 Synthesis 的一个 kind：

```typescript
// Synthesis kind: memory.digest
// scope_key: mem-digest:<YYYY-MM>

export interface MemoryDigestPayload {
  period: { from: string; to: string };
  new_memories: MemoryNode[];           // 新提取的记忆
  reinforced_memories: string[];        // 被增强的旧记忆 id
  fading_memories: string[];            // 可能已过时的记忆 id
  clusters: MemoryCluster[];            // 新发现的聚类
}
```

定期（每周/midnight）运行。

#### `memory/recall-service.ts`

唤回服务：当 AI 需要上下文时，查询最相关的记忆。

```typescript
export async function recallContext(
  query: string,
  options?: {
    user_id?: string;
    scope?: string;
    max_memories?: number;
    min_confidence?: number;
    exclude_volatile?: boolean;
  }
): Promise<{ memories: MemoryNode[]; explanation: string }> {
  // 1. 语义搜索匹配的记忆
  // 2. 按 relevance * confidence * (recall_count + 1) 排序
  // 3. 生成为什么唤回的解释
  // 4. 记录 RecallEvent
}
```

#### `memory/store.ts`

CRUD + merge + promote：

```typescript
export class MemoryStore {
  async list(filter: MemoryFilter): Promise<MemoryNode[]>;
  async get(id: string): Promise<MemoryNode | null>;
  async create(input: CreateMemoryInput): Promise<MemoryNode>;
  async update(id: string, patch: UpdateMemoryInput): Promise<MemoryNode>;
  async archive(id: string): Promise<void>;
  async merge(fromId: string, toId: string): Promise<MemoryNode>;
  async promoteToResource(memoryId: string): Promise<Resource>;
  async promoteToProject(memoryId: string): Promise<Project>;
  async recordRecall(memoryId: string, event: RecallEvent): Promise<void>;
  async getRecallStats(memoryId: string): Promise<{ total: number; by_kind: Record<string, number> }>;
  async listClusters(): Promise<MemoryCluster[]>;
}
```

### 7.2.5 Memory Stability 演化规则

```
volatile  (新提取，置信度 < 0.6)
    │
    │ 被 3+ 条独立事件证据支撑 + confidence >= 0.6
    ▼
stable    (可信记忆，参与大部分上下文注入)
    │
    │ 被 10+ 条证据支撑 + recall_count >= 5 + user 标记
    ▼
core      (核心记忆，无法被自动删除，始终参与上下文)
```

自动降级：
- stable 记忆 90 天无 recall + 无新证据 → volatile
- volatile 记忆 180 天无 recall → 建议归档

### 7.2.6 IPC

```typescript
IPC.memory = {
  list(filter?: MemoryFilter): Promise<MemoryNode[]>;
  get(id: string): Promise<MemoryNode | null>;
  create(input: CreateMemoryInput): Promise<MemoryNode>;
  update(id: string, patch: UpdateMemoryInput): Promise<MemoryNode>;
  archive(id: string): Promise<void>;
  merge(fromId: string, toId: string): Promise<MemoryNode>;
  promoteToResource(id: string): Promise<{ resource: Resource; memory: MemoryNode }>;
  promoteToProject(id: string): Promise<{ project: Project; memory: MemoryNode }>;
  recall(query: string, options?: RecallOptions): Promise<{ memories: MemoryNode[]; explanation: string }>;
  recallStats(id: string): Promise<RecallStats>;
  clusters(): Promise<MemoryCluster[]>;
  generateDigest(): Promise<SynthesisArtifact>;
};
```

### 7.2.7 Renderer UI

#### Memory Explorer 一级入口

- 位置：左侧栏中下部（search 和 timeline 之间）
- icon：`BrainCircuit`
- 路由：`/memory`

#### 页面布局

```
┌─────────────────────────────────────────────────────────────────┐
│ 🧠 Memory Explorer                                              │
│                                                                 │
│  [全部 ▼] [兴趣] [偏好] [模式] [教训] [实体记忆]  [+]          │
│                                                                 │
│  ╭── 记忆统计 ────────────────────────────────────────────╮    │
│  │  总计 47 条记忆    ·   稳定 28    ·   易变 12    ·   核心 7  │    │
│  │  本月新增 5 条    ·   记忆唤回 23 次                        │    │
│  │  [生成记忆摘要]                                             │    │
│  ╰───────────────────────────────────────────────────────╯    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 核心  · 兴趣                                             │   │
│  │ ⭐ 用户对 MCP 协议持续深度关注                            │   │
│  │ 基于 17 个 note, 5 篇 library, 8 次 Ask 对话询问         │   │
│  │ 置信度: 0.92    ·   唤回: 8 次    ·   来源: conversation │   │
│  │ [编辑] [提升为 Resource] [归档]  [🔍 查看关联]           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 稳定  · 偏好                                             │   │
│  │ 用户偏好先读源码再读文档                                  │   │
│  │ 基于 3 个 task 的执行模式                                 │   │
│  │ 置信度: 0.78    ·   唤回: 3 次                            │   │
│  │ [确认] [❌ 这不是我] [编辑]                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 易变  · 教训 (新)                                        │   │
│  │ 🆕 用 worktree 时需要先指定目标 branch                     │   │
│  │ 基于 task: getCwd 重命名失败                              │   │
│  │ 置信度: 0.55                                             │   │
│  │ [确认] [❌ 忽略] [提供更多证据]                           │   │
│  └─────────────────────────────────────────────────────────┘   │
```

#### 用户可执行动作

- **确认**：提高置信度，volatile → stable
- **❌忽略/删除**：归档记忆
- **提供更多证据**：手动关联更多 entity
- **编辑**：修改 title/summary/detail/stability
- **合并**：两条相似记忆合成一条
- **提升为 Resource**：兴趣记忆 → 创建 Resource
- **提升为 Project**：目标/教训 → 创建 Project/Task
- **查看关联**：列出支撑证据的实体引用

#### 记忆唤回展示

在 Ask-Anywhere 或 task 运行时，如果唤回了记忆，UI 应该展示：

```
╭── 🧠 相关记忆 (2) ───────────────────────────────────╮
│  ⭐ 用户对 MCP 协议持续深度关注                         │
│  用户偏好先读源码再读文档                              │
│  [隐藏记忆]                                           │
╰──────────────────────────────────────────────────────╯
```

### 7.2.8 测试

| 测试 | 内容 |
|---|---|
| unit | MemoryNode schema validation |
| unit | stability evolution logic |
| unit | merger 两个 volatile → 一个 stable |
| integration | conversation extract → synthesis → MemoryNode created |
| integration | entity change → memory reinforced |
| integration | recall context returns correct memories |
| integration | promoteToResource 创建合法 Resource |
| e2e | Memory Explorer page renders, filter by kind, edit, archive |
| e2e | Ask-Anywhere with memory recall shows chips |

### 7.2.9 验收

- [ ] 记忆可以从 conversation/review 中自动提取
- [ ] 用户可以在 Memory Explorer 中查看、编辑、删除
- [ ] 记忆稳定性会随证据变化自动调整
- [ ] Ask-Anywhere 可以唤回记忆作为上下文
- [ ] 用户可以将记忆提升为 Resource/Project
- [ ] 记忆唤回是透明的，用户知道 AI 用了哪条记忆

---
## Phase 7.3 — Review System

### 7.3.1 设计目标

自动化日常、周度、月度复盘，自动发现异常（注意力偏差，开放闲散项目，孤独笔记等），把复盘洞察变成可执行任务。

### 7.3.2 数据模型

```typescript
// src/shared/review/types.ts

export type ReviewKind =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'area'
  | 'resource'
  | 'project';

export interface ReviewRun {
  id: string;
  kind: ReviewKind;
  scope_ref?: string;              // area_slug / resource_slug / project_id
  period: { from: string; to: string };
  status: 'pending' | 'generating' | 'generated' | 'reviewed' | 'actions_done' | 'archived';
  artifact_id?: string;            // synthesis artifact
  created_at: string;
  reviewed_at?: string;
}

export type ReviewSeverity = 'info' | 'suggestion' | 'warning';

export interface ReviewFinding {
  id: string;
  review_run_id: string;
  severity: ReviewSeverity;
  category: string;                // 'stale-project' | 'unassigned-note' | 'dormant-resource' |
                                    // 'area-imbalance' | 'missed-goal' | 'dependency-block' |
                                    // 'low-engagement' | 'cognitive-overload' | ...
  title: string;
  rationale: string;
  evidence?: ReviewEvidence[];
  suggested_actions: ReviewAction[];
  acknowledged?: boolean;
  resolved_at?: string;
}

export interface ReviewEvidence {
  kind: string;                    // 'stat' | 'event' | 'entity_ref'
  description: string;
  ref?: string;
}

export interface ReviewAction {
  id: string;
  kind: 'create_task' | 'archive_project' | 'mark_stale' | 'refresh_resource' |
        'assign_area' | 'schedule_review' | 'send_reminder' | 'ignore';
  target_ref?: string;
  description: string;
  executed: boolean;
  executed_at?: string;
}
```

### 7.3.3 复盘种类与输入

#### Daily Review

触发：每晚 21:00（系统 scheduled task）

输入：

- 当天 Timeline events
- 当天 DailySummary
- 未处理 Inbox items

输出 Findings 例如：

```
info    - 今天写了 3 个 thought，但没有任何 project 活动
warning - 「资源: Writing Toolkit」30 天无 engagement
info    - 3 篇 library 文章 read 后未蒸馏
```

#### Weekly Review

触发：每周日 20:00

输入：

- 一周 Timeline events + stats
- 当前 active Projects 状态
- Resource engagement stats
- Area activity balance
- Vision goal progress
- Memory 变化

输出 Findings 例如：

```
warning - Project "Orbit Dashboard" 无活动 12 天 → 建议 review 或 archive
suggestion - 25 条 unassigned notes，可以分配到 Areas
info     - Area "写作" 相对于 Area "编码" 时间投入 1:8，偏离 Vision
warning  - Resource "MCP" depth 仍是 exploring 但已积累 17 个 distilled notes → 建议升级
suggestion - 发现了 3 个潜在的 Resource 涌现
```

#### Monthly Review

输入：4 周数据 + Memory digest + Vision milestones

#### Area Review

输入：该 Area 的 projects/resources/notes/feed

#### Resource Review

输入：Resource 的 sections/refs/timeline/engagement

### 7.3.4 Main Process 组件

#### `review/discovery.ts`

各类复盘侦探逻辑：

```typescript
export async function runDailyReview(): Promise<ReviewFinding[]> { /* ... */ }
export async function runWeeklyReview(): Promise<ReviewFinding[]> { /* ... */ }
export async function runMonthlyReview(): Promise<ReviewFinding[]> { /* ... */ }
export async function runAreaReview(areaSlug: string): Promise<ReviewFinding[]> { /* ... */ }
export async function runResourceReview(resourceSlug: string): Promise<ReviewFinding[]> { /* ... */ }
```

每个函数调用 Synthesis `review.weekly` / `review.monthly` 等 kind。

#### `review/scheduler.ts`

```typescript
// 系统 scheduled task:
// - daily-review: 每天 21:00
// - weekly-review: 每周日 20:00
// - monthly-review: 每月最后一天 20:00
```

#### `review/store.ts`

```typescript
export class ReviewStore {
  async list(filter: ReviewFilter): Promise<ReviewRun[]>;
  async get(id: string): Promise<ReviewRun>;
  async start(kind: ReviewKind, scopeRef?: string): Promise<ReviewRun>;
  async getFindings(reviewRunId: string): Promise<ReviewFinding[]>;
  async acknowledgeFinding(findingId: string): Promise<void>;
  async executeAction(actionId: string): Promise<void>;
  async markReviewed(reviewRunId: string): Promise<void>;
}
```

### 7.3.5 IPC

```typescript
IPC.review = {
  listRuns(filter: ReviewFilter): Promise<ReviewRun[]>;
  getRun(id: string): Promise<{ run: ReviewRun; findings: ReviewFinding[] }>;
  triggerReview(kind: ReviewKind, scopeRef?: string): Promise<ReviewRun>;
  acknowledge(findingId: string): Promise<void>;
  executeAction(actionId: string): Promise<void>;
  archiveRun(id: string): Promise<void>;
};
```

### 7.3.6 Renderer UI

#### Review 一级入口

- 位置：左侧栏中下部
- icon：`ClipboardCheck`
- 路由：`/review`

#### 页面布局

```
┌─────────────────────────────────────────────────────────────────┐
│ 📋 Review                                                       │
│                                                                 │
│ [本周] [上周] [本月] [Areas] [Resources]                       │
│                                                                 │
│  本周复盘 · 2026-04-27 ~ 2026-05-03                              │
│  status: ✅ 已复盘  ·  3 个发现  ·  1 个待处理                   │
│                                                                 │
│  ╭── 整体健康 ──────────────────────────────────────────╮     │
│  │  Projects: ●●●○○ (3 active, 1 stalled)                │     │
│  │  Areas:    ●●●●○ (2 有活动, 1 空闲)                   │     │
│  │  Resources:●●●●○ (5 active, 2 dormant)               │     │
│  │  Library:  4 篇新保存, 3 篇已读                       │     │
│  │  Notes:    27 条新增                                   │     │
│  ╰──────────────────────────────────────────────────────╯     │
│                                                                 │
│  ⚠️ 本周发现 (3)                                                │
│                                                                 │
│  ⚠️ Warning                                                      │
│  Project "Orbit Dashboard" 12 天无活动                          │
│  该 Project 上次 update 是 2026-04-18，当前 status: doing          │
│  [归档 Project]  [Ignore]  [设置为 paused]                       │
│                                                                 │
│  💡 Suggestion                                                   │
│  25 条 Notes 未归属 Area                                          │
│  可以打开 "Unassigned" 队列统一分配                                │
│  [去分配]  [Ignore]                                              │
│                                                                 │
│  ℹ️ Info                                                        │
│  Area "编码" vs "写作" 时间投入 8:1                                │
│  与你的 Vision "写作与编码并重" 有偏差                              │
│  [创建写作 Task]  [Ignore]  [提醒我以后关注]                      │
│                                                                 │
│  [重新复盘]  [全部 Ignore]                                       │
│                                                                 │
│  ── 上月复盘 · 2026-03 ──                                       │
│  ✅ reviewed · 5 个发现 全处理                                   │
│  [查看详情]                                                      │
│                                                                 │
│  ── Area 复盘 ──                                                │
│  Area "Orbit 项目": ✅ reviewed 1 天前 · 2 个发现               │
│  [立即复盘]                                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3.7 测试

| 测试 | 内容 |
|---|---|
| unit | `ReviewFinding` suggestion generation logic per kind |
| unit | action execution: create_task/archive_project/assign_area |
| integration | weekly review → 3 findings → acknowledge → execute action |
| integration | area review discovers inactive resource, dormant projects |
| e2e | Review page loads, shows weekly findings, user acknowledges, dismisses |
| e2e | Unassigned note action opens Unassigned queue |

### 7.3.8 验收

- [ ] 系统自动在周日晚间生成每周复盘
- [ ] 复盘能识别陈旧项目、空闲 Areas、无归属 Notes、dormant Resources
- [ ] Finding 可以转化为具体 Task/归档/归档操作
- [ ] 有复盘历史可以回看

---

## Phase 7.4 — Vision System

### 7.4.1 设计目标

让 Vision 从"一次性写好的静态文档"变成"与 Areas/Projects/Resources/Timeline 联动回流、定期复查的动态系统"。

### 7.4.2 数据模型

```typescript
// src/shared/vision/types.ts

export type VisionHorizon = 'life' | '5y' | '1y' | 'quarter';

export interface VisionGoal {
  id: string;
  title: string;
  horizon: VisionHorizon;
  description: string;
  area_refs: string[];            // 哪些 Are as 接了这个 goal
  target_outcome?: string;        // 可衡量的目标（"发表 12 篇长文"）
  status: 'active' | 'paused' | 'completed' | 'dropped';
  priority: number;               // 0..100, 用于排序
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface VisionMilestone {
  id: string;
  goal_id: string;
  title: string;
  target_date?: string;
  project_refs?: string[];        // 关联的 project
  completed_at?: string;
  notes?: string;                 // 完成时的备注
}

export interface VisionReview {
  id: string;
  reviewed_at: string;
  period: 'quarterly' | 'annual';
  findings: VisionReviewFinding[];
  goal_changes: string[];         // goal id 列表
}

export interface VisionDriftWarning {
  goal_id: string;
  area_slug: string;
  drift_type: 'neglect' | 'overgrowth' | 'inactivity';
  severity: 'low' | 'medium' | 'high';
  rationale: string;
  suggested_action: string;
}

export interface VisionAlignmentMap {
  goal_id: string;
  alignment_score: number;        // 0..100, 与该目标匹配程度
  evidence: {
    active_projects: number;
    completed_projects: number;
    resources_touched: number;
    notes_count: number;
    time_spent_hours: number;
  };
}
```

### 7.4.3 存储结构

```text
<vault>/vision/
├── index.md                      # Vision 总览（Obsidian 可见）
├── goals/
│   ├── life/
│   │   └── <goal-id>.md
│   ├── 5y/
│   │   └── <goal-id>.md
│   ├── 1y/
│   │   └── <goal-id>.md
│   └── quarter/
│       └── <goal-id>.md
├── .orbit/
│   ├── vision-store.json         # Orbit 结构化视图
│   ├── milestones.json
│   └── reviews.json
```

### 7.4.4 Main Process 组件

#### `vision/goal-store.ts`

```typescript
export class GoalStore {
  async list(horizon?: VisionHorizon): Promise<VisionGoal[]>;
  async get(id: string): Promise<VisionGoal>;
  async create(input: CreateGoalInput): Promise<VisionGoal>;
  async update(id: string, patch: UpdateGoalInput): Promise<VisionGoal>;
  async complete(id: string): Promise<VisionGoal>;
  async drop(id: string): Promise<VisionGoal>;
  async getMilestones(goalId: string): Promise<VisionMilestone[]>;
  async addMilestone(input: AddMilestoneInput): Promise<VisionMilestone>;
  async completeMilestone(milestoneId: string): Promise<VisionMilestone>;
  async getAlignmentMap(): Promise<VisionAlignmentMap[]>;
  async detectDrift(): Promise<VisionDriftWarning[]>;
}
```

#### `vision/review.ts`

```typescript
// 预置 Scheduled Task: vision-quarterly-review
// 每季度最后一天 20:00 触发

export async function runVisionReview(): Promise<VisionReview> {
  // 1. 对每个 active goal 计算 alignment score
  // 2. 检测 drift
  // 3. 对完成/接近完成的 milestone 提示
  // 4. 生成 vision review Synthesis artifact
}
```

### 7.4.5 IPC

```typescript
IPC.vision = {
  listGoals(horizon?: VisionHorizon): Promise<VisionGoal[]>;
  getGoal(id: string): Promise<{ goal: VisionGoal; milestones: VisionMilestone[]; alignment?: VisionAlignmentMap }>;
  createGoal(input: CreateGoalInput): Promise<VisionGoal>;
  updateGoal(id: string, patch: UpdateGoalInput): Promise<VisionGoal>;
  completeMilestone(id: string): Promise<VisionMilestone>;
  getAlignment(): Promise<VisionAlignmentMap[]>;
  detectDrift(): Promise<VisionDriftWarning[]>;
  triggerReview(): Promise<VisionReview>;
  getReviewHistory(): Promise<VisionReview[]>;
};
```

### 7.4.6 Renderer UI

#### Vision Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│ 🌟 Vision Dashboard                       [季度复盘 →]         │
│                                                                 │
│  ╭── 目标树 ───────────────────────────────────────────────╮   │
│  │                                                         │   │
│  │  🎯 一生: 成为一个能独立思考、乐于建造的人                    │   │
│  │   ├── 🎯 5 年: 完成 3 个有意义的 software project            │   │
│  │   │    ├── ✅ 1 年: Orbit 项目完成核心架构              │   │
│  │   │    │    ├── ✅ Q1: 完成 v2 架构落地                 │   │
│  │   │    │    ├── ✅ Q2: 完成 Synthesis Layer              │   │
│  │   │    │    └── ⏳ Q3: 完成 Semantic Search              │   │
│  │   │    └── ⏳ 1 年: 开源一个 MCP 工具                       │   │
│  │   │                                                      │   │
│  │   ├── 🎯 5 年: 成为更好的写作者                                │   │
│  │   │    └── ⏳ 1 年: 发表 12 篇长文                            │   │
│  │   │         ├── ✅ Q1: 4 篇完成                             │   │
│  │   │         ├── ⚠️ Q2: 仅 1 篇 (behind)                    │   │
│  │   │         └── ⏳ Q3: 目标 3 篇                               │   │
│  │                                                         │   │
│  ╰─────────────────────────────────────────────────────────╯   │
│                                                                 │
│  ╭── Area 对齐热度 ────────────────────────────────────────╮   │
│  │  [Orbit 项目] ████████░░ 78%  目标 "软件项目"             │   │
│  │  [写作]       ██░░░░░░░░ 21%  目标 "写作者" ← 偏离       │   │
│  │  [阅读]       █████░░░░░ 52%  目标 "思维成长"             │   │
│  ╰─────────────────────────────────────────────────────────╯   │
│                                                                 │
│  ⚠️ Drift 警告                                                  │
│  「成为更好的写作者」本季度仅 1 篇长文，远低于 3 篇目标              │
│  [创建写作 Task] [调整目标] [延长截止日期]                        │
│                                                                 │
│  ╭── 里程碑时间线 ────────────────────────────────────────╮    │
│  │  2026-01 · ✅ 完成 v1 基础设施                           │    │
│  │  2026-03 · ✅ 完成 v2 架构                               │    │
│  │  2026-04 · ✅ 完成 Synthesis Layer                       │    │
│  │  2026-05 · ⏳ 完成 Semantic Search · 目标 2026-05-31    │    │
│  │  2026-06 · ⏳ 完成 Memory Layer                          │    │
│  ╰───────────────────────────────────────────────────────╯     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.4.7 测试

| 测试 | 内容 |
|---|---|
| unit | goal hierarchy integrity validation |
| unit | alignment score calculation |
| integration | area activity → alignment map update |
| integration | drift detection based on milestone timestamps |
| e2e | Vision dashboard renders, shows goals and alignment |

### 7.4.8 验收

- [ ] Areas/Projects 可追溯到 Vision 目标
- [ ] Vision dashboard 展示目标层级树
- [ ] 系统可以检测 drift 并提出行动建议
- [ ] 季度 Vision 复盘自动生成

---
## Phase 8 — Gateway Daemon + Scheduled Automation

### 8.0 设计目标

让 Orbit 可以在桌面 App 不开、用户不在电脑前时继续工作。用户可以通过手机（Telegram）做 capture、问问题、收到通知。

Gateway Daemon 是一个独立于 Electron App 的 Node.js 后台进程，永远在运行。

---

## Phase 8.1 — Gateway Daemon

### 8.1.1 进程模型

```
用户机器
├── Gateway Daemon (Node.js, 独立进程, launchd/systemd 管理)
│   ├── Telegram Channel
│   ├── Future: WhatsApp / Email / Webhook channels
│   ├── Message Router
│   └── Vault Access (直接读写 vault 文件)
│
└── Orbit App (Electron, 用户主动打开)
    ├── Gateway Settings (配置 daemon, token, 用户绑定)
    └── Gateway IPC → communicates with daemon

  当他们都在运行时:
  Gateway Daemon ←→ Orbit App (HTTP IPC 或 Unix socket)

  当 App 关闭时:
  Gateway Daemon 独立运行，直接写 vault 文件
```

### 8.1.2 数据模型

```typescript
// src/shared/gateway/types.ts

export type GatewayChannelKind = 'telegram' | 'webhook' | 'email' | 'shortcut';

export interface GatewayChannel {
  id: string;
  kind: GatewayChannelKind;
  enabled: boolean;
  label: string;
  config: TelegramConfig | WebhookConfig | EmailConfig;
  created_at: string;
}

export interface TelegramConfig {
  bot_token_ref: string;          // keychain ref
  bot_username: string;
  bound_chat_ids: number[];       // 已绑定的 Telegram chat id 白名单
  commands: {
    capture: boolean;
    ask: boolean;
    library_gate: boolean;
    daily_summary: boolean;
  };
}

export interface WebhookConfig {
  url: string;
  secret_ref?: string;
  allowed_methods: ('GET' | 'POST')[];
}

export interface InboundMessage {
  id: string;
  channel_id: string;
  from_user_id: string;
  text?: string;
  attachments?: GatewayAttachment[];
  received_at: string;
  status: 'received' | 'routed' | 'processed' | 'failed';
  routed_to?: 'capture' | 'ask' | 'library_gate';
  processing_output?: {
    conversation_id?: string;
    note_path?: string;
    library_item_id?: string;
    error?: string;
  };
}

export interface GatewayAttachment {
  kind: 'photo' | 'document' | 'url' | 'audio';
  mime_type?: string;
  url?: string;
  local_path?: string;
  file_size?: number;
}

export interface GatewayStatus {
  daemon_running: boolean;
  uptime_seconds: number;
  channels: Array<{ id: string; kind: string; status: 'ok' | 'error' | 'disabled'; last_msg_at?: string }>;
  message_queue_length: number;
  vault_writable: boolean;
}
```

### 8.1.3 目录结构

```text
src/main/gateway/
├── daemon.ts               # 主 daemon 入口
├── channel-registry.ts     # 注册、启停 channel
├── router.ts               # InboundMessage → action
├── vault-io.ts             # 直接读/写 vault
├── ipc-server.ts           # Orbit App ↔ Daemon 通信
├── channels/
│   ├── base-channel.ts     # channel 抽象接口
│   ├── telegram.ts
│   └── webhook.ts
└── auth.ts                 # 用户绑定、白名单、校验
```

Daemon 可以放在独立包 `packages/gateway/` 中，或 `src/main/gateway/` 中由 Electron 的子进程 spawn。

### 8.1.4 Telegram Channel 具体实现

```typescript
// channels/telegram.ts

import TelegramBot from 'node-telegram-bot-api';

export class TelegramChannel implements GatewayChannelImpl {
  private bot: TelegramBot;

  constructor(config: TelegramConfig) {
    const token = keychain.read(config.bot_token_ref);
    this.bot = new TelegramBot(token, { polling: true });
    this.setupHandlers(config);
  }

  private setupHandlers(config: TelegramConfig) {
    this.bot.onText(/\/start/, (msg) => this.handleStart(msg, config));
    this.bot.onText(/\/capture (.+)/, (msg, match) => this.handleCapture(msg, match));
    this.bot.onText(/\/ask (.+)/, (msg, match) => this.handleAsk(msg, match));
    this.bot.onText(/\/summary/, (msg) => this.handleSummary(msg));
    this.bot.on('message', (msg) => this.handleAnyMessage(msg, config));
  }

  private async handleAsk(msg: TelegramBot.Message, match: RegExpMatchArray) {
    // 1. 校验 msg.chat.id 在 bound_chat_ids 白名单中
    // 2. 创建 InboundMessage
    // 3. 调用 Runtime B (Ask-Anywhere via SDK)
    // 4. 返回回答给 Telegram
  }

  private async handleCapture(msg: TelegramBot.Message, match: RegExpMatchArray) {
    // 1. 创建 raw capture note
    // 2. linked back to the gateway channel
    // 3. Confirm to user
  }

  private async handleAnyMessage(msg: TelegramBot.Message, config: TelegramConfig) {
    // 附带 文本?
    // 带 URL? → 提供 "保存到 Library?" 按钮
    // 带图片/文件/语音 → 存到 vault
    // 若 config.commands.ask 开，把纯文本当 Ask-Anywhere 处理
  }
}
```

### 8.1.5 Orbit App ↔ Gateway Daemon 通信

通信方式（选择一个）：

- Unix socket: 快速、本地、安全
- HTTP 本地接口: 简单，方便 debug
- 文件间写/轮询: 简单但不可实时

推荐 HTTP 本地接口 + shared secret。

```typescript
// ipc-server.ts (runs in daemon)
// 监听 http://127.0.0.1:9876 (随机端口，写入配置)
// Endpoints:
//   GET  /status
//   GET  /channels
//   POST /channels/<id>/enable
//   POST /channels/<id>/disable
//   GET  /messages?since=<ISO>
//   POST /messages/send (outbound)
```

Orbit App 侧：

```typescript
IPC.gateway = {
  getStatus(): Promise<GatewayStatus>;
  listChannels(): Promise<GatewayChannel[]>;
  enableChannel(channelId: string): Promise<void>;
  disableChannel(channelId: string): Promise<void>;
  getMessages(filter: MessageFilter): Promise<InboundMessage[]>;
  sendOutbound(channelId: string, message: OutboundMessage): Promise<void>;
  startDaemon(): Promise<void>;
  stopDaemon(): Promise<void>;
  setVaultPath(vaultPath: string): Promise<void>;
};
```

### 8.1.6 Router 行为

InboundMessage → action mapping:

| Input | Route to | 动作 |
|---|---|---|
| `/capture text` | capture | `gateway.capture` note with source |
| `/ask question` | ask | Runtime B → answer → send back |
| plain text | ask (if enabled) | Runtime B |
| forwarded URL | library_gate (if enabled) | Offer save to library button |
| forwarded file | library_gate | Save file into vault |
| `/summary` | ask | Trigger daily summary |

### 8.1.7 Renderer UI

#### Gateway Settings Page

```
┌─ Gateway Settings ────────────────────────────────────────────┐
│                                                               │
│  Daemon Status: 🟢 Running (uptime: 3d 7h)                    │
│  Vault: /Users/me/vault                                       │
│  [Stop] [Restart]                                             │
│                                                               │
│  ┌─ Channels ─────────────────────────────────────────────┐  │
│  │                                                        │  │
│  │  ✈️ Telegram Bot                🟢 ok                  │  │
│  │     Bot: @orbit_my_bot                                 │  │
│  │     Token: ******A1B2C3  [Edit]                      │  │
│  │     绑定用户: +8613xxxxxxx  [+ 绑定]                  │  │
│  │     ┌─ 权限 ────────────────────────────────────┐    │  │
│  │     │ [x] Capture  [x] Ask  [x] Library Gate      │    │  │
│  │     │ [x] Daily Summary push  [x] Review push      │    │  │
│  │     └────────────────────────────────────────────┘    │  │
│  │     [Test]  [禁用]                                    │  │
│  │                                                        │  │
│  │  ╺╺ Webhook · 已禁用 · [+ 配置]              ╺╺     │  │
│  │                                                        │  │
│  │  [+ 新增 Channel]                                      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ 最近消息 ────────────────────────────────────────────┐  │
│  │  今天 09:15 · Telegram · /ask MCP 的最新进展?          │  │
│  │  今天 08:02 · Telegram · /capture 记得买牛奶          │  │
│  │  昨天 22:00 · System · daily summary pushed           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### 8.1.8 测试

| 测试 | 内容 |
|---|---|
| unit | Telegram 命令解析 |
| unit | Router mapping correctness |
| unit | InboundMessage → vault write |
| integration | daemon start/stop + Orbit App 通信 |
| integration | `/capture` → note created in vault |
| integration | `/ask` → answer via SDK |
| integration | forwarded URL → library item |
| integration | daemon runs when Orbit App closed |
| e2e | Telegram message → note visible in Orbit when App opens next |

### 8.1.9 验收

- [ ] Gateway 后台常驻进程启动/停止
- [ ] Telegram Bot 能收到 `/capture`、`/ask`、URL 转发
- [ ] Ask-Anywhere 回答回调 Telegram
- [ ] 与 Orbit App 通信正常，配置同步
- [ ] Orbit App 关闭后 Gateway 继续工作

---

## Phase 8.2 — Scheduled Automation

### 8.2.1 设计目标

提供用户可配置的周期任务系统，以及一组预置的系统任务。

### 8.2.2 数据模型（增强）

在现有 `02-scheduled-tasks-ui.md` 基础上增加系统任务支持和更多 action type：

```typescript
// src/shared/scheduled-task/types.ts (extended)

export type ScheduledTaskAction =
  | { kind: 'ask_anywhere'; prompt: string; skills?: string[]; respond_to?: 'log' | 'inbox' | 'telegram' }
  | { kind: 'agent_run'; agent: string; prompt: string; runtime?: string }
  | { kind: 'shell'; command: string; cwd?: string }
  | { kind: 'feed_refresh'; source_ids?: string[] }
  | { kind: 'webhook'; url: string; method: 'GET' | 'POST'; body?: unknown }
  | { kind: 'synthesis'; synthesis_kind: SynthesisKind; scope_key?: string; force?: boolean }
  | { kind: 'review'; review_kind: ReviewKind; scope_ref?: string }
  | { kind: 'memory_digest' }
  ;

export interface ScheduleSpec {
  kind: 'cron' | 'interval' | 'daily' | 'weekly' | 'monthly' | 'once';
  cron?: string;
  interval_minutes?: number;
  time?: string;                    // 'HH:MM'
  days?: number[];                  // kind=weekly [0=Sun..6]
  day_of_month?: number;
  target_datetime?: string;         // kind=once
  timezone?: string;
}

export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;

  schedule: ScheduleSpec;
  action: ScheduledTaskAction;

  status: 'active' | 'paused' | 'disabled' | 'error';
  created_at: string;
  updated_at: string;
  next_run_at?: string;
  last_run_at?: string;

  source: 'system' | 'user' | 'ask_anywhere';
  system_key?: string;             // 'daily-summary' | 'weekly-review' | ...

  para_ref?: string;
  area_ref?: string;
  budget_usd?: number;             // 单次执行上限

  tags?: string[];
}

export interface TaskExecution {
  id: string;
  scheduled_task_id: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  status: 'running' | 'success' | 'failed' | 'skipped' | 'timeout';
  output?: {
    artifact_id?: string;
    note_path?: string;
    conversation_id?: string;
    error?: string;
    token_usage?: { input: number; output: number };
    cost_usd?: number;
  };
}
```

### 8.2.3 预置系统任务

```typescript
const SYSTEM_TASKS: ScheduledTask[] = [
  {
    id: 'sys-daily-summary',
    name: 'Daily Summary',
    schedule: { kind: 'daily', time: '22:00' },
    action: { kind: 'synthesis', synthesis_kind: 'summary.daily' },
    source: 'system',
    system_key: 'daily-summary',
    budget_usd: 0.03,
  },
  {
    id: 'sys-weekly-review',
    name: 'Weekly Review',
    schedule: { kind: 'weekly', time: '20:00', days: [0] },
    action: { kind: 'review', review_kind: 'weekly' },
    source: 'system',
    system_key: 'weekly-review',
    budget_usd: 0.10,
  },
  {
    id: 'sys-monthly-review',
    name: 'Monthly Review',
    schedule: { kind: 'monthly', day_of_month: 1, time: '20:00' },
    action: { kind: 'review', review_kind: 'monthly' },
    source: 'system',
    system_key: 'monthly-review',
    budget_usd: 0.15,
  },
  {
    id: 'sys-resource-health',
    name: 'Resource Health Scan',
    schedule: { kind: 'daily', time: '03:00' },
    action: { kind: 'synthesis', synthesis_kind: 'summary.entity' },
    source: 'system',
    system_key: 'resource-health',
  },
  {
    id: 'sys-feed-digest',
    name: 'Feed Daily Digest',
    schedule: { kind: 'daily', time: '10:00' },
    action: { kind: 'feed_refresh', source_ids: [] },  // refresh all
    source: 'system',
    system_key: 'feed-digest',
  },
  {
    id: 'sys-vision-quarterly',
    name: 'Vision Quarterly Review',
    schedule: { kind: 'monthly', day_of_month: 1, time: '18:00' },
    action: { kind: 'review', review_kind: 'quarterly' },
    source: 'system',
    system_key: 'vision-quarterly',
  },
  {
    id: 'sys-memory-digest',
    name: 'Memory Weekly Digest',
    schedule: { kind: 'weekly', time: '02:00', days: [1] },
    action: { kind: 'memory_digest' },
    source: 'system',
    system_key: 'memory-digest',
  },
];
```

### 8.2.4 Main Process 组件

#### `scheduled/task-runner.ts`

```typescript
export class ScheduledTaskRunner {
  private store: ScheduledTaskStore;
  private timer: NodeJS.Timer | null;

  async start(): Promise<void> {
    // 每 60 秒检查一次是否有任务到期
    this.timer = setInterval(() => this.tick(), 60_000);
  }

  private async tick(): Promise<void> {
    const due = await this.store.listDue();
    for (const task of due) {
      await this.execute(task);
    }
  }

  private async execute(task: ScheduledTask): Promise<void> {
    const execution = this.createExecution(task);

    try {
      switch (task.action.kind) {
        case 'synthesis':
          // call Synthesis runtime
          break;
        case 'ask_anywhere':
          // call Runtime B SDK
          break;
        case 'feed_refresh':
          // call Feed fetcher
          break;
        case 'review':
          // call Review engine
          break;
        case 'memory_digest':
          // call Memory digest synthesis
          break;
        case 'shell':
          // run shell cmd in sandbox
          break;
        case 'webhook':
          // http request
          break;
        case 'agent_run':
          // call Runtime A CLI
          break;
      }
      await this.completeExecution(execution, task, output);
    } catch (error) {
      await this.failExecution(execution, task, error);
    }
  }
}
```

### 8.2.5 IPC

```typescript
IPC.scheduledTasks = {
  list(filter?: ScheduledTaskFilter): Promise<ScheduledTask[]>;
  get(id: string): Promise<ScheduledTask>;
  create(input: CreateScheduledTaskInput): Promise<ScheduledTask>;
  update(id: string, patch: UpdateScheduledTaskInput): Promise<ScheduledTask>;
  delete(id: string): Promise<void>;
  enable(id: string): Promise<void>;
  disable(id: string): Promise<void>;
  runNow(id: string): Promise<TaskExecution>;
  getExecutions(taskId: string, limit?: number): Promise<TaskExecution[]>;
  getSystemTasks(): Promise<ScheduledTask[]>;
};
```

### 8.2.6 Renderer UI

#### Scheduled Tasks 一级入口

- 位置：左侧栏中下部
- icon：`Clock`
- 路由：`/scheduled`

#### 页面布局

```
┌─────────────────────────────────────────────────────────────────┐
│ ⏰ Scheduled Tasks                [+ 创建]                      │
│                                                                 │
│  [全部] [活跃] [已暂停] [系统] [由我创建]                        │
│                                                                 │
│  ┌─ 系统任务 ───────────────────────────────────────────────┐  │
│  │                                                          │  │
│  │  🌙 Daily Summary          每 22:00    · 下次 2h 后    │  │
│  │     最近: ✅ success (今天 22:03) · 0.002 USD            │  │
│  │     [立即执行] [⏸ 暂停] [查看历史]                       │  │
│  │                                                          │  │
│  │  📋 Weekly Review          Sun 20:00   · 下次 4d 后    │  │
│  │     [立即执行] [查看历史]                                  │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ 用户创建 ───────────────────────────────────────────────┐  │
│  │                                                          │  │
│  │  📝 每日写作提醒          每 08:00   · active            │  │
│  │     动作: ask_anywhere "今天有什么写作灵感?"              │  │
│  │     最近: ✅ (今天 08:01)                                 │  │
│  │     [编辑] [暂停] [查看历史]                               │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  创建向导：[点击 + 创建]                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 创建/编辑向导

```
┌─ 新建定时任务 ──────────────────────────────────────────────┐
│                                                             │
│  名称: [________________________________________]         │
│  描述: [________________________________________]         │
│                                                             │
│  ⏱ 调度：                                                  │
│  类型: [每天 ▼]                                              │
│  时间: [08:00]                                              │
│                                                             │
│  ⚡ 动作：                                                  │
│  [Ask-Anywhere 提问 ▼]                                      │
│  提示词: [_________________________________________________________________]│
│                                                             │
│  ┌─ 高级 ─────────────────────────────────────────────┐    │
│  │  Area: [无 ▼]                                       │    │
│  │  Budget: $[0.05]                                    │    │
│  │  失败重试: [3 次]                                    │    │
│  │  结果通知: [Inbox] [Telegram]                       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [取消] [创建]                                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 执行历史 Drawer

```
┌─ Daily Summary · 执行历史 ───────────────────────────────────┐
│                                                               │
│  04-29 22:03 ✅ success · 0.002 USD · 300ms                  │
│  04-28 22:01 ✅ success · 0.003 USD · 400ms                  │
│  04-27 22:05 ✅ success · 0.002 USD · 250ms                  │
│  04-26 22:00 ⚠️ failed · Rate limit exceeded · [重试]        │
│  04-25 22:02 ✅ success · 0.003 USD · 350ms                  │
│                                                               │
│  [加载更多]                                                    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### 8.2.7 测试

| 测试 | 内容 |
|---|---|
| unit | ScheduleSpec next run calculation |
| unit | TaskExecution output serialization |
| integration | create task → auto execute on due |
| integration | budget exceeded → task disabled |
| integration | task failed → retry logic |
| integration | system tasks list correct |
| e2e | Scheduled Tasks page, create/edit/delete |
| e2e | Run now → execution visible in history |

### 8.2.8 验收

- [ ] 用户可以创建/编辑/删除/暂停定时任务
- [ ] 系统任务可以开启/关闭
- [ ] 任务自动在设定时间执行（本地时钟）
- [ ] 执行历史可追溯，包含状态、耗时、成本
- [ ] 预算内执行，超出停任务
- [ ] 失败重试机制

---

## 8.3 实施顺序与依赖

```text
Phase 7.1 Semantic Search (无强依赖)
   ↓
Phase 7.2 Memory Layer (依赖 Semantic Search)
   ↓
Phase 7.3 Review System (依赖 Synthesis + Timeline + Area)
   ↓
Phase 7.4 Vision System (依赖 Review + Area)
   ↓
Phase 8.2 Scheduled Automation (依赖 Synthesis + Review)
   ↓
Phase 8.1 Gateway + Telegram (依赖 Scheduled Automation + SDK)
```

理想实施顺序：

1. Semantic Search
2. Memory Layer
3. Review System
4. Vision System
5. Scheduled Automation
6. Gateway Daemon + Telegram

但如果你有基础设施经验，6 个模块可以并行（在数据模型和 API 定义完成后分给不同 agent）。

---

## 8.4 整体验收 Checklist

- [ ] 语义搜索可检索全库 Note/Library/Resource/Project/Area/Conversation
- [ ] 搜索结果分层标识
- [ ] Ask across results 联动 Ask-Anywhere
- [ ] 记忆自动提取 + 用户管理 + 唤回透明
- [ ] 记忆稳定性随证据和 recall 变化
- [ ] 日/周/月/Area/Resource/Project 复盘自动生成
- [ ] 复盘 findings 可转化为 Task/操作
- [ ] Vision 目标与 Areas 对齐映射
- [ ] Vision drift 检测
- [ ] Gateway Daemon 独立启动/停止
- [ ] Telegram Bot capture/ask/save URL 功能
- [ ] 定时任务创建/管理/执行/历史
- [ ] 系统任务完整预置
- [ ] 所有功能有完整测试
- [ ] 所有文档更新
