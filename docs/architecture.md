# Orbit Architecture

> 本文描述 Orbit v2 实施后的当前架构。v1 架构原文已归档到
> [`docs/archive/architecture-v1.md`](./archive/architecture-v1.md)。

## 1. Product shape

Orbit 是一个本地优先的 AI 协作工作台：

- **Markdown + Git** 是项目和知识的持久化边界。
- **Electron main process** 拥有文件系统、Git、agent runner、调度器和本地 CLI bridge。
- **React renderer** 提供 PARA、Project Room、Inbox、Capture、Planner、Roles、Terminal 与 Inspector 等工作面。
- **`orbit` CLI** 是 agent-facing 能力入口；旧 MCP server 和 Night Shift 路径已移除。

v2 的核心转向：

| v1 | v2 |
| --- | --- |
| Night Shift 批量执行 | 24x7 Auto-runner，可通过 Settings 默认关闭 |
| agent 直接创建 task | `propose -> approve/reject -> materialize` |
| 隐式执行顺序 | `depends_on` 拓扑解锁 |
| 分散审批入口 | Inbox hub + Proposal sync |
| MCP server 工具面 | `orbit` CLI + main-process CLI bridge |
| 仅 worktree 执行隔离 | `ExecutionContext` 抽象，当前实现 worktree，sandbox 暂 unsupported |
| 无统一事件留痕 | Activity Log NDJSON event stream |

## 2. Process model

Orbit 仍采用 Electron 三进程布局：

- **Main** (`src/main/`)：Node.js/Electron 主进程。注册 IPC，管理 vault session、watcher、Git、worktree、terminal、agent runner、Auto-runner、Activity Log、Inbox、Approval、Capture 与 CLI server。
- **Preload** (`src/preload/index.ts`)：通过 `contextBridge` 暴露 typed `window.orbit`，实现 renderer 与 shared IPC contract 的唯一桥。
- **Renderer** (`src/renderer/`)：React 18 + Zustand + Tailwind。所有系统能力通过 `window.orbit` 调用，不直接访问 Node API。

启动或打开 vault 时，main process 会执行：

1. `configureActivityEmitter(vaultPath)` 绑定 Activity Log 根目录。
2. `openFsSession(vaultPath)` 建立 refmap、文件索引、search index、task index 与 watcher。
3. `startCliServerForVault(vaultPath)` 在 `<vault>/.orbit/cli-socket` 暴露本地 CLI bridge。
4. `reconcileOnStart(vaultPath)` 恢复 agent / terminal session 状态。
5. `ensureOrchestrationForVault(vaultPath)` 初始化 runtime、planner、roles、dispatch storage。
6. `getAutoRunnerDispatcher().attach(vaultPath)` 装载 Auto-runner，但是否运行由 settings 控制。
7. `ensureTerminalAgentRuntimeForVault(vaultPath)` 启动 terminal hook runtime。
8. `ensureVectorStore(vaultPath)` 与 worktree GC 作为后台能力初始化。

关闭 vault 时，上述 runtime 会反向 detach / shutdown，并停止 CLI server 与 watcher。

## 3. Shared IPC contract

`src/shared/ipc.ts` 是 main、preload、renderer 的单一 IPC contract。新增 channel 必须同时经过：

1. `IPC` namespace 定义。
2. `OrbitApi` 类型声明。
3. preload `api` 实现。
4. main-side handler 注册。
5. `tests/ipc.test.ts` contract 更新。

当前主要 namespace：

| Namespace | Owner |
| --- | --- |
| `workspace`, `settings`, `fs`, `para`, `project`, `task`, `vision`, `migrations` | vault / PARA / file / task core |
| `git`, `github`, `env`, `envExt` | local Git, GitHub CLI integration, environment checks |
| `agent`, `terminal`, `terminalAgent` | Claude/Codex/Gemini runner, pty, terminal session awareness |
| `runtime`, `planner`, `conversation`, `dispatch`, `role` | orchestration core |
| `activity` | append/query Activity Log |
| `approval` | proposal approval state machine |
| `inbox` | unified Inbox hub |
| `capture`, `quickCapture` | Feed, Library, Thoughts, global quick capture |
| `autoRunner` | 24x7 dispatcher control/status/events |
| `review`, `distill` | daily review and distillation |
| `area`, `vaultConfig` | Area Room and external notes configuration |

