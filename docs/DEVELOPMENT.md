# Orbit — developer notes

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Launch Electron + Vite dev server (HMR for renderer). |
| `npm run build` | Typecheck, then build main / preload / renderer into `out/`. |
| `npm run start` | Preview a production build locally. |
| `npm run typecheck` | `tsc --noEmit` across both tsconfig projects. |
| `npm run lint` | ESLint across `src/`, `tests/`, `e2e/`. |
| `npm run test` | Vitest unit suite (node env; no e2e). |
| `npm run test:all` | `test` + `e2e` (requires `ORBIT_E2E=1` + display). |
| `npm run e2e` | Builds the app and drives it via Playwright Electron. Gated by `ORBIT_E2E=1`. |
| `npm run e2e:install` | Install Playwright browsers (optional). |
| `npm run package:dir` | Electron Builder `--dir` smoke (unsigned `.app`). |
| `npm run package` | Full `.dmg` + `.zip` for arm64 + x64 (unsigned). |

## Layout

```
orbit/
├── build/                 # packaging assets (icon.png)
├── docs/                  # architecture, user guide, dev notes
├── e2e/                   # Playwright Electron smoke tests (gated)
├── electron-builder.yml   # packaging config
├── electron.vite.config.ts
├── playwright.config.ts
├── src/
│   ├── main/              # Electron main process (IPC, vault, agents, crash)
│   ├── preload/           # contextBridge → window.orbit
│   ├── renderer/          # React + Zustand UI
│   └── shared/            # types + schemas + IPC contract
└── tests/                 # Vitest unit tests
```

## Testing

- Unit tests live in `tests/` and run under Node (no DOM). Where UI behaviour
  needs coverage, we test the class logic directly (e.g. `ErrorBoundary`'s
  `getDerivedStateFromError`) rather than pulling in jsdom.
- `ORBIT_USER_DATA=<tmp>` override at the top of `src/main/index.ts` lets e2e
  and local experiments redirect `app.getPath('userData')` without polluting
  the real userData.
- Crash log format: NDJSON at `<vault>/.orbit/crash/YYYY-MM-DD.log`, falling
  back to `userData/crash/` when no vault is open.

## Packaging

`electron-builder.yml` ships unsigned `.dmg` + `.zip` for macOS. Signing and
notarization are intentionally disabled (`mac.identity: null`, no `afterSign`).
To enable real distribution:

1. Set `mac.identity` to your Developer ID string.
2. Set `mac.hardenedRuntime: true` and add entitlements.
3. Wire `afterSign` to `electron-notarize` or `@electron/notarize`.

### Replacing the app icon

`build/icon.png` is a procedurally generated 1024×1024 placeholder. Replace
it with a real PNG (same dimensions) or regenerate `icon.icns` via
`iconutil`. Electron Builder will derive the other required sizes at
package time.

## React hook rules

The codebase uses `react-hooks/exhaustive-deps`. When an effect depends on a
property of an unstable object (e.g. `vault?.path`), destructure the primitive
into a local const and put that in the dep array — rather than an
eslint-disable.

## Adding a new IPC channel

1. Declare the channel in `src/shared/ipc.ts` (`IPC` object + `OrbitApi`).
2. Implement the main-process handler (typically in the owning module's
   `ipc.ts`).
3. Expose the method in `src/preload/index.ts`.
4. Use via `window.orbit.<ns>.<method>()` from the renderer.

The `tests/ipc.test.ts` file contains a compile-time shape test — new channels
must be added there (or the test will fail typecheck).

## Runtime B SDK endpoints

- Shared contracts are in `src/shared/runtime/*`; the renderer API is exposed as `window.orbit.runtime.sdk`.
- Non-secret endpoint config is stored per vault at `.orbit/runtime/sdk-endpoints.json`.
- API keys go through `SDKKeyVault` and should never be logged, written to endpoint config, or sent to renderer except as masked state.
- SDK streaming emits chat `RuntimeEvent`s and TraceableEvent observability records under source `runtime`.
- Focused coverage lives in `tests/sdk_runtime.test.ts`.

## Synthesis Layer

