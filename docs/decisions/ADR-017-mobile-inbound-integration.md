# ADR-017: Orbit Mobile inbound integration

**Status**: accepted  
**Date**: 2026-05-07

## Context

Orbit Mobile is a Capture-only iOS app. It writes complete capture directories to iCloud Drive and expects desktop Orbit to ingest them into the existing Inbox/Thoughts flow.

## Decision

Desktop Orbit will add `src/main/capture/mobile_inbound/` as a fourth Capture domain. The module watches `~/Library/Mobile Documents/iCloud~com.orbit.capture/Documents/inbox/*/.complete`, verifies `manifest.json.sha256`, parses schema version 1 manifests, creates a Thought through `ThoughtService`, copies attachments into `<vault>/.orbit/capture/attachments/<capture_id>/`, then moves the iCloud directory to `processed/<id>/` with `.acked`.

Failures move the directory to `failed/<id>/` with `.failed.json` so Orbit Mobile can surface retryable versus conflicted states.

## Consequences

- Mobile capture becomes part of the existing Inbox triage flow instead of a separate mobile-only inbox.
- iCloud remains a transport channel; desktop Orbit does not treat it as the source of truth after ingest.
- The protocol is schema-versioned and hash-checked, so future mobile manifest changes must update both repositories together.