## 4. Vault and project layout

Vault root:

```text
<vault>/
├── 01_Projects/
├── 02_Areas/
├── 03_Resources/
├── 04_Archives/
├── AGENT.md
├── .git/
└── .orbit/
    ├── config.json
    ├── refmap.json
    ├── activity/YYYY-MM-DD.ndjson
    ├── cli-socket
    ├── inbox/
    ├── approval/
    ├── orchestration/
    ├── capture/
    ├── logs/
    ├── cost/
    ├── trash/
    └── worktrees/
```

Folder-backed project:

```text
01_Projects/<slug>/
├── README.md
├── AGENT.md
├── CLAUDE.md
├── CODEX.md
├── GEMINI.md
├── .git/
└── .orbit/
    ├── config.json
    ├── agent/
    │   ├── tasks/
    │   ├── memories/
    │   ├── skills/
    │   │   ├── _index.md
    │   │   ├── orbit-world.md
    │   │   ├── task-workflow.md
    │   │   ├── project-understanding.md
    │   │   ├── tooling-commands.md
    │   │   ├── worktree-workflow.md
    │   │   ├── safety-rules.md
    │   │   └── orbit-cli.md
    │   └── logs/
    └── bridge/
        └── manifest.json
```

Orbit 不再自动写入 `.mcp.json`，project bridge 仅用于 `AGENT.md` / `AGENTS.md` 兼容暴露。

## 5. File, refmap, and task index

`src/main/fs.ts` owns the active `VaultSession`:

- `RefmapStore` keeps `uid -> relPath` and content hash mappings.
- `VaultIndex` scans Markdown frontmatter and wikilinks.
- `SearchIndex` provides MiniSearch full-text lookup.
- `TaskIndex` materializes PARA entities and task records.
- `VaultWatcher` incrementally refreshes all indices and broadcasts `fs:event`.

Task files use Zod schemas from `src/shared/schemas.ts`. v2 task fields include:

- ownership and authorization: `created_by`, `approved_by`, `proposed_by_agent_run`, `approval_state`.
- proposal links: `proposal_id`, `origin`.
- dependency fields: `depends_on`, `derived_from`, `blocked_reason`.
- execution metadata: recommended role, owner agent, implementation report fields.

Immutable task frontmatter keys are still `uid`, `type`, and `created`; migrations must not rewrite them.

## 6. ExecutionContext and agent runner

`src/main/execution/` defines the v2 execution abstraction:

- `ExecutionContext` is the interface.
- `WorktreeExecutionContext` adapts existing ghost worktree behavior.
- `SandboxExecutionContext` is intentionally unsupported in this milestone and fails clearly.

Project config (`.orbit/config.json`) stores `execution_context: "worktree" | "sandbox"`, defaulting to `worktree`.

`src/main/agent/runner.ts` starts Claude Code in one-shot stream-json mode by default:

```text
claude -p <prompt> --output-format stream-json --verbose
```

The runner owns:

- `.orbit/logs/<runId>.log` and `.ndjson` event files.
- `_active.json` PID bookkeeping and startup reconciliation.
- cost extraction and event normalization.
- hook env vars for terminal/agent lifecycle integration.

It no longer auto-loads `.mcp.json`; agent capabilities should go through `orbit` CLI or terminal hooks.

## 7. Activity Log

`src/main/activity/` provides append-only Activity Log infrastructure:

- shared event schema in `src/shared/activity.ts`.
- fire-and-forget `emitActivity`.
- NDJSON storage under `.orbit/activity/YYYY-MM-DD.ndjson`.
- query filters exposed through `activity:query`.

Activity Log currently records task mutations, proposal lifecycle, Inbox events, Auto-runner events, and Capture operations. It is the audit trail for v2 behavior and the observation substrate for later review UI.

## 8. Proposal approval system

`src/main/approval/` implements the propose-approve state machine:

- proposal schema and type definitions in `src/shared/approval.ts`.
- pending/archive NDJSON stores.
- `submit`, `resolve`, `list`, `get` IPC.
- event emission to Activity Log.
- materialization of approved `new_task` proposals into task Markdown.

Agents must not create independent board tasks directly. They submit proposals; users approve or reject them through chat/Inbox surfaces.

