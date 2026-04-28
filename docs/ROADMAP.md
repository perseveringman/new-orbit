# Orbit — Roadmap

> **Status**: Phase 4.1 已完成；下一阶段进入 Phase 5：SDK Runtime + Synthesis Layer + Conversation Surface 稳定化。
> **Update cadence**: 每个里程碑落地后更新；架构方向以 `docs/architecture/` 为准；thinking-trail 记录推理过程。

---

## 0. 当前北极星

Orbit 是一个 **local-first、vision-driven、AI-native 的个人知识与执行工作台**。

最新架构共识：

```text
Layer 0  Signal Sources   Feeds / raw captures / gateway inbound
Layer 1  Ground Truth     Notes / Library / Resources / Projects / Areas / Conversations
Layer 2  Synthesis        AI-generated artifacts / projections / summaries / relations
Layer 3  Surfaces         Timeline / Chat / Search / Dashboard / Resource / Area UI
```

最重要的修正：**Feeds 不是用户数据。只有进入 Library 才算用户数据。**

---

## 1. 已完成里程碑

### v1 基础设施（M1–M7）

| Milestone | Delivered |
|---|---|
| M1 | Electron shell, workspace/settings IPC, WelcomeView |
| M2 | File system layer, refmap, watcher, MiniSearch, editor |
| M3 | PARA directory model, schemas, task index, Kanban |
| M4 | Claude Code runner, hydration protocol, cost logs, RunnerPool |
| M5 | Git worktree, ghost commit, pre-merge check, InstallLock, ports |
| M6 | BudgetGate / BudgetWatch / daily cost report |
| M7 | Project distillation, hash-trick vector store, experience wake-up |

### v1 Project-as-Folder rebuild（R1–R7）

| Milestone | Delivered |
|---|---|
| R1 | Project as folder, per-project git |
| R2 | Vision-first dashboard, New Project wizard |
| R3 | Four-section Task Editor |
| R4 | Project Room: Kanban + terminal + sessions |
| R5 | Orbit Hooks MCP server（later deprecated by CLI-first） |
| R6 | Night Shift batch runner（later deprecated by Auto-runner） |
| R7 | Worktree GC + Daily Review |

### v2 Execution Model（2026-04-26）

| Subsystem | Status |
|---|---|
| Night Shift → 24×7 Auto-runner | completed |
| Agent autonomy boundaries / folded subtasks | completed |
| ExecutionContext split: Worktree / Sandbox abstraction | completed |
| Inbox as human-AI collaboration hub | completed |
| propose-approve authorization chain | completed |
| task dependency model | completed |
| CLI-first AI-native interface | completed |
| Activity Log infrastructure | completed |
| Capture tri-partition | completed |
| Quick Capture MVP | completed |

### Phase 3 — Agent Observability & Resilience

| Subsystem | Status |
|---|---|
| Agent Playground and scenario harness | completed |
| Runtime adapter layer | completed |
| Activity timeline UI | completed |
| Task-session binding + resume | completed |
| Runtime fallback + budget | completed |
| Unified event replay + Developer Console | completed |
| Global Dashboard v1 | completed |

### Phase 4 — Lifecycle + Ask-Anywhere UX

| Subsystem | Status |
|---|---|
| Task / Agent Session state decoupling | completed |
| Agent Onboarding Protocol | completed |
| Switch Runtime handoff | completed |
| lifecycle scenario infrastructure | completed |
| Ask-Anywhere overlay + full-page two-column revamp | completed |

---

## 2. Phase 5 — Runtime B + Synthesis Foundation + Conversation Unification

**Goal**: 把 AI 从“执行任务的外部 agent”扩展成“应用内部可编排的智能生成层”。

### 5.1 Runtime B：Anthropic SDK track

Deliverables:

- `@anthropic-ai/sdk` integration
- Anthropic-compatible endpoint registry
- built-in endpoint templates: Anthropic / MiniMax / DeepSeek / Custom
- key storage through system keychain
- streaming adapter → unified AgentEvent
- cost accounting for SDK calls
- Settings UI for SDK endpoints

Data structures:

- `SDKEndpoint`
- `SDKInvocation`
- `SDKCostProfile`
- `RuntimeRouteDecision`

UI:

- Settings → AI Endpoints
- endpoint test button
- masked key state
- per-use-case default runtime selector（Ask / Synthesis / Background）

Acceptance:

- Ask-Anywhere can stream via SDK.
- MiniMax / DeepSeek Anthropic-compatible endpoints can be configured.
- SDK events render through existing message timeline.

### 5.2 Synthesis Layer foundation

Deliverables:

- `src/shared/synthesis/*` contracts
- `.orbit/synthesis/` artifact store
- prompt registry
- initial kinds: `summary.daily`, `distill.library`, `emerge.resource`, `classify.area`
- invalidator subscribed to TraceableEvent
- scheduler with budget controls
- IPC: get / ensure / recompute / list / applyUserEdit

Data structures:

- `SynthesisArtifact`
- `SynthesisSource`
- `SynthesisProvenance`
- `SynthesisJob`
- `PromptTemplate`

UI:

- synthesis status affordance（fresh/stale/generated time/source count）
- refresh/recompute action
- “accept suggestion” cards
- artifact debug panel in Developer Console

Acceptance:

- Daily Summary is backed by `summary.daily` artifact.
- Resource suggestions are backed by `emerge.resource` artifacts.
- Stale artifacts are detectable and refreshable.

### 5.3 Conversation Surface unification

Deliverables:

- first-class `Conversation` store
- overlay and full-page share same conversation
- conversation dropdown in overlay top bar
- new conversation action from overlay
- shared message render primitives
- shared Stage View / Artifact cards
- scope-aware context injection

Data structures:

- `Conversation`
- `ConversationMessage`
- `ConversationScope`
- `ConversationArtifactRef`

UI:

- `ConversationShell`
- `ConversationHeader`
- `ConversationListDropdown`
- `MessageTimeline`
- `MessageComposer`
- `ArtifactStage`

Acceptance:

- Opening overlay defaults to last active conversation.
- Same conversation is visible in full page.
- Task / Ask-Anywhere / Resource / Area chat reuse same component family.

---
## 3. Phase 6 — Knowledge Stack Completion

**Goal**: 完成 Notes / Library / Feeds / Timeline / Resource / Area 的知识复利闭环。

### 6.1 Notes and KB import

Deliverables:

- top-level Notes view
- note type directories: thoughts / longforms / captures / voice_logs / daily-summaries
- note list / editor / search
- KB import into `knowledge-base/`
- KB activation flow → Note
- welcome analysis flow

Data structures:

- `Note`
- `NoteFrontmatter`
- `NoteType`
- `KnowledgeBaseRegistry`
- `KBDocRef`
- `ActivationOrigin`

UI:

- Notes sidebar filters by type/tag/area/resource
- simple markdown editor
- note detail right panel: backlinks / resources / areas / synthesis summary
- KB import wizard
- “activate into note” action

Acceptance:

- Users can browse, edit, and search Notes.
- Imported KB remains separate until activated.
- Activation creates Note with origin metadata.

### 6.2 Library workstation

Deliverables:

- Library item model for articles/PDF/videos/bookmarks
- save-from-url flow
- reading status / progress / annotations
- Library → Note distillation via Synthesis
- Library → Resource linking

Data structures:

- `LibraryItem`
- `LibraryStatus`
- `LibraryAnnotation`
- `LibrarySource`
- `DistillationArtifactRef`

UI:

- Library list with status filters
- reader panel / metadata panel
- annotations sidebar
- distill button
- link to Resource action

Acceptance:

- A feed item or URL can become LibraryItem.
- User can annotate and mark read.
- Distillation produces synthesis artifact and accepted Note.

### 6.3 Feed reader as Layer 0

Deliverables:

- Feed source management
- feed item fetcher / dedupe / fade-out rules
- feed reader UI separate from Inbox
- feed-scoped synthesis: digest / cluster / relate-to-library
- Save to Library gate

Data structures:

- `FeedSource`
- `FeedItem`
- `FeedDigestArtifact`
- `FeedClusterArtifact`
- `FeedRecommendation`

UI:

- Feed Reader page
- source list
- daily digest card
- clustered topic cards
- item action: Save to Library / Ignore / Hide source
- “related to your Resource” badges

Acceptance:

- Feed items never directly enter Resource or main Library index.
- Save creates LibraryItem and emits promote event.
- Feed digest does not pollute main synthesis index.

