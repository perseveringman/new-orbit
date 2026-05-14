---
id: ADR-022
title: Decouple Orbit project coordination from code workdirs
status: accepted
date: 2026-05-13
builds_on:
  - ADR-003
implementation: ../plans/2026-05-13-project-workdir-decoupling.md
---

## Context

Orbit originally treated `01_Projects/<slug>/` as both the product coordination
space and the code repository. That made early project-as-folder work simple,
but it created friction for real software projects:

- existing repositories had to be copied or imported into the vault shape;
- Orbit task/memory/agent files mixed with application source files;
- worktree, GitHub, terminal, and agent surfaces could disagree about which
  directory was the actual execution root.

The redesign reviewed in
`orbit-projects-decoupling/ADR-DRAFT-project-workdir-decoupling.md` correctly
separates these concerns, but the implementation needs explicit path roles.

## Decision

An Orbit project now has two first-class roots:

- `coordinationPath`: the vault-owned project folder under `01_Projects/<slug>/`.
  It stores README, tasks, memories, project config, assets, and Orbit metadata.
- `workdirPath`: the real code/build directory. It may be an existing local repo,
  a newly scaffolded directory, or a legacy in-vault project directory.

`.orbit/config.json` stores:

- `workdir.path`, `workdir.linked_via`, and permissions;
- `git.root_path` / remote metadata when detected;
- `execution_context.kind`, plus worktree placement settings.

Agents, terminals, Git/GitHub operations, inspector files/changes, and CLI
project commands use `workdirPath` for code execution. Task storage, project
README, role bindings, assets, and search/refmap indexing remain under
`coordinationPath`.

## Consequences

- New project creation exposes three entry points: link existing workdir,
  scaffold new workdir, and import GitHub repository into a chosen workdir.
- Legacy projects remain valid through `linked_via: "legacy-in-vault"`.
- Migrated legacy folder-backed projects use `linked_via:
  "migrated-from-vault"` after their code payload is moved into an external
  workdir.
- Direct execution is available for non-git or low-risk projects; worktree
  execution remains the default for git repos.
- Safety gates and filesystem IPC allow access to linked workdirs, but only for
  directories registered by a project.
- Migration can move old code out of `01_Projects/` without changing task UIDs
  or project coordination history.
