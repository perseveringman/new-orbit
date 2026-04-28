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
- KB import copies markdown folders into `<vault>/knowledge-base/<kb-name>` and writes registry metadata to `knowledge-base/.orbit-kb-meta/registry.json`.
- KB activation must go through `knowledgeBase.activate`; it creates a Note, records activation metadata under `.orbit-kb-meta/annotations/`, and emits `kb.doc.activated`.
- Focused coverage lives in `tests/notes_kb.test.ts`.

## Library workstation

- Shared contracts live in `src/shared/library.ts`.
- Main-process store/IPC live in `src/main/library/store.ts` and `src/main/library/ipc.ts`; renderer API is `window.orbit.library`.
- Library items are Markdown files under `<vault>/library/{articles,pdfs,videos,bookmarks}`. Archive moves them to `<vault>/04_Archives/library/...`.
- `library.distill(id)` writes a `distill.library` SynthesisArtifact; it must not create a Note.
- `library.acceptDistillation({ artifact_id })` is the explicit user promotion gate to materialize a Note with `source.kind = library` and `synthesis_ref`.
- The older `capture.library` API remains for Inbox/Capture compatibility; new workstation features should prefer the top-level `library` API.
- Focused coverage lives in `tests/library_store.test.ts`.

## Feed Reader

- Shared contracts live in `src/shared/feed.ts`.
- Main-process store/IPC live in `src/main/feed/store.ts` and `src/main/feed/ipc.ts`; renderer API is `window.orbit.feeds`.
- Feed sources are stored in `<vault>/feeds/_sources.json`; raw feed items are Layer 0 JSON files under `<vault>/feeds/<source-id>/`.
- Fetching feeds must stay Layer 0: do not create Notes, LibraryItems, Resources, Resource refs, or main search truth during raw fetch.
- `feeds.items.saveToLibrary(id)` is the explicit promotion gate. It creates a first-class Library item and emits `promote.feed_to_library`.
- `feeds.digest(date)` and `feeds.cluster(scope)` write feed-scoped SynthesisArtifacts and must not materialize Layer 1 truth automatically.
- Focused coverage lives in `tests/feed_store.test.ts`; IPC namespace coverage lives in `tests/ipc.test.ts`.
