---
status: implemented-foundation
date: 2026-05-15
adr: ADR-023
supersedes:
  - docs/plans/2026-05-13-personal-memory-intelligence-layer.md
related:
  - docs/VISION.md
  - docs/ROADMAP.md
  - docs/architecture/data-layering.md
  - docs/architecture/synthesis-layer.md
  - docs/architecture/entity-flow.md
  - docs/architecture/chat-conversation-surface.md
---

# Personal Memory Intelligence Layer Foundation

> 目标：先建立一套稳定的个人记忆与上下文基础设施，再接入本地 Agent 会话源。这样 Codex / Claude Code / Amp / Copilot 等会话只是新的 truth source provider，不会迫使 Search、Memory、Synthesis、Review、Ask Anywhere 返工。

Implementation status (2026-05-16): Phase A foundation 已落地。代码包含 shared evidence contracts、`.orbit/evidence/sources.json` registry、Orbit-owned Layer 1 provider shim、SemanticDocument evidence provenance，以及 registry/source projection 单元测试。第二轮 recall foundation 已补上 evidence chunk index、deterministic graph skeleton、minimal ContextPacket builder。第三轮已补上 `qa.personal` 最小闭环和本地 Agent session reference-truth provider foundation。第四轮已把 ContextPacket 接入 Semantic Search / Search UI / `search.answer` sources；普通搜索只 lookup 既有 synthesis，显式生成回答才 ensure QA，避免输入搜索时隐性写入大量 artifacts。第五轮已接入 Ask Anywhere prompt context、Evidence drill-down IPC/UI，以及 Review 的 `work.context` / `report.open_loops` artifacts 与 open-loop findings。第六轮已把 Ask ContextPacket 物化为 Stage artifact / PMIL context chips，并新增 `context:*` IPC 与 Project Room PMIL 上下文 tab，让项目级 current focus、active threads、open loops、decisions 与 evidence drill-down 可见。剩余重点是 Memory Explorer evidence inspector、MemoryNode v2 feedback、entity profile、LLM refinement/feedback loop，以及更强的本地 Agent session UI/settings。

---

## 1. 核心判断

Orbit 的 Personal Memory Intelligence Layer 不应该先从“怎么总结会话”开始，而应该先回答一个更底层的问题：

> Orbit 如何把用户真实发生过的工作、阅读、对话、决策和执行痕迹，变成可引用、可提炼、可召回、可质疑、可行动的个人上下文系统？

这里有一个关键修正：

- FeedItem 是 Layer 0 signal，因为用户还没有确认它属于自己。
- 本地 AI 会话不是普通外部 signal。它是用户实际工作过程的一部分。
- 因此，本地 AI 会话应该属于 Layer 1 truth source，但可以采用 reference-first 存储，不要求把全文立刻复制进 vault。
- 摘要、open loops、建议、记忆、关系、报告属于 Layer 2 Synthesis。它们必须引用 Layer 1 evidence，不能替代 evidence。

这让 Orbit 的语义稳定下来：

```text
Evidence is truth.
Synthesis is interpretation.
Context is a cited assembly for action.
```

---

## 2. 产品定位

Personal Memory Intelligence Layer 的一句话定位：

> 帮 Orbit 持续理解“用户正在做什么、为什么这么做、卡在哪里、下一步可以怎么推进”的个人上下文层。

它不是搜索功能，也不是另一个记忆列表。它是 Notes、Library、Resources、Projects、Areas、Tasks、Conversations、Activity、外部本地 AI 会话之间的连接层。

它需要服务三个核心体验：

1. **Ask Anywhere 更懂上下文**
   - 用户不必反复解释最近做了什么。
   - 回答能说明引用了哪些证据、哪些记忆、哪些提炼。

2. **Review 能主动发现开放回路**
   - 哪些对话隐含了未完成任务。
   - 哪些阅读/笔记反复指向同一主题。
   - 哪些项目决策需要沉淀或复盘。

3. **Agent 执行前能拿到正确背景**
   - 当前项目目标是什么。
   - 最近相关会话讨论到哪里。
   - 哪些约束、偏好、失败经验应该被带入 prompt。

---

## 3. 非目标

本阶段不做：

