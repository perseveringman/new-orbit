const FUTURE = 'Phase 5 unavailable';

export function generateTopLevelHelp(): string {
  return `Orbit CLI - agent interface for the local AI collaboration workbench

Usage: orbit <command> [args]

Available commands:
  search       Search the open vault (Phase 0)
  cat          Read a vault file or UID (Phase 0)
  task         Task commands: list, get, update, deps
  project      Project commands (${FUTURE})
  inbox        Inbox event commands (${FUTURE})
  feed         Feed capture commands (${FUTURE})
  library      Library capture commands (${FUTURE})
  thought      Thought capture commands (${FUTURE})
  activity     Activity log commands (${FUTURE})
  memory       Memory commands (${FUTURE})
  approval     Approval commands (${FUTURE})
  auto-runner  Auto-runner commands (${FUTURE})
  agent        Agent run commands (${FUTURE})
  run          Agent self-reporting commands (${FUTURE})

Run \`orbit <command> --help\` for command help.
Global flags: --json (structured output), --help, --socket <path>, --vault <path>
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

export function generateTaskHelp(): string {
  return `Usage: orbit task <subcommand> [args]

Available subcommands:
  list        List tasks
  get         Show task readiness and dependencies
  update      Update task fields (status / depends_on)
  deps        Print a task dependency tree

Unavailable:
  propose, propose-scope, delete

Examples:
  orbit task list
  orbit task list --status todo --project project_uid --json
  orbit task get task_uid --json
  orbit task update task_uid --depends-on task_a,task_b
  orbit task deps task_uid
`;
}

export function generateUnavailableHelp(command: string): string {
  return `Usage: orbit ${command} <subcommand> [args]

The ${command} domain is documented for agent self-discovery but is not implemented in Phase 0.
It is scheduled for Phase 5 CLI coverage.
`;
}
