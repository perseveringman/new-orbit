# Orbit Synthesis Layer

> **Status**: accepted draft
> **Purpose**: 统一 Orbit 内所有 AI 生成内容的模型、存储、失效、预算、调用与消费方式。

---

## 1. Definition

Synthesis Layer 是 Orbit 的 Layer 2。它负责把 Layer 1 的真相数据转化为 AI 生成的二级产物：摘要、提炼、关系、主题涌现、归属建议、叙事、索引等。

它不是一个功能，而是一层基础设施。

---

## 2. What belongs here

属于 Synthesis：

- Daily / Weekly / Monthly / Yearly Summary
- Timeline narrative
- Library distillation
- Resource emergence suggestions
- Entity summaries：Note / Project / Resource / Area / Person
- Area assignment suggestions
- Relation graph suggestions
- Search answer synthesis
- Memory digest
- Feed daily digest / feed clusters（isolated namespace）

不属于 Synthesis：

- 用户手写 Note
- 用户保存的 Library item
- Resource / Project / Area 实体本身
- Task 执行产生的代码 / 文件 diff
- Agent run 的原始事件流

---

## 3. Core model

```typescript
export type SynthesisKind =
  | 'summary.daily'
  | 'summary.weekly'
  | 'summary.monthly'
  | 'summary.yearly'
  | 'summary.entity'
  | 'distill.library'
  | 'emerge.resource'
  | 'relate.notes'
  | 'classify.area'
  | 'timeline.narrative'
  | 'memory.digest'
  | 'search.answer'
  | 'review.weekly'
  | 'feed.digest'
  | 'feed.cluster';

export interface SynthesisSource {
  kind: 'note' | 'library' | 'feed' | 'resource' | 'project' | 'area' |
        'task' | 'conversation' | 'event' | 'timeline_range' | 'kb' | 'raw';
  ref?: string;
  range?: { from: string; to: string };
  weight?: number;
}

export interface SynthesisArtifact {
  id: string;
  kind: SynthesisKind;
  scope_key: string;
  sources: SynthesisSource[];
  provenance: SynthesisProvenance;
  payload: unknown;
  status: 'fresh' | 'stale' | 'superseded' | 'failed';
  created_at: string;
  invalidated_at?: string;
  superseded_by?: string;
  user_edited?: boolean;
}
```

---

## 4. Provenance

Every artifact must record:

```typescript
export interface SynthesisProvenance {
  runtime: 'sdk:anthropic' | 'sdk:minimax' | 'sdk:deepseek' | 'cli:claude' | string;
  model: string;
  prompt_version: string;
  generated_at: string;
  cost_usd?: number;
  tokens?: { input: number; output: number; cache_read?: number };
  trace_id?: string;
}
```

A synthesis result without provenance is invalid.

---

## 5. Storage

```text
<vault>/.orbit/synthesis/
├── index.json                  # scope_key → latest artifact id
├── artifacts/
│   └── synth-xxx.json
└── dlq/
    └── failed-job-xxx.json
```

Materialized files are optional projections:

- `summary.daily` → `notes/daily-summaries/YYYY-MM-DD.md`
- `summary.weekly` → `notes/weekly-summaries/YYYY-Www.md`
- accepted `distill.library` → real Note
- accepted `emerge.resource` → real Resource

`.orbit/synthesis` stores metadata truth; Markdown projection is for user reading/editing.

---

## 6. Scope keys

Scope keys provide idempotence.

| kind | scope key |
|---|---|
| `summary.daily` | `daily:<YYYY-MM-DD>` |
| `summary.weekly` | `weekly:<YYYY-Www>` |
| `summary.monthly` | `monthly:<YYYY-MM>` |
| `summary.entity` | `entity:<kind>:<id>` |
| `distill.library` | `library:<library-item-id>` |
| `emerge.resource` | `emerge:cluster:<cluster-id>` |
| `classify.area` | `area-classify:<entity-kind>:<entity-id>` |
| `timeline.narrative` | `timeline:<date>:<segment>` |
| `feed.digest` | `feed:daily:<YYYY-MM-DD>` |
| `feed.cluster` | `feed:cluster:<source>:<hash>` |