- 不做一个独立的“AI 会话查看器”。
- 不把所有本地 agent transcript 全量复制进 vault。
- 不让 AI 提炼结果自动创建 Note / Task / Resource / Memory core。
- 不把 graph 当成最终答案源。
- 不要求第一版就做完整知识图谱、LLM entity merge 或跨月趋势分析。
- 不把 FeedItem 重新定义为 truth。Feed 的 Layer 0 语义保持不变。

---

## 4. 数据分层修正

现有四层仍然成立，但 Layer 1 需要更精确地区分两类 truth。

```text
Layer 0  Signal Sources
         未确认、可过期、低承诺输入：feeds, raw inbound, browser candidates

Layer 1  Ground Truth / Evidence
         用户确认或真实发生过的个人资料与工作事实
         - Direct Truth: Notes, Library, Resources, Projects, Tasks, Areas, Conversations
         - Reference Truth: External AI Sessions, external files, imported KB refs

Layer 2  Intelligence / Synthesis
         摘要、关系、Personal QA、MemoryNode、reports、open loops、context packets

Layer 3  Surfaces
         Ask Anywhere, Search, Review, Today, Timeline, Memory Explorer, Project Room
```

### 4.1 Direct Truth

Direct Truth 是 Orbit 自己拥有正文和生命周期的实体：

- Note
- LibraryItem
- Resource
- Project
- Task
- Area
- Conversation
- Activity / TraceableEvent

这些实体可以被编辑、归档、版本化，并且其主要内容存储在 vault 或 `.orbit/` 下。

### 4.2 Reference Truth

Reference Truth 是 Orbit 承认其为用户事实，但不一定拥有全文副本的实体。

第一批目标：

- External AI Session
- External file / folder reference
- Imported KB document reference
- Future: calendar event, GitHub issue/PR, email thread

Reference Truth 必须满足：

- 有稳定 `source_id`
- 有可验证原始位置或 snapshot
- 有 fingerprint / mtime / size / provider metadata
- 有 provider 能按需读取全文或片段
- 有 availability 状态
- 有隐私/索引策略

也就是说，truth layer 不等于“全文复制”。truth layer 的最低要求是：Orbit 能稳定引用、检查变化、按需读取、对提炼结果给出证据。

---

## 5. 核心抽象一：Evidence Source Registry

Personal Memory Intelligence Layer 的第一块地基是 `EvidenceSourceRegistry`。

它统一记录所有可作为证据的来源，不论来源是 Orbit 内部实体，还是外部本地会话。

```typescript
export type EvidenceSourceKind =
  | 'note'
  | 'library_item'
  | 'resource'
  | 'project'
  | 'area'
  | 'task'
  | 'conversation'
  | 'activity_event'
  | 'external_ai_session'
  | 'external_file'
  | 'kb_doc';

export type EvidenceOwnership = 'orbit_owned' | 'reference' | 'snapshot';

export type EvidenceAvailability =
  | 'available'
  | 'changed'
  | 'missing'
  | 'permission_denied'
  | 'snapshotted';

export interface EvidenceSource {
  id: string;
  kind: EvidenceSourceKind;
  ownership: EvidenceOwnership;
  title: string;
  summary?: string;
  provider_id: string;
  canonical_ref: string;
  created_at?: string;
  updated_at: string;
  observed_at: string;
  time_range?: { from?: string; to?: string };
  scope_refs?: Array<{
    kind: 'project' | 'area' | 'resource' | 'task' | 'note' | 'library';
    ref: string;
    confidence?: number;
  }>;
  fingerprint: {
    algorithm: 'sha256' | 'mtime-size' | 'provider-version';
    value: string;
    size_bytes?: number;
    mtime?: string;
  };
  availability: EvidenceAvailability;
  privacy: {
    index_level: 'metadata_only' | 'safe_projection' | 'full_text';
    allow_synthesis: boolean;
    allow_tool_outputs: boolean;
    redaction_profile?: 'default' | 'code' | 'strict';
  };
  snapshot_ref?: string;
  metadata?: Record<string, unknown>;
}
```

### 5.1 存储位置

```text
<vault>/.orbit/evidence/
├── sources.json                  # source_id -> EvidenceSource summary
├── providers.json                # provider config and health
├── snapshots/
│   └── <source-id>/
│       ├── manifest.json
│       └── content.ndjson | content.md
└── projections/
    └── <source-id>.safe.json     # optional cached safe projection
```

### 5.2 为什么不是直接扩展 SemanticDocument

