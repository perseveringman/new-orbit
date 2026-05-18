# Orbit — Roadmap

> **Status**: Phase 5 已完成基础闭环，Phase 6.1 Notes + KB Import / AI Workbench / Markdown Live Preview 已落地 foundation；下一步进入 Phase 6.2 Library workstation。
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

### 2026-05-13 — Ask Anywhere OpenClaw parity foundation

Status: **implemented (foundation)**.

Delivered:

- Ask Anywhere agent tool registry now exposes OpenClaw-inspired web, shell, browser, and subagent tool families.
- `orbit_shell_run` runs bounded argv-style local commands through Agent Authority.
- `orbit_browser_open` / `orbit_browser_snapshot` / `orbit_browser_close` provide rendered public-page inspection.
- `orbit_subagent_spawn` / `orbit_subagent_list` / `orbit_subagent_stop` provide first helper-agent control surface with profile-based authority checks.
- Tool Registry workspace page shows active tools, planned OpenClaw parity tools, risk levels, permissions, and remaining gaps.

Next parity backlog:

- richer browser actions with final-click safeguards
- session history/send/status APIs
- automation cron/heartbeat tooling
- plugin/gateway tool bridge
- media/PDF tool family

### 2026-05-13 — Project workdir decoupling

Status: **implemented**.

Delivered:

- Project config now separates vault coordination folders from linked code
  workdirs.
- New project flows support linking existing code, scaffolding a new workdir,
  and importing GitHub repos into a chosen workdir.
- Agents, terminals, inspector files/changes, GitHub operations, CLI project
  commands, and project-specific worktrees resolve against `workdirPath`.
- Legacy in-vault projects remain supported through `linked_via:
  "legacy-in-vault"`.
- Project Room now supports relinking a project's workdir and moving legacy
  in-vault code payloads into an external workdir.
- Environment install actions resolve both vault-level and project-specific
  worktree IDs.
- Focused integration tests cover migration, external GitHub import, and
  external-workdir worktree launch.

### 2026-05-16 — PMIL Ask / Evidence / Review / Project Context loop

Status: **implemented (foundation)**.

Delivered:

- Ask Anywhere now injects a PMIL ContextPacket into each user send, after the existing scoped Orbit context, including evidence chunks, graph neighbors, Personal QA, and recalled MemoryNode entries.
- Evidence drill-down has a dedicated IPC/preload namespace (`evidence:list/get/read/sync`) so UI surfaces can read cited snippets by EvidenceSelector.
- Search PMIL context sections now expose "查看证据" actions for citation drill-down.
- Ask Anywhere now materializes each injected ContextPacket as a Stage artifact and shows PMIL context chips above the conversation, so prompt context is visible and inspectable.
- Review runs generate `work.context` and `report.open_loops` synthesis artifacts, then materialize open-loop candidates as Review findings.
- Review UI shows a Personal Memory Intelligence work-context panel with current focus, active threads, and open loops.
- `context:*` IPC/preload APIs expose reusable ContextPacket and Work Context builders for surfaces beyond Search/Review.
- Project Room now has a PMIL context tab that summarizes current focus, active threads, open loops, decisions, and cited evidence for the active project.
- Memory Explorer now exposes source evidence drill-down and recall feedback controls, so MemoryNode entries can be inspected and tuned.
- Registered Runtime session-library entries are retained in the default evidence chunk index, keeping `external_ai_session` truth sources available to normal recall/search rebuilds.
- Runtime session-library sources now have vault-level settings and filters in Settings → 记忆源, covering enabled state, scan limit, agent/project/path include/exclude lists, index level, and tool-output projection policy. The default scanner follows runtime-wide local history stores, not only sessions launched inside Orbit.
- `distill.external_session` and `entity.profile` synthesis foundations now summarize matched Runtime history sessions and graph entities into cited ContextPacket sections, with local deterministic fallback and prompt templates for later LLM refinement.
- Memory Explorer now includes a Runtime session-library workspace and entity profile workspace, so users can sync sessions, inspect safe projections, generate per-session summaries, and turn recurring themes into browsable profiles.
- Runtime history sessions can now be explicitly saved as Notes or materialized as Orbit Conversations from Memory Explorer, preserving the original session as reference-truth evidence while letting important spans enter Orbit-owned Layer 1 context.

