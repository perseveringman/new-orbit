# ADR-017: Orbit Mobile inbound integration

**Status**: accepted  
**Date**: 2026-05-07  
**Updated**: 2026-05-17

## Context

Orbit Mobile is a Capture-only iOS app. It writes complete local-first capture directories to iCloud Drive and expects desktop Orbit to ingest them when the Mac is available.

The original integration targeted Inbox / Thoughts. The desktop architecture has since moved capture ground truth into Layer 1 Notes and Library items, while Timeline is a Layer 3 projection over `TraceableEvent`. Mobile captures should follow that model.

## Decision

Desktop Orbit keeps `src/main/capture/mobile_inbound/` as the dedicated iCloud ingest module. Non-link captures materialize as Notes and publish `note.created`; URL share captures materialize as Library items and publish `library.item.added`.

The iCloud path `Documents/inbox/<capture_id>/` remains a transport queue name only. It does not mean Orbit product Inbox. A successful ingest:

1. Verifies manifest schema, `manifest.json.sha256`, and every attachment path/hash/size.
2. Copies attachments to `<vault>/.orbit/capture/attachments/<capture_id>/`.
3. For non-link captures, creates or reuses a stable Note id, currently `note-<capture_id>`.
4. Maps `thought` to `notes/thoughts`, `voice` / `recording` to `notes/voice_logs`, and `photo` / `share` / `mixed` to `notes/captures`.
5. For URL share captures, creates or reuses a stable Library item id, currently `lib-<capture_id>`, and parses source content through the shared Content Connector registry.
6. Publishes a deterministic Timeline event: `mobile-capture-note:<capture_id>` for Notes, `mobile-capture-library:<capture_id>` for Library items.
7. Moves the iCloud directory to `processed/<capture_id>/` and writes ACK schema v2 with either `artifact_kind: "note"` + `note_id` / `note_path`, or `artifact_kind: "library_item"` + `library_item_id` / `library_item_path`.

Recording captures may include transcript and AI derivative artifacts. Usable transcript excerpts and human-facing source attachment links can be written into the Note body, but technical transcript files such as `partial-transcript.ndjson` / `final-transcript.json` and original image source files such as `original-photo-1.heic` are copied for provenance rather than exposed by default. DeepSeek-generated summaries, decisions, risks, todos, and custom derivatives are **not** written into the Note body by default. They are converted into a `summary.entity` Synthesis artifact scoped to the Note, so Note Workbench can display and explicitly accept them.

Failures move the directory to `failed/<capture_id>/` with `.failed.json` so Orbit Mobile can surface retryable versus conflicted states.

If a duplicate `inbox/<capture_id>` arrives after `processed/<capture_id>/.acked` already exists, desktop Orbit treats it as idempotent replay and removes the duplicate inbox directory without creating another Note or Library item. Existing schema v1 ACKs with `inbox_item_id` are still honored as legacy idempotency guards.

## Consequences

- Mobile captures become first-class Notes or Library items and appear on Timeline without passing through product Inbox.
- Note body remains source-first and auditable; AI output lives in Synthesis / Note Workbench until the user accepts it.
- Orbit Mobile receives an ACK that points to the created Note or Library item path instead of an Inbox item.
- Content parsing is pluggable: OpenCLI can be attempted before the built-in fallback, and parser failure does not fail ingest or ACK.
- iCloud remains a transport channel; desktop Orbit does not treat it as a source of truth after ingest.
- Orbit Mobile can still delay first upload until DeepSeek-derived recording notes reach a terminal state, so desktop Workbench usually receives generated derivatives rather than local heuristic placeholders.
- The protocol remains schema-versioned and hash-checked, so future mobile manifest changes must update both repositories together.