`SemanticDocument` 是索引用投影，不是证据本身。它会丢信息、清洗 Markdown、切 chunk、移除工具输出，不能承担 truth registry 的职责。

正确关系是：

```text
EvidenceSource  ->  EvidenceExcerpt  ->  SemanticDocument
       truth           cited read          index projection
```

---

## 6. 核心抽象二：Source Provider

每类 truth source 都通过 provider 接入。

```typescript
export interface SourceProvider {
  id: string;
  kind: EvidenceSourceKind;

  list(input: SourceListInput): Promise<EvidenceSource[]>;
  get(sourceId: string): Promise<EvidenceSource | null>;
  read(selector: EvidenceSelector): Promise<EvidenceReadResult>;
  search?(input: ProviderSearchInput): Promise<EvidenceSelector[]>;
  fingerprint(source: EvidenceSource): Promise<EvidenceSource['fingerprint']>;
  snapshot?(sourceId: string, options?: SnapshotOptions): Promise<EvidenceSnapshot>;
}
```

### 6.1 EvidenceSelector

所有 Layer 2 artifact 都必须引用 selector，而不是只引用模糊的 source id。

```typescript
export type EvidenceSelectorKind =
  | 'whole_source'
  | 'message_range'
  | 'event_range'
  | 'line_range'
  | 'time_range'
  | 'semantic_chunk';

export interface EvidenceSelector {
  source_id: string;
  kind: EvidenceSelectorKind;
  range?: {
    from?: string | number;
    to?: string | number;
  };
  role_filter?: Array<'user' | 'assistant' | 'system' | 'tool'>;
  content_view: 'metadata' | 'safe_projection' | 'full';
  reason?: string;
}
```

### 6.2 EvidenceReadResult

```typescript
export interface EvidenceReadResult {
  source: EvidenceSource;
  selector: EvidenceSelector;
  excerpts: EvidenceExcerpt[];
  completeness: 'metadata_only' | 'partial' | 'complete';
  redactions?: Array<{ kind: string; count: number }>;
}

export interface EvidenceExcerpt {
  id: string;
  selector: EvidenceSelector;
  title?: string;
  text: string;
  role?: 'user' | 'assistant' | 'system' | 'tool';
  at?: string;
  metadata?: Record<string, unknown>;
}
```

这个设计保证以后接入 Codex / Claude / Amp 时，不需要让 Search、Synthesis、Memory 知道每个工具自己的文件格式。

---

## 7. 核心抽象三：Context Packet

PMIL 最重要的运行时产物不是“记忆节点”，而是 `ContextPacket`。

`ContextPacket` 是 Orbit 给 Ask Anywhere、task agent、Review、Project Room 组装上下文的标准包。它必须可解释、可裁剪、可缓存、可审计。

```typescript
export interface ContextPacket {
  id: string;
  purpose: 'ask' | 'task' | 'review' | 'project' | 'area' | 'resource';
  scope: {
    kind: 'global' | 'project' | 'area' | 'resource' | 'task' | 'note' | 'library';
    ref?: string;
  };
  query?: string;
  generated_at: string;
  freshness: {
    evidence_until: string;
    stale_sources?: string[];
  };
  budget: {
    max_tokens: number;
    estimated_tokens: number;
  };
  sections: ContextSection[];
  evidence: EvidenceSelector[];
  synthesis_refs: string[];
  memory_refs: string[];
  open_loop_refs?: string[];
}

export interface ContextSection {
  kind:
    | 'vision'
    | 'scope_summary'
    | 'recent_work'
    | 'relevant_evidence'
    | 'memories'
    | 'decisions'
    | 'open_loops'
    | 'constraints'
    | 'suggested_next_steps';
  title: string;
  content: string;
  citations: EvidenceSelector[];
  priority: number;
}
```

### 7.1 Context Packet 的原则

- 必须引用 evidence。
- 必须区分事实、提炼、建议。
- 必须有 token budget。
- 必须能解释“为什么这条记忆被带入”。
- 不能把 tool output / secret-heavy transcript 默认塞入 prompt。
- 可以短期缓存，但不能成为唯一 truth。

### 7.2 Context Packet 与 SynthesisArtifact 的关系

`ContextPacket` 可以有两种形态：

- 临时运行时对象：Ask / agent 调用前即时生成。
- Debug artifact：用户或开发者需要审计时写入 `.orbit/context-packets/`。

