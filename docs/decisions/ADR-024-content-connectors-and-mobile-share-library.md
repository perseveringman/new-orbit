# ADR-024 — Content Connectors and Mobile Share to Library

**Date**: 2026-05-17  
**Status**: accepted

## Context

Orbit has three places that need readable external content:

- Library URL saves and reading workflows
- Feed item extraction before Save to Library
- Orbit Mobile shares from WeChat, Xiaohongshu, X, Safari, and other apps

These parsing rules change frequently. Platform-specific pages may require login/browser context, and hard-coding parsers inside `mobile_inbound` or `feed/store` makes the system brittle.

## Decision

Introduce a shared `ContentConnector` layer under `src/main/content-connectors/`.

Connectors receive URL/title/raw text/platform hints and return a normalized `ParsedContent` result:

- platform and parser hint
- canonical/source URL
- title, author, excerpt
- Markdown body
- connector id/version
- status/error/attempts

Business modules do not write directly inside connector code. They call the registry, then decide how to persist the result:

- Mobile URL shares create stable Library items and optionally write parsed snapshots under `.orbit/content/extracted/...`.
- Feed item extraction calls the same registry before writing `FeedItem.extracted_ref`.
- Library items preserve connector provenance in `frontmatter.source`.

OpenCLI is the first external connector target. It is attempted before the built-in fallback for WeChat/Xiaohongshu/X. If OpenCLI is unavailable or fails, the registry continues to the next connector. Parser failure never fails mobile ingest or Feed save.

## Consequences

- External-source parsing becomes replaceable and easier to update.
- Multiple connectors can provide layered fallback without changing Library/Feed/mobile code.
- Mobile shares are now source material and belong in Library, not Notes.
- Raw captures and transport ACK remain local-first and durable even when all connectors fail.

## Follow-up

- Harden the OpenCLI command mapping as OpenCLI stabilizes.
- Add connector health UI and user-visible retry in Library.
- Add source-specific cleanup selectors for Xiaohongshu to remove comment/recommendation noise.
- Consider shared dedupe by canonical URL across Feed and Library.
