# Orbit Entity Flow Architecture

> **Status**: accepted draft
> **Purpose**: 定义 Feed、Library、Note、Resource、Area、Project、Task、Conversation 之间的边界和流转。

---

## 1. Entity ontology

| Entity | Layer | Essence | Lifecycle |
|---|---:|---|---|
| FeedItem | 0 | external low-signal stream item | fetched → faded / saved |
| RawCapture | 0 | unprocessed user/external input | captured → promoted / discarded |
| LibraryItem | 1 | user-saved external material | saved → reading → read → distilled / archived |
| Note | 1 | user output primitive | created → edited → linked → archived |
| Resource | 1 | ongoing topic/theme workspace | active ↔ dormant → evolved / archived |
| Area | 1 | long-term responsibility coordinate | created → maintained → dormant / archived |
| Project | 1 | goal with deadline/outcome | inbox/todo → doing → done/archived |
| Task | 1 | executable unit inside project/area | todo → doing → awaiting-user/blocked → done |
| Conversation | 1 | user/AI dialogue record | active → summarized / saved / archived |
| SynthesisArtifact | 2 | AI-generated secondary data | fresh → stale → superseded |

---

## 2. Feed flow

Feed is not Library.

```text
External source
  → feed.source.added
  → feed.item.fetched
  → feed.item.seen / ignored
  → feed-scoped synthesis
  → user Save
  → library.item.added
```

Feed items can produce:

- feed daily digest
- topic clusters
- recommendation cards
- “related to your resource” hints

But they cannot directly become:

- Resource refs
- Area assignments
- global search truth
- Timeline main entries, except source/subscription changes and saved events

---

## 3. Library flow

Library is user-saved external material.

```text
Feed item / URL / PDF / Video / Bookmark
  → LibraryItem
  → reading / annotation / completion events
  → distill.library synthesis
  → user accepts
  → Note or Resource ref
```

LibraryItem states:

```typescript
export type LibraryStatus =
  | 'saved'
  | 'reading'
  | 'read'
  | 'distilled'
  | 'archived';
```

Key events:

- `library.item.added`
- `library.item.opened`
- `library.item.progress.updated`
- `library.item.annotated`
- `library.item.read`
- `library.item.distilled`
- `library.item.archived`

---

## 4. Note flow

Note is the central user-output primitive.

Types:

```typescript
export type NoteType =
  | 'thought'
  | 'longform'
  | 'capture'
  | 'voice_log'
  | 'daily_summary';
```

Creation paths:

- Quick Capture → thought
- Raw capture promotion → capture
- Voice log transcription → voice_log
- User editor → longform
- Synthesis daily summary → daily_summary materialized note
- Library distillation acceptance → capture / longform
- Conversation save → thought / capture

Important: an AI-generated daily summary materializes as a note for readability, but its provenance stays in SynthesisArtifact.

---

## 5. Resource flow

Resource is an ongoing topic/theme workspace, not a bookmark folder.

Resource input channels:

```text
Notes ─────────────┐
LibraryItems ──────┤
KB activations ────┤
Projects ──────────┤──→ Resource refs / sections
People ────────────┤
Accepted synthesis ┘
```

Sections:

- `_canonical/` stable essential materials
- `_distilled/` user-produced distilled notes
- `_related/` useful but not canonical references
- `_people/` authors / people / sources
- `_projects-touched/` projects inspired by or feeding the topic
- `_timeline/` resource-scoped timeline projection

Lifecycle:

```text
active → dormant → archived
active → evolved → new resource
```

Depth:

```text
exploring → practicing → mastered → teaching
```

Synthesis can recommend transitions but must not execute them without approval.

---

## 6. Area flow

Area is a coordinate system, not an item that flows.

Entities belong to Areas:

```typescript
interface AreaRef {
  area_slug: string;
  primary?: boolean;
  assigned_at: string;
  assigned_by: 'user' | 'synthesis';
}
```

Area can be attached to:

- Notes
- LibraryItems
- Resources
- Projects
- Tasks
- People
- Feed sources
- Scheduled tasks
- Conversations

Area changes are rare:

- create
- rename/update
- split
- merge
- dormant
- archive

Area Dashboard is a surface assembled from Layer 1 + Synthesis, not a stored blob.

---

## 7. Project flow

Project is goal-oriented and time-bound.

Typical flow:

```text
idea / note / resource / conversation
  → project suggestion
  → user approves
  → project created
  → tasks created
  → agent/user execution
  → completed
  → distilled into Resource / archived
```

Project belongs to one primary Area, optionally multiple secondary Areas.

Project may be inspired by a Resource; completed Project should feed Resource `_projects-touched/` and `_distilled/`.

---

## 8. Task flow

Task is executable unit.

Task states are separate from agent session states.

```text
todo → doing → awaiting-user → doing → done
              ↘ blocked ↗
```

Agent-created subtasks do not automatically enter Kanban. They are folded into main task execution log unless the agent proposes a new task and user approves.

---

## 9. Conversation flow

Conversation is reusable across overlay/full-page/scoped chat.

```text
conversation started
  → messages
  → artifacts / suggestions
  → maybe meaningful event for timeline
  → save span as note
  → summary.entity synthesis
  → archived
```

Conversation can be scoped to global, task, project, area, resource, note, or library.

---

## 10. Cross-entity graph

Important edges:

| Edge | Meaning |
|---|---|
| Note → Resource | note contributes to topic |
| LibraryItem → Resource | material supports topic |
| Resource → Project | topic inspires execution |
| Project → Resource | completed work feeds knowledge back |
| Entity → Area | long-term responsibility ownership |
| Conversation → Entity | conversation happened in scope |
| SynthesisArtifact → sources | AI output derived from sources |
| FeedItem → LibraryItem | saved signal |
| KBDoc → Note | activated legacy knowledge |

All edges should be observable either in frontmatter, structured index files, or TraceableEvent history.

---

## 11. Timeline implications

Timeline should show:

- Note created / updated meaningfully
- Library item saved / read / distilled
- Feed item saved to Library, not every feed fetch
- Resource created / engaged / evolved
- Area review completed / assignment accepted
- Project created / completed
- Task completed / blocked / awaiting-user
- Meaningful conversation
- Synthesis summary generated

Timeline should not show:

- every RSS fetch
- every heartbeat
- every token/cost delta
- internal file watcher events

---

## 12. Acceptance criteria

- Feed cannot bypass Library.
- Resource accepts only Layer 1 refs.
- Area appears as assignment coordinate on all major entities.
- Project completion writes back to Resource if linked.
- Conversation overlay/full-page share same entity.
- Synthesis artifacts reference sources but do not mutate entities automatically.
