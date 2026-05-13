# Agent Authority Architecture

> **Status**: accepted foundation  
> **Companion ADR**: `docs/decisions/ADR-021-configurable-agent-authority.md`  
> **Purpose**: 定义 Ask-Anywhere / shell / browser / subagent / future plugins 的统一权限模型。

---

## 1. Principle

Orbit's agent model is not "approve every action" and not "let the model do anything".

The product principle is:

> Users should gradually delegate authority to Orbit, with clear scope, expiry, auditability, and revocation.

Approval is only one mechanism for creating authority. Once a user trusts a repeated action, Orbit should let them turn that action into a rule so future runs are smooth.

---

## 2. First-principles check

Every powerful tool call is evaluated by five questions:

1. What can this action change?
2. Can the change be automatically or humanly reverted?
3. Does it touch Layer 1 Ground Truth or the external world?
4. Did the user see the intent before an irreversible action happens?
5. Can Orbit later explain who did what, when, why, and under which grant?

If the answer is unclear, the tool must ask or run in a sandbox/worktree.

---

## 3. Core objects

### AuthorityRequest

A single proposed tool action:

- tool family: `shell`, `browser`, `subagent`, `web`, `orbit`, ...
- requested permissions: `read`, `network`, `write_worktree`, `external_submit`, ...
- risk level: `L0_observe` through `L5_dangerous_elevated`
- scope hints: conversation, project, task, cwd, domain
- human summary for preflight UI

### AuthorityRule

A durable user-created grant or deny rule.

Examples:

- allow `npm run typecheck` inside one project
- always ask before browser form submit on `github.com`
- deny shell commands touching `.env`
- allow `researcher` subagents in one conversation

### AutopilotSession

A temporary high-trust grant.

Autopilot must always have:

- explicit scope
- expiry
- allowed tool families
- allowed permissions
- risk ceiling
- budget
- visible active UI state
- one-click stop

It is a bounded delegation mode, not a global root switch.

### AuthorityProfile

Default behavior bundle:

- `Strict`
- `Balanced`
- `Builder`
- `Research`
- `Autopilot`
- `Custom`

Profiles provide defaults only. Explicit allow/deny rules win.

---

## 4. Risk levels

| Level | Meaning | Default posture |
|---|---|---|
| `L0_observe` | Read public web/vault state, screenshot public pages | allow |
| `L1_bounded_local` | Local inspect/build/test with bounded writes to cache/sandbox | allow or ask |
| `L2_reversible_draft` | Worktree/sandbox edits with diff review | sandbox/worktree |
| `L3_layer1_direct_write` | Direct writes to Notes/Tasks/Resources/Conversations | ask unless whitelisted |
| `L4_external_side_effect` | Submit forms, send messages, post, purchase, third-party writes | ask every critical action |
| `L5_dangerous_elevated` | secrets, sudo, broad deletion, system settings, destructive commands | deny by default |

Risk is contextual. The same `shell` tool can be L1 for `npm run typecheck`, L2 for a worktree patch command, or L5 for a broad delete.

---

## 5. Policy evaluation order

1. Explicit deny rules
2. Explicit allow / ask / sandbox-only rules
3. Active Autopilot sessions
4. Active AuthorityProfile default
5. Hard safety rails

Hard safety rails are non-bypass by normal UI:

- payments / purchase / transfers
- sending messages, emails, posts, or form submissions with external consequences
- secrets / keychain / `.env`
- `sudo` and system settings
- broad deletion or overwrite
- writing outside authorized roots

Advanced users may later unlock some rails through settings, but this must be deliberate and visibly dangerous.

---

## 6. Approval as rule creation

Preflight UI should never stop at "Allow" / "Deny".

It should offer:

- Allow once
- Allow this run
- Allow this conversation
- Allow this project
- Always allow matching rule
- Deny once
- Always deny matching rule
- Edit rule

Orbit should also learn from repetition:

> You have allowed `npm run typecheck` in this project 5 times. Always allow it here?

This is how Orbit becomes less interruptive without becoming less accountable.

---

## 7. Tool family guidance

### Registry and parity surface

Ask-Anywhere tools must be registered through the central agent tool registry, not hidden in model-provider-specific prompts.

Each registered tool records:

- tool family
- risk level
- requested permissions
- OpenClaw-equivalent capability, when applicable
- active/planned status

The renderer exposes a Tool Registry page so future work can verify what is actually available to models and what remains planned. This page is the source of truth for OpenClaw parity tracking at runtime.

### Shell

Shell must run through `AuthorityRequest`.

Default design:

- Inspect/build/test commands can be allowed by project/cwd + command prefix.
- Mutations run in worktree or sandbox by default.
- Direct vault writes require explicit grant.
- Dangerous commands are denied or ask every time.
- Output is traced; command, cwd, exit code, stdout/stderr summaries enter Activity/Trace.

### Browser

Browser authority is action-based, not just domain-based.

- public read / screenshot / extraction: usually L0
- logged-in read: scoped domain grant
- form fill: ask or grant by domain/action
- form submit / posting / purchase: L4, final manual click by default
- Save to Library is an explicit Layer 0 → Layer 1 promotion

### Subagent

Subagents are worker profiles with bounded authority:

- `researcher`: web + vault read, no writes
- `reviewer`: repo/vault read + tests, no file edits
- `worker`: worktree/sandbox writes + final diff review
- `operator`: browser/shell/external actions; high risk, explicit grant

Subagents do not inherit all parent permissions automatically. They receive a narrowed authority envelope.

---

## 8. Storage

Authority grants live under:

```text
<vault>/.orbit/authority/grants.json
```

The file contains:

- durable `AuthorityRule[]`
- active or historical `AutopilotSession[]`
- version and updated timestamp

Secrets are never stored in grants.

---

## 9. Relationship to Inbox

Inbox remains the durable review surface for important decisions.

Inline preflight handles immediate flow. Inbox mirrors unresolved approvals so users can leave and return. A grant created from either surface updates the same Authority Store.

---

## 10. Non-goals

- Not a hosted IAM system.
- Not team permission management.
- Not a way for agents to self-grant power.
- Not a bypass for ExecutionContext, Activity Log, or Layer 0 → Layer 1 promotion rules.
