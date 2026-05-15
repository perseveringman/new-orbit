const CAPTURE_UNAVAILABLE =
  'Capture backend is unavailable in this worktree; phase5-capture owns implementation.';
const MEMORY_UNAVAILABLE = 'Memory backend is unavailable in this worktree.';

export function generateTopLevelHelp(): string {
  return `Orbit CLI - agent interface for the local AI collaboration workbench

Usage: orbit <command> [args]

Available commands:
  search       Search the open vault
  cat          Read a vault file or UID
  memory      Memory search/save (${MEMORY_UNAVAILABLE})
  project     Project commands: link, scaffold, relink, migrate-workdir, workdir, overview, graph, list, get, archive
  space       Space commands: list, show, context
  resource    Resource commands: list, get, create, archive
  note        Note commands: queue, get, search, workbench, classify, relate, distill, propose-update, accept-suggestion
  assets      Project materials commands: list, show, scan, stat, read, add-scope, pin, unpin
  kanban      Kanban commands: list
  task        Task commands: list, get, update, propose, related, transcript, switch-runtime, propose-scope, propose-split, deps, delete
  inbox       Inbox commands: list, get, resolve, dismiss, archive, emit-message
  activity    Activity log commands: list, summary
  approval    Approval commands: list, get, resolve
  auto-runner Auto-runner controls: status, start, stop
  agent       Agent run commands: list-runs, stop
  run         Agent self-reporting: request-merge, report-progress, emit-insight
  dev:scenarios Agent Playground scenario runner
  dev:lifecycle Phase 4.0 lifecycle scenario runner
  dev:golden  Agent Playground golden file verification
  feed        Feed capture commands (${CAPTURE_UNAVAILABLE})
  library     Library capture commands (${CAPTURE_UNAVAILABLE})
  thought     Thought capture commands (${CAPTURE_UNAVAILABLE})

Run \`orbit <command> --help\` for command help.
Global flags: --json (structured output), --help, --socket <path>, --vault <path>
Long content flags: use stdin or --file / --content-file / --summary-file where supported.
Exit codes: 0 success, 1 business/unavailable, 2 usage, 3 main-process connection.
`;
}

export function generateSearchHelp(): string {
  return `Usage: orbit search <query> [--limit N] [--json]

Search the currently open Orbit vault through the main-process CLI bridge.

Examples:
  orbit search roadmap
  orbit search "agent approval" --limit 10 --json
`;
}

export function generateCatHelp(): string {
  return `Usage: orbit cat <path-or-uid> [--json]

Read a vault-relative Markdown path, absolute path inside the vault, or UID.

Examples:
  orbit cat 01_Projects/demo/README.md
  orbit cat task_abc123 --json
`;
}

export function generateMemoryHelp(): string {
  return `Usage: orbit memory <subcommand> [args]

Available subcommands:
  search <query>       Search memories (${MEMORY_UNAVAILABLE})
  save [--file F]      Save memory text from stdin or --file (${MEMORY_UNAVAILABLE})

All subcommands currently return a structured unavailable error because no memory backend
is present in this worktree.
`;
}

export function generateProjectHelp(): string {
  return `Usage: orbit project <subcommand> [args]

Available subcommands:
  overview <slug>         Project vision/current phase/key docs summary
  link <path> --name N    Link an existing code directory as an Orbit project
  scaffold --name N --parent DIR
                          Create a new code directory and Orbit coordination folder
  relink <slug> <path>    Point an existing Orbit project at a different workdir
  migrate-workdir <slug> <target-dir>
                          Move legacy in-vault code payload into an external workdir
  workdir <slug>          Show coordination/workdir paths
  probe <path>            Inspect a directory before linking
  graph [--uid UID]       Return project/task graph data
  list                    List projects
  get <uid>               Get project metadata
  archive <uid>           Submit archive-project approval request

Examples:
  orbit project list --json
  orbit project link ~/code/demo --name Demo --slug demo
  orbit project scaffold --name Demo --parent ~/code
  orbit project relink demo ~/code/demo
  orbit project migrate-workdir demo ~/code/demo --remove-copied-files
  orbit project workdir demo
  orbit project overview demo
  orbit project graph --uid project_uid
  orbit project archive project_uid --json
`;
}

