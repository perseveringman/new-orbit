---
id: ADR-023
title: Evidence-first Personal Memory Intelligence Layer
status: accepted
date: 2026-05-15
builds_on:
  - ADR-009
  - ADR-013
  - ADR-014
  - ADR-022
implementation: ../plans/2026-05-15-personal-memory-intelligence-foundation.md
---

## Context

Orbit needs to understand what the user is doing across notes, reading,
projects, tasks, conversations, activity events, and local AI agent sessions.
The previous Personal Memory proposal correctly identified Personal QA,
relation graph, memory nodes, reports, and conversation distillation as
important data products, but it did not define the lower-level evidence contract
that all of them depend on.

This matters because local AI agent sessions are becoming a major source of
user context. A Codex or Claude Code transcript is not the same kind of data as
a feed item. It records work the user actually did, but Orbit may not want to
copy the entire transcript into the vault immediately because transcripts can
be large, provider-specific, mutable, and sensitive.

Without a common evidence layer, adding local agent sessions first would force
Search, Memory, Synthesis, Review, Ask Anywhere, and Project Room to each invent
their own import and citation logic.

## Decision

Introduce an evidence-first Personal Memory Intelligence Layer.

Layer 1 truth is split into two storage forms:

- Direct truth: Orbit-owned entities such as Notes, Library items, Resources,
  Projects, Tasks, Areas, Conversations, and Activity events.
- Reference truth: user work facts that Orbit can cite and read through a
  provider, such as local AI agent sessions and external files, without
  requiring immediate full-text import.

All Layer 2 intelligence products, including summaries, Personal QA, Memory
nodes, open-loop reports, entity profiles, and context packets, must cite Layer
1 evidence through stable selectors. Synthesis remains interpretation and must
not replace the original evidence.

Local AI agent sessions are Layer 1 reference truth, not Layer 0 signal. They
will be integrated through `external_ai_session` source providers after the
evidence registry, selector model, safe projection, and context packet builder
exist.

## Rationale

Reference truth preserves the important product semantics: Orbit acknowledges
that local AI sessions are part of the user's real work context, while avoiding
the cost and privacy risk of copying every transcript by default.

The evidence registry gives all later systems the same primitive:

- source identity and fingerprint;
- availability status;
- privacy and indexing policy;
- stable selectors for full source, message range, line range, time range, or
  semantic chunk;
- optional snapshots when the user pins, distills, or saves a span.

This makes Personal Memory, Search, Review, Ask Anywhere, and future agent
context injection share one citation model.

## Consequences

Positive:

- Local agent session support can be added without creating a parallel session
  import architecture.
- Every synthesis artifact can be traced back to evidence.
- Search and Ask Anywhere can explain why a result or memory was recalled.
- Sensitive transcript content can remain reference-only or safe-projected by
  default.
- Missing or changed external sources can be detected instead of silently
  serving stale summaries.

Costs:

- A new evidence registry and provider abstraction must be built before the
  local agent session feature.
- The semantic index must track selectors and source provenance, not just
  flattened text.
- UI surfaces need evidence inspectors and stale/missing-source affordances.

Open questions:

- Whether `external_ai_session` should be added as a first-class
  `SynthesisSourceKind` or encoded as `conversation` metadata. The plan
  recommends making it first-class.
- Whether context packets should be persisted by default or only in developer
  debug mode. The plan recommends debug persistence only.

## Implementation

See `docs/plans/2026-05-15-personal-memory-intelligence-foundation.md`.
