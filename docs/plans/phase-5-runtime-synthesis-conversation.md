# Phase 5 Plan — Runtime B + Synthesis + Conversation Surface

> **Goal**: 为 Orbit 增加应用内部可编排 AI 能力，并统一所有 chat surface。
> **Depends on**: Phase 3/4 runtime adapter, event replay, Ask-Anywhere UX.
> **Architecture refs**: `docs/architecture/ai-runtime-and-sdk.md`, `docs/architecture/synthesis-layer.md`, `docs/architecture/chat-conversation-surface.md`.

---

## Milestone 5.1 — Runtime B SDK Track

Status: **implemented (foundation)**.

### Scope

Add a native SDK runtime track for short, programmable LLM calls.

### Shared contracts

Files:

- `src/shared/runtime/sdk.ts`
- `src/shared/runtime/route.ts`
- extend existing runtime event types if needed

Types:

```typescript
export interface SDKEndpoint {
  id: string;
  label: string;
  provider: 'anthropic' | 'minimax' | 'deepseek' | 'custom';
  protocol: 'anthropic-compatible';
  baseURL: string;
  keyRef: string;
  defaultModel: string;
  modelAlias?: Record<string, string>;
  costProfile?: SDKCostProfile;
  enabled: boolean;
}

export interface SDKInvocationInput {
  endpointId?: string;
  model?: string;
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  traceId?: string;
}
```

### Main process

Files:

- `src/main/runtime/sdk/endpoint-registry.ts`
- `src/main/runtime/sdk/anthropic-sdk-adapter.ts`
- `src/main/runtime/sdk/key-vault.ts`
- `src/main/runtime/router.ts`
- `src/main/runtime/sdk/ipc.ts`

Implementation:

1. Add endpoint registry with built-in templates.
2. Add keychain-backed secret read/write.
3. Implement non-streaming and streaming Anthropic SDK invocation.
4. Map SDK events into unified `AgentEvent`.
5. Emit cost events.
6. Add runtime route decision: ask/synthesis/background → SDK by default.

### Renderer

UI:

- Settings → AI Endpoints
- endpoint list, add/edit/delete
- key status: configured / missing / invalid
- test endpoint button
- default endpoint selectors for Ask / Synthesis / Background

### Tests

- endpoint registry serialization
- model alias resolution
- route decision logic
- stream event mapping
- cost estimation
- key masking

### Acceptance

- User can configure MiniMax / DeepSeek Anthropic-compatible endpoint.
- Ask-Anywhere can stream from SDK.
- SDK invocation and cost events appear in the TraceableEvent observability stream.

### Implementation notes

- Shared contracts live in `src/shared/runtime/*` and are exposed through `IPC.runtime.sdk`.
- Main-process services live in `src/main/runtime/sdk/*` plus `src/main/runtime/router.ts`.
- The endpoint registry stores non-secret endpoint metadata in `.orbit/runtime/sdk-endpoints.json`.
- Runtime B keys are stored through `SDKKeyVault`; renderer receives only configured/masked state.
- Ask-Anywhere now asks the router for an `ask` route. If SDK is configured it streams through `@anthropic-ai/sdk`; if not, the existing Claude CLI path remains the fallback.
- Tests: `tests/sdk_runtime.test.ts`.

---

## Milestone 5.2 — Synthesis Foundation

Status: **implemented (foundation)**.

### Scope

Implement artifact store, prompt registry, scheduler, and initial synthesis kinds.

### Shared contracts

Files:

- `src/shared/synthesis/types.ts`
- `src/shared/synthesis/payloads.ts`
- `src/shared/synthesis/ipc.ts`

Types:

```typescript
export interface SynthesisArtifact { /* see architecture doc */ }
export interface SynthesisJob { /* see architecture doc */ }
export interface EnsureSynthesisInput {
  kind: SynthesisKind;
  scope_key: string;
  sources: SynthesisSource[];
  priority?: SynthesisJob['priority'];
  force?: boolean;
}
```

### Main process

Files:

- `src/main/synthesis/store.ts`
- `src/main/synthesis/index-file.ts`
- `src/main/synthesis/scheduler.ts`
- `src/main/synthesis/invalidator.ts`
- `src/main/synthesis/runner.ts`
- `src/main/synthesis/prompts/registry.ts`
- `src/main/synthesis/prompts/summary.daily.v1.ts`
- `src/main/synthesis/prompts/distill.library.v1.ts`
- `src/main/synthesis/prompts/emerge.resource.v1.ts`
- `src/main/synthesis/prompts/classify.area.v1.ts`
- `src/main/synthesis/ipc.ts`

Implementation steps:

1. Build append-only artifact store with `index.json` latest pointer.
2. Implement `get`, `getMany`, `list`, `write`, `markStale`, `supersede`.
3. Implement prompt registry and JSON parsing.
4. Implement runner using Runtime B router.
5. Implement queue with priority and daily budget.
6. Subscribe invalidator to TraceableEvent kinds.
7. Add IPC.

### Initial synthesis kinds

#### `summary.daily`

Input:

- Timeline entries for day
- DailyStats

Payload:

```typescript
interface DailySummaryPayload {
  headline: string;
  narrative: string;
  highlights: string[];
  tomorrow?: string[];
}
```

Materialization:

- `notes/daily-summaries/YYYY-MM-DD.md`

#### `distill.library`

Input:

- Library item metadata/content/annotations

Payload:

```typescript
interface LibraryDistillPayload {
  title: string;
  summary: string;
  key_points: string[];
  quotes?: string[];
  suggested_note_type: 'capture' | 'longform';
}
```

Acceptance:

- Creates Note with origin metadata.

#### `emerge.resource`

Input:

- note clusters / tag frequency / library refs / conversations

Payload:

```typescript
interface ResourceEmergencePayload {
  title: string;
  slug: string;
  rationale: string;
  samples: SynthesisSource[];
  suggested_sections: Array<{ section: string; source: SynthesisSource }>;
}
```

Acceptance:

- Creates Resource and links samples.

#### `classify.area`

Input:

- entity content + existing areas

Payload:

```typescript
interface AreaClassificationPayload {
  suggestions: Array<{ area_slug: string; confidence: number; reason: string; primary?: boolean }>;
}
```

Acceptance:

- Adds AreaRef to entity.

### Renderer

Components:

- `components/synthesis/SynthesisBadge.tsx`
- `components/synthesis/SynthesisStatus.tsx`
- `components/synthesis/SynthesisActionCard.tsx`
- `components/synthesis/ArtifactDebugPanel.tsx`

### Tests

- artifact supersede behavior
- stale invalidation
- prompt version stored in provenance
- scheduler respects budget
- malformed model output goes to failed artifact / DLQ

### Acceptance

- Daily summary is a synthesis artifact.
- Resource suggestion is a synthesis artifact before acceptance.
- Stale state appears in UI.

### Implementation notes

- Shared contracts: `src/shared/synthesis/types.ts`, `payloads.ts`, `ipc.ts`.
- Main-process foundation: `src/main/synthesis/store.ts`, `index-file.ts`, `scheduler.ts`, `runner.ts`, `invalidator.ts`, `ipc.ts`.
- Prompt registry and initial templates: `src/main/synthesis/prompts/*`.
- Storage: `.orbit/synthesis/index.json`, `.orbit/synthesis/artifacts/*.json`, `.orbit/synthesis/dlq/*.json`.
- Daily Summary generation now writes a `summary.daily` artifact and records `synthesis_ref` in the timeline summary.
- Resource suggestions now flow through an `emerge.resource` artifact and only become Resources after explicit user acceptance.
- UI primitives: `components/synthesis/SynthesisBadge`, `SynthesisStatus`, `SynthesisActionCard`, `ArtifactDebugPanel`.
- Tests: `tests/synthesis_store.test.ts`.

---

## Milestone 5.3 — Conversation Surface Unification

Status: **implemented (foundation)**.

### Scope

Unify Ask-Anywhere overlay, full-page Ask-Anywhere, task activity chat, and future scoped chats around one conversation component model.

### Shared contracts

Files:

- `src/shared/conversation/types.ts`
- `src/shared/conversation/ipc.ts`

Types:

```typescript
export interface Conversation { /* see architecture doc */ }
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  created_at: string;
  event_refs?: string[];
  artifact_refs?: string[];
}
```

### Main process

Files:

- `src/main/conversation/store.ts`
- `src/main/conversation/ipc.ts`
- `src/main/conversation/title.ts`
- `src/main/conversation/context.ts`

Implementation:

1. Persist conversations under `.orbit/conversations/`.
2. Maintain last active conversation per scope.
3. Support create/list/get/update/archive.
4. Attach runtime invocation stream to conversation messages.
5. Emit `conversation.started`, `conversation.message.added`, `conversation.meaningful`.

### Renderer

Files:

- `src/renderer/src/components/conversation/*`
- replace Ask-Anywhere overlay internals
- replace Ask-Anywhere page internals
- adapt Task Activity to shared message primitives

UI requirements:

- overlay default = last active global conversation
- top dropdown = switch conversation / new conversation / archive
- full page shows same selected conversation
- stage/artifact panel can appear both overlay and full page
- message rendering consistent

### Tests

- overlay/full-page state sync
- new conversation from overlay
- message persistence after reload
- scoped context injection
- artifact card actions shared

### Acceptance

- No duplicate chat renderer remains for Ask-Anywhere vs full page.
- Conversations can be scoped to resource/area later without new architecture.

### Implementation notes

- Shared conversation contracts live in `src/shared/conversation/types.ts` and now include `ConversationScope`, `ConversationMessage`, `ConversationArtifactRef`, `conversationScopeKey`, `anchorToConversationScope`, and `turnToMessage`.
- Conversation persistence remains local-first under `.orbit/conversations/`: `<id>.meta.json`, `<id>.ndjson`, and `index.json` for last-active-by-scope.
- Main-process APIs now support create/list/get/update/archive plus scoped last-active get/set through chat IPC and preload.
- Ask-Anywhere overlay and full-page Ask both render `src/renderer/src/components/conversation/ConversationShell.tsx` and share message timeline, composer, runtime status, conversation dropdown, archive, and Artifact Stage primitives.
- `conversation.message.added` and `conversation.meaningful` TraceableEvents are emitted alongside legacy conversation turn events for observability compatibility.
- Focused coverage: `tests/conversation_store.test.ts`, `tests/ask_anywhere_ux.test.ts`, `tests/ipc.test.ts`.

---

## Phase 5 rollout order

1. Runtime B SDK non-streaming
2. Runtime B SDK streaming + cost
3. Settings endpoint UI
4. Synthesis store + prompt registry
5. Daily summary via synthesis
6. Resource emergence artifact MVP
7. Conversation store
8. Overlay/full-page conversation unification
9. Developer Console artifact debug

---

## Phase 5 risks

| Risk | Mitigation |
|---|---|
| Anthropic-compatible providers differ subtly | endpoint capability flags + test endpoint action |
| AI JSON output invalid | schema parse + repair retry once + DLQ |
| Artifact over-generation burns budget | scheduler budget + stale batching |
| Chat refactor breaks task activity | migrate renderer primitives first, preserve task runtime store |
| Key leakage | keychain only, mask logs, no prompt/env echo |