Remaining gaps:

- Work Context / Open Loops are deterministic first-pass artifacts; richer LLM refinement and feedback loops remain future work.
- Runtime session-library providers still need message-range selectors, first-class snapshot storage, deeper per-session review actions, richer vendor-specific parsers, and timeline/project-room dedicated browsing beyond the Memory Explorer foundation.

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
| Orbit Mobile inbound ingest | completed; non-link captures materialize as Notes + `note.created`; URL shares materialize as Library items + `library.item.added`; content parsing now goes through the shared Content Connector layer with OpenCLI-first / built-in fallback support |

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

Status: **implemented (foundation)**.

Deliverables:

- `@anthropic-ai/sdk` integration
- Anthropic-compatible endpoint registry
- built-in endpoint templates: Anthropic / MiniMax / DeepSeek / Custom
- key storage through system keychain
- streaming adapter → chat RuntimeEvent stream
- cost accounting for SDK calls
- Settings UI for SDK endpoints

Implemented notes:

- Endpoint registry persists non-secret endpoint config under `.orbit/runtime/sdk-endpoints.json`.
- API keys are stored via the SDK key vault and exposed to renderer only as masked state.
- Ask-Anywhere routes to Runtime B SDK when an enabled endpoint with key exists, otherwise keeps the Claude CLI fallback.
- SDK cost and invocation lifecycle are published as TraceableEvent kinds under the `runtime` source.
- Focused tests cover registry serialization, model aliasing, route decisions, stream mapping, cost estimation, and key masking.

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

Status: **implemented (foundation)**.

Deliverables:

- `src/shared/synthesis/*` contracts
- `.orbit/synthesis/` artifact store
- prompt registry
- initial kinds: `summary.daily`, `distill.library`, `emerge.resource`, `classify.area`
- invalidator subscribed to TraceableEvent
- scheduler with budget controls
- IPC: get / ensure / recompute / list / applyUserEdit

Implemented notes:

- Shared contracts live in `src/shared/synthesis/*`.
- Artifact metadata is stored under `.orbit/synthesis/` with `index.json`, `artifacts/`, and `dlq/`.
- Recompute writes a new artifact and marks the previous artifact `superseded`; invalidation marks latest artifacts `stale`.
- Prompt registry includes `summary.daily`, `distill.library`, `emerge.resource`, and `classify.area` v1 templates with recorded prompt versions.
- Scheduler supports priorities and per-job/default budget checks; malformed model output is recorded as failed artifact + DLQ entry.
- Timeline Daily Summary now creates/reads a `summary.daily` artifact before materializing the user-requested daily-summary note.
- Resource “Suggest from Notes” now returns `emerge.resource` artifact-backed suggestions; creating a Resource remains an explicit user action.
- Renderer primitives show generated time, status, source count, refresh action, and an artifact debug panel in Developer Console.

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

Status: **implemented (foundation)**.

Deliverables:

- first-class `Conversation` store
- overlay and full-page share same conversation
- conversation dropdown in overlay top bar
- new conversation action from overlay
- shared message render primitives
- shared Stage View / Artifact cards
- scope-aware context injection

Implemented notes:

- Conversation shared contracts now include `ConversationScope`, `ConversationMessage`, and `ConversationArtifactRef` while preserving legacy turn storage.
- Main-process conversation storage persists metadata/turn logs under `.orbit/conversations/` and maintains `index.json` for last active conversation per scope.
- Conversation IPC now supports create/list/get/update/archive plus scoped last-active get/set.
- Ask-Anywhere overlay and full-page Ask now reuse the same `ConversationShell` component family, including shared message timeline, composer, runtime status, conversation dropdown, archive action, and artifact stage.
- Ask-Anywhere opens the last active global conversation and keeps overlay/full-page selection synchronized through the conversation store.
- Conversation events include `conversation.message.added` and `conversation.meaningful` in addition to existing compatibility events.

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