不建议把每个 context packet 都作为长期 `SynthesisArtifact`，否则会制造大量低价值噪声。只有 review / report 级别的 context assembly 才需要长期 artifact。

---

## 8. Personal Memory Intelligence 数据产品

Layer 2 应该产出一组互相配合的数据产品，而不是散落的摘要。

### 8.1 Personal QA

Personal QA 用来缓存高复用问题的答案。

```typescript
export interface PersonalQA {
  question: string;
  answer: string;
  confidence: number;
  sources: EvidenceSelector[];
  related_entities: string[];
  useful_for: Array<'ask' | 'review' | 'task_context' | 'resource'>;
}
```

适合的问题：

- 为什么我做了某个项目决策？
- 我对某个主题反复担心什么？
- 某个 Resource 的当前立场是什么？
- 最近某个 Project 的主要 blocker 是什么？

Synthesis kind：

```typescript
'qa.personal'
```

Scope key：

```text
qa:source:<source-id>
qa:entity:<kind>:<id>
qa:cluster:<cluster-id>
qa:period:<YYYY-MM-DD..YYYY-MM-DD>
```

### 8.2 MemoryNode v2

现有 MemoryNode 已经有基础，但需要明确它和 evidence / synthesis 的关系。

MemoryNode 表示跨时间稳定下来的个人记忆，不是每次对话的摘要。

建议扩展 kind：

```typescript
export type MemoryKind =
  | 'interest'
  | 'preference'
  | 'pattern'
  | 'lesson'
  | 'goal'
  | 'decision'
  | 'belief'
  | 'working_style'
  | 'entity_memory';
```

MemoryNode 必须保留：

- sources: EvidenceSelector[]
- supporting_artifacts: SynthesisArtifact ids
- confidence
- stability
- user_confirmed
- last_recalled_at
- recall impact

重要规则：

- MemoryNode 可以由 synthesis 建议，但不能直接成为 `stable` 或 `core`，除非证据积累或用户确认。
- MemoryNode 应该可编辑、可拒绝、可降权。
- Memory recall 必须记录 RecallEvent。

### 8.3 Work Context

为了达成“了解用户在做什么”，需要一个显式的 Work Context artifact。

```typescript
export interface WorkContext {
  id: string;
  scope: { kind: 'global' | 'project' | 'area' | 'resource'; ref?: string };
  period: { from: string; to: string };
  current_focus: string;
  active_threads: Array<{
    title: string;
    summary: string;
    evidence: EvidenceSelector[];
    confidence: number;
    likely_next_steps: string[];
    blockers?: string[];
  }>;
  decisions: Array<{
    title: string;
    status: 'made' | 'pending' | 'reversed';
    evidence: EvidenceSelector[];
  }>;
  open_loops: string[];
}
```

Synthesis kind：

```typescript
'work.context'
```

这个 artifact 是 Today、Ask Anywhere、Project Room、Review 的核心输入。

### 8.4 Open Loop

Open Loop 是“用户可能需要回头处理的未闭环事项”。

```typescript
export interface OpenLoop {
  id: string;
  title: string;
  kind: 'question' | 'task_candidate' | 'decision_pending' | 'follow_up' | 'stale_context';
  status: 'candidate' | 'accepted' | 'dismissed' | 'resolved';
  severity: 'info' | 'suggestion' | 'warning';
  rationale: string;
  evidence: EvidenceSelector[];
  suggested_actions: Array<
    | { kind: 'create_task'; title: string; project_ref?: string }
    | { kind: 'create_note'; title: string; note_type: 'thought' | 'capture' | 'longform' }
    | { kind: 'link_resource'; resource_ref: string }
    | { kind: 'schedule_review'; date?: string }
  >;
}
```

Open Loop 默认是 candidate。用户接受后才创建 Task / Note / Review action。

Synthesis kind：

```typescript
'report.open_loops'
```

### 8.5 Entity Profile

Entity Profile 是个人维度的概念页，不是团队 wiki。

```typescript
export interface EntityProfile {
  entity_id: string;
  canonical_name: string;
  kind: 'person' | 'project' | 'resource' | 'concept' | 'tool' | 'company' | 'book' | 'author';
  aliases: string[];
  summary: string;
  claims: Array<{
    text: string;
    evidence: EvidenceSelector[];
    confidence: number;
  }>;
  timeline: Array<{
    at: string;
    event: string;
    evidence: EvidenceSelector[];
  }>;
  related_entities: Array<{ entity_id: string; relation: string; strength: number }>;
}
```

