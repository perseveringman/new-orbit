# Orbit Project Session Orchestration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn terminal-bound agent tracking into a project-level session system so Claude/Codex sessions can be revisited, resumed, displayed in project history, and reused as project context.

**Architecture:** Split terminal runtime identity from agent session identity. A project owns many Orbit agent sessions; a terminal pane may bind to different sessions over time. Main process becomes the source of truth for project session records, vendor session bindings, resume targets, and imported transcript snippets; renderer surfaces those records in both the right sidebar and a dedicated project history tab.

**Tech Stack:** Electron, React, Zustand, TypeScript, Vitest, node fs/json persistence

---

## Scope to complete in this implementation

1. Replace the current pane-scoped terminal session registry with a project-level Orbit session registry.
2. Bind vendor session identity as early as possible from hook payloads, while still supporting fallback resume discovery.
3. Add a project-center history tab so session history is not only a sidebar panel.
4. Make history item actions deterministic:
   - active session -> jump to existing pane
   - resumable inactive session -> open new terminal and resume
   - non-resumable inactive session -> open a new terminal seeded with project/session context
5. Add project-level session detail data that can later power full history/chat pages, and expose that data to project agent context generation now.

## Delivered

- `ProjectRoomView` now exposes `Kanban / Terminal / Sessions` outer tabs.
- Session records now preserve vendor session identity, title, summary, and resume metadata.
- Same-pane vendor/session switches create a new Orbit session instead of mutating one long-lived pane session.
- `window.orbit.terminalAgent.detail(projectUid, sessionId)` now returns lightweight session detail messages.
- Claude transcript import is implemented through local `~/.claude/projects/*` session files.
- Project-local `.agent/logs/SESSION_HISTORY.md` is scaffolded on project creation and refreshed when project sessions change.
- Compact sidebar session history remains available; the richer project-center history surface is the new primary inspection UI.

## Current vendor limits

- Claude: resume + lightweight transcript import supported.
- Non-Claude terminal vendors: project session tracking and resume command passthrough supported when hook payload provides enough metadata; transcript import is not yet implemented.

## Data model to land

- `ProjectAgentSessionRecord`
  - `orbitSessionId`
  - `projectUid`
  - `vendor`
  - `vendorSessionId?`
  - `status`
  - `createdAt`
  - `startedAt`
  - `endedAt?`
  - `lastActivityAt`
  - `title`
  - `summary`
  - `originPaneId?`
  - `activePaneId?`
  - `resumeCommand?`
  - `stats`
  - `artifacts`
  - `transcript`
- `ProjectAgentSessionMessage`
  - `id`
  - `role`
  - `text`
  - `at`
  - `kind`

Persistence stays in `<vault>/.orbit/sessions/registry.json`, but the schema changes from “pane active session list” to “project session timeline”.

## Task 1: Define the new project session schema

**Files:**
- Create: `tests/project_agent_sessions.test.ts`
- Modify: `src/main/agent/terminal_sessions.ts`
- Modify: `src/shared/ipc.ts`

**Step 1: Write the failing test**

Add tests that require:
- the registry to create a new Orbit session when the same pane receives a different `vendorSessionId`
- the registry to keep multiple sessions for the same pane under one project
- session records to expose title/summary/resume metadata fields in DTO shape

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/project_agent_sessions.test.ts`

Expected: FAIL because the current registry only supports one active session per `paneId + projectUid`.

**Step 3: Write minimal implementation**

Refactor `src/main/agent/terminal_sessions.ts` to:
- introduce `ProjectAgentSessionRecord`
- derive vendor/session identity from hook payload
- match the active record by `projectUid + activePaneId + vendor + vendorSessionId`
- rotate to a new Orbit session when vendor session identity changes in the same pane
- keep the old session immutable except for final completion bookkeeping

Update `src/shared/ipc.ts` so renderer DTOs carry the new fields.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/project_agent_sessions.test.ts`

Expected: PASS

## Task 2: Bind vendor resume identity and transcript metadata

**Files:**
- Create: `tests/project_agent_session_imports.test.ts`
- Modify: `src/main/agent/claude_sessions.ts`
- Modify: `src/main/agent/ipc.ts`
- Modify: `src/main/agent/hooks/server.ts`

**Step 1: Write the failing test**

Add tests that require:
- hook-ingested sessions to preserve a `vendorSessionId` from payload when present
- Claude transcript discovery to prefer the bound `vendorSessionId`
- fallback time-window matching to remain available when hook payload has no vendor session id
- imported transcript snippets/messages to be returned in session detail data

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/project_agent_session_imports.test.ts`

Expected: FAIL because current code only lazily computes `resumeCommand` in `terminalAgent.list`.

**Step 3: Write minimal implementation**

Update main-process session enrichment to:
- normalize hook payload fields such as `session_id`, `sessionId`, `conversation_id`, `cwd`, `summary`, `title`
- compute and persist `resumeCommand` as soon as a reliable vendor id is known
- extend Claude local session readers so Orbit can load lightweight transcript/detail data for the project session detail view

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/project_agent_session_imports.test.ts`