Status: **implemented (AI Workbench + Markdown Live Preview foundation)**.

Deliverables:

- top-level Notes view
- note type directories: thoughts / longforms / captures / voice_logs / daily-summaries
- note list / editor / search
- KB import into `knowledge-base/`
- KB activation flow → Note
- welcome analysis flow

Implemented notes:

- Notes live under `notes/thoughts`, `notes/longforms`, `notes/captures`, `notes/voice_logs`, and `notes/daily-summaries`.
- Note frontmatter supports `areas`, `resource_refs`, `source`, `special_marker`, and `synthesis_ref` so Notes can become the Layer 1 output primitive for later Resource/Area/Library flows.
- Notes IPC supports list/get/getByPath/create/update/archive/search and emits note TraceableEvents.
- Knowledge Base import copies Markdown folders into `knowledge-base/<kb-name>` and maintains `knowledge-base/.orbit-kb-meta/registry.json`.
- KB activation creates a Note with `source.kind = kb`, records activation metadata under `.orbit-kb-meta/annotations/`, and emits `kb.doc.activated`.
- Notes UI includes type/tag/area/resource filters, a Markdown editor, and a contextual side panel for backlinks/source/resources/areas/synthesis refs.
- Knowledge Base UI includes an import wizard, KB browser/search, welcome analysis, and Activate-to-Note action.
- Notes AI Workbench upgrades the top-level Notes surface into inbox/connect/express/settled processing queues.
- `summary.entity` and `relate.notes` artifacts now back per-note summary, key points, suggested tags, Area/Resource links, task extraction, longform distillation, Resource seed creation, and semantic note relations.
- Suggestions remain Layer 2 until explicit user acceptance through UI, IPC, CLI, or agent tools; acceptance updates Note frontmatter, creates longform Notes/Resources, links Resource refs, or submits task proposals.
- `orbit note ...` exposes queue/get/search/workbench/classify/relate/distill/propose-update/accept-suggestion/dismiss-suggestion for AI parity.
- Ask-Anywhere tool registry exposes note workbench/read relation tools plus a user-approved accept-suggestion write tool.
- Notes body editing now uses a source-first CodeMirror Live Preview editor: Markdown remains the stored Layer 1 truth, Live Preview hides common syntax outside the active editing line, and Source mode shows full Markdown.
- Notes editing autosaves with debounce and blur flush, while Workbench analysis remains an explicit user action.

Data structures:

- `Note`
- `NoteFrontmatter`
- `NoteType`
- `KnowledgeBaseRegistry`
- `KBDocRef`
- `ActivationOrigin`

UI:

- Notes sidebar filters by type/tag/area/resource
- CodeMirror Markdown editor with Live Preview / Source modes
- autosave status: Saved / Unsaved / Saving / Error
- note detail right panel: backlinks / resources / areas / synthesis summary
- AI Workbench: summary, proposals, semantic relations, accept/dismiss actions
- KB import wizard
- “activate into note” action

Acceptance:

- Users can browse, edit, and search Notes.
- Imported KB remains separate until activated.
- Activation creates Note with origin metadata.

### 6.2 Library workstation

Status: **implemented (foundation)**.

Deliverables:

- Library item model for articles/PDF/videos/bookmarks
- save-from-url flow
- reading status / progress / annotations
- Library → Note distillation via Synthesis
- Library → Resource linking

Implemented notes:

- Added first-class `LibraryItem` contracts for article/pdf/video/bookmark, reading status/progress, annotations, source metadata, area refs, resource refs, and distillation refs.
- Added top-level `window.orbit.library` IPC/API for save/list/get/update/archive/annotate/markRead/distill/acceptDistillation.
- Library items persist as Markdown under `library/articles`, `library/pdfs`, `library/videos`, and `library/bookmarks`; archive moves them to `04_Archives/library/...`.
- Distillation creates a `distill.library` SynthesisArtifact first; only `acceptDistillation` materializes a Note with source and synthesis provenance.
- Library UI now provides save URL, status filters, reader/editor panel, metadata panel, annotations, Distill, and Accept-to-Note actions.
- Existing `capture.library` APIs remain for Inbox/Feed compatibility until Phase 6.3 promotion gate migration.
- Mobile URL shares now create stable Library items (`lib-<capture_id>`) instead of Notes. Parsed source snapshots are stored under `.orbit/content/extracted/...` and referenced by `source_snapshot_ref`.
- Content extraction is routed through a shared Content Connector registry. OpenCLI is the first external connector target for WeChat/Xiaohongshu/X; the built-in HTML/oEmbed parser remains a fallback.

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

Status: **implemented (foundation)**.

Deliverables:

- Feed source management
- feed item fetcher / dedupe / fade-out rules
- feed reader UI separate from Inbox
- feed-scoped synthesis: digest / cluster / relate-to-library
- Save to Library gate

Implemented notes:

- Added first-class `FeedSource` / `FeedItem` contracts and top-level `window.orbit.feeds` IPC/API for source CRUD, fetch, item listing, seen/ignore, Save to Library, digest, and cluster.
- Raw feed items persist as Layer 0 JSON under `feeds/<source-id>/...`; `_sources.json` tracks feed subscriptions.
- RSS fetch uses source-level dedupe and never creates Notes, Resources, or Library items by itself.
- Save to Library is the promotion gate: it creates a first-class `LibraryItem`, marks the feed item as saved, and emits `promote.feed_to_library`.
- Feed digest and cluster produce feed-scoped SynthesisArtifacts (`feed.digest`, `feed.cluster`) and remain outside Layer 1 truth.
- Feed Reader UI provides source management, fetch controls, filters, item stream, save/seen/ignore actions, and digest/cluster previews.
- Feed readable extraction now calls the same Content Connector registry used by Library/mobile shares before writing `extracted_ref`.
- X sources now normalize `@handle` / profile URLs plus `x:following` / `x:for-you` timeline feeds, fetch the latest 20 posts through OpenCLI, dedupe globally by `x:<tweet_id>`, and remain Layer 0 until explicit Save to Library.
- Reddit subreddit sources now normalize `r/<name>` / subreddit URLs, fetch latest 20 posts with OpenCLI + public JSON fallbacks, dedupe by `reddit:<post_id>`, and save discussion Markdown only when promoted to Library.
- Hacker News sources now support top/new/best/show/ask/jobs channels through the public API, dedupe by `hackernews:<story_id>`, and preserve HN discussion links plus optional comments during Library promotion.

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

Status: **implemented (foundation)**.

Deliverables:

- Timeline one-level entry
- day/week/month/year views
- projection from TraceableEvent
- aggregation rules
- AI daily summary from Synthesis
- PDF export

Implemented notes:

- Timeline remains a projection over TraceableEvent; it does not add a new truth store.
- Added day/week/month/year contracts, time segments, merged weekly stats, monthly/yearly indexes, and `TimelineExportResult`.
- Layer policy is explicit: Layer 1 renders by default, Layer 2 appears only with developer mode, and raw feed fetch/noise stays hidden.
- Daily projection now covers Notes, Library, Feed save gates, KB activation, scheduled tasks, conversations, resources, and selected developer events.
- Aggregation merges short-window longform saves / annotations / task completions and preserves `derived_from` links.
- Manual daily summary uses `summary.daily` SynthesisArtifact, materializes a `daily_summary` Note only on user action, and emits `daily_summary.generated`.
- Timeline UI provides day/week/month/year modes, today glance, daily summary card, time segments, empty/loading/error states, developer toggle, and PDF export feedback.