Synthesis kind：

```typescript
'entity.profile'
```

第一版可以只对 Resource / Project / Area / recurring terms 生成，不需要全量 NER。

---

## 9. Relation Graph Foundation

Graph 的第一版目标不是“智能推理”，而是低成本导航。

### 9.1 Node

```typescript
export type GraphNodeKind =
  | EvidenceSourceKind
  | 'memory'
  | 'entity'
  | 'synthesis_artifact'
  | 'open_loop';

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  source_id?: string;
  entity_ref?: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}
```

### 9.2 Edge

```typescript
export type GraphEdgeKind =
  | 'mentions'
  | 'co_occurs'
  | 'derived_from'
  | 'supports'
  | 'contradicts'
  | 'updates_belief'
  | 'belongs_to_area'
  | 'linked_to_resource'
  | 'conversation_about'
  | 'project_inspired_by'
  | 'same_work_thread';

export interface GraphEdge {
  id: string;
  kind: GraphEdgeKind;
  from: string;
  to: string;
  strength: number;
  evidence: EvidenceSelector[];
  generated_by: 'deterministic' | 'synthesis';
  created_at: string;
}
```

### 9.3 第一版只做确定性 skeleton

输入：

- frontmatter tags
- resource refs
- area refs
- project/task links
- conversation scope
- synthesis sources
- wikilinks
- titles and repeated terms
- time-window co-occurrence

输出：

- `related evidence`
- `neighbor expansion`
- `same work thread` candidates

LLM refinement 后置。不要让第一版 graph 依赖昂贵模型。

---

## 10. 处理流水线

标准流水线：

```text
TraceableEvent / source scan
  -> EvidenceSourceRegistry update
  -> SourceProvider safe projection
  -> SemanticDocument chunks
  -> deterministic graph skeleton
  -> candidate tables
  -> targeted synthesis jobs
  -> MemoryNode / QA / WorkContext / OpenLoop / EntityProfile
  -> ContextPacket assembly
  -> Ask / Review / Agent prompt / UI
```

### 10.1 Evidence 更新

触发源：

- note.updated
- library.item.*
- conversation.message.added
- task/project/resource/area events
- synthesis.artifact.created
- external source scan result

行为：

- 更新或创建 EvidenceSource
- 检查 fingerprint
- 标记 changed / missing
- 触发 projection stale

### 10.2 Safe Projection

每个 provider 必须提供 safe projection。

默认策略：

- user / assistant text 可以进入 safe projection
- tool call name 可以进入 safe projection
- tool input 默认只保留结构摘要
- tool output 默认不进入全文索引，除非 provider 或用户允许
- secrets / env / tokens / private keys 必须 redaction

这既保护隐私，也避免 agent transcript 的巨大输出污染搜索。

### 10.3 Chunking

Chunk 必须保留 selector，而不是只有文本。

```typescript
export interface SemanticChunk {
  id: string;
  source_id: string;
  selector: EvidenceSelector;
  text: string;
  title?: string;
  kind: 'summary' | 'message' | 'paragraph' | 'event' | 'tool_summary';
  token_estimate: number;
}
```

### 10.4 Candidate Tables

LLM 不应该直接扫全库构建关系。先生成候选表：

```text
candidate_id | phrase | source_count | source_kinds | scopes | co_occurs | samples
```

LLM 只做：

- merge alias
- remove noise
- name cluster
- upgrade relation type
- extract claims
- produce QA / open loops

---

## 11. Ask Anywhere Recall Contract

Ask Anywhere 需要从“搜索几条结果”升级为“上下文组装”。

```text
user question
  -> scope detection
  -> evidence search
  -> graph neighbor expansion
  -> memory recall
  -> relevant synthesis lookup
  -> context packet
  -> answer with citations
  -> optional suggested actions
```

### 11.1 回答必须区分来源

回答中要能区分：

- Source Truth: 来自 Layer 1 evidence
- Synthesis: 来自 Layer 2 artifact
- Memory: 来自 MemoryNode
- Inference: 当前回答中的推断

### 11.2 RecallEvent

任何 MemoryNode 被带入 context packet，都写 recall。

