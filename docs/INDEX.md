# Orbit Docs Index

> This is the recommended reading order for current Orbit architecture and plans.

---

## 1. Start here

1. `overview.md` — v2 overview; historical entry point.
2. `ROADMAP.md` — current milestone map from completed work to Phase 9+.
3. `architecture.md` — current code architecture snapshot.

---

## 2. Stable architecture docs

These documents are the current source of truth for new design work.

1. `architecture/data-layering.md`
   - Layer 0 Signal Sources
   - Layer 1 Ground Truth / Library
   - Layer 2 Synthesis
   - Layer 3 Consumption Surfaces
   - Promotion gates
   - Feeds as Layer 0

2. `architecture/ai-runtime-and-sdk.md`
   - Runtime A: external Agent CLI
   - Runtime B: native SDK
   - Anthropic SDK first
   - MiniMax / DeepSeek Anthropic-compatible endpoints

3. `architecture/synthesis-layer.md`
   - SynthesisArtifact
   - prompt registry
   - scheduler
   - invalidation
   - provenance

4. `architecture/chat-conversation-surface.md`
   - Conversation as first-class entity
   - overlay/full-page shared chat
   - scoped conversation surfaces
   - shared Stage View

5. `architecture/entity-flow.md`
   - Feed / Library / Note / Resource / Area / Project / Task / Conversation flow
   - Resource lifecycle
   - Area as coordinate system
   - Timeline implications

---

## 3. Implementation plans

Current forward-looking plans:

1. `plans/phase-5-runtime-synthesis-conversation.md`
   - SDK runtime track
   - Synthesis foundation
   - Conversation surface unification

2. `plans/phase-6-knowledge-stack.md`
   - Notes + KB import
   - Library
   - Feed Reader as Layer 0
   - Timeline
   - Resource workstation
   - Area dashboard

3. `plans/phase-7-8-memory-search-gateway-vision.md`
   - semantic search
   - memory layer
   - reviews
   - vision system
   - gateway + Telegram
   - scheduled automation

Historical plans remain under `plans/2026-*` and should be treated as background unless referenced by current architecture docs.

---

## 4. Thinking trails

Reasoning history and decision context:

- `thinking-trail/2026-04-29-chat-unification-decoupling/`
  - Chat decoupling, runtime protocol, app bus, migration plan.

- `thinking-trail/2026-04-30-phase-2-knowledge-stack/`
  - `01-note-system-and-para.md`
  - `02-scheduled-tasks-ui.md`
  - `03-gateway-telegram.md`
  - `04-ask-anywhere-stage-view.md`
  - `05-daily-timeline.md`
  - `06-resource-workstation.md`
  - `07-sdk-synthesis-layering.md`

`07-sdk-synthesis-layering.md` is the bridge from Phase 2 thinking to the new stable architecture documents.

---

## 5. ADRs

ADRs live in `decisions/`.

Important current ADR anchors:

- `ADR-011-runtime-abstraction-through-capabilities.md`
- `ADR-012-task-session-binding-model.md`
- `ADR-013-unified-event-replay-infrastructure.md`
- `ADR-014-chat-decoupling-conversation-first-class.md`
- `ADR-015-task-session-state-decoupling.md`
- `ADR-016-agent-onboarding-protocol.md`
- `ADR-017-external-gateway-via-cc-connect.md`

New ADRs should be created for:

- Runtime B SDK track
- Synthesis Layer
- Feeds as Layer 0
- Promotion gates
- Area as coordinate system

---

## 6. When implementing a feature

Use this sequence:

1. Read `ROADMAP.md` for phase context.
2. Read the relevant stable architecture doc.
3. Read the relevant plan file.
4. Check old `plans/2026-*` only if the new plan references it.
5. Implement with tests and update docs if behavior changes.

---

## 7. Current doctrine in one page

- Feeds are not user data; Library is user data.
- Layer 0 cannot enter Layer 1 without a promotion gate.
- Synthesis never silently mutates truth data.
- Resource is an ongoing topic workspace, not a bookmark folder.
- Area is a long-term responsibility coordinate, not a moving item.
- Conversation is first-class; overlay and full page are the same conversation.
- SDK runtime is for short programmable AI; external CLI runtime is for long execution.
- Timeline is a projection, not the event store.
- Everything AI-generated must carry provenance.
st-class; overlay and full page are the same conversation.
- SDK runtime is for short programmable AI; external CLI runtime is for long execution.
- Timeline is a projection, not the event store.
- Everything AI-generated must carry provenance.
