# Phase 7–8 Plan — Memory, Search, Review, Vision, Gateway

> **Goal**: 在 Phase 5–6 的数据与 Synthesis 地基上，把 Orbit 变成可唤回、可复盘、可远程触达、可自动运转的个人系统。
> **Depends on**: Phase 5 Synthesis + Conversation, Phase 6 Knowledge Stack.

---

## Phase 7.1 — Real Semantic Search

### Scope

Replace the current hash-trick vector store with a real semantic index and hybrid search.

### Data model

```typescript
export interface SemanticDocument {
  id: string;
  entity_kind: 'note' | 'library' | 'resource' | 'project' | 'area' | 'conversation' | 'synthesis';
  entity_ref: string;
  title: string;
  text: string;
  metadata: Record<string, unknown>;
  updated_at: string;
}

export interface EmbeddingRecord {
  doc_id: string;
  model: string;
  dimensions: number;
  vector_ref: string;
  content_hash: string;
  embedded_at: string;
}
```

### Components

- `semantic/document-projectors.ts`
- `semantic/index-store.ts`
- `semantic/embedder.ts`
- `semantic/hybrid-search.ts`
- `semantic/ipc.ts`

### UI

- global Search page
- command palette semantic mode
- result labels: source truth / synthesis / feed-only
- filters by entity kind, area, resource, date
- “Ask across results” → `search.answer` synthesis

### Acceptance

- Search can retrieve semantically related notes/resources/conversations.
- Search results show layer and provenance.
- Index updates incrementally on TraceableEvent.

---

## Phase 7.2 — Memory Layer

### Scope

Build a persistent memory system on top of semantic index, TraceableEvent, and Synthesis.

### Data model

```typescript
export interface MemoryNode {
  id: string;
  kind: 'interest' | 'preference' | 'pattern' | 'lesson' | 'entity-memory';
  title: string;
  summary: string;
  sources: SynthesisSource[];
  confidence: number;
  stability: 'volatile' | 'stable' | 'core';
  created_at: string;
  updated_at: string;
  recall_count: number;
}

export interface RecallEvent {
  id: string;
  memory_id: string;
  triggered_by: string;
  used_in: 'ask' | 'task' | 'synthesis' | 'search';
  occurred_at: string;
}
```

### Components

- memory extractor from conversations/reviews
- memory digest synthesis
- recall service
- memory explorer UI
- memory merge/split/edit actions

### UI

- Memory Explorer
- entity memory sidebar
- recall history
- “promote memory to Resource / Project”
- confidence and stability controls

### Acceptance

- Important patterns can be promoted into durable memory.
- Agent/Ask sessions can explain which memories were recalled.
- User can edit/delete memory.

---

## Phase 7.3 — Review System

### Scope

Create daily/weekly/monthly review loops over Timeline, Area, Resource, Project, and Memory.

### Data model

```typescript
export interface ReviewRun {
  id: string;
  kind: 'daily' | 'weekly' | 'monthly' | 'area' | 'resource' | 'project';
  scope_ref?: string;
  period: { from: string; to: string };
  generated_artifact_id: string;
  status: 'generated' | 'reviewed' | 'actions-created' | 'archived';
}

export interface ReviewFinding {
  id: string;
  severity: 'info' | 'suggestion' | 'warning';
  title: string;
  rationale: string;
  suggested_actions: ReviewAction[];
}
```

### UI

- Review top-level page
- weekly review dashboard
- findings cards
- actions: create task / archive / schedule / assign area / refresh resource
- review history

### Acceptance

- Weekly review can identify stale projects, unassigned notes, dormant resources, and area imbalance.
- Findings can be converted into tasks/actions.

---

## Phase 7.4 — Vision System

### Scope

Rebuild Vision as a living planning system tied to Areas, Projects, Resources, and Timeline.

### Data model

```typescript
export interface VisionGoal {
  id: string;
  title: string;
  horizon: 'life' | '5y' | '1y' | 'quarter';
  description: string;
  area_refs: string[];
  status: 'active' | 'paused' | 'completed' | 'dropped';
}

export interface VisionMilestone {
  id: string;
  goal_id: string;
  title: string;
  target_date?: string;
  project_refs?: string[];
  completed_at?: string;
}
```

### UI

- Vision dashboard
- goal hierarchy
- area alignment map
- milestones timeline
- drift warnings
- review prompt: “does this still matter?”

### Acceptance

- Areas and projects can trace back to Vision goals.
- Reviews can identify drift or neglect.

---

## Phase 8.1 — Gateway Daemon + Telegram

### Scope

Enable Orbit outside desktop UI.

### Data model

```typescript
export interface GatewayChannel {
  id: string;
  kind: 'telegram' | 'webhook' | 'email' | 'shortcut';
  enabled: boolean;
  config_ref: string;
  bound_user?: string;
}

export interface InboundMessage {
  id: string;
  channel_id: string;
  text?: string;
  attachments?: Array<{ kind: string; url?: string; path?: string }>;
  received_at: string;
  routed_to: 'capture' | 'ask' | 'library-gate';
}
```

### Components

- Gateway daemon process
- channel abstraction
- Telegram bot adapter
- app ↔ gateway IPC
- vault write coordination

### UI

- Gateway settings
- bind Telegram user
- channel health
- remote session history
- push preferences

### Acceptance

- User can send Telegram message to Ask-Anywhere.
- User can forward URL to Library gate.
- Daily summary can push to Telegram.

---

## Phase 8.2 — Scheduled Automation

### Scope

Provide recurring tasks and system automation.

### Data model

```typescript
export interface ScheduledTask {
  id: string;
  title: string;
  schedule: ScheduleSpec;
  action: ScheduledAction;
  scope?: ConversationScope | { kind: 'area'; area_slug: string };
  enabled: boolean;
  created_at: string;
}

export interface TaskExecution {
  id: string;
  scheduled_task_id: string;
  started_at: string;
  completed_at?: string;
  status: 'running' | 'success' | 'failed' | 'skipped';
  output_ref?: string;
}
```

### System tasks

- daily summary
- weekly review
- monthly review
- resource health scan
- area review reminders
- stale project detector
- feed daily digest

### UI

- Scheduled Tasks page
- list/calendar view
- create/edit wizard
- execution history drawer
- run now action

### Acceptance

- User can schedule recurring AI tasks.
- All executions are traceable and budgeted.

---

## Phase 8.3 — External Connectors

Future connectors:

- Browser extension
- Mobile share extension
- Calendar
- GitHub
- Email
- Health

Rule: all external connectors enter Layer 0 first. Promotion gates decide what becomes Layer 1.

---

## Recommended order

1. Semantic search
2. Memory layer
3. Review system
4. Vision system
5. Gateway daemon
6. Telegram channel
7. Scheduled automation UI
8. External connectors

---

## Risks

| Risk | Mitigation |
|---|---|
| Semantic index complexity | keep full-text fallback; incremental rollout by entity kind |
| Memory feels creepy/wrong | user-editable memory, provenance, delete controls |
| Review becomes notification spam | review is pull-based by default, only summary pushes |
| Gateway secrets/security | keychain, allowlist bound user, local daemon only |
| Automation spends money | budget per scheduled task and global cap |
| Vision becomes ceremony | tie vision to actual Area/Project evidence |