```typescript
export interface RecallEvent {
  id: string;
  memory_id: string;
  context_packet_id: string;
  triggered_by: { kind: 'ask' | 'task' | 'review' | 'manual'; ref?: string };
  score: number;
  reasons: string[];
  occurred_at: string;
  feedback?: 'helpful' | 'not_relevant';
}
```

---

## 12. 本地 Agent 会话源如何接入

这部分不是第一步实现，但 foundation 必须为它预留准确位置。

### 12.1 语义

本地 Agent 会话是 Layer 1 Reference Truth：

- 它记录用户真实工作过程。
- Orbit 不一定拥有其全文副本。
- Orbit 必须能按需读取、引用、snapshot。
- 它的摘要和建议属于 Layer 2。

### 12.2 Provider 形式

```typescript
export interface ExternalAISessionProvider extends SourceProvider {
  id: 'codex-local' | 'claude-code-local' | 'amp-local' | 'copilot-local' | string;
  kind: 'external_ai_session';
}
```

每个本地 agent adapter 只需要实现：

- list sessions
- read metadata
- read full transcript
- read message range
- safe projection
- fingerprint
- snapshot

### 12.3 不默认导入为 Conversation

外部会话不应该默认写入 `.orbit/conversations/`，否则会混淆两个语义：

- `Conversation`: Orbit-owned chat record
- `ExternalAISession`: reference truth from another runtime

两者可以互相转换：

- `snapshot external session`：把原文规范化保存到 evidence snapshot
- `materialize as Conversation`：用户想在 Orbit chat surface 里完整浏览/继续组织时创建 Conversation
- `save span as Note`：用户只想沉淀片段

### 12.4 索引策略

默认：

- metadata 全量索引
- user messages 和 assistant text 进入 safe projection
- thinking 可由用户开关
- tool call names 进入 projection
- tool inputs 做结构摘要
- tool results 不全文索引，只保留短摘要和可按需读取 selector

用户可对 provider 配置：

- `metadata_only`
- `safe_projection`
- `full_text`

---

## 13. 新增 Synthesis Kinds

建议在现有 `SYNTHESIS_KINDS` 上增加：

```typescript
export type SynthesisKind =
  | ExistingKinds
  | 'qa.personal'
  | 'distill.conversation'
  | 'work.context'
  | 'entity.profile'
  | 'graph.relations'
  | 'report.open_loops'
  | 'report.periodic';
```

Scope key 约定：

| Kind | Scope key |
|---|---|
| `qa.personal` | `qa:<scope-kind>:<scope-ref>:<hash>` |
| `distill.conversation` | `conversation:<conversation-id>` |
| `work.context` | `work:<scope-kind>:<scope-ref>:<period>` |
| `entity.profile` | `entity:<entity-kind>:<entity-id>` |
| `graph.relations` | `graph:<scope-kind>:<scope-ref>:<version>` |
| `report.open_loops` | `open-loops:<scope-kind>:<scope-ref>:<period>` |
| `report.periodic` | `report:<daily|weekly|monthly>:<period>` |

外部 AI 会话进入后：

```text
distill.external_session:<source-id>
qa.external_session:<source-id>:<hash>
```

可以先复用 `distill.conversation` 的 payload，但 source kind 应该是 `external_ai_session`。

---

## 14. UI 与体验落点

### 14.1 Ask Anywhere

新增上下文可解释区：

- 引用的 evidence
- 使用的 memories
- 使用的 synthesis artifacts
- stale / missing source 提醒
- “保存回答为 Note”
- “创建 Task”
- “查看证据片段”

### 14.2 Review

Review 变成 PMIL 的行动面：

- open loops
- stale context
- conversations worth distilling
- memories needing confirmation
- project drift
- resource update candidates

### 14.3 Project Room

Project Room 不只显示当前 Orbit task sessions，还应该显示：

- related evidence sources
- recent work context
- related external AI sessions
- project decisions
- blockers / open loops

外部 AI 会话源实现后，只需要 Project Room 查询 `EvidenceSource.scope_refs`。

### 14.4 Memory Explorer

Memory Explorer 需要显示：

- memory summary
- supporting evidence
- recall history
- confidence / stability
- confirm / reject / merge / archive

---

## 15. 实施顺序

### Phase A: Evidence Foundation

Status: implemented (foundation), 2026-05-15.

