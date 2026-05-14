---
status: completed
created: 2026-05-13
updated: 2026-05-13
adr: ADR-022
---

# Project Workdir Decoupling Implementation Plan

## Goal

Make Orbit projects usable with real code repositories without forcing the code
tree to live inside the vault coordination folder.

## Implemented

- Extended project config with `workdir`, `git`, object-style
  `execution_context`, `watcher`, and `vendor_bridge_files`.
- Added backend flows for linking an existing workdir and scaffolding a new
  workdir from Orbit templates.
- Added workdir probing for git/code markers and recommended execution mode.
- Retargeted agent cwd resolution, safety checks, direct execution, terminal
  rooms, inspector files/changes, GitHub sync/publish/import, dashboard dirty
  checks, and project-specific worktrees to use `workdirPath`.
- Added IPC/preload/renderer support for choosing directories, probing workdirs,
  linking existing projects, and scaffolding new workdirs.
- Added CLI bridge commands:
  - `project.link`
  - `project.scaffold`
  - `project.relink`
  - `project.migrateWorkdir`
  - `project.workdir`
  - `project.probeWorkdir`
- Updated shared Space summaries to expose project workdir metadata.
- Preserved legacy in-vault projects with `linked_via: "legacy-in-vault"`.
- Added Project Room maintenance actions for relinking a project workdir and
  moving legacy in-vault code payloads out of `01_Projects/`.
- Added CLI commands:
  - `orbit project relink <slug-or-uid> <workdir-path>`
  - `orbit project migrate-workdir <slug-or-uid> <target-dir>`
- Extended environment install actions to resolve project-specific worktree IDs.
- Added focused integration tests for legacy migration, external workdir GitHub
  import, and external-workdir task worktree launch.

## Migration Notes

Legacy folder-backed projects remain valid as `linked_via: "legacy-in-vault"`.
Use Project Room's **Move Workdir Out** action, or:

```bash
orbit project migrate-workdir <slug-or-uid> /path/to/new/workdir --remove-copied-files
```

The migration copies code payload into the target workdir, keeps Orbit tasks,
assets, outputs, README, and `.orbit/` metadata in the coordination folder, and
then updates `.orbit/config.json` to `linked_via: "migrated-from-vault"`.