export function generateSpaceHelp(): string {
  return `Usage: orbit space <subcommand> [args]

Available subcommands:
  list [--type project|area|resource]                 List unified Spaces
  show <space-id>                                     Show one Space summary
  context <space-id> [--summary] [--section a,b]   Export a unified Space context bundle

Examples:
  orbit space list --type resource --json
  orbit space show my-resource
  orbit space context my-project --json
  orbit space context area_uid --summary --section tasks,materials
`;
}

export function generateResourceHelp(): string {
  return `Usage: orbit resource <subcommand> [args]

Available subcommands:
  list [--include-archived]       List Resources
  get <id-or-slug>                Show one Resource
  create --title T [--slug S]     Create a Resource
  archive <id-or-slug>            Archive a Resource

Examples:
  orbit resource list --json
  orbit resource create --title "Egypt history"
  orbit resource archive egypt-history
`;
}

export function generateNoteHelp(): string {
  return `Usage: orbit note <subcommand> [args]

Available subcommands:
  queue [--bucket inbox|connect|express|settled|all] [--type thought|capture|longform|voice_log|daily_summary] [--tag T] [--query Q]
                              List the AI-native note processing queue
  get <id-or-path>             Show one Note
  search <query> [--limit N]   Search Notes
  workbench <id-or-path> [--force]
                              Generate or read the Note AI Workbench artifact
  classify <id-or-path> [--force]
                              Suggest Area assignments
  relate <id-or-path> [--force]
                              Suggest semantic note relations
  distill <id-or-path> [--force]
                              Suggest longform distillation actions
  propose-update <id-or-path> [--force]
                              Return all Note Workbench suggestions
  accept-suggestion <id-or-path> <suggestion-id> [--artifact ID]
  dismiss-suggestion <id-or-path> <suggestion-id> [--artifact ID]

Examples:
  orbit note queue --bucket inbox --json
  orbit note workbench note-123 --force --json
  orbit note accept-suggestion note-123 classify-area-writing --json
`;
}

export function generateAssetsHelp(): string {
  return `Usage: orbit assets <subcommand> [args]

Project selection:
  Pass --project <uid-or-slug>, or run inside a Space terminal where ORBIT_PROJECT_UID / ORBIT_AREA_UID / ORBIT_RESOURCE_UID is set.

Available subcommands:
  list [--project P]                         List scopes and pins
  show <scope-id> [--project P]              Show one scope
  scan <scope-id> [--project P] [--filter F] [--limit N]
  stat <scope-id> [--project P]
  read <path> [--project P]                  Read a file only if it is inside an authorized scope
  add-scope <path-or-url> --kind K --confirm [--project P] [--title T] [--tag T]
  pin <path> [--project P] [--parent S] [--title T] [--tag T]
  unpin <pin-id> [--project P]

Examples:
  orbit assets list --project demo
  orbit assets add-scope ~/Movies/Egypt --kind folder --title "Egypt footage" --confirm
  orbit assets scan egypt-footage --filter .mp4 --limit 20
`;
}

export function generateTaskHelp(): string {
  return `Usage: orbit task <subcommand> [args]

Available subcommands:
  list [--status S] [--mode human|assisted|agent|scheduled] [--project UID] [--area UID] [--resource UID] [--tag TAG]
  get <uid>
  update <uid> [--status S] [--mode human|assisted|agent|scheduled] [--depends-on a,b]
  related <uid>
  transcript <uid>
  switch-runtime <uid> --to <runtime-id>
  propose --title T (--project UID | --area UID | --resource UID) [--mode human|assisted|agent|scheduled] [--conversation ID] [--run RUN] [--description TEXT|--file F]
  propose-scope <current-uid> [--run RUN] [--summary TEXT|--file F]
  propose-split <current-uid> [--run RUN] [--summary TEXT|--file F]
  deps <uid>
  delete <uid>            Currently unavailable unless a delete backend is added

Examples:
  orbit task list --status todo --project project_uid --json
  orbit task get task_uid --json
  orbit task update task_uid --mode agent --depends-on task_a,task_b
  orbit task deps task_uid
  echo "details" | orbit task propose --title "Follow-up" --project project_uid --run run_1
`;
}