- Shared contracts are in `src/shared/synthesis/*`; renderer IPC is exposed as `window.orbit.synthesis`.
- Artifact state lives under `<vault>/.orbit/synthesis/`:
  - `index.json` maps `scope_key` to the latest artifact id.
  - `artifacts/*.json` stores immutable-ish artifact records with provenance.
  - `dlq/*.json` stores failed jobs and malformed model output.
- Recompute creates a new artifact and marks the previous latest artifact `superseded`; invalidation marks the latest artifact `stale`.
- Synthesis must not silently mutate Layer 1 truth. Materialization, such as Resource creation from suggestion, must go through an explicit user action/API.
- Focused coverage lives in `tests/synthesis_store.test.ts`.

## Conversation surface

- Shared contracts are in `src/shared/conversation/types.ts`.
- Main-process persistence lives under `<vault>/.orbit/conversations/`:
  - `<id>.meta.json` stores scope, anchors, title, status, and archived state.
  - `<id>.ndjson` stores append-only turns.
  - `index.json` stores last active conversation per `ConversationScope`.
- Chat IPC/preload methods expose create/list/get/update/archive and scoped last-active get/set.
- Ask-Anywhere overlay and full-page Ask should render the shared `components/conversation/ConversationShell` instead of forking chat UI.
- Focused coverage lives in `tests/conversation_store.test.ts`, `tests/ask_anywhere_ux.test.ts`, and `tests/ipc.test.ts`.

## Notes and Knowledge Base

- Shared contracts live in `src/shared/note.ts` and `src/shared/knowledge-base.ts`.
- Notes are Markdown files under `<vault>/notes/{thoughts,longforms,captures,voice_logs,daily-summaries}`. Archive moves them to `<vault>/04_Archives/notes/...`.
- Note frontmatter supports Layer 1 links (`areas`, `resource_refs`), origin (`source`), UI markers (`special_marker`), and Layer 2 provenance (`synthesis_ref`).
- Notes Workbench APIs live under `notes.queue`, `notes.workbench`, `notes.acceptSuggestion`, and `notes.dismissSuggestion`; suggestions are stored as `summary.entity` / `relate.notes` SynthesisArtifacts and only mutate Layer 1 when accepted.
- The Notes body editor uses `MarkdownLiveEditor`: Markdown text remains the source of truth, Live Preview hides common syntax on inactive lines, and Source mode disables the live decorations.
- Notes editor autosave uses a short renderer-side debounce and blur flush. Autosave writes the Layer 1 Note only; users trigger Workbench recomputation explicitly with Analyze.
- The CLI surface is `orbit note ...`; Ask-Anywhere agent tools should prefer `orbit_note_workbench` before accepting user-approved note suggestions.
- KB import copies markdown folders into `<vault>/knowledge-base/<kb-name>` and writes registry metadata to `knowledge-base/.orbit-kb-meta/registry.json`.
- KB activation must go through `knowledgeBase.activate`; it creates a Note, records activation metadata under `.orbit-kb-meta/annotations/`, and emits `kb.doc.activated`.
- Focused coverage lives in `tests/notes_kb.test.ts`.

## Library workstation

- Shared contracts live in `src/shared/library.ts`.
- Main-process store/IPC live in `src/main/library/store.ts` and `src/main/library/ipc.ts`; renderer API is `window.orbit.library`.
- Library items are Markdown files under `<vault>/library/{articles,pdfs,videos,bookmarks}`. Archive moves them to `<vault>/04_Archives/library/...`.
- URL shares from Orbit Mobile materialize as Library items, not Notes; source parsing goes through `src/main/content-connectors/` and stores snapshots under `<vault>/.orbit/content/extracted/`.
- `library.distill(id)` writes a `distill.library` SynthesisArtifact; it must not create a Note.
- `library.acceptDistillation({ artifact_id })` is the explicit user promotion gate to materialize a Note with `source.kind = library` and `synthesis_ref`.
- The older `capture.library` API remains for Inbox/Capture compatibility; new workstation features should prefer the top-level `library` API.
- Focused coverage lives in `tests/library_store.test.ts`.

## Feed Reader