Data structures:

- `TimelineEntry`
- `DailyTimeline`
- `DailyStats`
- `MonthlyIndex`
- `YearlyIndex`
- `WeeklyTimeline`
- `TimeSegmentGroup`
- `TimelineExportResult`

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

Status: **implemented (foundation)**.

Deliverables:

- Resource top-level entry
- six-section workspace
- resource refs and counts
- engagement tracking
- emerge.resource suggestions
- Resource-scoped Timeline
- link note/library/project/person/area

Implemented notes:

- Resource contracts now include area assignment, engagement/depth/status metadata, sectioned refs, canonical promotion, suggestions, and scoped events.
- `03_Resources/<slug>/` workstations contain `index.md`, six section directories, `_timeline`, and `.orbit-resource.json`; legacy `resources/<slug>/` workstations are migrated on access.
- Resource refs reject legacy `feed_source` Layer 0 links; Feed material must be saved to Library before linking to a Resource.
- Store/IPC support create/list/get/update/archive/link/unlink/promote/engage/suggest/createFromSuggestion and emit Resource TraceableEvents.
- Note-tag emergence creates `emerge.resource` SynthesisArtifacts first; users explicitly create Resources from suggestions.
- Resource UI provides list/suggestions, editor, tags/areas, status/depth/evolve controls, section refs, canonical promotion, engagement timeline, and resource-scoped chat creation.

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

Status: **implemented (foundation)**.

Deliverables:

- Area as long-term coordinate
- `areas` assignment on major entities
- Area Dashboard
- area-scoped Ask-Anywhere context
- classify.area synthesis suggestions
- area-scoped scheduled tasks and memories

Implemented notes:

- Area contracts now cover richer config, dashboard projection data, health/stats, entity refs, assignment inputs, suggestions, and scoped events.
- Existing `02_Areas/<slug>` storage and `window.orbit.area` IPC namespace were extended for get/update/archive/dashboard/assign/unassign/suggestAssignments.
- Dashboard data is assembled dynamically from Layer 1 Projects, Tasks, Notes, Library items, Resources, Feed sources, scheduled reviews, and latest area synthesis.
- Note/Library/Resource/Feed assignments use the shared `areas` refs; Project/Task assignment remains compatible with legacy `area_uid` while also writing `areas`.
- `suggestAssignments` creates `classify.area` SynthesisArtifacts and exposes explicit accept actions instead of mutating Layer 1 truth automatically.
- Area Room now opens on a Dashboard tab with health signals, active work, resource/note/feed/review cards, an unassigned queue, and area-scoped chat entry.

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

### 6.7 Ask-Anywhere universal tool layer

Status: **implemented (foundation)**.

Goal: 把 Ask-Anywhere 从“内部规划/知识库助手”升级为 Orbit 的通用代理入口，参考 OpenClaw 的工具层设计：工具能力独立于模型，模型只负责推理和调用。

Implemented notes:

- Ask-Anywhere system prompt 改为 universal agent surface，不再声明“只能操作 vault 内部数据”。
- 新增 `orbit_web_search` / `orbit_web_fetch` agent tools；搜索 provider 先支持 `auto`、Brave API（`BRAVE_API_KEY`）和 keyless DuckDuckGo fallback。
- `orbit_web_fetch` 支持公网 http(s) 抓取、正文抽取、长度限制、超时和 SSRF/private-network 防护。
- SDK agent 路由支持 Conversation 级 `runtimeEndpointHint` / `runtimeModelHint`。
- Ask-Anywhere 支持 `/model`、`/model list`、`/model <endpoint>/<model>`、`/endpoint <id>`、`/model auto` 等会话内模型/端点切换命令。
- 新增 Agent Authority foundation：共享权限契约、grant store、policy evaluator、ADR-021、`agent-authority.md`，后续 shell/browser/subagent 必须先生成 `AuthorityRequest` 再执行。

