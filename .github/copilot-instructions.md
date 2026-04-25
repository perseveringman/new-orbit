<!-- SPECKIT START -->
Read `AGENTS.md` first for the repository's operational rules, documentation
strategy, commit conventions, and validation checklist. Then read
`.specify/memory/constitution.md` for the persistent Spec Kit governance that
turns those rules into planning gates.

Before planning or implementation, inspect the relevant code and docs
(`README.md`, `docs/architecture.md`, `docs/DEVELOPMENT.md`, and
`docs/plans/` when applicable). Treat `specs/` as Spec Kit working artifacts
only; durable product and architecture knowledge still belongs in `docs/` and
`CHANGELOG.md`.

Orbit-specific guardrails:
- Preserve the Electron process split across `src/main/`, `src/preload/`,
  `src/shared/`, and `src/renderer/src/`.
- Renderer code talks to backend capabilities only through `window.orbit`.
- Keep TypeScript strict; avoid `any`; prefer `unknown` + guards; use explicit
  return types.
- Use Zustand for app state and Tailwind utility classes for styling.
- Validate with `npm run typecheck && npm run lint && npm test && npm run build`
  before concluding implementation.
<!-- SPECKIT END -->