- Shared contracts live in `src/shared/feed.ts`.
- Main-process store/IPC live in `src/main/feed/store.ts` and `src/main/feed/ipc.ts`; renderer API is `window.orbit.feeds`.
- Feed sources are stored in `<vault>/feeds/_sources.json`; raw feed items are Layer 0 JSON files under `<vault>/feeds/<source-id>/`.
- YouTube sources are provider-backed by `src/main/feed/youtube.ts`; X account sources are provider-backed by `src/main/feed/x.ts` and use OpenCLI (`twitter search from:<handle>`) to fetch the latest 20 posts by default.
- Reddit sources are provider-backed by `src/main/feed/reddit.ts` with OpenCLI + public JSON fallbacks. Hacker News sources are provider-backed by `src/main/feed/hackernews.ts` and use the official public API for stable story IDs.
- Feed readable extraction calls the shared content connector registry before writing `<vault>/.orbit/feed/extracted/` refs.
- Fetching feeds must stay Layer 0: do not create Notes, LibraryItems, Resources, Resource refs, or main search truth during raw fetch.
- `feeds.items.saveToLibrary(id)` is the explicit promotion gate. It creates a first-class Library item and emits `promote.feed_to_library`.
- `feeds.digest(date)` and `feeds.cluster(scope)` write feed-scoped SynthesisArtifacts and must not materialize Layer 1 truth automatically.
- Focused coverage lives in `tests/feed_store.test.ts`; IPC namespace coverage lives in `tests/ipc.test.ts`.

## Daily Timeline

- Shared contracts live in `src/shared/timeline.ts`; IPC/preload API is `window.orbit.timeline`.
- Main-process projection lives in `src/main/timeline/store.ts`; UI lives in `src/renderer/src/views/TimelineView.tsx`.
- Timeline must remain a TraceableEvent projection. Do not create separate Timeline truth records for Layer 1 data.
- Layer policy is centralized in `TIMELINE_LAYER_1_KINDS` / `TIMELINE_LAYER_2_KINDS`; raw feed fetch and other Layer 0/3 noise should stay out of both sets.
- `timeline.generateDailySummary(date)` writes a `summary.daily` SynthesisArtifact and materializes a `daily_summary` Note only because the user explicitly requested it.
- `timeline.exportPDF(scope)` writes PDF files under `<vault>/.orbit/timeline/exports/`.
- Focused coverage lives in `tests/timeline_store.test.ts` and `tests/timeline_view.test.ts`.

## Resource workstation

- Shared contracts live in `src/shared/resource.ts`; IPC/preload API is `window.orbit.resources`.
- Main-process store/IPC live in `src/main/resource/store.ts` and `src/main/resource/ipc.ts`; UI lives in `src/renderer/src/views/ResourceView.tsx`.
- Resource workstations live under `<vault>/resources/<slug>/` with `index.md`, section README files, `_timeline/README.md`, and `.orbit-resource.json`.
- Resource frontmatter supports `areas`, status/depth, engagement counters, and evolution metadata.
- Do not link raw Feed/Feed source data to Resources. Save Feed items to Library first, then link the resulting LibraryItem.
- `resources.suggestFromNotes()` creates `emerge.resource` synthesis output; `resources.createFromSuggestion()` is the explicit user promotion step.
- `resources.promoteRef()` moves refs between sections, most commonly to canonical.
- Focused coverage lives in `tests/resource_store.test.ts`; IPC namespace coverage lives in `tests/ipc.test.ts`.

## Area Dashboard and Assignment

- Shared contracts live in `src/shared/area.ts`; IPC/preload API is `window.orbit.area`.
- Main-process logic lives in `src/main/area.ts` and preserves existing `<vault>/02_Areas/<slug>/.orbit/config.json` storage.
- Area Dashboard data is assembled dynamically from Layer 1 Projects, Tasks, Notes, Library items, Resources, Feed sources, scheduled reviews, and latest area synthesis. Do not persist dashboard snapshots as truth.
- Assignments use shared `areas` refs for Notes, Library items, Resources, and Feed sources. Project/Task assignment writes `areas` while preserving legacy `area_uid` compatibility.
- `area.suggestAssignments(entity)` writes a `classify.area` SynthesisArtifact; accepting a suggestion must go through explicit `area.assign`.
- Renderer surfaces live in `src/renderer/src/views/AreaRoomView.tsx` and `src/renderer/src/views/AreaOverview.tsx`.
- Focused coverage lives in `tests/area_store.test.ts`, `tests/area_view.test.ts`, and `tests/ipc.test.ts`.