Recompute creates a new artifact and marks previous one `superseded`; it does not overwrite history.

---

## 7. Invalidating artifacts

Artifacts become stale when any source changes.

Examples:

- `note.updated` invalidates `summary.entity` for that note and any `relate.notes` involving it.
- `library.item.annotated` invalidates `distill.library`.
- `resource.ref.linked` invalidates resource summary and resource health synthesis.
- `area.assignment.changed` invalidates area dashboard synthesis.
- `feed.item.fetched` invalidates feed digest only, not global synthesis.

Invalidation is event-driven through TraceableEvent subscription.

---

## 8. Scheduler

Synthesis jobs run through a low-priority background scheduler.

Job fields:

```typescript
interface SynthesisJob {
  id: string;
  kind: SynthesisKind;
  scope_key: string;
  sources: SynthesisSource[];
  priority: 'user-blocking' | 'interactive' | 'background' | 'maintenance';
  reason: 'missing' | 'stale' | 'manual' | 'scheduled';
  created_at: string;
  budget_usd?: number;
}
```

Priority rules:

- user clicks “generate now” → `user-blocking`
- Ask-Anywhere needs context summary → `interactive`
- nightly recompute → `background`
- old artifact refresh → `maintenance`

The scheduler must obey global budget and per-kind default budget.

---

## 9. Runtime selection

Default runtime: Runtime B（SDK track）.

| kind | default runtime |
|---|---|
| summaries | `sdk:anthropic-compatible` |
| library distill | `sdk:anthropic-compatible` |
| resource emergence | `sdk:anthropic-compatible` |
| relation graph | `sdk:anthropic-compatible` |
| code review synthesis | `cli:claude` or task runtime |

Synthesis should rarely use external CLI agents. CLI agents are reserved for long-running tasks or tool-heavy work.

---

## 10. Prompt registry

All prompt templates live in a registry:

```text
src/main/synthesis/prompts/
├── registry.ts
├── summary.daily.v1.ts
├── distill.library.v1.ts
├── emerge.resource.v1.ts
└── classify.area.v1.ts
```

Template contract:

```typescript
interface PromptTemplate<Input, Output> {
  kind: SynthesisKind;
  version: string;
  render(input: Input): { system: string; user: string; tools?: unknown[] };
  parse(response: unknown): Output;
  outputSchema: unknown;
  defaultBudget: { input_tokens: number; output_tokens: number; usd?: number };
}
```

Prompt version is part of provenance.

---

## 11. IPC contract

```typescript
IPC.synthesis = {
  get(scope_key: string): Promise<SynthesisArtifact | null>;
  getMany(scope_keys: string[]): Promise<Record<string, SynthesisArtifact | null>>;
  ensure(input: EnsureSynthesisInput): Promise<SynthesisArtifact>;
  recompute(scope_key: string, options?: { force?: boolean }): Promise<SynthesisArtifact>;
  applyUserEdit(artifact_id: string, patch: unknown): Promise<SynthesisArtifact>;
  list(filter: SynthesisFilter): Promise<SynthesisArtifact[]>;
};
```

---

## 12. UI rules

Any surface rendering synthesis must show, at least in compact form:

- generated time
- stale/fresh status
- source count
- refresh action
- “AI generated” affordance

If the artifact was user-edited, UI should show “edited by user” and avoid auto-overwriting the materialized Markdown projection.

---

## 13. Acceptance criteria

- One artifact store backs all AI summaries and suggestions.
- Daily Summary is no longer a special implementation; it is `summary.daily`.
- Resource suggestions are `emerge.resource` artifacts before acceptance.
- Feed digest is isolated and never pollutes Library.
- Artifacts carry provenance and budget accounting.
- Stale artifacts are visible and refreshable.
