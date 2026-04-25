<!--
Sync Impact Report
Version change: template -> 1.0.0
Modified principles:
- Placeholder principle set -> I. Context Before Code
- Placeholder principle set -> II. Preserve Typed Electron Boundaries
- Placeholder principle set -> III. Type Safety and Pattern Reuse
- Placeholder principle set -> IV. Behavior-Safe Delivery
- Placeholder principle set -> V. Durable Documentation and Verification
Added sections:
- Repository-Specific Guardrails
- Workflow & Quality Gates
Removed sections:
- Placeholder-only template content
Templates requiring updates:
- ✅ .specify/templates/plan-template.md
- ✅ .specify/templates/spec-template.md
- ✅ .specify/templates/tasks-template.md
- ✅ .github/copilot-instructions.md
- ✅ AGENTS.md
- ✅ README.md
- ✅ docs/DEVELOPMENT.md
- ✅ CHANGELOG.md
Follow-up TODOs:
- None
-->

# Orbit Constitution

## Core Principles

### I. Context Before Code
Agents MUST read `AGENTS.md`, this constitution, and the relevant code and docs
before proposing or applying changes. Medium and large changes MUST go through
`/speckit.specify` -> `/speckit.plan` -> `/speckit.tasks` before implementation;
`/speckit.clarify` is required whenever scope, behavior, or constraints are
ambiguous. Any change that spans multiple surfaces (`src/main/`, `src/preload/`,
`src/shared/`, `src/renderer/src/`, `tests/`, `e2e/`, `docs/`) counts as at
least medium scope.

### II. Preserve Typed Electron Boundaries
Renderer code MUST remain browser-only and access backend capabilities only
through `window.orbit`. IPC surfaces MUST be declared in `src/shared/ipc.ts`,
implemented on the main side, exposed from preload, and typed end-to-end.
Main-process, preload, shared-contract, and renderer concerns MUST not be mixed
to shortcut delivery.

### III. Type Safety and Pattern Reuse
TypeScript stays in strict mode. New code MUST avoid `any`, prefer `unknown` +
type guards, declare explicit return types, and reuse existing helpers and repo
patterns before adding new abstractions. Zustand is the default state layer and
Tailwind utility classes are the default styling system.

### IV. Behavior-Safe Delivery
Changes MUST be surgical, preserve intended UX, and surface errors explicitly
rather than hiding them. Work MUST update every affected surface—code, tests,
IPC contracts, documentation, and user flows—when a feature crosses boundaries.
Silent fallbacks, broad catch blocks, unrelated refactors, and destructive git
operations are prohibited unless explicitly requested.

### V. Durable Documentation and Verification
Spec Kit artifacts in `specs/` guide execution, but lasting project knowledge
MUST be synced back to `docs/` and `CHANGELOG.md` according to `AGENTS.md`.
Every completed implementation MUST run `npm run typecheck`, `npm run lint`,
`npm test`, and `npm run build`. Features that change behavior SHOULD add or
update unit or e2e coverage consistent with existing repository test patterns.

## Repository-Specific Guardrails

- Orbit is an Electron + React + TypeScript desktop app with four primary code
  surfaces: `src/main/`, `src/preload/`, `src/shared/`, and `src/renderer/src/`.
- Renderer work MUST use function components + hooks, Zustand stores from
  `src/renderer/src/store/`, and Tailwind utility classes. Do not introduce
  Redux, React Context for app state, class components, or ad hoc CSS files.
- Main-process work SHOULD stay modular by domain (`git/`, `agent/`,
  `terminal/`, orchestration modules) and keep IPC registration centralized.
- Commit discipline is mandatory: stage only task-related files, avoid
  `git add .` / `git add -A`, and create one semantic commit per logical change.

## Workflow & Quality Gates

- Small, localized fixes may be implemented directly, but medium and large work
  MUST use the Spec Kit flow so scope, plan, and task breakdown exist before
  code changes begin.
- `specs/` is an execution workspace for Spec Kit. Durable documentation still
  follows the repository strategy in `AGENTS.md`: large changes update
  `docs/plans/` plus affected core docs, medium changes update the affected
  existing docs, and small changes update `CHANGELOG.md`.
- Done means more than "code compiles": the implementation, tests, docs,
  changelog, and semantic commit must all be complete for the scope of the task.
- If long-term constraints change, update this constitution and confirm
  `AGENTS.md`, Copilot instructions, and Spec Kit templates still agree.

## Governance

This constitution governs how Spec Kit plans and executes work in Orbit. When a
rule overlaps with `AGENTS.md`, the stricter rule wins; `AGENTS.md` remains the
operational rulebook and repository docs remain the source of technical facts.

Amendments require an explicit constitution update, a short rationale in the
diff or commit, and synchronization of any affected templates or workflow docs.
Versioning follows semantic intent: MAJOR for incompatible governance changes,
MINOR for new or materially expanded principles, and PATCH for clarifications.

Every spec, plan, task list, review, and implementation handoff SHOULD be
checked against these principles. Work that cannot satisfy them must either be
re-scoped or explicitly justified in the relevant plan before implementation.

**Version**: 1.0.0 | **Ratified**: 2026-04-25 | **Last Amended**: 2026-04-25
