# Phase 6 Plan — Knowledge Stack Completion

> **Goal**: 完成 Notes / Library / Feeds / Timeline / Resource / Area 的知识复利闭环。
> **Depends on**: Phase 5 Runtime B + Synthesis + Conversation Surface.
> **Architecture refs**: `docs/architecture/data-layering.md`, `docs/architecture/entity-flow.md`, `docs/architecture/synthesis-layer.md`.

---

## Milestone 6.1 — Notes and KB Import

Status: **implemented (foundation)**.

### Scope

Build a first-class Notes system and imported KB activation path.

### Data model

```typescript
export type NoteType = 'thought' | 'longform' | 'capture' | 'voice_log' | 'daily_summary';

export interface NoteFrontmatter {
  id: string;
  type: NoteType;
  title: string;
  created: string;
  updated: string;
  tags: string[];
  areas?: AreaRef[];
  resource_refs?: string[];
  source?: NoteSource;
  special_marker?: SpecialMarker;
  synthesis_ref?: string;
}
```

Directories:

```text
notes/
  thoughts/
  longforms/
  captures/
  voice_logs/
  daily-summaries/
knowledge-base/
  <kb-name>/
  .orbit-kb-meta/
```

### APIs

- `notes.list(filter)`
- `notes.get(idOrPath)`
- `notes.create(input)`
- `notes.update(id, patch)`
- `notes.archive(id)`
- `notes.search(query)`
- `kb.import(path)`
- `kb.activate(kbDocRef, targetNoteType)`

### UI

- Notes top-level view
- type filters
- tag/area/resource filters
- markdown editor
- backlinks/resources/areas side panel
- KB import wizard
- KB browser
- activate-to-note action

### Events

- `note.created`
- `note.updated`
- `note.archived`
- `kb.imported`
- `kb.doc.activated`

### Acceptance

- Notes are editable and searchable.
- KB documents are not active notes until activated.
- Activated notes retain origin metadata.

### Implementation notes

- Shared contracts live in `src/shared/note.ts` and `src/shared/knowledge-base.ts`.
- Notes are stored as Markdown under `notes/thoughts`, `notes/longforms`, `notes/captures`, `notes/voice_logs`, and `notes/daily-summaries`; archived notes move to `04_Archives/notes/...`.
- Note frontmatter now includes `areas`, `resource_refs`, `source`, `special_marker`, and `synthesis_ref` to support later Library/Resource/Area flows.
- Main-process Notes APIs support CRUD, archive, path lookup, search, type/tag/area/resource/source filters, and TraceableEvents.
- KB import stores copied markdown folders under `knowledge-base/<kb-name>` with registry metadata at `knowledge-base/.orbit-kb-meta/registry.json`.
- KB activation is a promotion gate: it creates a Note with KB origin metadata, records an activation annotation under `.orbit-kb-meta/annotations/`, and emits `kb.doc.activated`.
- Renderer surfaces: `NotesView` for list/filter/editor/context panel and `KnowledgeBaseView` for import/search/welcome-analysis/activate-to-note.
- Focused coverage: `tests/notes_kb.test.ts`.

---

## Milestone 6.2 — Library Workstation

### Data model

```typescript
export type LibraryKind = 'article' | 'pdf' | 'video' | 'bookmark';
export type LibraryStatus = 'saved' | 'reading' | 'read' | 'distilled' | 'archived';

export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  title: string;
  url?: string;
  local_path?: string;
  status: LibraryStatus;
  created: string;
  updated: string;
  areas?: AreaRef[];
  resource_refs?: string[];
  annotations?: LibraryAnnotation[];
}
```

### APIs

- `library.save(input)`
- `library.list(filter)`
- `library.get(id)`
- `library.update(id, patch)`
- `library.annotate(id, annotation)`
- `library.markRead(id)`
- `library.distill(id)` → Synthesis `distill.library`
- `library.acceptDistillation(artifactId)` → Note

### UI

- Library list
- status tabs: saved / reading / read / distilled / archived
- reader/detail view
- annotations sidebar
- distill card
- link to Resource / Area

### Events

- `library.item.added`
- `library.item.opened`
- `library.item.annotated`
- `library.item.read`
- `library.item.distilled`
- `library.item.linked_to_resource`

### Acceptance