export function generateInboxHelp(): string {
  return `Usage: orbit inbox <subcommand> [args]

Available subcommands:
  list [--category message|capture] [--subtype A1|thought] [--status pending] [--include-archived]
  get <id>
  resolve <id> [--decision approve|reject|done|processed] [--note TEXT|--file F]
  dismiss <id> [--note TEXT|--file F]
  archive <id>
  emit-message --type B1 --title T [--summary TEXT|--file F] [--run RUN] [--task UID]

Examples:
  orbit inbox list --status pending --json
  orbit inbox resolve inbox_1 --decision approve --note "looks good"
  echo "Need credentials" | orbit inbox emit-message --type B1 --title "Need info" --run run_1
`;
}

export function generateActivityHelp(): string {
  return `Usage: orbit activity <subcommand> [args]

Available subcommands:
  list [--from DATE|-Nd] [--to DATE] [--actor user|agent|system] [--action ACTION] [--limit N]
  summary [--from DATE|-Nd] [--to DATE] [--actor user|agent|system] [--action ACTION]

Examples:
  orbit activity list --from 2026-04-26 --json
  orbit activity summary --from -7d
`;
}

export function generateApprovalHelp(): string {
  return `Usage: orbit approval <subcommand> [args]

Available subcommands:
  list [--pending] [--status pending|approved|rejected|dismissed] [--type new_task|merge|archive_project]
  get <id>
  resolve <id> --decision approve|reject|dismiss [--note TEXT|--file F]

Examples:
  orbit approval list --pending --json
  orbit approval resolve proposal_1 --decision approve
`;
}

export function generateAutoRunnerHelp(): string {
  return `Usage: orbit auto-runner <subcommand> [--json]

Available subcommands:
  status      Show dispatcher settings, ready count, running runs, and hourly limit
  start       Enable Auto-runner and trigger one dispatcher tick
  stop        Disable Auto-runner scheduling (does not kill already-running agents)

Examples:
  orbit auto-runner status
  orbit auto-runner start --json
  orbit auto-runner stop
`;
}

export function generateAgentHelp(): string {
  return `Usage: orbit agent <subcommand> [args]

Available subcommands:
  list-runs       List active agent runs
  stop <run-id>   Stop an active agent run

Examples:
  orbit agent list-runs --json
  orbit agent stop run_123
`;
}

export function generateRunHelp(): string {
  return `Usage: orbit run <subcommand> [args]

Available subcommands:
  request-merge [--run RUN] [--task UID] [--summary TEXT|--summary-file F|--file F]
  report-progress --task UID [--message TEXT|--file F]
  emit-insight [--run RUN] [--task UID] [--content TEXT|--file F]

Examples:
  echo "Implemented and tested" | orbit run request-merge --run run_1 --task task_1
  orbit run report-progress --task task_1 --message "Ran typecheck"
`;
}

export function generateFeedHelp(): string {
  return `Usage: orbit feed <subcommand> [args]

Command surface:
  add <rss-url> [--category X]
  list-subscriptions
  remove <subscription-id>
  refresh [subscription-id]
  list [--unread]
  save <feed-item-id> [--note TEXT|--file F]
  history search <query>
  history purge --before YYYY-MM-DD

${CAPTURE_UNAVAILABLE}
`;
}

export function generateLibraryHelp(): string {
  return `Usage: orbit library <subcommand> [args]

Command surface:
  save <url> [--note TEXT|--file F]
  list [--status unread|reading|read|processed|dismissed|archived]
  get <id>
  mark-read <id>
  promote <id> [--target-path PATH] [--no-ai-summary]
  dismiss <id>

${CAPTURE_UNAVAILABLE}
`;
}

export function generateThoughtHelp(): string {
  return `Usage: orbit thought <subcommand> [args]

Command surface:
  create [--content-file F|--file F] [--tags a,b]
  list [--tag X]
  get <id>
  promote <id> [--target-path PATH]
  link <id> --project <uid>
  dismiss <id>

${CAPTURE_UNAVAILABLE}
`;
}
