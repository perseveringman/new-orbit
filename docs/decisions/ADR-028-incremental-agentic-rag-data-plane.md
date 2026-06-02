---
id: ADR-028
title: Incremental Agentic RAG Data Plane
status: accepted
date: 2026-06-02
builds_on:
  - ADR-013
  - ADR-023
---

## Context

Orbit's PMIL and Ask Anywhere foundations already have the right product shape:
Layer 1 evidence, Layer 2 synthesis, cited context packets, graph recall, and
agentic retrieval planning.

The remaining architecture risk is performance. Connectors and index stores can
accidentally behave like query-time crawlers: a user asks a question, Search or
ContextPacket discovers stale state, then Orbit scans external files, reads many
connector documents, or rebuilds a whole index before returning a result.

That violates the local-first data contract. External sources such as Obsidian
vaults and local AI session archives can be large, mutable, sensitive, and slow.
They should be synchronized and indexed when they change, not reprocessed on
every retrieval.

## Decision

Orbit adopts an incremental Agentic RAG data plane.

Data ingestion and retrieval are separate phases:

- Ingestion phase: source changes are discovered through Orbit events, provider
  scans, connector sync, file fingerprints, or future provider cursors. Changed
  sources are written to the evidence registry and indexed incrementally.
- Retrieval phase: Ask, Search, ContextPacket, Memory, and Synthesis query local
  indexes and read bounded evidence selectors. Retrieval must not trigger an
  unbounded connector scan or a whole-index rebuild.

Connectors are catalog-backed. A connector scan writes a persistent catalog of
documents and safe projections under `.orbit/connectors/`. After a scan:

- `listDocuments` reads the catalog.
- connector search reads the catalog and cached safe projections.
- evidence reads prefer cached connector projections.
- semantic connector projection reads cached connector projections.
- full original reads may still call the connector plugin for a selected
  document.

Evidence chunk search and semantic search read existing indexes only. They do
not rebuild themselves in the query path. Rebuild and incremental sync are
explicit data-plane operations.

## Invariants

The following invariants are normative:

1. `search()` methods must not call `rebuild()` or `rebuildIndex()`.
2. Query-time code must not call connector plugin `listDocuments()`.
3. Connector plugin `listDocuments()` belongs to explicit scan/sync only.
4. Connector plugin `readDocument()` may be used by scan/sync or a selected full
   read, but evidence and semantic safe projections should prefer the catalog.
5. Every indexable source has a stable source id and fingerprint.
6. Unchanged source fingerprints skip chunking and embedding.
7. Deleted or missing sources remove their chunks and vectors during explicit
   sync, while evidence provenance can retain missing-source status.
8. Layer 0 feed items do not enter the main evidence index unless promoted to a
   Layer 1 entity such as Library.
9. Layer 2 synthesis artifacts remain derived state and must cite Layer 1
   evidence instead of silently mutating truth.
10. Full rebuild is an administrative, migration, first-run, or explicit user
    action, not a retrieval side effect.

## Consequences

Positive:

- Ask/Search latency becomes bounded by local index reads and top-k evidence
  reads.
- Large Obsidian vaults and local AI history archives do not freeze the app on
  every query.
- Connector behavior matches enterprise RAG connector patterns: sync external
  data into a local catalog/index, then retrieve locally.
- The existing retrieval planner can become genuinely agentic without using
  file crawls as hidden tools.
- Staleness becomes visible data-plane state instead of a surprise rebuild.

Costs:

- Existing tests and call sites that relied on implicit rebuild must explicitly
  sync or rebuild indexes.
- The current JSON index stores remain a foundation; larger vaults should move
  toward SQLite/FTS-backed source, chunk, vector, graph, job, and cursor tables.
- Event consumers still need to be wired so all Layer 1 mutations enqueue
  source-level index jobs instead of waiting for manual sync.

## Implementation Notes

Initial implementation:

- Added a persistent connector catalog and projection cache.
- Changed connector list/search/evidence/semantic safe-projection paths to read
  the catalog.
- Changed semantic search to use existing index contents instead of rebuilding
  when stale.
- Changed evidence chunk list/get/search to read existing chunks instead of
  rebuilding when stale.
- Added `syncIncremental` for evidence chunks so explicit data-plane sync
  reprocesses changed sources while preserving unchanged chunks and embeddings.

Future work:

- Add a durable source delta/job queue under `.orbit/data/`.
- Convert Note, Library, Resource, Project, Area, Conversation, KB, and
  connector updates into source-level indexing jobs.
- Persist lexical/vector indexes in a database instead of rebuilding MiniSearch
  in memory per query.
- Add connector cursors and file watchers for delta scans beyond initial catalog
  sync.
