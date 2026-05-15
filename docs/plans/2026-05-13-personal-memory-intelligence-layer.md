# Personal Memory Intelligence Layer

> Status: proposal / discussion draft
> Date: 2026-05-13
> Context: inspired by the "knowledge evolution / Wiki system" article discussed in product planning.
> Related docs: `docs/VISION.md`, `docs/ROADMAP.md`, `docs/architecture/data-layering.md`, `docs/architecture/synthesis-layer.md`, `docs/architecture/entity-flow.md`, `docs/architecture/chat-conversation-surface.md`
> Superseded by: `docs/plans/2026-05-15-personal-memory-intelligence-foundation.md`

> Note: this document remains useful as broad product inventory and gap analysis.
> The active foundation design is now evidence-first: Layer 1 truth includes
> direct truth and reference truth, while summaries, memory, open loops, QA, and
> reports remain Layer 2 synthesis.

---

## 1. Core Thesis

Orbit should not become a generic knowledge-base product whose value is "documents can be searched".

Orbit's stronger direction is:

> A local-first personal intelligence system that continuously turns reading, conversations, projects, tasks, and personal direction into reusable memory, relationships, reports, and actions.

The article's most important lesson is that retrieval is only one tool. When a user's corpus grows, repeatedly asking an agent to rediscover the same cross-document insights creates latency, token cost, and weak compounding value. The useful layer is the materialized middle layer: cross-document relationships, periodic distillations, personal QA, entity pages, trend reports, and review findings.

For Orbit, that layer must be personal rather than team/wiki oriented. The goal is not only:

- "What did I save?"
- "Which document mentions this?"

The goal is:

- "What am I repeatedly thinking about?"
- "Which readings, AI conversations, projects, and notes are pointing at the same theme?"
- "Why did I make this project decision?"
- "Which old belief is being updated by new material?"
- "Which open loops should become a Resource, Task, Project, or Vision adjustment?"

This turns Orbit from a storage/search system into a personal compounding system.

---

## 2. Alignment With Orbit Vision

This proposal is aligned with Orbit's existing vision:

- Local-first data ownership remains non-negotiable. Layer 1 truth stays in local Markdown, structured JSON under `.orbit/`, and Git history.
- Vision-driven work remains the north star. Memory and reports should help the user notice drift, neglected goals, and overgrown topics.
- AI-native does not mean AI silently mutates truth. Synthesis can suggest, but user-approved promotion gates still decide what becomes Note, Resource, Project, Task, or Area assignment.
- Agent execution remains an Express layer. The memory system should not only answer questions; it should also create actionable review findings and task/project suggestions.

The proposal extends the existing Layer 2 Synthesis direction rather than replacing it.

Current doctrine remains intact:

```text
Layer 0  Signal Sources
Layer 1  Ground Truth
Layer 2  Synthesis / Memory / Index / Relations
Layer 3  Consumption Surfaces
```

The main addition is that Layer 2 needs to become a coherent Personal Memory Intelligence Layer, not a collection of feature-local summaries.

---

## 3. Product Principle

Orbit should optimize for knowledge compounding, not knowledge hoarding.

The user's valuable personal data includes:

- articles, books, PDFs, YouTube videos, podcasts, bookmarks
- daily AI conversations
- project work and execution logs
- notes, voice logs, thoughts, captures, daily summaries
- resources and long-running areas
- review history and activity logs
- decisions, mistakes, preferences, repeated questions, and evolving goals

Saving all of this is necessary but insufficient. The product must help this data evolve into:

- reusable context for Ask Anywhere and task agents
- visible memory the user can inspect and correct
- periodic reports that compress time
- relationship maps that reveal hidden connections
- action suggestions that close loops
- project and resource intelligence that improves future execution

---

## 4. Lessons From the Reference Article

The article identifies a failure mode that applies directly to Orbit:

1. Documents get saved.
2. Retrieval can recall them.
3. But the user still does not feel knowledge compounding.

The problem is that classic RAG answers one question at a time. It usually redoes perception from scratch:

```text
question -> retrieve chunks -> generate answer
```

For compound tasks, retrieval is only perception input:

```text
question / goal
  -> understand the relevant territory
  -> navigate relationships
  -> compare across time
  -> synthesize claims
  -> produce answer / report / action
```

The article's useful architectural claims:

- Do not rely on vector search alone. Vector search is weak at cross-document relationships.
- Do not make graph the only answer source. A stale graph summary can reduce trust.
- Use graph as an agent navigation aid: "what else should I inspect?"
- Keep graph skeleton cheap and deterministic.
- Let LLM judge, merge, denoise, and distill after deterministic extraction.
- Materialize repeated distillation work as QA, entity pages, reports, and subgraphs.
- Make generated artifacts visible in the product, otherwise they remain invisible infrastructure.

Orbit should adopt these ideas with a personal-workflow bias.

---

## 5. Target Architecture

### 5.1 Layer 0: Signal Sources

Layer 0 is raw external or temporary signal:

- RSS and web feeds
- saved URLs before full ingestion
- browser extension captures
- mobile share extension
- Telegram / Gateway inbound
- YouTube / podcast feeds
- email/newsletter imports
- raw voice logs
- future calendar, GitHub, health, browser-history connectors

Layer 0 is not user truth. It can be fetched, ranked, clustered, expired, and ignored.

Required evolution:

- richer fetchers and metadata extraction
- source health and deduplication
- scheduled refresh
- per-source quality controls
- "save to Library" promotion gate
- feed-scoped digests that do not pollute main search until promoted

### 5.2 Layer 1: Ground Truth

Layer 1 is user-confirmed personal data:

- Notes
- Library items
- Conversations
- Projects
- Tasks
- Resources
- Areas
- KB activations
- Activity / TraceableEvent history

Layer 1 should remain editable, inspectable, and portable.

The important expansion is that conversations must become first-class source material. Daily AI dialogue is one of the most important personal datasets in Orbit. It should be indexed, summarized, distilled, linked, and reviewable, not treated as disposable chat history.

### 5.3 Layer 2: Personal Memory Intelligence

Layer 2 should contain all generated, derived, or index-like artifacts:

- semantic index
- relation graph
- entity/concept pages
- Personal QA
- MemoryNode
- SearchAnswer
- Daily / Weekly / Monthly reports
- Resource / Area / Project summaries
- ReviewRun and ReviewFinding
- Conversation distillations
- trend and drift reports
- open-loop reports
- graph subviews

Layer 2 is not truth. It must be:

- provenance-bearing
- stale-able
- supersedable
- user-editable when appropriate
- source-linked
- refreshable
- safe to delete and regenerate

### 5.4 Layer 3: Consumption Surfaces

Layer 3 should expose the memory system through a small number of coherent surfaces:

- Ask Anywhere
- Search
- Memory / Intelligence workspace
- Today
- Dashboard
- Timeline
- Review
- Journal
- Library / Feed
- Notes
- Resource / Area workstations

The direction should be fewer overlapping pages with clearer jobs, not more isolated pages.

---

## 6. Data Products To Materialize

### 6.1 Personal QA

Personal QA is the most important first artifact.

Examples:

- "Why did I choose local-first storage for Orbit?"
- "What are my recurring concerns about AI memory?"
- "What did I conclude about Resource vs Area?"
- "Which readings changed my view on graph-based retrieval?"

Why QA first:

- User questions are also questions, so Q embeddings naturally match future queries.
- QA compresses repeated perception work into a reusable artifact.
- QA can cite sources and be edited or rejected.
- QA can be shown directly in Search, Ask Anywhere, Resource pages, and reports.

Suggested synthesis kind:

```typescript
'qa.personal'
```

Suggested scope keys:

```text
qa:conversation:<conversation-id>
qa:resource:<resource-slug>:<period>
qa:project:<project-id>:<period>
qa:area:<area-slug>:<period>
qa:cluster:<cluster-id>
```

### 6.2 Entity / Concept Pages

Entity pages are personal wiki pages for recurring people, projects, technologies, books, authors, companies, concepts, and user-defined topics.

They should answer:

- Where did this entity appear?
- Which documents, conversations, projects, and resources mention it?
- Which entities co-occur with it?
- What claims or decisions are attached to it?
- How has my view of it changed over time?

