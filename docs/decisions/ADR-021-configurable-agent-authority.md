---
id: ADR-021
title: Configurable agent authority and learnable grants
status: accepted
date: 2026-05-13
builds_on:
  - ADR-019
  - ADR-020
---

## Context

ADR-020 makes Ask-Anywhere the universal agent surface. That implies powerful future tools: shell, browser, subagents, automation, media, plugins, and external services.

The original propose/approve model protects user data, but if every medium-risk action asks every time, Orbit becomes exhausting. The user should be able to grow a personal whitelist over time, and sometimes temporarily enable a no-interruption mode for a bounded session.

This must not collapse into "agent can do anything forever".

## Decision

Orbit introduces a configurable **Agent Authority** model.

Approval is treated as a way to create scoped grants, not as the only runtime control.

Core concepts:

- `AuthorityRequest`: a proposed tool action with tool family, permissions, risk, scope, and summary.
- `AuthorityRule`: a durable allow/ask/deny/sandbox-only rule created by the user or system migration.
- `AutopilotSession`: a temporary high-trust mode with scope, expiry, tool family list, permission list, risk ceiling, and budget.
- `AuthorityProfile`: default behavior bundle such as Strict, Balanced, Builder, Research, Autopilot, and Custom.

The policy engine evaluates:

1. explicit deny rules
2. explicit grant rules
3. active Autopilot sessions
4. active profile defaults
5. hard safety rails

## Approval UX

Preflight approval cards must support more than one-shot approval:

- Allow once
- Allow this run
- Allow this conversation
- Allow this project
- Always allow matching rule
- Deny once
- Always deny matching rule
- Edit rule

Orbit may suggest a durable grant after repeated approvals of the same action.

## Autopilot

Autopilot is allowed, but it is always bounded:

- scope: conversation / project / task / cwd / domain
- expiry: e.g. 15 minutes, one hour, this run
- budget: tool calls, time, tokens, cost
- tool families: shell/browser/subagent/web/etc.
- permissions: read/network/write_worktree/etc.
- risk ceiling

Autopilot does not bypass non-negotiable rails by default:

- payments and transfers
- posting/sending messages
- secret/keychain/env access
- `sudo` and system-level changes
- broad deletion/overwrite
- writes outside authorized roots

## Tool-family implications

Shell:

- Repeated safe commands should become cwd/project-scoped grants.
- Mutation defaults to sandbox/worktree.
- Direct vault writes require explicit grants.

Browser:

- Public read can be low friction.
- Logged-in domains need grants.
- Submit/post/purchase remains high-risk and normally asks at the final step.

Subagents:

- Spawn grants are profile-based.
- Subagents receive narrowed permission envelopes.
- Recursive subagent spawning is off by default.

## Consequences

Positive:

- Power users can make Orbit fast without removing accountability.
- The permission model becomes inspectable and editable.
- Ask-Anywhere can become OpenClaw-class without abandoning Orbit's local-first, auditable promise.

Trade-offs:

- Permission UX becomes a core product surface.
- The evaluator must be conservative when action classification is uncertain.
- Every new powerful tool family must implement `AuthorityRequest` before execution.

## Implementation notes

Foundation:

- Shared contracts: `src/shared/authority.ts`
- Grant store: `src/main/authority/grant-store.ts`
- Evaluator: `src/main/authority/policy.ts`
- Architecture doc: `docs/architecture/agent-authority.md`
