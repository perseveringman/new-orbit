# Orbit architecture (M1 → M2)

## Process model

Standard Electron three-process layout:

- **Main** (`src/main/`) — Node.js. Owns the window, the filesystem, git, the
  chokidar watcher, the in-memory index and (in future milestones) the Claude
  Code CLI child processes. Registers all `ipcMain.handle` channels declared
  in `src/shared/ipc.ts`.
- **Preload** (`src/preload/index.ts`) — runs in the renderer's process but
  before the page loads, with access to Node. Uses `contextBridge` to expose a
  single typed object `window.orbit` that mirrors the `OrbitApi` interface.
  `contextIsolation: true` and `nodeIntegration: false`.
- **Renderer** (`src/renderer/`) — React + Vite + Tailwind + CodeMirror, pure
  browser context. Talks to the main process only through `window.orbit`.

## IPC contract

`src/shared/ipc.ts` defines a `const IPC` object whose keys are channel names
and an `OrbitApi` interface whose shape matches. Both main and preload import
from the same module so adding a channel fails to compile on either end until
it is implemented.

Namespaces:

| Namespace                                   | Status      | Owner milestone |
| ------------------------------------------- | ----------- | --------------- |
| `workspace`                                 | implemented | M1              |
| `settings`                                  | implemented | M1              |
| `fs`                                        | implemented | M2              |
| `para`                                      | implemented | M3              |
| `git`                                       | stub        | M5              |
| `agent`                                     | implemented | M4              |
| `runtime` / `planner` / `dispatch` / `role` | implemented | Orchestration   |

### `fs` surface

| Channel                                | Purpose                                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `fs:listTree(vault)`                   | Typed `FileNode` tree of markdown files (ignores `node_modules`, `.git`, `.orbit`).                                                |
| `fs:readFile(abs)`                     | Reads a file; injects a uid into frontmatter on first read and rewrites the file.                                                  |
| `fs:writeFile(abs, content)`           | Atomic write (temp + rename).                                                                                                      |
| `fs:createFile(dir, name, initial?)`   | Creates a new markdown note with a uid in frontmatter.                                                                             |
| `fs:rename(old, new)`                  | OS-level rename + refmap update + **backlink-safe rewrite** of `[[Old]]` → `[[New]]` across the vault. Returns `{ linksUpdated }`. |
| `fs:deleteFile(abs)`                   | Moves to `.orbit/trash/` (reversible).                                                                                             |
| `fs:resolveUid(uid)` / `fs:uidOf(rel)` | Refmap lookups.                                                                                                                    |
| `fs:search(q, { limit })`              | MiniSearch full-text + title search.                                                                                               |
| `fs:backlinksOf(abs)`                  | Files linking to the given file via wikilink.                                                                                      |
| `fs:event` (push)                      | Broadcasted `FsEvent { kind, path, relPath, oldPath?, oldRelPath? }`.                                                              |

All handlers reject any path that resolves outside the current vault
(`src/main/pathGuard.ts`).

## Refmap format

`.orbit/refmap.json` is a flat JSON object `{ [uid]: relPath }` where `relPath`
is POSIX-style (`sub/note.md`). Writes are atomic (temp + rename). The in-memory
store in `src/main/refmap.ts` keeps forward + reverse maps. On vault open:

1. Load any existing refmap.
2. Walk every markdown file. For each:
   - If frontmatter has `uid`, record it.
   - Otherwise generate a 12-char URL-safe nanoid and inject it into the
     frontmatter (preserving any existing YAML keys, fabricating the block if
     absent). Never clobber an existing `uid`.
3. Drop any refmap entry whose file is no longer on disk.

UIDs are preserved across rename (both in-app and external), so they are the
ground truth for cross-references even when filenames change.

## File watcher

`src/main/watcher.ts` uses chokidar with `awaitWriteFinish` and ignores:

- `**/.git/**`
- `**/node_modules/**`
- `**/.orbit/logs/**`, `**/.orbit/cost/**`, `**/.orbit/trash/**`

### Rename heuristic

chokidar emits `unlink` + `add` on moves. We buffer every `unlink` in a 250 ms
window keyed on the last-known file signature. When a matching `add` arrives
we:

1. Compute file size + SHA-1 of the first 4 KB of the new file.
2. Match against the pending unlink bucket.
3. On match → emit a synthesized `rename` event; otherwise flush the unlink
   after the timeout and treat the add as a plain add.

This avoids re-indexing or losing wikilink rewrites on internal moves while
still handling the pathological case (delete + rewrite different content at
the same path) correctly, because that would cancel the match.

## Search index

`src/main/search.ts` wraps MiniSearch. The index is built in-process from the
bodies of every markdown file (frontmatter stripped), with title-weighted
boost. It is updated incrementally on `fs:event` (`add`/`change`/`unlink`/
`rename`). M7 will replace it with sqlite-vss semantic search.

## Editor extension points (M3+)

- `src/renderer/src/components/Editor/MarkdownEditor.tsx` — CodeMirror 6 host.
  Takes `onOpenWikilink(target)` so views can replace the resolver (e.g. M3
  task-aware navigation).
- `src/renderer/src/components/Editor/wikilinkExt.ts` — decoration + click
  plugin. Replace or extend with additional parsers (embeds, block refs) by
  returning an `Extension[]` from a sibling module and concatenating in the
  editor factory.
- `src/renderer/src/store/files.ts` — Zustand store. `openPath`,
  `setContent`, `save`, `rename`, `deletePath`, `search`, `toast` form the
  public surface the editor and sidebars consume. Additional panes (PARA,
  tasks) should plug in here rather than call IPC directly.