These pages should begin as Layer 2 artifacts, not as mandatory user Notes. The user can promote a valuable entity page into a Resource or Note.

Suggested synthesis kinds:

```typescript
'entity.profile'
'entity.timeline'
```

### 6.3 Relation Graph

The graph should not replace search. It should provide navigation and clustering.

Initial node types:

- note
- library_item
- conversation
- resource
- area
- project
- task
- memory
- entity
- synthesis_artifact
- person

Initial edge types:

- mentions
- co_occurs
- cites
- derived_from
- linked_to_resource
- belongs_to_area
- conversation_about
- inspired_project
- project_distilled_into
- updates_belief
- contradicts
- supports

The graph skeleton should be mostly deterministic:

- frontmatter links
- resource refs
- area refs
- conversation scope
- synthesis sources
- wikilinks
- tags
- repeated terms
- cheap NER / noun phrases
- time-window co-occurrence

LLM should enter later for:

- alias merge
- false positive cleanup
- relation type upgrade
- claim extraction
- concept naming
- short TLDR

### 6.4 MemoryNode

MemoryNode should represent durable personal memory:

- interests
- preferences
- patterns
- lessons
- goals
- entity memories
- decisions
- beliefs

Current memory kinds already include `interest`, `preference`, `pattern`, `lesson`, `entity_memory`, and `goal`. The next step is to connect them to Personal QA, reports, graph relations, and Ask Anywhere recall.

Memory should always be transparent:

- why it exists
- which sources support it
- how confident it is
- when it was recalled
- whether the user confirmed it
- what it affected

### 6.5 Conversation Distillation

Conversation is one of Orbit's most important truth sources.

Distillation should produce:

- key questions
- claims
- decisions
- assumptions
- open loops
- follow-up tasks
- changed beliefs
- reusable prompts / reasoning trails
- links to projects, resources, and areas

Suggested synthesis kind:

```typescript
'distill.conversation'
```

### 6.6 Reports

Reports should compress time and trigger action.

Core report types:

- Daily report: what happened, what mattered, open loops.
- Weekly report: themes, project progress, reading digestion, conversations worth saving, suggested actions.
- Monthly report: trend shifts, area balance, resource evolution, vision drift.
- Resource report: new material, stale claims, emerging questions, next practice step.
- Project report: progress, blockers, decisions, lessons, next actions.
- Conversation report: high-value discussions and reusable insights.
- Reading report: saved/read/distilled ratio, top sources, undigested backlog.
- Open-loop report: unresolved questions, dangling captures, read-but-undistilled items, conversations with implicit tasks.

Reports should live as SynthesisArtifacts first. Selected reports can materialize as Notes when the user wants durable journal-like records.

---

## 7. Processing Pipeline

The proposed pipeline:

```text
Layer 0 / Layer 1 input changes
  -> TraceableEvent
  -> SemanticDocument projection
  -> hybrid index update
  -> deterministic relation extraction
  -> candidate tables
  -> LLM refinement on structured candidates
  -> Layer 2 artifacts
  -> visible surfaces
  -> user promotion to Layer 1 when desired
```

### 7.1 Deterministic Extraction First

Deterministic extraction should handle:

- Markdown frontmatter
- links and backlinks
- tags
- resource refs
- area refs
- conversation scope
- source provenance
- event history
- title terms
- simple noun phrases
- simple NER
- co-occurrence within sentence/paragraph/document/time window

This keeps cost close to zero and makes extraction reproducible.

### 7.2 LLM Refinement On Candidate Tables

LLM should not read every source document for graph skeleton construction.

Instead, it should receive structured candidate tables:

```text
entity | aliases | frequency | source_count | source_kinds | co_occurs | time_range | sample_titles
```

LLM jobs:

- remove noise
- merge aliases
- name clusters
- upgrade relation type
- extract claims
- generate QA
- generate TLDR
- detect contradictions or changed beliefs

This keeps refinement cost tied to candidate count rather than raw corpus length.

### 7.3 Hub-Driven Distillation