- URL/feed item can become LibraryItem.
- Distillation is synthesis-backed.
- LibraryItem can link to Resource after being saved.

---

## Milestone 6.3 — Feed Reader as Layer 0

### Data model

```typescript
export interface FeedSource {
  id: string;
  title: string;
  url: string;
  kind: 'rss' | 'youtube' | 'twitter' | 'newsletter' | 'custom';
  areas?: AreaRef[];
  enabled: boolean;
  last_fetched_at?: string;
}

export interface FeedItem {
  id: string;
  source_id: string;
  title: string;
  url: string;
  author?: string;
  published_at?: string;
  fetched_at: string;
  summary?: string;
  status: 'new' | 'seen' | 'ignored' | 'saved';
  saved_library_item_id?: string;
}
```

### APIs

- `feeds.sources.list/create/update/delete`
- `feeds.fetch(sourceId?)`
- `feeds.items.list(filter)`
- `feeds.items.markSeen(id)`
- `feeds.items.ignore(id)`
- `feeds.items.saveToLibrary(id)`
- `feeds.digest(date)` → Synthesis `feed.digest`
- `feeds.cluster(dateOrSource)` → Synthesis `feed.cluster`

### UI

- Feed Reader top-level view or Library sub-entry
- source sidebar
- item stream
- daily digest card
- topic cluster cards
- Save to Library action
- related-resource badge

### Events

- `feed.source.added`
- `feed.item.fetched`
- `feed.item.seen`
- `feed.item.ignored`
- `feed.item.saved_to_library`
- `promote.feed_to_library`

### Acceptance

- Raw feed fetches do not appear in main Timeline.
- Save emits promote event and creates LibraryItem.
- Feed digest stays isolated from main synthesis unless saved.

---

## Milestone 6.4 — Daily Timeline

### Data model

```typescript
export interface TimelineEntry {
  event_id: string;
  event_kind: string;
  occurred_at: string;
  layer: 1 | 2;
  icon: string;
  title: string;
  summary?: string;
  refs?: TimelineRef[];
  aggregation_key?: string;
  derived_from?: string[];
}
```

### APIs

- `timeline.getDay(date)`
- `timeline.getWeek(isoWeek)`
- `timeline.getMonth(month)`
- `timeline.getYear(year)`
- `timeline.generateDailySummary(date)`
- `timeline.exportPDF(scope)`

### UI

- Timeline entry in navigation
- day view with time segments
- today glance
- daily summary card
- week/month/year views
- PDF export
- developer mode toggle for Layer 2 events

### Acceptance

- Layer 1 events render by default.
- Layer 2 technical events are collapsed/hidden.
- Layer 3 noise never appears.

---
## Milestone 6.5 — Resource Workstation

### Data model

```typescript
export type ResourceStatus = 'active' | 'dormant' | 'evolved' | 'archived';
export type ResourceDepth = 'exploring' | 'practicing' | 'mastered' | 'teaching';

export interface ResourceFrontmatter {
  id: string;
  type: 'resource';
  title: string;
  slug: string;
  status: ResourceStatus;
  depth: ResourceDepth;
  created: string;
  updated: string;
  last_engaged?: string;
  engagement_count: number;
  tags: string[];
  areas?: AreaRef[];
  evolved_to?: string;
}

export interface ResourceRef {
  id: string;
  kind: 'note' | 'library_item' | 'kb_item' | 'project' | 'area' | 'person' | 'url';
  ref: string;
  title?: string;
  section: 'canonical' | 'distilled' | 'related' | 'people' | 'projects_touched';
  added_at: string;
}
```

Directory:

```text
resources/<slug>/
  index.md
  _canonical/README.md
  _distilled/README.md
  _related/README.md
  _people/README.md
  _projects-touched/README.md
  _timeline/README.md
  .orbit-resource.json
```

### APIs

- `resources.list(filter)`
- `resources.get(idOrSlug)`
- `resources.create(input)`
- `resources.update(id, patch)`
- `resources.archive(id)`
- `resources.linkRef(id, input)`
- `resources.unlinkRef(id, refId)`
- `resources.engage(id, input)`
- `resources.suggestFromNotes()` → Synthesis `emerge.resource`
- `resources.createFromSuggestion(artifactId)`

### UI

Three-column workstation:

```text
Resource List + Suggestions | Resource body/sections | Meta / Timeline / Actions
```