### 6.4 Daily Timeline

Deliverables:

- Timeline one-level entry
- day/week/month/year views
- projection from TraceableEvent
- aggregation rules
- AI daily summary from Synthesis
- PDF export

Data structures:

- `TimelineEntry`
- `DailyTimeline`
- `DailyStats`
- `MonthlyIndex`
- `YearlyIndex`

UI:

- day view with time segments
- “today glance” card
- daily summary card
- weekly cards
- monthly calendar heatmap
- yearly heatmap
- export PDF action

Acceptance:

- Layer 1 events render correctly.
- Layer 2 developer events are hidden unless developer mode.
- Layer 3 noise never appears.

### 6.5 Resource workstation

Deliverables:

- Resource top-level entry
- six-section workspace
- resource refs and counts
- engagement tracking
- emerge.resource suggestions
- Resource-scoped Timeline
- link note/library/project/person/area

Data structures:

- `ResourceFrontmatter`
- `ResourceRef`
- `ResourceEngagement`
- `ResourceSuggestion`
- `.orbit-resource.json`

UI:

- three-column Resource workstation
- resource list + suggestions
- center: index.md and sections
- right: meta / timeline / actions
- create-from-suggestion card

Acceptance:

- Resource can emerge from notes/library/conversation clusters.
- Engagement updates depth/status suggestions.
- Resource accepts only Layer 1 refs.

### 6.6 Area dashboard and assignment

Deliverables:

- Area as long-term coordinate
- `areas` assignment on major entities
- Area Dashboard
- area-scoped Ask-Anywhere context
- classify.area synthesis suggestions
- area-scoped scheduled tasks and memories

Data structures:

- `AreaConfig`
- `AreaRef`
- `AreaHealth`
- `AreaDashboardData`
- `AreaAssignmentSuggestion`

UI:

- Area list
- Area Dashboard cards: active projects / resources / notes / feed radar / synthesis summary
- unassigned entities queue
- accept area assignment suggestions
- Area review flow

Acceptance:

- Note/Library/Resource/Project can belong to Areas.
- Area dashboard is assembled, not manually maintained.
- Area-scoped chat injects correct context.

---
## 4. Phase 7 — Semantic Memory, Search, Review, Vision

**Goal**: 让 Orbit 从“保存知识”进化到“主动唤回、关联、复盘、校准愿景”。

### 7.1 Real semantic index

Deliverables:

- replace hash-trick embedding with real embeddings
- unified index over Notes / Library / Resource / Project / Area / Conversations / Synthesis artifacts
- incremental indexing on TraceableEvent
- hybrid search: full-text + vector + graph refs

Data structures:

- `SemanticDocument`
- `EmbeddingRecord`
- `IndexShard`
- `SearchResult`
- `SearchAnswerArtifact`

UI:

- global semantic search
- filters by layer/entity/kind/source
- “why this result” explanation
- search answer synthesis

Acceptance:

- Searching a concept surfaces notes, resources, conversations, and summaries together with layer labels.

### 7.2 Memory layer

Deliverables:

- Memory digest artifacts
- long-term interest model
- entity recall counts
- “this memory was recalled N times” metadata
- memory explorer

Data structures:

- `MemoryDigest`
- `InterestSignal`
- `RecallEvent`
- `MemoryNode`

UI:

- Memory Explorer
- entity memory sidebar
- recall history
- “promote memory to Resource / Project” action

Acceptance:

- Past projects and notes can wake up in future tasks/Ask sessions.
- Recall is traceable and explainable.

### 7.3 Weekly / monthly review

Deliverables:

- system scheduled review tasks
- weekly timeline summary
- PARA health check
- Area review
- Resource review
- open loops / stale projects detection

Data structures:

- `ReviewRun`
- `ReviewFinding`
- `ReviewAction`
- `HealthScore`

UI:

- Weekly Review page
- review inbox cards
- accept actions: archive, refresh, create task, schedule follow-up

Acceptance:

- User can review a week from one page and convert findings into concrete actions.

### 7.4 Vision system revival

Deliverables:

- Vision initialization and periodic review
- goals → areas → projects traceability
- vision drift detection
- “does this still match your vision?” prompts

Data structures:

- `VisionDocument`
- `VisionGoal`
- `VisionMilestone`
- `GoalAreaLink`
- `VisionReviewArtifact`