For cross-document distillation, Orbit should not randomly sample documents.

It should seed synthesis from hubs:

- high-degree entities
- fast-growing Resources
- active Areas
- projects with many related conversations
- repeated open questions
- reading clusters
- frequently recalled memories

Hub-driven collections give LLM coherent material and avoid generic summaries.

---

## 8. Retrieval And Ask Anywhere

Ask Anywhere should consume multiple channels:

```text
user question
  -> scope detection
  -> hybrid search over Layer 1 and Layer 2
  -> Personal QA hits
  -> memory recall
  -> graph neighbor expansion
  -> optional source reading
  -> answer with citations and recall explanation
```

The answer should distinguish:

- source truth
- synthesis
- memory
- unpromoted signal

The user should be able to inspect:

- why each result was recalled
- which sources support the answer
- which memory nodes were used
- which graph neighbors were considered
- which artifacts are stale

The graph should answer "where else should I look?", not "what is the final answer?"

---

## 9. UI Direction

### 9.1 New Top-Level Surface: Intelligence / Memory

Orbit likely needs one top-level surface that makes the Personal Memory Intelligence Layer visible.

Working name options:

- Memory
- Intelligence
- Knowledge
- Mind

Suggested layout:

```text
left: scope
  All / Today / Week / Areas / Resources / Projects / Conversations / People / Reports

top: Ask your Orbit
  natural language query + time range + entity/source filters

center tabs:
  Answers
  Map
  Reports
  Memories

right inspector:
  why recalled
  sources
  graph neighbors
  stale status
  actions
```

Actions:

- save as Note
- link to Resource
- create Task
- create Project
- assign Area
- confirm memory
- reject memory
- edit synthesis
- refresh artifact
- view sources

### 9.2 Ask Anywhere

Ask Anywhere should become the main conversational entry into personal data.

Required upgrades:

- show memory chips used in the answer
- show Personal QA hits separately from raw source hits
- expose "expand graph neighborhood"
- support "save this answer as Note"
- support "turn this into Review action / Task"
- show source vs synthesis labels

### 9.3 Search

Search should evolve from a result list into an investigation surface.

Required upgrades:

- result grouping by source truth / synthesis / memory
- relation-aware result expansion
- "why this result" with graph and memory evidence
- result-side actions
- query templates for "what changed", "what did I decide", "what should I revisit"

### 9.4 Today

Today is currently too task-only for the target product.

Target role:

> Today's command surface for attention, review, capture, and continuation.

It should include:

- tasks due / ready
- active agent work
- today reading queue
- conversations worth saving
- generated daily report
- open loops from yesterday
- scheduled captures / feed refresh status
- one Ask input scoped to today

Today should not be a full dashboard. It should answer: "What deserves my attention now?"

### 9.5 Dashboard

Dashboard should become a strategic cockpit, not an operational task list.

It should show:

- Vision alignment
- Area balance
- project momentum
- resource growth
- memory growth
- reading digestion rate
- review health
- automation health
- data freshness

Dashboard should answer: "Is my personal system healthy and moving toward my vision?"

### 9.6 Review

Review should become the main place where synthesis turns into action.

It should include:

- weekly/monthly review runs
- stale resources
- undistilled reading
- conversations with decisions/open loops
- area imbalance
- project drift
- memory candidates
- suggested tasks
- suggested archives
- suggested resource updates

Review should answer: "What should I accept, reject, schedule, or close?"

### 9.7 Journal

Journal should not remain only a list of daily Markdown files.

It should become the user's narrative history:

- daily summaries
- manually written reflections
- conversation-derived insights
- decisions
- mood/energy if future health data exists
- links to reports and review runs

Journal should answer: "What was the story of this period?"

### 9.8 Timeline

Timeline should remain the chronological projection, but it needs stronger narrative grouping.

It should show:

- meaningful events
- report artifacts
- memory creation and recall
- reading progress
- conversation milestones
- project decisions
- synthesis refreshes only when user-visible

Timeline should answer: "What happened and how did it compound?"

### 9.9 Library And Feed

Feed should be the raw source manager.

Library should become the reading workstation.

Library needs:

- robust article extraction
- metadata extraction
- PDF ingestion
- YouTube transcript support
- podcast transcript support
- highlights and annotations
- reading queue
- read later workflow
- source reliability
- distill quality
- link to Resource / Area
- recurring source refresh

Feed needs:

- scheduled fetch
- source health
- dedupe across sources
- source grouping
- daily digest
- "related to my Resources"
- direct save-to-library flow

### 9.10 Notes

Notes are currently the central user-output primitive. That remains correct.

But Notes need better affordances:

- Markdown preview / editing modes
- backlinks and graph neighborhood
- source provenance panel
- inline save from synthesis
- conversation span to note
- note-to-resource promotion
- better note type semantics
- templates for capture, thought, longform, voice log, daily summary
- merge/split notes

Notes should answer: "What have I actually written or accepted into my personal truth?"

---

## 10. Current State Inventory

This inventory is based on current docs and code as of 2026-05-13.

### 10.1 Strong Foundations Already Present

Orbit already has many of the hard primitives:

- Layer 0 / Layer 1 / Layer 2 / Layer 3 architecture is documented.
- SynthesisArtifact store exists under `.orbit/synthesis/`.
- Synthesis provenance, stale/superseded/failed states, prompt registry, scheduler, and DLQ exist.
- Conversation is first-class and indexed.
- Notes, Library, Feed, Resource, Area, Timeline, Search, Memory, Review, Gateway, and Scheduled Tasks all have foundation-level APIs and views.
- Semantic document projection covers Notes, Library, Resources, Projects, Areas, Conversations, Synthesis artifacts, and KB docs.
- Search supports hybrid mode and answer synthesis.
- MemoryNode store and Memory Explorer exist.
- ReviewRun / ReviewFinding store and Review workspace exist.
- Timeline is event-projection based.
- Feed is correctly isolated as Layer 0.
- Library -> Note distillation uses a SynthesisArtifact before materialization.
- Resource suggestions use SynthesisArtifact before creation.
- Scheduled system tasks are seeded.

This means the project does not need a ground-up rewrite.

### 10.2 Foundation-Level Gaps

Many pieces are foundation-level rather than product-complete:

- Semantic embedding currently uses `orbit-local-hash-embedding-v1`, not a model-backed embedder.
- Search has no real relation graph expansion.
- Graph refs are named in roadmap but not implemented as a coherent graph store.
- Synthesis kinds are still limited. There is no Personal QA, conversation distillation, entity profile, project report, resource report, or open-loop report.
- Several synthesis flows fall back to local heuristics.
- Feed digest and clustering are heuristic.
- Library URL save does not fetch and extract full article content.
- RSS parsing is regex-based and minimal.
- Scheduled task `triggerNow` records that work was queued but does not actually execute the synthesis/review/feed action.
- Memory extraction is sentence/regex based, not LLM-refined or graph-aware.
- Review discovery is useful but shallow: unassigned notes, dormant resources, read-undistilled library, unassigned projects.
- Today is only a task list.
- Dashboard is five-quadrant but still metric-centric and not yet vision/memory intelligence-centric.
- Journal is still a daily review file list.
- Notes editor is basic textarea editing.
- Library reader is a Markdown editor rather than a rich reading/capture workflow.

---

## 11. Gap Analysis By Capability

### 11.1 Capture And Reading Ingestion

Current:

- Feed source CRUD exists.
- RSS fetch exists.
- Feed items can be saved to Library.
- Library can save URL/PDF/video/bookmark-like items.
- Library stores Markdown with source metadata.

Gap:

- Saving a URL mostly stores title/source and optional body; it does not reliably fetch readable article content.
- No full HTML readability extraction pipeline.
- No canonical metadata extraction: author, site, published date, hero image, language, estimated reading time.
- No YouTube transcript ingestion.
- No podcast feed/audio transcript workflow.
- No PDF text extraction pipeline.
- No browser extension capture.
- No daily source refresh loop that actually runs.
- No robust duplicate detection across URL canonicalization, title, content hash, and source item IDs.

Required direction:

```text
URL / Feed item
  -> fetch HTML
  -> readability extraction
  -> metadata extraction
  -> content hash / canonical URL dedupe
  -> Library item
  -> optional transcript / PDF text extraction
  -> semantic projection
  -> distill / QA / Resource link
```

MVP iteration:

1. Add web article extraction using existing `web-tools/fetch.ts` and HTML parsing utilities.
2. Store `raw_html_ref`, `extracted_text`, `author`, `published_at`, `site_name`, `canonical_url`, `content_hash`.
3. Add "refresh metadata / refetch content" action.
4. Add YouTube transcript adapter.
5. Add PDF text extraction.
6. Add scheduled feed refresh that actually calls feed fetch.
7. Add daily reading digest over saved/read/undistilled items.

### 11.2 Notes

Current:

- Notes have types, tags, areas, resource refs, source, synthesis ref.
- Notes list/search/create/update/archive exist.
- UI supports filters and editing.

Gap:

- Editing is a basic textarea; no mature writing or review experience.
- No first-class note provenance inspector beyond raw source fields.
- Backlinks exist in metadata but are not a primary navigational surface.
- No inline graph neighborhood.
- No "save conversation span as Note" product flow surfaced strongly.
- No merge/split/refactor note workflow.
- No note-level summary or Personal QA generation.
- No confidence/staleness display for notes derived from synthesis.

Required direction:

- Keep Note as Layer 1 output primitive.
- Improve writing surface only enough to support capture, review, and distillation.
- Make provenance and graph context visible.
- Add Note actions: generate QA, link to Resource, assign Area, extract tasks, save to Journal.

### 11.3 Conversations

Current:

- Conversation store exists.
- Overlay/full-page share conversation model.
- Conversations are projected into semantic index.
- Timeline can show meaningful conversation events.

Gap:

- No rich conversation distillation artifact.
- No automatic extraction of decisions, open loops, claims, or QA from conversations.
- No review queue for "this conversation contains something worth saving".
- No visible "thinking trail" surface for the reasoning arc.
- Memory extraction from conversations is heuristic.

Required direction:

1. Add `distill.conversation`.
2. Add "save span as Note" and "extract decisions" from Ask Anywhere.
3. Add daily/weekly report section for conversations worth revisiting.
4. Link conversation topics to Resources/Projects/Areas.
5. Feed conversation claims into Personal QA and MemoryNode candidates.

### 11.4 Search

Current:

- Semantic document projection covers most major entities.
- Hybrid search exists.
- Search answer synthesis exists.
- Search UI can filter by entity, layer, area, date.

Gap:

- Embedding is local hash-based, so semantic quality is limited.
- Search does not use a proper graph.
- Search result actions are limited.
- Search does not show memory recall.
- Search does not group Personal QA because Personal QA does not exist yet.
- "Why this result" is mostly keyword/semantic score, not a real explanation.

Required direction:

1. Add model-backed embedding adapter while keeping local fallback.
2. Add graph store and relation expansion.
3. Add Personal QA as first-class search target.
4. Add memory recall to search.
5. Add investigation actions: ask, save, link, create task, refresh artifact.

### 11.5 Relation Graph

Current:

- Entity flow docs define important edges.
- Resource refs, area refs, synthesis sources, conversation scopes, and TraceableEvents already contain graph-like signals.
- No coherent graph store appears to own these relations.

Gap:

- No node/edge schema.
- No deterministic extractor.
- No graph query API.
- No graph-based collection builder for synthesis.
- No graph visualization surface.
- No alias or entity merge workflow.

Required direction:

```typescript
GraphNode
GraphEdge
GraphSnapshot
GraphNeighborhood
GraphCluster
```

Initial graph store can be a Layer 2 projection under:

```text
<vault>/.orbit/graph/
  nodes.jsonl
  edges.jsonl
  index.json
```

It should be rebuildable and sourced from existing Layer 1/2 data.

### 11.6 Synthesis

Current:

- Synthesis infrastructure is well placed.
- Prompt registry exists.
- Initial synthesis kinds exist.
- Search answer prompt exists.

Gap:

- The important new artifact kinds are missing.
- Current generation often uses heuristic fallback.
- LLM prompts operate mostly on source excerpts, not graph candidate tables.
- No hub-driven cross-document distillation.
- No unified report pipeline.
- No user feedback loop for artifact quality besides generic edit/refresh.

Required new synthesis kinds:

```typescript
'qa.personal'
'distill.conversation'
'entity.profile'
'entity.timeline'
'report.daily'
'report.weekly'
'report.monthly'
'report.resource'
'report.project'
'report.reading'
'report.open_loops'
'graph.refine'
'graph.cluster'
```

Some existing kinds can be preserved as aliases or lower-level primitives.

### 11.7 Memory

Current:

- MemoryNode model exists.
- Memory Explorer exists.
- Recall service exists.
- Memory digest exists.
- Promotion to Resource/Project exists.

Gap:

- Extraction is regex/sentence based.
- Memory is not deeply integrated into Ask Anywhere, Search, Review, Today, or Reports.
- Memory lacks graph relations and Personal QA linkage.
- The UI is transparent but isolated.

Required direction:

- Memory candidates should come from conversation distillation, review runs, repeated search/ask patterns, and graph clusters.
- Memory recall should be visible in Ask/Search.
- Memory should feed reports and Vision drift.
- User feedback should affect confidence/stability.

### 11.8 Reports And Automation

Current:

- Timeline daily summary exists.
- ReviewRun exists.
- Scheduled system tasks are seeded.
- Gateway can expose summaries remotely.

Gap:

- Scheduled tasks do not actually execute the target action yet; current `triggerNow` records a queued-style output.
- Reports are not unified.
- Daily summary is timeline-centric, not intelligence-centric.
- Weekly/monthly reports are review findings, not narrative intelligence reports.
- No reading, conversation, project, resource, or open-loop reports yet.

Required direction:

- Build a real scheduled task dispatcher that invokes feed refresh, synthesis runner, review trigger, memory digest, and Ask Anywhere jobs.
- Standardize report artifacts.
- Surface report cards in Today/Review/Timeline.
- Allow Gateway push only as summary/entrypoint, not as a noisy notification center.

---

## 12. Page-Level Redesign Recommendations

### 12.1 Keep But Reframe

These pages should stay, but their job should change.

| Page | Current role | Target role |
| --- | --- | --- |
| Today | task due list | daily attention cockpit |
| Dashboard | five-quadrant metrics | strategic system health and vision alignment |
| Review | stale/unassigned finder | action inbox for synthesized findings |
| Journal | daily review file list | narrative personal history |
| Timeline | event chronology | chronological memory and report projection |
| Search | semantic result list | investigation and answer workspace |
| Memory | memory explorer | inspectable personal intelligence layer |
| Library | simple saved item editor | reading and distillation workstation |
| Feed | source/item list | daily signal triage and source health |
| Notes | basic note CRUD | accepted truth editor with provenance |

### 12.2 Avoid Adding Too Many New Pages

Orbit already has many pages. The better approach is:

- one top-level Intelligence/Memory workspace
- upgrade existing Today/Dashboard/Review/Journal/Search pages around clearer jobs
- avoid separate "Knowledge Graph", "Reports", "QA", "Entity Wiki" pages unless they are tabs inside Intelligence or scoped panels inside Resource/Area/Search

### 12.3 Suggested Navigation Model

Top-level should bias toward user mental modes:

```text
Today        what needs attention now
Ask          ask / act anywhere
Library      read and collect
Notes        accepted writing
Resources    long-running topics
Projects     execution
Review       decide and close loops
Memory       inspect intelligence
Timeline     chronological history
Dashboard    system health
```

If navigation gets too crowded, Dashboard and Timeline can be secondary surfaces, while Today/Ask/Review become the daily core.

---

## 13. Proposed Implementation Order

### Phase A: Make Reading Data Real

Goal: turn Library from URL registry into real source material.

Deliverables:

- article extractor
- metadata extraction
- canonical URL and content hash
- PDF text extraction
- YouTube transcript import
- Library item freshness/refetch
- tests for URL -> Library item content

Why first:

Personal intelligence quality depends on rich Layer 1 inputs.

### Phase B: Personal QA