## Workspace Inspector（Files + Changes）

Project / editor 右侧栏现在统一走 `inspector` 面板，而不是旧的分散式
`files` / `diff` 分支。实现分三层：

- **Renderer shell**：`src/renderer/src/components/Inspector/WorkspaceInspectorPane.tsx`
  负责 tab 切换；`useWorkspaceInspector` 持有 `activeTab`、查询词、
  `selectedPath`、`commitMessage` 与目录展开状态。
- **Files tab**：`src/renderer/src/components/Inspector/files/` 复用
  `useFiles`，但在 `project` surface 下改用新的 `fs:listProjectTree(root)`
  加载完整项目树；非 project surface 仍保留旧的 markdown-only
  `fs:listTree(vault)`，避免 PARA / editor 导航回退。
- **Changes tab**：`src/renderer/src/components/Inspector/changes/` 通过
  `git:getChanges(cwd)` 获取 staged / unstaged / untracked 状态，通过
  `git:getWorkingTreeDiff(cwd, pathspec?)` 获取 tracked working-tree patch，
  再在 renderer 里按目录分组、渲染 stage / unstage / discard、统一 diff
  预览与 staged-only commit bar。

与 Inspector 直接相关的新 IPC / git surface：

| Channel                                                | Purpose                                                                           |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `fs:listProjectTree(root)`                             | 返回完整项目树（不限于 Markdown），忽略 `.git` / `node_modules` / `.orbit`。      |
| `fs:createDirectory(parent, name)`                     | 在 vault/project 边界内安全创建目录。                                             |
| `git:getChanges({ cwd })`                              | 返回 porcelain status 摘要（staged / unstaged / untracked + file entries）。      |
| `git:getWorkingTreeDiff({ cwd, pathspec? })`           | 返回当前 tracked working tree 相对 `HEAD` 的 patch / numstat，用于 Changes 预览。 |
| `git:stagePaths / git:unstagePaths / git:discardPaths` | 针对选中文件执行精细化 git 动作；untracked discard 由 renderer 二次确认后触发。   |
| `git:commitSelection({ cwd, message })`                | 只提交当前暂存区，不做隐式 `add -A`。                                             |

`ProjectGitHubView` 复用与 Inspector Changes 相同的受控发布 / PR 表单；
`ProjectRoomView` 顶栏的 Publish / Create PR 快捷入口不再弹 prompt，
而是切到对应 GitHub/Inspector 工作区完成操作。

## Orchestration UI surfaces

Renderer 里的 orchestration 观察面现在拆成两层：

- **Workspace 级控制面**：`RuntimesWorkspaceView` 与 `AgentsLibraryView`
  提供 list/detail 工作区，分别聚合 runtime registry、capabilities、
  active leases / reports，以及全局 role templates、版本历史、跨项目
  bindings / reports。
- **Project 级执行面**：`ProjectRoomView` 继续承载 `Planner` 与 `Roles`
  tab；其中 `ProjectPlannerView` 已升级为 React Flow canvas，proposal 节点
  使用 `position` 坐标落盘，支持平移/缩放与布局保存。

`WorkspaceView` 现支持 `runtimes` / `agents` 顶层页面，以及 project deep
link 的 `planner` / `roles` pane hint，从 workspace 控制面可直接跳回项目
执行现场。

## Vault layout

```
<vault>/
├── 01_Projects/
├── 02_Areas/
├── 03_Resources/
├── 04_Archives/
├── AGENT.md
├── .gitignore
├── .git/
└── .orbit/
    ├── config.json
    ├── refmap.json         # { [uid]: relPath }
    ├── logs/               # gitignored (M4)
    ├── cost/               # gitignored (M6)
    └── trash/              # reversible deletes (M2)
```

## Settings

`app.getPath('userData')/orbit-settings.json` stores last-used vault + theme.

## Extension points reserved for M3..M8

- **M3 PARA + tasks** — add `paraIndex` IPC namespace; extend `FileNode` with
  `frontmatter` summary; add `src/renderer/src/views/TasksView.tsx`.
- **M4 Claude Code agent runner** — `src/main/agent/`; stream logs into
  `.orbit/logs/<runId>.jsonl`.
- **M5 git worktree manager** — `src/main/git.ts`; wraps `simple-git`. Safety
  gates live here (no `push` without approval).
- **M6 token budget** — reads `.orbit/cost/*.json`; renderer adds a budget
  strip in the right sidebar.
- **M7 distillation + sqlite-vss** — replace `src/main/search.ts` with a
  sqlite-backed module exposing the same interface so the command palette and
  future pluggable search UIs keep working.
- **M8 packaging** — `electron-builder` config + signing.

## M3: PARA schemas, task index, migrations

### Frontmatter module

`src/main/frontmatter.ts` wraps the `yaml` package and exposes
`read(raw) → { data, body, raw }`, `write(data, body) → string`, and
`update(raw, patch) → { content, changed, data }`. Key insertion order is
preserved on `update` (original keys first, new keys appended). Bodies are
never mutated by the serializer.

### PARA entity schemas

`src/shared/schemas.ts` exports Zod schemas + TypeScript types:

| Schema                | Required fields                                                            | Optional                     |
| --------------------- | -------------------------------------------------------------------------- | ---------------------------- | --------- | --------- | --------------------------------------- | ----- | ---------------------------------------------- | --- | --- | --- | ------------------------------------------------------ |
| `ProjectFrontmatter`  | `uid`, `type: 'project'`, `title`, `status ∈ active                        | paused                       | done      | archived` | `area_uid`, `started_at`, `due`, `tags` |
| `AreaFrontmatter`     | `uid`, `type: 'area'`, `title`                                             | `standard`, `tags`           |
| `ResourceFrontmatter` | `uid`, `type: 'resource'`, `title`                                         | `source_project_uid`, `tags` |
| `ArchiveFrontmatter`  | `uid`, `type: 'archive'`, `title`, `archived_at`, `original_type ∈ project | area                         | resource` | `tags`    |
| `TaskFrontmatter`     | `uid`, `type: 'task'`, `title`, `status ∈ backlog                          | waiting                      | todo      | doing     | blocked                                 | done` | `project_uid`, `area_uid`, `due`, `effort ∈ xs | s   | m   | l   | xl`, `tags`, orchestration ownership / proposal fields |

`inferTypeFromPath(relPath)` maps `01_Projects/…` → `project`, `02_Areas/` →
`area`, `03_Resources/` → `resource`, `04_Archives/` → `archive`. On first
`fs:readFile` of a PARA file lacking a `type` key, the main process injects
the inferred type and rewrites the file in place (never clobbering an existing
`type`).

### Task index

`src/main/tasks.ts` exposes a `TaskIndex` kept in sync with `VaultIndex` on
every upsert/remove/rename. A task record is:

```ts
{
  id, source: 'file' | 'inline',
  status, title,
  filePath, relPath,
  uid?, line?,           // line is 1-based, measured from body (post-FM)
  project_uid?, area_uid?,
  due?, effort?, tags?
}
```

**File tasks** are any `.md` whose frontmatter has `type: task`.

**Inline tasks** are GFM checklists (`^(\s*)-\s*\[( |x|X)\]\s+(.*)$`) inside
any markdown file. Their owning project/area is inferred from the parent
file's frontmatter (`uid` if the file is itself a project/area; else
`project_uid` / `area_uid`).

#### Inline status comment convention

GFM checklists only encode two states (`[ ]`, `[x]`). To carry the five
statuses (`backlog | waiting | todo | doing | blocked | done`) without leaving standard
Markdown, Orbit encodes non-binary statuses as an HTML comment on the same
line:

```
- [ ] start writing <!-- orbit:status=doing -->
- [ ] research options <!-- orbit:status=blocked -->
- [x] buy beans
```

Rules applied by `para.updateTaskStatus`:

- `done` → `[x]`, comment removed.
- `backlog` → `[ ]`, comment removed (backlog is the implicit default).
- `waiting | todo | doing | blocked` → `[ ]` + `<!-- orbit:status=... -->` appended or
  replaced.

These comments are inert in any Obsidian/GitHub renderer.

### `para` IPC surface

| Channel                                                                   | Purpose                                                                                                                                                                                            |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `para:listEntities({ type? })`                                            | All known PARA entities (projects/areas/resources/archives).                                                                                                                                       |
| `para:listTasks({ status?, project_uid?, area_uid?, due_before?, tag? })` | Task list, filtered server-side.                                                                                                                                                                   |
| `para:updateTaskStatus(id, status)`                                       | For `file:…` ids, rewrites frontmatter; for `inline:relPath:line` ids, toggles the checkbox and writes/removes the status comment.                                                                 |
| `para:closeProject(abs)`                                                  | Archive a project: move to `04_Archives/<YYYY>/`, set `type: archive`, preserve `uid`, add `archived_at` and `original_type: project`. Calls the M2 rename pipeline to rewrite `[[…]]` references. |

### Migration registry

`src/main/migrations.ts` defines `{ version, describe, migrate(file) }`
entries. Vault schema version lives in `.orbit/config.json` under
`schemaVersion`. `runMigrations(vault)` runs on every `openFsSession`:

1. Read `schemaVersion` (default `0`).
2. For each markdown file, run every `migrate(...)` whose version is greater
   than the stored version; re-feed the output into later migrations.
3. Write only when content changes. Bump `schemaVersion` when done.

Every migration must be idempotent; migrations do not record which file they
touched per-run so running them twice must produce the same result.

**v1** — inject `type: project | area | resource | archive` from the top-level
PARA folder when the key is absent. Files outside the four PARA roots are
left alone.

### Kanban reducer

`src/shared/kanban.ts` exports pure helpers `groupByStatus(tasks)` and
`moveTask(tasks, id, target) → { next, moved }`. The renderer's
`@dnd-kit/core` board is a thin shell around these functions; they are
unit-tested without any DOM.

## Vault layout (M3)

```
<vault>/
├── 01_Projects/
├── 02_Areas/
├── 03_Resources/
├── 04_Archives/
│   └── <YYYY>/…            # created by para:closeProject
├── AGENT.md
├── .gitignore
├── .git/
└── .orbit/
    ├── config.json         # now carries { schemaVersion: number }
    ├── refmap.json
    ├── logs/
    ├── cost/
    └── trash/
```

## Security posture

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`.
- A strict `Content-Security-Policy` meta tag limits renderer to its own
  origin (`style-src 'self' 'unsafe-inline'` for CodeMirror injected styles).
- External links open via `shell.openExternal`.
- Every `fs:*` handler resolves its argument against the current vault root
  and rejects anything that escapes (`..` traversal, absolute paths to other
  directories).

## M4: Claude Code agent runner

### CLI detection

`src/main/agent/cli.ts#detectClaude()` first tries `which claude` (or `where`
on Windows), then falls back to `~/.claude/local/claude`, `/usr/local/bin/claude`,
`/opt/homebrew/bin/claude`. The resolved path is memoized for 60 seconds. We
probe the version with `claude --version` and a 3s timeout. The renderer calls
`window.orbit.agent.detect()`; when the result is `{ available: false }` the
Agent panel shows an install banner with a link to
`https://docs.claude.com/claude-code` and every `agent.startTask(...)` call
returns `{ kind: 'error', code: 'cli_missing', … }` so the rest of the UI keeps
working.