范围：

- 新增 EvidenceSource / EvidenceSelector / SourceProvider shared contracts
- 新增 `.orbit/evidence/` registry
- 为 Note / Library / Resource / Project / Area / Task / Conversation / Activity / KB Doc 做 provider shim
- SemanticDocument 增加 selector/provenance backref

验收：

- 现有 Layer 1 实体都能列为 EvidenceSource：已覆盖主要 Orbit-owned entities
- 每条 SemanticDocument 能追溯到 EvidenceSelector：已为 Layer 1 semantic projectors 写入 `source_id` 与 `evidence_selectors`
- registry 能标记 source changed / missing：已实现 provider replace sync，并保留 previous fingerprint

### Phase B: Graph Skeleton

Status: implemented (foundation), 2026-05-15.

范围：

- 确定性 relation extractor：已基于 evidence chunks 的 entities / scope refs 建立零 LLM 图骨架
- GraphNode / GraphEdge store：已写入 `.orbit/graph/pmil-graph.json`
- graph neighbor query：已支持 entity / scope / node id 的 1-hop 查询
- Search result “related evidence” 扩展：尚未接入 Search UI / Ask Anywhere UI

验收：

- Note / Resource / Conversation / Project 能通过显式 ref 形成 graph edge：foundation 已覆盖 source scope 与 entity mentions/co-occurs
- Search 可以展示“为什么相关”和 neighbor expansion：ContextPacket 已可消费 graph neighbors，Search UI 尚未展示

### Phase C: Context Packet Builder

Status: implemented (runtime foundation), 2026-05-16.

范围：

- ContextPacket contract：已新增 shared contract
- scope detection
- evidence search + graph expansion + memory recall + synthesis lookup：已支持 evidence chunk search + graph expansion + Personal QA synthesis lookup；memory 未接入
- token budget packing：已支持基础 section budget 裁剪
- debug view：Search PMIL section 已可显示 packet sections，并可按 selector 查看证据片段

验收：

- Ask Anywhere 可生成带 citations 的 context packet：Ask Anywhere send() 已调用 `buildContextPacket(..., purpose: ask, synthesis_mode: ensure)` 并注入 prompt
- task/project scope 能得到不同 packet：scope contract 已支持，测试覆盖 resource scope
- packet 中事实、记忆、提炼、建议分区明确：facts / graph / synthesis sections 已区分，memory sections 待接入

### Phase D: Intelligence Artifacts

Status: partially implemented (Personal QA + deterministic Work Context/Open Loops), 2026-05-16.

范围：

- `qa.personal`：已实现 kind / payload / deterministic chunk-based generator / semantic projection / ContextPacket injection
- `work.context`：已实现 deterministic artifact payload，并由 Review run 写入 SynthesisArtifact
- `report.open_loops`：已实现 deterministic open-loop candidates，并转成 Review findings
- MemoryNode extractor v2
- RecallEvent

验收：

- Review 能展示 open loops candidates：已在 Review 页面显示 PMIL Work Context 面板，并将 open-loop candidates 写入 findings
- Ask 能显示 personal QA hits
- Memory recall 可解释且可反馈

### Phase E: Surfaces

Status: partially implemented (Search + Ask + Review + Project Room foundation), 2026-05-16.

范围：

- Ask Anywhere context injection：已接入 prompt，并以 PMIL context chips + Stage `pmil.context_packet` artifact 显示可解释区
- Review workspace open-loop queue：已通过 `report.open_loops` artifact + Review findings 显示第一版
- Project Room recent work context panel：已新增 PMIL 上下文 tab，调用 `context.workContext` 展示 current focus / active threads / open loops / decisions / evidence drill-down
- Memory Explorer evidence inspector
- Search PMIL context section：已实现，Search response 可附带 ContextPacket，UI 展示 context sections / citations / Personal QA 命中，并支持 evidence drill-down

验收：

- 用户能看到“Orbit 为什么认为我在做 X”：Search / Ask / Review / Project Room foundation 已支持
- 用户能接受/驳回建议
- 用户能从任何 synthesis 回到证据片段：Search / Ask ContextPacket / Project Room drill-down 已实现；Review 深层 citation drawer 与 Memory Explorer 待补齐

### Phase F: Local Agent Session Source

Status: implemented (provider foundation), 2026-05-15.

范围：

