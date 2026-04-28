# Orbit

Orbit is a **complete local implementation of Building a Second Brain (BASB)** — with AI agents as the execution engine for the Express stage of the CODE workflow. Your knowledge lives as plain Markdown in a PARA-shaped vault (`01_Projects`, `02_Areas`, `03_Resources`, `04_Archives`); all app state lives in a `.orbit/` folder inside the vault — never in the app source.

Under the hood, Orbit is an Electron + React workbench that orchestrates Claude Code CLI sub-agents in isolated execution contexts. Worktree execution is the current production path; sandbox execution is a reserved v2 extension point. It is Obsidian-compatible Markdown + Git — no vendor lock-in, no proprietary format.

> **Architecture update.** Orbit now uses a four-layer model: Layer 0 Signal Sources, Layer 1 Ground Truth / Library, Layer 2 Synthesis, and Layer 3 Consumption Surfaces. Feeds are Layer 0 and only become user data after entering Library. Start from [`docs/INDEX.md`](docs/INDEX.md), then read [`docs/ROADMAP.md`](docs/ROADMAP.md) and [`docs/architecture/data-layering.md`](docs/architecture/data-layering.md).

## Quickstart

**Prereqs**: Node 20+, macOS (Windows/Linux work in dev but packaging is mac-first today), and the [Claude Code CLI](https://docs.claude.com/claude-code) installed and reachable on your `PATH`. Set `ANTHROPIC_API_KEY` in your shell, or paste it in Settings → API / CLI after first launch.

```bash
git clone <this-repo>
cd orbit-app/orbit
npm install
npm run dev                # live-reload renderer + Electron main
```

### Build a distributable

```bash
# .app bundle only (fast smoke; needs no code signing):
npm run package:dir
# .dmg + .zip for arm64 and x64 (unsigned; gatekeeper will warn):
npm run package
```

Artifacts land in `dist-electron/`. Signing + notarization are intentionally disabled in `electron-builder.yml`; enable them by setting a real `mac.identity` and wiring `afterSign`.

## Concepts

- **Vault** — a folder you pick (or create) containing PARA directories + a `.orbit/` control folder (`config.json`, search index, agent logs, crash logs, vector store).
- **PARA** — `01_Projects`, `02_Areas`, `03_Resources`, `04_Archives`. The top-level folder determines entity type; UIDs are stable.
- **Tasks** — frontmatter `type: task` files OR inline `- [ ]` checkboxes. Statuses: inbox / today / doing / blocked / done.
- **Agents** — Claude Code CLI runs spawned in the vault or in a worktree. Agent-facing capabilities go through the local `orbit` CLI and main-process bridge.
- **Worktrees** — each risky change runs in its own `git worktree` under `.orbit/worktrees/`. Auto-allocated dev ports, isolated `node_modules`, queued installs. GC sweeps merged/aborted worktrees older than 7 days on launch + every 24h.
- **Ghost Commits** — agent output first lands on a `ghost/*` branch (`git commit --no-verify` with a preserved authored ident). Merging requires passing a pre-merge secret/diff-size/test check.
- **Budget** — per-run and per-day token + USD caps live in Settings → Budget. Hard-stop blocks overruns; warn-only surfaces a banner.
- **Distillation** — "distill project" summarises a project into a resource note; local hash-trick vector store powers experience wake-up (threshold in Settings → Vectors).

## v2 architecture highlights

Orbit v2 keeps the local-first Markdown + Git foundation and replaces the old batch automation model:

- **项目即文件夹 (Project = folder)** — every project is its own folder under `01_Projects/<slug>/` with its own `README.md`, `AGENT.md`, `.orbit/config.json`, `.orbit/agent/tasks/`, `.orbit/agent/memories/` and a per-project `git` repo. Legacy single-file projects migrate via an in-app dialog that commits a safety snapshot at the vault root first.
- **Vision-first dashboard** — on first launch you write `Vision.md`; the Dashboard surfaces vision excerpt, recommended tasks, and a + New Project wizard (blank / web-app / research / writing templates).
- **Four-section Task Editor** — every task stores `## Description`, `## Thinking`, `## Execution Log`, `## Summary` as plain Markdown; the editor auto-saves each section and exposes per-section aria-expanded state.
- **Project Room** — Kanban + embedded xterm/node-pty terminal + GitHub + Sessions + Planner + Roles, rooted at the project folder.
- **Orbit CLI** — local `orbit` CLI talks to the Electron main process through the vault socket and replaces the removed MCP server as the agent-facing tool surface.
- **Auto-runner** — a default-off 24x7 dispatcher observes approved, dependency-ready tasks and starts worktree-backed agent runs when enabled.
- **Proposal + Inbox** — agents propose independent new tasks instead of directly mutating the board; users approve/reject through Inbox/chat.
- **Task dependencies** — `depends_on` gives task graphs explicit topological unlock semantics and cascade blocking.
- **Capture** — Feed / Library / Thoughts plus Quick Capture feed the same Inbox triage surface.
- **Daily Review** — `02_Areas/Journal/YYYY-MM-DD.md` generated on demand (or scheduled), with "Recommended today" badges on the Kanban + an LLM-written summary of the previous day. A Journals tab lists every past review.
- **Worktree GC** — done/aborted worktrees are cleaned on launch and every 24h (configurable in settings: `worktreeGcEnabled`, `worktreeGcDays`).

See [docs/architecture.md](docs/architecture.md) for internals and [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for an end-to-end walkthrough.

## Keyboard shortcuts

- `⌘K` / `Ctrl+K` — command palette (switch file, open view)
- `⌘S` / `Ctrl+S` — save the active editor
- `⌘N` / `Ctrl+N` — new project (from anywhere in a vault)
- `⌘⇧N` / `Ctrl+Shift+N` — new task (inside a Project Room)
- `⌘B` / `Ctrl+B` — toggle the left sidebar
- `` ⌘` `` / `` Ctrl+` `` — focus the embedded terminal (Project Room)
- `Esc` — close modals, palettes and drawers

## Troubleshooting

- **"Claude Code CLI not found"** — either install from the [Claude Code docs](https://docs.claude.com/claude-code) or set a custom path in Settings → API / CLI → "Claude Code CLI path".
- **A run was halted by budget** — either raise the cap in Settings → Budget, or disable Hard stop to downgrade caps to warnings.
- **Worktree is stuck / won't remove** — Settings → Advanced → "Reset all unmerged worktrees" will force-remove every worktree under `.orbit/worktrees/`. Uncommitted changes are discarded.
- **App won't launch after an upgrade** — check `<vault>/.orbit/crash/YYYY-MM-DD.log` (or `userData/crash/` if no vault was open). You can also reveal the userData folder from Settings → Advanced.
- **Renderer errored** — the in-app ErrorBoundary will surface a Reload + Copy crash details option.

## Docs

- [Docs Index](docs/INDEX.md) — recommended reading order and current doctrine.
- [Roadmap](docs/ROADMAP.md) — completed milestones and Phase 5–9 plan.
- [Data Layering](docs/architecture/data-layering.md) — Signal Sources / Ground Truth / Synthesis / Surfaces.
- [AI Runtime + SDK](docs/architecture/ai-runtime-and-sdk.md) — external CLI runtime plus Anthropic-compatible SDK track.
- [Synthesis Layer](docs/architecture/synthesis-layer.md) — AI-generated artifacts, provenance, invalidation, scheduler.
- [Conversation Surface](docs/architecture/chat-conversation-surface.md) — unified overlay/full-page/scoped chat.
- [Entity Flow](docs/architecture/entity-flow.md) — Feed / Library / Note / Resource / Area / Project lifecycle.
- [Architecture](docs/architecture.md) — current code/process architecture snapshot.
- [Development](docs/DEVELOPMENT.md) — scripts, layout, testing notes.
- [User guide](docs/USER_GUIDE.md) — walkthrough of the UI.
- [Changelog](CHANGELOG.md) — change history.

## License

MIT — see `package.json`.