### Runner event schema

`src/shared/agent.ts#AgentEvent`:

```ts
interface AgentEvent {
  idx: number;
  at: string; // ISO timestamp
  kind:
    | 'message'
    | 'tool_use'
    | 'tool_result'
    | 'thinking'
    | 'cost'
    | 'error'
    | 'done'
    | 'text'
    | 'hydrate';
  data?: unknown; // raw JSON object when stream-json succeeded
  text?: string; // plain text payload for message/text/thinking/error/hydrate
  toolName?: string;
  // cost-event extras:
  input_tokens?;
  output_tokens?;
  cache_read_input_tokens?;
  cache_creation_input_tokens?;
  total_cost_usd?;
}
```

Runner flags are the documented Claude Code streaming set:
`-p <prompt> --output-format stream-json --input-format stream-json --verbose`.
When the first non-JSON line is encountered the runner flips to a
line-buffered fallback and wraps subsequent lines as `{ kind: 'text' }`, so a
version of the CLI that rejects stream flags still delivers readable output.

The runner keeps the **last 500 events** in memory (`runner.tail(sinceIdx?)`),
broadcasts each event over the `agent:event` IPC channel, and mirrors every
raw stdout/stderr line to `<vault>/.orbit/logs/<runId>.log` with ISO
timestamps. Idle timeout: 10 minutes with no events → `stop('idle_timeout')`.

### Hydration protocol

When the persona prompt is composed we append a footer:

```
# Context hydration
You may request more context at any time by emitting a single line that
starts with `@orbit:search <query>`.
```

The runner inspects every stdout line through
`context.ts#parseHydrationLine(line)`. When it matches, the runner:

1. Emits an `AgentEvent { kind: 'hydrate', text: <query> }` so the UI shows
   the request.
2. Runs `vaultSession.search.search(query, 8)` in the main process.
3. Writes a formatted reply back to the child's **stdin** as a single
   `HYDRATION for "<q>" … /HYDRATION` block.

If a future Claude Code build surfaces structured tool calls in its JSON
stream, `mapStreamJson` already emits them as `kind: 'tool_use'` events and a
parallel handler can replace the text-based fallback without breaking the
IPC surface.

### Cost schema

`<vault>/.orbit/cost/YYYY-MM.json` is an append-only **newline-delimited JSON
file** (`.json` extension for forward-compat with M6 readers). Each line is a
`CostRecord`:

```ts
{
  runId, taskId, at,      // ISO
  input, output, cached, cacheCreation,
  estUSD,                  // from CLI `total_cost_usd` when present
  source: 'cli' | 'estimate'
}
```

We rely on POSIX `appendFile` atomicity for writes below `PIPE_BUF` so
multiple concurrent runners can share the same file without coordination.
Readers accept truncated tail lines (they are skipped). Per-run totals and
per-day totals are served via `agent.costRun(runId)` and `agent.costToday()`.

The fallback estimator is `ceil(chars / 4)` with a Sonnet-ish pricing table
(`$3/Mtok in`, `$15/Mtok out`). Records built from an estimator carry
`source: 'estimate'` so the UI can label them accordingly.

`BudgetGate.check(estimate)` is wired in `runner.start()` and currently always
returns `{ ok: true }` — M6 will add real cap enforcement.

### Kill-reconcile flow

Every runner registers its `pid` in `<vault>/.orbit/logs/_active.json`
(`{ [runId]: pid }`, atomic temp+rename). On vault open we call
`reconcileOrphans(vault)` which:

1. Reads the active map.
2. For every pid still alive (per `process.kill(pid, 0)`), sends `SIGTERM`.
3. Resets the file to `{}`.

This cleans up any runners left behind by a crashed main process. The
Electron `before-quit` hook also calls `pool.killAll('app_quit')` for the
happy path.

### RunnerPool invariants

- At most **one runner per `taskId`**. Duplicate `spawn` rejects with
  `{ code: 'already_running' }`.
- `runs: Record<runId, AgentRunner>` keyed by nanoid runId (`size 12`).
- Pool forwards child events on a single `'event'` emitter which the IPC
  layer re-broadcasts to every `BrowserWindow`.

### Extension points reserved for M5

- **Worktree cwd** — `AgentRunner` already accepts `cwd: worktreePath`;
  `agent.startTask({ worktreePath })` takes an optional argument that M5 can
  populate from a new `git.createWorktree()` IPC.
- **Safety gates** — `BudgetGate` in `src/main/agent/tokens.ts` is the entry
  point for pre-spawn policy checks. M5 should add a sibling `SafetyGate` in
  the same file exposing `check({ cwd, prompt })` and call it from
  `ipc.ts#startTask` alongside the existing budget call.
- **Git stubs** — `IPC.git.{status,commit,createWorktree}` remain registered
  as `notImplemented` stubs in `src/main/index.ts`; replace the stubs, don't
  rename the channels.

---

## M5 — Worktrees, safety gates, install lock

### Worktree layout & ghost-branch policy

Each dispatched agent can optionally run in a **ghost worktree**, a
throwaway `git worktree` dedicated to that run:

```
<vault>/
  .orbit/
    worktrees/
      <shortId>/     ← the worktree checkout (a whole tree)
      index.json     ← atomic metadata file
    logs/git.log     ← NDJSON audit trail of every git op
```