Next tool families to reach OpenClaw-class parity:

- shell / process execution with Agent Authority grants, sandbox/worktree defaults, command-prefix allowlists, and rollback policy
- browser automation with domain/action grants and final-click guard for external side effects
- subagents / session tools with profile-based narrowed authority envelopes
- cron / heartbeat automation
- media and document tools
- plugin tool packs and per-agent allow/deny policy

---
## 4. Phase 7 — Semantic Memory, Search, Review, Vision

**Goal**: 让 Orbit 从“保存知识”进化到“主动唤回、关联、复盘、校准愿景”。

### 7.1 Real semantic index

Status: **implemented v1 (local deterministic embeddings; model-backed embeddings remain swappable behind the same embedder contract).**

Deliverables:

- replace hash-trick embedding with real embeddings *(adapter contract is in place; current default is `orbit-local-hash-embedding-v1` to avoid a heavyweight runtime dependency)*
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
- Ask across results handoff to Ask-Anywhere conversation context

Acceptance:

- Searching a concept surfaces notes, resources, conversations, and summaries together with layer labels.
- `search.answer` is stored as a Layer 2 Synthesis artifact with provenance and source citations.
- Raw Feed items are not indexed directly; they enter search only after Save to Library promotion.

### 7.2 Memory layer

Status: **implemented v1** — MemoryNode store, stability evolution, recall service, Memory Explorer, Ask-Anywhere memory chips, digest artifact, and explicit Resource/Project promotion are wired.

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
- Memory promotion to Resource/Project is explicit and user-triggered; synthesis does not silently write Truth.
- `memory.digest` is stored as a Layer 2 Synthesis artifact with provenance.

### 7.3 Weekly / monthly review

Status: **implemented v1** — review runs/findings/actions store, discovery checks, system task definitions, Review workspace, synthesis-backed run artifact, and acknowledge/execute/archive flows are wired.

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
- Review discovery covers unassigned notes/projects, dormant resources, and read-but-undistilled library items.
- Existing Daily Review journal IPC remains available while the new ReviewRun API powers the Review workspace.

### 7.4 Vision system revival

Status: **implemented v1** — structured goals/milestones, alignment scoring, drift warnings, quarterly review artifact, and Vision Dashboard are wired while preserving `Vision.md`.

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
- Vision Dashboard renders goal tree, alignment bars, drift warnings, and milestone status.
- Quarterly review creates a provenance-bearing Layer 2 synthesis artifact.

---

## 5. Phase 8 — Gateway, Automation, External World

**Goal**: 让 Orbit 脱离桌面 UI 的限制，成为随时可触达、可自动执行的个人系统。

### 8.1 Gateway daemon and Telegram channel

Status: **implemented v1** — Gateway runtime, daemon/app IPC aliases, Telegram long polling, binding/whitelist settings, command routing, message history, URL save, capture note, Ask routing, summary request, and file vault-save path are wired.

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
- `/capture`, `/ask`, `/summary`, forwarded URLs, and forwarded files are routed explicitly and recorded in Gateway message history.
- App-side Gateway Settings shows daemon status, channel permissions, whitelist/bind state, logs, and recent messages.

### 8.2 Scheduled automation

Status: **implemented v1** — Scheduled Tasks now supports Phase 8 system/user automation, flexible weekly/monthly schedules, synthesis/review/memory-digest actions, run history, budget disabling, retry metadata, and enable/disable/runNow IPC aliases.

Deliverables:

- scheduled task top-level UI
- system tasks: daily summary, weekly review, monthly review, resource health scan, feed daily digest, vision quarterly review, memory weekly digest
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
- Required system task list is seeded automatically.
- Budget-exceeded runs are recorded and disable the task instead of silently continuing.
- Retry and notification preferences are explicit task metadata.

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
Phase 6.7 Ask-Anywhere Universal Tool Layer
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
