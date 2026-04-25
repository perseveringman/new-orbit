# Orbit

Orbit is a **complete local implementation of Building a Second Brain (BASB)** — with AI agents as the execution engine for the Express stage of the CODE workflow. Your knowledge lives as plain Markdown in a PARA-shaped vault (`01_Projects`, `02_Areas`, `03_Resources`, `04_Archives`); all app state lives in a `.orbit/` folder inside the vault — never in the app source.

Under the hood, Orbit is an Electron + React workbench that orchestrates Claude Code CLI sub-agents in isolated execution contexts (worktrees for code projects, sandboxes for note projects). It is Obsidian-compatible Markdown + Git — no vendor lock-in, no proprietary format.

> **🚧 v2 direction being implemented.** As of 2026-04-26, Orbit has entered a major architectural evolution. See [`docs/overview.md`](docs/overview.md) for the new direction and [`docs/decisions/`](docs/decisions/) for the 10 core ADRs. The code in this repo still reflects v1 (which [`docs/architecture.md`](docs/architecture.md) describes accurately).

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
- **Agents** — Claude Code CLI runs spawned in the vault or in a worktree. Hydration queries (`@orbit:search ...`) are answered from the local index.
- **Worktrees** — each risky change runs in its own `git worktree` under `.orbit/worktrees/`. Auto-allocated dev ports, isolated `node_modules`, queued installs. GC sweeps merged/aborted worktrees older than 7 days on launch + every 24h.
- **Ghost Commits** — agent output first lands on a `ghost/*` branch (`git commit --no-verify` with a preserved authored ident). Merging requires passing a pre-merge secret/diff-size/test check.
- **Budget** — per-run and per-day token + USD caps live in Settings → Budget. Hard-stop blocks overruns; warn-only surfaces a banner.
- **Distillation** — "distill project" summarises a project into a resource note; local hash-trick vector store powers experience wake-up (threshold in Settings → Vectors).

## 二期改造 — Project-as-Folder / Terminal / MCP / Night Shift (v1.0)

Orbit 1.0 ships the second-phase redesign described in the Gemini blueprint:

- **项目即文件夹 (Project = folder)** — every project is its own folder under `01_Projects/<slug>/` with its own `README.md`, `AGENT.md`, `.agent/config.json`, `.agent/tasks/`, `.agent/memories/` and a per-project `git` repo. Legacy single-file projects migrate via an in-app dialog that commits a safety snapshot at the vault root first.
- **Vision-first dashboard** — on first launch you write `Vision.md`; the Dashboard surfaces vision excerpt, recommended tasks, and a + New Project wizard (blank / web-app / research / writing templates).
- **Four-section Task Editor** — every task stores `## Description`, `## Thinking`, `## Execution Log`, `## Summary` as plain Markdown; the editor auto-saves each section and exposes per-section aria-expanded state.
- **Project Room** — Kanban + an embedded xterm + node-pty terminal rooted at the project folder. Open your favourite agent CLI (`claude`, `codex`, `gemini`…); the project's `.mcp.json` is auto-written so MCP-capable CLIs see the Orbit server.
- **Orbit Hooks (MCP)** — local MCP server (`out/mcp/server.cjs`) exposes 7 tools: `search_vault`, `get_file`, `create_task`, `update_task`, `search_memories`, `save_memory`, `query_project_graph`.
- **Night Shift** — pick a batch of tasks, set concurrency + auto-PR, go to sleep. Each task runs in its own worktree; results merge or open PRs. Results visible in the 🌙 History drawer.
- **Daily Review** — `02_Areas/Journal/YYYY-MM-DD.md` generated on demand (or scheduled), with "Recommended today" badges on the Kanban + an LLM-written summary of the previous day. A Journals tab lists every past review.
- **Worktree GC** — done/aborted worktrees + night-worktree runs are cleaned on launch and every 24h (configurable in settings: `worktreeGcEnabled`, `worktreeGcDays`).

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

- [Vision](docs/VISION.md) — product vision and long-term direction.
- [Roadmap](docs/ROADMAP.md) — completed milestones and upcoming work.
- [Architecture](docs/architecture.md) — process model, IPC surface, vault layout.
- [Development](docs/DEVELOPMENT.md) — scripts, layout, testing notes.
- [User guide](docs/USER_GUIDE.md) — walkthrough of the UI.
- [Migration (legacy → v3)](docs/MIGRATION.md) — moving single-file projects to folders, rollback.
- [Changelog](CHANGELOG.md) — change history.

## License

MIT — see `package.json`.
back.
- [Changelog](CHANGELOG.md) — change history.

## License

MIT — see `package.json`.