- `shortId` is an 8-char `nanoid`, **not** derived from the task UID so
  renaming a task doesn't orphan the worktree.
- The branch checked out is always `orbit/ghost/<shortId>`. This prefix
  is the _only_ thing we'll ever auto-delete or auto-commit onto; code
  that touches branches (`git.ghostCommit`, `WorktreeManager.remove` with
  `force: true`, `WorktreeManager.resetAll`) asserts the prefix with
  `isGhostBranch()` before acting.
- `.orbit/worktrees/`, `.orbit/logs/`, `.orbit/cost/`, `.orbit/trash/`
  are added to `.gitignore` on vault bootstrap (v2 migration) so ghost
  trees are never committed to the vault's own history.

### Git queue semantics

`GitQueue` (`src/main/git/queue.ts`) is a FIFO async mutex keyed by
scope string:

- **`scope = 'global'`** — any op that touches `.git/worktrees` or the
  index (worktree add/remove/prune, merge). Guarantees `git worktree
add` can't race another add/remove.
- **`scope = 'cwd:<abs-path>'`** — per-worktree ops (`git add`,
  `commit`, status). Scales concurrency across unrelated worktrees
  while serializing ops within one.

Tests live in `tests/git_queue.test.ts`. The queue continues draining
after a rejected job; errors never break FIFO ordering.

### Install lock

`InstallLock` (`src/main/env/install_lock.ts`) is a **single global**
FIFO for any package-manager install (`npm|pnpm|yarn install`).
Multiple runners that each want to install dependencies in their
worktree queue up and run one at a time — avoids tmp-cache and
registry rate-limit collisions.

- Streams combined stdout/stderr into
  `.orbit/logs/install-<worktreeId>-<iso>.log`.
- 20-minute default timeout.
- Emits a `status` event (`{ queued, active }`) after every transition;
  the main process forwards it to renderers on `IPC.env.event` so the
  top-bar indicator can animate.

### Port allocator

`PortAllocator` (`src/main/env/ports.ts`) hands out free TCP ports by
bind-0-then-close. When `agent.startTask` runs in a worktree it
`allocate('worktree:<path>')` and injects `ORBIT_PORT` + `PORT` into
the agent's environment. On `runner.exit` we `release(...)`.

Note: between `bind(0)` + child process claiming the port there is an
unavoidable TOCTOU window. Consumers must still handle `EADDRINUSE` —
the allocator is advisory.

### Pre-merge check report

`runPreMergeCheck(cwd, base)` returns:

```ts
interface CheckReport {
  build: { ok: boolean; exitCode: number | null; logTail: string; skipped?: boolean };
  secrets: { ok: boolean; findings: { file: string; line: number; rule: string }[] };
  headSha?: string;
  at: string; // ISO8601
}
```

- **Build:** if `package.json` has a `build` script, runs `npm run build`
  with `CI=1`, 10-minute default timeout, captures last ~60 lines of output.
  Skipped (ok=true, skipped=true) when no build script is defined.
- **Secrets:** scans `git diff --unified=0 <base>...HEAD`, inspecting
  only `+`-prefixed addition lines (ignores context/deletions). Rules:
  AWS access/secret keys, GitHub PAT/app tokens, Slack tokens, private
  keys (`-----BEGIN … PRIVATE KEY-----`), plus literal assignments to
  `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` that look
  like real values (≥20 chars after `=`).
- `headSha` is captured at check time and stored in `CheckCache`.

### Safety gate

`SafetyGate.check({ cwd, prompt, vaultPath })` in
`src/main/agent/tokens.ts` is invoked by `agent:startTask` **before**
`BudgetGate`. It enforces:

- `cwd` must be the vault root OR live under
  `<vault>/.orbit/worktrees/`. Anything else ⇒ `safety_blocked`.
- Composed prompt length ≤ `MAX_PROMPT_CHARS` (100 000 today) — a
  hard stop on runaway hydration growth.

A failed gate produces `{ kind: 'error', code: 'safety_blocked',
message }` from `startTask`; the renderer surfaces this as a toast
and the task is not dispatched.

### Merge policy + check expiry

`git.mergeGhost(worktreeId, { strategy })` only proceeds when
`CheckCache.gateMerge(id, headSha)` returns `null`, i.e.:

1. A `preMergeCheck` result is cached for this worktree.
2. The cache entry is ≤ 60 s old.
3. The cached report's `headSha` matches the worktree's current HEAD —
   i.e. no new commits since the check.
4. Both `build.ok` and `secrets.ok` are true.

Otherwise the IPC call rejects with a typed error:

- `no_check` — caller never ran `git.preMergeCheck`.
- `check_expired` — TTL or head-sha mismatch.
- `check_failed` — the cached check reported a failure.

Supported strategies today: `fast-forward` and `squash`. Conflicts are
returned in `MergeResult.conflicts`; the renderer's "Merge" button only
enables when a fresh successful check exists.

### Circuit breaker

When `preMergeCheck` fails for a worktree that has a `taskId`, the main
process calls `blockTask(taskId, reason)`:

- `file:` tasks get status → `blocked` and
  `agent_block_reason: <reason>` written into frontmatter (new optional
  field in `TaskFrontmatter` Zod schema).
- Inline (`inline:`) tasks get only a status flip plus an `agent:event`
  error toast — no frontmatter write, per spec.

## M6 — Token budgets & cost reports

### Budget schema (user settings)

`BudgetSettings` lives in `src/shared/schemas.ts` and is persisted inside
the standard user-data `orbit-settings.json` (not per-vault) so a single
user's caps travel with them across vaults.