## 9. Inbox hub

`src/main/inbox/` and `src/shared/inbox.ts` implement Inbox v2:

- item categories: messages, capture events, proposal-linked approvals, archive/history.
- persisted store under `.orbit/inbox/`.
- resolver/dismiss/archive actions with Proposal sync where applicable.
- renderer shell and stage components under `src/renderer/src/components/inbox/` and `InboxView`.

Inbox is the common user attention surface for:

- agent help requests.
- proposal approval cards.
- capture triage.
- dependency/blocked notices.

## 10. Dependency system

`src/main/dependencies/` provides task dependency semantics:

- validates `depends_on` graph updates.
- detects cycles.
- computes ready/blocked states for dispatch.
- cascades dependency deletion/archive into dependent task blocking and Inbox notifications.

`src/main/auto_runner/ready_set.ts` consumes these semantics to select runnable work. Planner publish also materializes dependency edges so generated task graphs are dispatchable.

## 11. Auto-runner

`src/main/auto_runner/` replaces Night Shift:

- dispatcher attaches to the active vault.
- scheduler observes task ready-set, authorization, dependency state, hourly limits, and concurrency.
- IPC namespace `autoRunner` exposes `status/start/stop/event`.
- settings default to disabled; users must explicitly enable Auto-runner.
- unsupported `sandbox` execution emits a clear Inbox/help event instead of silently skipping.

Auto-runner is designed as a continuous local loop, not a batch modal. Manual terminal/project workflows remain available when it is disabled.

## 12. CLI-first agent surface

`src/cli/` and `src/main/cli_server/` implement the local `orbit` CLI:

- `orbit search`
- `orbit cat`
- `orbit task list/get/update/propose/log`
- `orbit inbox ...`
- `orbit activity ...`
- `orbit approval ...`
- `orbit auto-runner ...`
- `orbit agent/run ...`

The CLI talks to the Electron main process over the local vault socket. Missing backend domains return structured `unavailable` errors rather than pretending success.

## 13. Capture

Capture v2 is split into three domains under `src/main/capture/`:

- **Feed**: RSS subscriptions, item de-duplication, refresh, fade-out/history.
- **Library**: saved articles, reading state, promotion to Resource.
- **Thoughts**: quick thought capture, edit/link/dismiss/promote lifecycle.

`quickCapture` binds the global shortcut (`⌘⇧I` on macOS) and opens a Thought-only renderer modal. Capture writes Inbox items so triage happens in the same attention hub.

## 14. Renderer workspace

Renderer state is organized through Zustand stores under `src/renderer/src/store/`:

- `workspace`, `files`, `para` for vault/project navigation.
- `agent`, `worktrees`, `reviewQueue`, `taskDetails` for execution-facing UI.
- Inbox, Capture, Project Room, Planner, Roles, Sessions, GitHub, Inspector and Area Room are composed as React views.

Project Room currently contains:

- Kanban
- Terminal
- GitHub
- Sessions
- Planner
- Roles

The old Night Shift modal/history UI has been removed. Review Inbox now focuses on permission requests from Orbit-managed sessions.

## 15. Git and GitHub integration

`src/main/git/` owns worktrees, status parsing, staging, diff, safety checks and merge operations. It also supports project Inspector Changes and GitHub publish/PR flows.

`src/main/github/` wraps `gh` CLI integration:

- connection/authentication state.
- repository list/import/publish.
- project details, issues, PRs, checks, reviews.
- task issue binding.

Project GitHub View is prompt-free and uses controlled forms for repository publishing and PR creation.

## 16. Migrations

Migrations live in `src/main/migrations/` and are triggered before indices are built in `openFsSession`.

v2 schema migrations follow these rules:

- Zod accepts old data first with optional/default fields.
- migration scripts backfill once and record marker state.
- vault safety snapshots are taken before destructive rewrites where applicable.
- immutable task keys (`uid`, `type`, `created`) are never rewritten.

## 17. Validation and observability

Implementation gates for this codebase are:

```bash
npm run typecheck
npm run lint -- --quiet
npm test
npm run build
```

E2E remains available through:

```bash
npm run e2e
```

Activity Log, Inbox records, agent event logs, terminal session history, and Git history are the primary observability surfaces for production debugging.