Goal: materialize repeated distillation in a query-friendly form.

Status (2026-05-15):

- Foundation implemented: `qa.personal` kind, payload schema, deterministic evidence-chunk generator, Layer 2 semantic projection using the QA question as title, and ContextPacket synthesis injection.
- Still missing: broad source-specific generation policies, hub/cluster-driven QA selection, accept/reject/edit UI, and explicit Search grouping for QA hits.

Deliverables:

- `qa.personal` synthesis kind
- QA payload schema
- QA generation from Library, Conversations, Resources, Projects, and clusters
- QA indexed as Layer 2
- Search grouping for QA hits
- accept/reject/edit UI

Why second:

QA has the fastest product payoff and improves Ask/Search immediately.

### Phase C: Conversation Distillation

Goal: make daily AI conversations valuable personal data.

Deliverables:

- `distill.conversation`
- conversation open loops
- decisions and claims
- save span as Note
- conversation-to-Resource linking
- conversation report section in Review/Today

Why third:

Orbit's differentiation depends on AI conversations having long-term memory.

### Phase D: Deterministic Graph Projection

Goal: create a cheap graph skeleton.

Deliverables:

- graph node/edge schema
- extractor from frontmatter, refs, scopes, sources, events, wikilinks, tags
- graph query API
- neighborhood API
- graph-backed synthesis collection builder
- basic graph inspector

Why fourth:

The graph becomes useful once Library, QA, and conversations contain enough signal.

### Phase E: Reports And Real Automation

Goal: make the system proactive.

Deliverables:

- real scheduled task executor
- daily/weekly/monthly/report synthesis kinds
- reading report
- resource report
- project report
- open-loop report
- Today and Review report cards
- Gateway push summary

Why fifth:

Reports need enough underlying data and synthesis quality to avoid becoming generic summaries.

### Phase F: Surface Redesign

Goal: make the new intelligence layer feel coherent.

Deliverables:

- Today redesign
- Dashboard redesign
- Review redesign
- Journal redesign
- Memory/Intelligence workspace
- Search investigation mode
- Library reader improvements
- Notes provenance/context panel

Why last:

Major UI redesign should follow stable data products, not precede them.

---

## 14. Open Product Questions

1. What should the top-level surface be called: Memory, Intelligence, Knowledge, or something else?
2. Should Personal QA be visible as documents in a folder, or only as SynthesisArtifacts with UI cards?
3. When should a generated entity page become a Resource?
4. How aggressive should Orbit be in surfacing conversation insights?
5. Should daily reports be automatically generated, or only generated when there is enough signal?
6. Should Gateway push reports by default, or only expose pull commands?
7. How much graph visualization is actually useful before it becomes decorative?
8. Should Journal remain Markdown-first, or become a projection over summaries, notes, and review runs?
9. What privacy classes are needed before indexing sensitive conversations and health-like data?
10. What is the minimum reading ingestion quality required before feed automation becomes valuable?

---

## 15. Non-Goals

- Do not make graph the final answer source.
- Do not silently promote feed items into Library.
- Do not silently turn synthesis into user truth.
- Do not build a team wiki.
- Do not optimize for large decorative graph visualization before the workflow proves value.
- Do not create many new pages when existing surfaces can be reframed.
- Do not push noisy notifications; Orbit should remain a calm personal system.

---

## 16. Summary

The reference article validates Orbit's existing direction but also raises the bar.

Orbit already has many foundation pieces: SynthesisArtifact, semantic search, MemoryNode, ReviewRun, Timeline, Library, Feed, Notes, Conversations, Resources, Areas, and scheduled tasks. The gap is not conceptual foundation. The gap is product compounding:

- richer ingestion
- real semantic quality
- relation graph projection
- Personal QA
- conversation distillation
- meaningful reports
- real scheduled execution
- redesigned daily/review/search/memory surfaces

The recommended strategy is to deepen the data pipeline before doing a broad UI redesign. Once reading ingestion, Personal QA, conversation distillation, and graph projection exist, Today, Dashboard, Review, Journal, Search, and Memory can be redesigned around real intelligence rather than placeholder metrics.