Expected: PASS

## Task 3: Replace sidebar history plumbing with project session history

**Files:**
- Create: `tests/project_session_action.test.ts`
- Modify: `src/renderer/src/components/Sidebar/terminalSessionAction.ts`
- Modify: `src/renderer/src/components/Sidebar/TerminalSessionsPanel.tsx`
- Modify: `src/renderer/src/components/Terminal/terminalNavigationIntent.ts`
- Modify: `src/renderer/src/views/ProjectRoomView.tsx`

**Step 1: Write the failing test**

Add tests that require:
- active sessions to route back to their existing pane
- resumable inactive sessions to open a new terminal tied to the selected Orbit session
- non-resumable inactive sessions to request a new tab seeded from session context instead of a dead pane id

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/project_session_action.test.ts tests/terminal_navigation_intent.test.ts`

Expected: FAIL because current inactive fallback still points at stale pane ids.

**Step 3: Write minimal implementation**

Refactor navigation intent payloads to carry:
- `projectUid`
- `orbitSessionId?`
- `paneId?`
- `initialCommand?`
- `openMode: 'focus-pane' | 'resume-session' | 'reopen-session'`

Update the sidebar list to render vendor/title/summary metadata and to route through the new action model.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/project_session_action.test.ts tests/terminal_navigation_intent.test.ts`

Expected: PASS

## Task 4: Add a project-center Sessions tab with detail view

**Files:**
- Create: `tests/project_room_model.test.ts`
- Create: `src/renderer/src/views/ProjectSessionsView.tsx`
- Modify: `src/renderer/src/store/para.ts`
- Modify: `src/renderer/src/views/projectRoomModel.ts`
- Modify: `src/renderer/src/views/ProjectRoomView.tsx`
- Modify: `src/renderer/src/views/vaultRightSidebarModel.ts`
- Modify: `src/preload/index.ts`

**Step 1: Write the failing test**

Add tests that require:
- project room outer tabs to include `sessions`
- session detail view state to be representable in the project room model
- session history tab copy and empty states to reflect project-level history rather than terminal-only history

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/project_room_model.test.ts`

Expected: FAIL because the project room only supports `kanban` and `terminal`.

**Step 3: Write minimal implementation**

Add a third project-room outer tab:
- `Kanban`
- `Terminal`
- `Sessions`

`ProjectSessionsView` should provide:
- session list for the active project
- summary/status/vendor chips
- latest activity and artifact summary
- inline detail panel with imported transcript snippets/messages when available
- CTA buttons for `Jump`, `Resume`, or `Open new terminal`

Keep the existing right sidebar `Sessions` panel as a compact companion, but make the center tab the richer history surface.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/project_room_model.test.ts`

Expected: PASS

## Task 5: Feed project session memory into project agent context

**Files:**
- Create: `tests/project_agent_context_sessions.test.ts`
- Modify: `src/main/project_agent_context.ts`
- Modify: `src/main/project.ts`
- Modify: `src/main/agent/ipc.ts`

**Step 1: Write the failing test**

Add tests that require:
- generated project agent context files to mention recent project sessions
- session summaries to be written into a stable project-local context file
- new sessions/import updates to refresh that context artifact

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/project_agent_context_sessions.test.ts`

Expected: FAIL because current project agent context only includes generic skills and logs.

**Step 3: Write minimal implementation**

Generate a project-local session memory artifact, for example:
- `.agent/logs/SESSION_HISTORY.md`

It should contain recent project sessions, vendors, status, summaries, and key transcript snippets. Update `project_agent_context.ts` so CLAUDE/CODEX/GEMINI entry files point agents to that session memory file as reusable project context.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/project_agent_context_sessions.test.ts`

Expected: PASS

## Task 6: Full verification

**Files:**
- Modify: `docs/plans/2026-04-23-orbit-project-session-orchestration.md`

**Step 1: Run focused regression tests**

Run:
- `npm test -- tests/project_agent_sessions.test.ts`
- `npm test -- tests/project_agent_session_imports.test.ts`
- `npm test -- tests/project_session_action.test.ts`
- `npm test -- tests/project_room_model.test.ts`
- `npm test -- tests/project_agent_context_sessions.test.ts`

Expected: PASS

**Step 2: Run repo validation**

Run:
- `npm run typecheck`
- `npm run lint -- --quiet`
- `npm test`
- `npm run build`

Expected: PASS

**Step 3: Update the plan doc status**

Revise this file so the delivered behavior matches the final implementation details, especially any vendor-specific limits discovered during implementation.