UI:

- Vision dashboard
- goal tree
- area alignment heatmap
- milestone timeline

Acceptance:

- Areas and projects can be traced back to Vision goals.
- Review can detect neglected goals and overgrown areas.

---

## 5. Phase 8 — Gateway, Automation, External World

**Goal**: 让 Orbit 脱离桌面 UI 的限制，成为随时可触达、可自动执行的个人系统。

### 8.1 Gateway daemon and Telegram channel

Deliverables:

- independent Gateway daemon
- Telegram bot channel
- app ↔ gateway IPC
- remote capture
- remote Ask-Anywhere
- daily summary push

Data structures:

- `GatewayConfig`
- `GatewayChannel`
- `InboundMessage`
- `OutboundMessage`
- `RemoteSession`

UI:

- Gateway settings
- channel binding wizard
- message history / health state

Acceptance:

- User can send message from Telegram and get Ask-Anywhere response.
- User can forward URL from phone into Library gate.

### 8.2 Scheduled automation

Deliverables:

- scheduled task top-level UI
- system tasks: daily summary, weekly review, resource health scan
- user-created recurring tasks
- execution history
- notifications / Inbox message integration

Data structures:

- `ScheduledTask`
- `ScheduleSpec`
- `TaskExecution`
- `ScheduledAction`

UI:

- Scheduled Tasks page
- calendar/list view
- execution history drawer
- create/edit wizard

Acceptance:

- User can create recurring AI tasks safely with visible history.

### 8.3 External event connectors

Future connectors:

- Calendar
- GitHub
- Email
- Health
- Browser extension
- Mobile share extension

Rules:

- external events first enter Layer 0
- promotion gates decide what becomes Layer 1
- privacy controls before feeding to Synthesis

---

## 6. Phase 9+ — Scale, Portability, Collaboration Boundaries

Long-term work:

- large vault performance
- cross-platform packaging
- encrypted/private event classes
- export yearly timeline book
- optional cloud sync without proprietary lock-in
- collaboration through Git/PR/export, not real-time multi-user editing
- plugin/tool pack ecosystem

---

## 7. Recommended implementation order

```text
Phase 5.1 Runtime B SDK
  ↓
Phase 5.2 Synthesis Artifact Store + Prompt Registry
  ↓
Phase 5.3 Conversation Surface Unification
  ↓
Phase 6.1 Notes + KB Import
  ↓
Phase 6.2 Library
  ↓
Phase 6.3 Feed Reader as Layer 0
  ↓
Phase 6.4 Timeline
  ↓
Phase 6.5 Resource Workstation
  ↓
Phase 6.6 Area Dashboard
  ↓
Phase 7 Semantic Search + Memory + Review + Vision
  ↓
Phase 8 Gateway + Automation
```

Rationale:

- SDK before Synthesis because Synthesis needs cheap programmable LLM calls.
- Synthesis before Timeline/Resource/Area because summaries and suggestions should not be feature-local.
- Conversation unification before scoped chat because Area/Resource chat should not fork UI.
- Notes/Library before Resource because Resource only makes sense when it can aggregate real notes/materials.
- Feeds before Timeline integration because Timeline should show feed-save events, not raw feed fetches.
- Area after Resource because Area Dashboard needs projects/resources/notes to aggregate.

---

## 8. Explicit non-goals

- No proprietary cloud storage as source of truth.
- No automatic promotion from Feed to Library without user approval.
- No AI-generated content silently overwriting user truth.
- No team-first realtime collaboration.
- No unbounded background AI spending.
- No duplicate chat implementations per surface.

---

## 9. Core architecture documents

Read in this order:

1. `docs/architecture/data-layering.md`
2. `docs/architecture/ai-runtime-and-sdk.md`
3. `docs/architecture/synthesis-layer.md`
4. `docs/architecture/chat-conversation-surface.md`
5. `docs/architecture/entity-flow.md`
6. `docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/07-sdk-synthesis-layering.md`

---

## 10. How to update this roadmap

1. Move delivered work from future phases to completed sections.
2. Keep `docs/architecture/` as the stable source of truth.
3. Keep `thinking-trail/` as reasoning history, not implementation contract.
4. Every new cross-cutting decision should either create an ADR or update one of the architecture documents.