Required actions:

- create resource
- create from suggestion
- link Note / Library / Project / Person / URL
- promote ref to canonical
- manual engage
- mark dormant / archive / evolve
- open resource-scoped chat

### Engagement weights

| Action | Weight |
|---|---:|
| open resource page | 1 |
| dwell > 2 minutes | 2 |
| link ref | 3 |
| Ask with resource context | 3 |
| produce longform note | 10 |
| create project from resource | 15 |
| completed project feeds back | 15 |

### Events

- `resource.created`
- `resource.emerged_from_synthesis`
- `resource.ref.linked`
- `resource.ref.promoted_to_canonical`
- `resource.engagement`
- `resource.status.changed`
- `resource.archived`

### Acceptance

- Resource can be created manually and from synthesis.
- Feed item cannot link directly unless saved to Library.
- Engagement affects sorting and suggestions.
- Resource page can show topic timeline.

---

## Milestone 6.6 — Area Dashboard and Assignment

### Data model

```typescript
export interface AreaConfig {
  id: string;
  slug: string;
  name: string;
  description?: string;
  status: 'active' | 'dormant' | 'archived';
  created: string;
  updated: string;
  vision_refs?: string[];
}

export interface AreaRef {
  area_slug: string;
  primary?: boolean;
  assigned_at: string;
  assigned_by: 'user' | 'synthesis';
}

export interface AreaDashboardData {
  area: AreaConfig;
  active_projects: ProjectSummary[];
  resources: ResourceSummary[];
  recent_notes: NoteSummary[];
  feed_sources: FeedSource[];
  people: PersonSummary[];
  stats: AreaStats;
  synthesis?: SynthesisArtifact;
}
```

Directory:

```text
areas/<slug>/
  README.md
  index.md
  .orbit/
    config.json
    agent/
      sessions/
      tasks/
      memories/
```

### APIs

- `areas.list()`
- `areas.get(slug)`
- `areas.create(input)`
- `areas.update(slug, patch)`
- `areas.archive(slug)`
- `areas.assign(entityRef, areaRef)`
- `areas.unassign(entityRef, areaSlug)`
- `areas.dashboard(slug)`
- `areas.suggestAssignments(entityRef)` → Synthesis `classify.area`

### UI

Area Dashboard cards:

- health score
- active projects
- related resources
- recent notes
- feed radar
- people
- scheduled reviews
- synthesis summary
- unassigned queue

Actions:

- assign/unassign entity
- accept AI area suggestion
- start area-scoped chat
- schedule area review
- create project in area

### Events

- `area.created`
- `area.updated`
- `area.assignment.added`
- `area.assignment.removed`
- `area.review.completed`
- `area.archived`

### Acceptance

- Major Layer 1 entities can belong to multiple areas.
- Area Dashboard is assembled dynamically.
- Area-scoped chat uses area context.
- Unassigned entity queue helps keep system organized.

---

## Cross-milestone integration

### Timeline integration

Events from Notes, Library, Feeds-save, Resource, Area, Project, Task, Conversation, and Synthesis should be projectable into Timeline.

### Synthesis integration

Synthesis kinds used in Phase 6:

- `summary.daily`
- `distill.library`
- `emerge.resource`
- `classify.area`
- `feed.digest`
- `feed.cluster`
- `summary.entity`

### Conversation integration

Scoped chats:

- Resource chat
- Area chat
- Library item chat
- Note chat

They reuse Phase 5 Conversation Surface.

---

## Rollout order

1. Notes contracts + store + UI
2. KB import + activation
3. Library contracts + UI
4. Feed Reader + Save to Library gate
5. Timeline projection and day view
6. Daily Summary via Synthesis
7. Resource store + workstation
8. Resource emergence
9. Area assignment fields
10. Area Dashboard
11. Area-scoped chat and review hooks

---

## Risks

| Risk | Mitigation |
|---|---|
| Too many entities too fast | implement in strict order; each milestone has acceptance tests |
| Feed pollutes Library | enforce promotion gate at API layer |
| Area becomes tags | dashboard + health/review makes Area responsibility-oriented |
| Resource becomes bookmarks | six-section model + engagement + distilled refs |
| Timeline becomes noisy | strict layer filters and event whitelist |
| Synthesis over-writes user content | artifact-first, accept-to-materialize only |