- `external_ai_session` evidence kind：已接入 EvidenceSource
- Codex provider：已支持默认 `~/.codex/sessions` JSONL scan foundation
- Claude Code provider：已支持默认 `~/.claude/projects` / `~/.claude-internal/projects` JSONL scan foundation
- session safe projection：已实现，safe projection 跳过 tool/system/tool-result 内容，`full` view 仍可按需读取原始文件
- snapshot / materialize as Conversation / save span as Note

验收：

- Orbit 能列出本地 Codex / Claude sessions：provider foundation 已支持，尚未接入 UI / settings
- 不导入全文也能生成 EvidenceSource：已实现 reference-truth registry entry
- Ask / Review / Project Room 能按需读取相关会话片段：chunk index 可消费，Ask/Project Room 已有通用 evidence read 入口；session-specific surface 仍待补齐
- 所有提炼结果都引用 session selector：EvidenceChunk / ContextPacket path 已支持，session-specific distillation 尚未接入

---

## 16. 技术权衡

### 16.1 Reference Truth vs Import Everything

选择：Reference Truth。

理由：

- 本地 agent 会话可能很大，且包含敏感工具输出。
- 不同 provider 的原始格式会变，直接复制会造成迁移负担。
- Orbit 的价值是引用、提炼、召回、行动，不是拥有每个字节。

代价：

- 原始 provider 数据被清理后可能 missing。
- 需要 availability / snapshot 机制。
- Provider read contract 必须做扎实。

### 16.2 Deterministic Graph First vs LLM Graph First

选择：Deterministic first。

理由：

- 成本低。
- 可重算。
- 可解释。
- 不容易把幻觉关系写进基础图。

代价：

- 第一版 relation recall 不够聪明。
- alias merge 和 claim extraction 会比较弱。

### 16.3 Context Packet as Runtime Object vs SynthesisArtifact

选择：默认 runtime object，必要时 debug persist。

理由：

- 每次 Ask 都存 artifact 会制造噪声。
- Context 是针对一次任务和预算的组装，不一定有长期价值。

代价：

- Debug 和可审计性需要额外开关。

---

## 17. 风险

| 风险 | 严重度 | 缓解 |
|---|---|---|
| Evidence registry 变成第二套数据库 | 高 | SourceProvider 只记录引用和索引状态，不复制业务实体 truth |
| 外部 transcript 含敏感信息 | 高 | 默认 safe projection，tool output 不全文索引，支持 redaction |
| Graph 质量太低 | 中 | 第一版只用于 navigation，不作为最终答案 |
| Synthesis artifacts 过多 | 中 | ContextPacket 默认不持久化，reports 才持久化 |
| Memory 误判用户偏好 | 高 | confidence/stability/user_confirmed/feedback 全部可见 |
| 接入 agent sessions 后格式漂移 | 中 | provider adapter + snapshot + fingerprint |

---

## 18. Open Questions

- `external_ai_session` 是否应该加入 `SynthesisSourceKind`，还是统一映射为 `conversation` 加 metadata？建议加入，避免混淆 Orbit-owned Conversation。
- Evidence registry 是否需要单独 IPC namespace，还是先藏在 semantic/memory 后面？建议单独 namespace，后续 agent tools 也需要读。
- ContextPacket 是否需要用户可见历史？建议开发者模式先可见，普通用户只看 context chips。
- External session snapshot 默认策略是什么？建议“用户 pin / distill / save span 时 snapshot”，普通 scan 不 snapshot。
- Thinking 内容是否进入 safe projection？建议默认不进，用户/provider 可开启。

---

## 19. Checklist 状态

已覆盖：

- 变更范围：PMIL foundation、EvidenceSource、ContextPacket、Graph skeleton、Synthesis kinds、外部 agent session 接入边界。
- 变更前后：从“记忆/摘要功能集合”调整为“evidence-first intelligence layer”。
- 受影响文档：本 plan、ADR-023、docs index、旧 PMIL 草案入口。
- 重大决策：用 ADR-023 记录。

仍需后续用户拍板：

- 是否接受 `external_ai_session` 作为独立 Layer 1 source kind。
- 是否优先实现 Evidence Foundation，而不是先做 Codex/Claude session adapter。
- 是否把第一版 UI 入口放在 Ask Anywhere/Review/Project Room，而不是新增顶级 Intelligence 页面。
