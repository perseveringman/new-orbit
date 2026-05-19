# ADR-025 — Feed Task Center

**Date**: 2026-05-19  
**Status**: accepted

## Context

Feed refresh now covers RSS, YouTube, X, Reddit, and Hacker News. Some providers use browser/session-backed connectors and can fail or rate-limit when multiple refreshes happen at once. The Feed UI also needs one place to explain queued, running, retrying, and failed subscription updates.

## Decision

Introduce a persisted Feed Task Center under `.orbit/feed/task-center/jobs.json`.

All subscription refresh entry points enqueue tasks instead of directly running provider fetches:

- new Feed source creation enqueues `source.initial_fetch`
- manual refresh enqueues `source.refresh`
- scheduled Feed refresh enqueues `source.refresh` and waits for terminal task results

The scheduler uses one lane per platform. Tasks from the same platform run serially, while different platforms can run in parallel up to a global concurrency cap. Active tasks are deduped by source and task kind so repeated clicks do not create duplicate work.

## Consequences

- X Following / For You and other browser-sensitive feeds no longer race each other.
- Feed refresh state survives app restarts and in-flight jobs are restored to queued.
- The Feed page can show a dedicated task-center sidebar with retries, cancellation for queued jobs, and platform-lane status.
- Provider fetch implementation can keep changing behind the task center without changing UI entry points.

## Follow-up

- Add connector-level health checks to annotate task failures with actionable remediation.
- Add abortable fetch providers before supporting cancellation of running tasks.
- Add a task event stream so the renderer can update without polling.