| Field           | Type             | Default   | Meaning                     |
| --------------- | ---------------- | --------- | --------------------------- |
| `perRunTokens`  | `number \| null` | 200 000   | Cap for a single agent run  |
| `perRunUSD`     | `number \| null` | 5         | USD cap for a single run    |
| `dailyTokens`   | `number \| null` | 1 000 000 | Aggregate cap for today UTC |
| `dailyUSD`      | `number \| null` | 20        | Aggregate USD cap           |
| `warnAtPercent` | `number` (0–100) | 80        | When to emit `budget_warn`  |
| `hardStop`      | `boolean`        | `true`    | False = warn-only mode      |

`null` on any cap means "unlimited". Missing keys are back-filled by
`parseBudgetSettings` on load — the schema never throws.

### Gate vs. Watch

Two independent enforcement points, sharing the same caps:

- **BudgetGate** (`tokens.ts`) — synchronous _pre-spawn_ check. Consulted
  from `startTask` after `SafetyGate`. Computes `today + estimate` and
  rejects the spawn with `StartError.code === 'budget_blocked'` when any
  cap would be exceeded. When `hardStop=false` it always returns
  `ok: true` but includes a `warning` payload so the caller can toast.
- **BudgetWatch** (`budget_watch.ts`) — attached once to the `RunnerPool`
  in `registerAgentIpc()`. Subscribes to every runner's `cost` events,
  maintains per-run running totals, and kills the subprocess via
  `pool.kill(runId)` the moment any cap is crossed. On halt it writes a
  `CostRecord` with `reason: 'budget_halt'` so the month's NDJSON log
  remains complete and emits a `budget_halt` agent event.

Warn-once semantics: once a run emits a `budget_warn` the watch never
emits another for that run, even if the threshold is crossed again.

### Agent event types

In addition to M4 kinds, M6 adds:

- `budget_warn` — crossing `warnAtPercent` of the most-constraining cap.
  Payload: `{ runId, reason, tokens, usd, pct?, message }`.
- `budget_halt` — the run has been killed. Payload:
  `{ runId, reason, tokens, usd }`. Halts also append a `CostRecord`
  marker so daily reports show the halt.

### Cost records

`CostRecord` gained an optional `reason?: 'budget_halt'` marker so the
daily report can distinguish halted runs. The NDJSON format, monthly
file layout (`.orbit/cost/YYYY-MM.json`) and atomic-append invariants
are unchanged from M4.

### Daily report

`generateDailyReport(vault, date?)` reads the current-month NDJSON,
filters to the requested UTC day and returns:

- `path` — absolute target under `03_Resources/cost-reports/YYYY-MM-DD.md`
  (not written; the renderer calls `fs.writeFile` on "Save to vault").
- `markdown` — the report body.

Sections in the rendered report:

1. **Totals** — runs, halts, input / output / cache tokens, estimated
   USD, source classifier (`cli | estimate | mixed`).
2. **Top 5 tasks by cost** — markdown table grouping by `taskId` (falls
   back to the first `runId` when the record has no task).
3. **Halts** — appears only when `reason === 'budget_halt'` records exist.

### IPC surface (M6 additions)

| Channel                  | Purpose                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `agent:budget:get`       | Read current `BudgetSettings`                                      |
| `agent:budget:update`    | Merge-patch `BudgetSettings`                                       |
| `agent:cost:dailyReport` | Return `{ path, markdown, date }`                                  |
| `agent:costToday`        | **Extended** — returns `CostTodayResult` with `caps` + `remaining` |

### Storage paths

| What                | Where                                             |
| ------------------- | ------------------------------------------------- |
| Budget settings     | `app.getPath('userData')/orbit-settings.json`     |
| Cost NDJSON         | `<vault>/.orbit/cost/YYYY-MM.json`                |
| Saved daily reports | `<vault>/03_Resources/cost-reports/YYYY-MM-DD.md` |

### M7 hooks reserved

- Distillation closure will want to emit a "run summary" that bundles
  the daily report for the window covering a closed project. The report
  format is stable and the underlying record filter can be trivially
  widened from "today" to "since X".
- `CostRecord.reason` is an open union — future milestones can add
  markers (e.g. `distilled`, `retryable_halt`) without changing the
  NDJSON shape.

---

## M7 — Distillation & experience wake-up

### Distillation pipeline (closure flow)

When the user clicks "Close project" and leaves _Generate distillation
summary_ checked in `CloseProjectDialog`, the renderer runs two main
IPCs in sequence:

1. `para.closeProject(path)` — M3 flow. Moves the project file into
   `04_Archives/<YYYY>/`, rewrites frontmatter to
   `type: archive / original_type: project`, preserves `uid`.
2. `distill.project(uid)` — M7 flow. Walks the vault for supporting
   material and spawns a dedicated agent run with a distillation
   persona.

`distillProject` (`src/main/distill/distill.ts`) collects:

- **Archived project body** — head + tail clip to 8 000 chars (see
  `clipHeadTail`).
- **Related files** — any markdown with `frontmatter.project_uid ===
projectUid`, body clipped to 1 200 chars each (max 20 files).
- **Closed tasks** — `TaskIndex.allTasks()` filtered by project uid and
  `status === 'done'`.
- **Git activity** — NDJSON from `.orbit/logs/git.log` whose `at`
  timestamps fall within the lifecycle window (`firstMentionAt` →
  `archived_at`). Max 50 events.
- **Cost records** — current + previous 3 months of NDJSON under
  `.orbit/cost/` filtered into the lifecycle window.

`composeDistillPrompt` renders persona + all inputs and pins the
response contract to seven section headers, exactly in order:

```
## Vision
## Key Decisions
## Artifacts & Code
## Lessons Learned
## Reusable Patterns
## Cost Snapshot
## Next Steps
```

The injected `DistillRunner` is spawned via `liveRunner()` which wraps
`AgentRunner` + forwards its events over the standard `agent:event`
channel so the existing Agent panel streams the distillation run
without new wiring. On `exit`, `parseDistillResponse` splits the final
assistant text by H2 header (missing sections become `(none)`) and
`renderDistillBody` emits the canonical ordering into a new resource
at:

```
03_Resources/distilled/<slug>-<shortUid>.md
```

Frontmatter written:

```yaml
uid: <nanoid(12)>
type: resource
title: 'Distilled: <Project Title>'
source_project_uid: <projectUid>
tags: [distilled]
distilled_at: <ISO>
```

A `CostRecord` with `reason: 'distilled'` is appended so daily reports
reflect distillation runs (the shared `CostRecord.reason` union was
widened from `'budget_halt'` to `'budget_halt' | 'distilled'`).

### Vector store contract

`VectorStore` (`src/main/vector/index.ts`) is an in-memory map persisted
as JSON under `<vault>/.orbit/vectors.json`. The interface is the only
public contract — swapping in a native `sqlite-vss` / `sqlite-vec`
backend is a drop-in replacement.

```ts
interface VectorStore {
  upsert(rec: { id; uid; kind; relPath; title; excerpt; embedding }): void;
  remove(id: string): boolean;
  search(
    query: Float32Array,
    k?: number,
    filter?: { kind?: VectorKind | VectorKind[] }
  ): Array<{ id; score; meta }>;
  flush(): Promise<void>;
  clear(): void;
}
```

Ranking is brute-force cosine similarity over the Float32Array store.
Ties are broken by `id.localeCompare` for determinism.

#### Native backend trade-off

We evaluated `better-sqlite3 + sqlite-vss` and `sqlite-vec`. Both failed
to prebuild reliably against Electron's ABI on macOS arm64 without
shipping extra binaries that would bloat packaging and complicate
notarisation. The pure-JS fallback is:

- **Deterministic** — same vault → same index → same search order,
  across platforms.
- **Fast enough** — O(10k) vectors at 512-d cosine scan < 50 ms on an
  M-series MacBook.
- **No native toolchain required** — tests and CI stay hermetic.

The `VectorStore` contract is identical to what a sqlite-backed
implementation would expose, so we can flip later without touching
callers.

### Embedding provider interface

`src/main/vector/embed.ts` exposes:

```ts
interface EmbeddingProvider {
  readonly dim: number;
  embed(text: string): Float32Array;
}
```

The default provider is a 512-dim **hash-trick TF embedding**:

1. Lowercase + split on `[a-z0-9]+`, drop tokens shorter than 2 chars.
2. For each token, FNV-1a 32-bit hash → `bucket = hash mod 512`;
   increment `v[bucket]`.
3. L2-normalise the vector.

Trade-offs:

- **Deterministic, offline, zero cost.**
- Captures lexical overlap. Misses synonymy ("archive" vs "close") and
  multilingual paraphrase. That's fine for M7's "wake up vaguely
  related past notes" bar; users are reviewing hits before dispatch.
- To upgrade: call `setEmbedder({ dim, embed })` at boot with a real
  provider (Anthropic `/v1/embeddings`, local `bge-small`, whatever).
  No callers need to change.

### Experience wake-up

At task dispatch time (`src/main/agent/ipc.ts#startTask`) we build a
query string from `task.title + owning project/area title + tags`,
embed it, and call `store.search(query, 3, { kind: ['resource',
'archive'] })`. Hits with cosine ≥ `WAKEUP_THRESHOLD` (`0.2`) are
formatted as a `# Relevant past experience` block and appended to
`userAsk` before `composePrompt`.

#### Threshold rationale

- Below ~0.15 the hash-trick embedding returns effectively-random
  lexical coincidences.
- At ≥ 0.20 hits consistently share at least 3 vocabulary-unique
  tokens, which is the signal users actually want. A real embedding
  provider with denser geometry should raise this (try 0.45–0.55).

The final injected hit list is recorded in a module-level map
(`recordInjection`) so the renderer's `ExperienceChip` can display "N
resources injected" with a popover of titles. Injection is also
appended to `.orbit/logs/agent.log` for post-hoc audit.

### Async indexer

`createIndexer` (`src/main/vector/indexer.ts`) drains a FIFO batch-by-batch
(default 10 files), yielding to the event loop via `setImmediate`
between batches. It flushes the JSON store after every batch and logs
NDJSON events to `.orbit/logs/vector.log`.

Indexable prefixes:

| Prefix          | Kind       |
| --------------- | ---------- |
| `01_Projects/`  | `project`  |
| `03_Resources/` | `resource` |
| `04_Archives/`  | `archive`  |

`02_Areas/` is intentionally excluded — areas are heading-only scopes
that don't benefit from embedding.

On vault open, `ensureVectorStore(vault)` loads the persisted store,
subscribes to watcher events through `onVaultFsEvent`, and kicks off
`indexer.rebuildAll()` in the background. File writes re-enqueue the
path; unlinks remove by relative path.

### IPC surface (M7 additions)

| Channel                 | Purpose                                         |
| ----------------------- | ----------------------------------------------- |
| `distill:project`       | Distill a closed project → new resource file    |
| `distill:cancel`        | Cancel an in-flight distillation run            |
| `distill:suggest`       | Preview wake-up hits for a task (TaskRow panel) |
| `distill:reindex`       | Clear + rebuild the vector store                |
| `distill:experienceFor` | Return the injection list for a given runId     |

### Storage paths

| What                         | Where                                 |
| ---------------------------- | ------------------------------------- |
| Vector store (JSON fallback) | `<vault>/.orbit/vectors.json`         |
| Indexer log                  | `<vault>/.orbit/logs/vector.log`      |
| Distilled resources          | `<vault>/03_Resources/distilled/*.md` |

### M8 hooks reserved

- **Native vector backend**: drop a sqlite-vss/vec backend into
  `src/main/vector/` and register it behind the same `VectorStore`
  interface.
- **Real embeddings**: call `setEmbedder(...)` at boot; no other code
  changes.
- **Packaging**: the fallback has zero native deps, so `electron-builder`
  configuration in M8 stays trivial on macOS arm64.

---

## 二期改造 Architecture (R1 → R7, v1.0)

### 项目即文件夹 (Project = folder)

Every project now lives as a full directory under `01_Projects/<slug>/`:

```
01_Projects/<slug>/
├── README.md           # frontmatter-owned project metadata + body
├── AGENT.md            # persona / system prompt the CLI reads by default
├── .mcp.json           # written on first ensureMcpConfig() call
├── .gitignore
├── .git/               # per-project repo (isolates worktrees + history)
└── .agent/
    ├── config.json     # uid / slug / name / template / timestamps
    ├── tasks/<uid>.md  # four-section task files
    └── memories/*.md   # MCP save_memory output
```

Construction: `src/main/project.ts::createProject()` writes templates from `src/main/templates/*` (blank, web-app, research, writing), renders `{{var}}` placeholders, initialises a git repo, and records the UID in the vault refmap.

Archival: `project.archive(uid)` moves the entire folder to `04_Archives/<year>/<slug>/`; the UID is preserved so backlinks keep working.

### Legacy → v3 migration

- `src/main/migrations.ts::migrateProjectsToFolders(vault, { dryRun, deps })` enumerates legacy single-file projects (`01_Projects/*.md` with `type: project`), writes them into folders, and deletes the old files atomically per project.
- Before the real run, the default `commitVaultRoot` helper makes a `Pre-migration snapshot` commit at the vault root, and its SHA is surfaced in the migration dialog so users can `git reset --hard <sha>` if needed.
- Per-project failures are captured in the `failed[]` array without aborting the whole batch; a half-built folder is `rm -rf`'d so the user can safely retry.
- Idempotent: a second run with no remaining legacy files returns zero migrations and no snapshot.
- UI entry: an amber "发现 N 个旧格式项目，点击迁移" banner appears in `TopBar` when the projects list contains any `legacy: true` entry.

### 双模驱动 — Terminal (interactive) vs Night Shift (headless)

Orbit runs agent CLIs in two complementary modes:

1. **Interactive (Terminal)** — `src/main/terminal/pty_manager.ts` owns node-pty sessions. Each `TerminalPane` in the Project Room opens a shell rooted at the project folder. The user runs `claude`, `codex`, `gemini`, or anything else; MCP capable CLIs automatically read `.mcp.json` and can call into the Orbit MCP server.
2. **Headless (Night Shift)** — `src/main/night_shift/dispatcher.ts` fan-outs a chosen batch of tasks, creates an isolated worktree per task (`<vault>/.orbit/night-worktrees/<runId>/<taskUid>/`), spawns a headless `claude` (or injectable `spawnRunner`) with the composed prompt, pre-merge-checks results, and optionally opens a PR. Progress is broadcast over `nightShift.onProgress` / `onDone` events.

Both modes share:

- The same per-project `AGENT.md` persona.
- The same MCP tool set.
- The same `git_branch` discipline — ghost/night branches never touch `main` without a `preMergeCheck` pass.

### Orbit Hooks (MCP server)

`src/mcp/server.ts` implements a stdio-based MCP server (built to `out/mcp/server.cjs` by `npm run build:mcp`) that exposes:

| Tool                  | Effect                                                        |
| --------------------- | ------------------------------------------------------------- |
| `search_vault`        | Full-text search across the PARA vault via the shared refmap. |
| `get_file`            | Read any markdown file by UID or relative path.               |
| `create_task`         | Spawn a four-section task into the current project.           |
| `update_task`         | Patch frontmatter or any of the four sections.                |
| `search_memories`     | Lookup entries in `.agent/memories/`.                         |
| `save_memory`         | Persist a markdown memory entry for future wake-up.           |
| `query_project_graph` | Return a project's tasks + links in a structured form.        |

Auto-registration: `project.ensureMcpConfig(uid)` writes `.mcp.json` with an absolute path to the bundled server and the vault + project-uid env vars.

### Worktree GC (R7)

`src/main/worktree_gc.ts`:

- Runs on vault-open and on a 24h interval.
- Walks `.orbit/worktrees/*` and `.orbit/night-worktrees/*/*`.
- Removes directories whose index record is `merged` or `aborted` (or missing) AND whose mtime is older than `worktreeGcDays` (default 7).
- Double-checks git state with `simple-git`: a dirty working copy or a branch with commits ahead of its upstream is kept.
- Prunes matching entries from `.orbit/worktrees/index.json`.
- Configurable via `AppSettings.worktreeGcEnabled` and `AppSettings.worktreeGcDays`.

### R7 IPC additions

| Channel       | Purpose                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `task:relink` | Rewrite a task's `project_uid` + physically move the file into the target project's `.agent/tasks/`. Rejects collisions. |

The V3 migration report gained two fields — `failed: { slug, error }[]` and `snapshotSha: string | null` — without breaking callers that only read `migrated` / `skipped`.
