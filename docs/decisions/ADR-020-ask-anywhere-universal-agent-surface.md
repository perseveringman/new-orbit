---
id: ADR-020
title: Ask-Anywhere as universal agent surface
status: accepted
date: 2026-05-13
supersedes:
  - ADR-015 partial scope: Ask-Anywhere as planning-only proxy
  - ADR-019 partial scope: internal-vault-only tool boundary
---

## Context

Ask-Anywhere was originally framed as Orbit's planning proxy: the user talks to one AI entry point, and that entry point operates the Orbit vault through structured `orbit_*` tools.

That was the right simplification when the main risk was prompt/UI sprawl. It is now too narrow. Users expect Ask-Anywhere to behave more like an OpenClaw-class agent surface:

- live web search and page fetch
- model switching without losing tools
- future shell/browser/subagent/session/cron/media capabilities
- one conversation surface instead of separate internal chat vs external agent chat

OpenClaw demonstrates the key architectural lesson: web/search/browser/system tools should be a runtime tool layer, not a property of one model. The model can change; the tool registry and provider runtime stay stable.

## Decision

Ask-Anywhere is now Orbit's **universal agent surface**.

This means:

1. Ask-Anywhere may use both Orbit-internal tools and external-world tools.
2. Tool availability is independent from the selected model whenever technically possible.
3. Conversation-level model/endpoint switching is a first-class interaction.
4. External capabilities must be exposed as named tool families with policy, tracing, and safety boundaries.
5. Track A external CLI agents remain available for long-running or sandbox-heavy execution, but Ask-Anywhere is the user's front door.

## Tool layering

The tool registry is organized by capability family:

| Family | Examples | Current status |
|---|---|---|
| Orbit data | `orbit_search`, `orbit_read`, task/project/resource/inbox/activity tools | implemented |
| Web | `orbit_web_search`, `orbit_web_fetch` | implemented foundation |
| Runtime selection | `/model`, `/endpoint` conversation commands | implemented foundation |
| System execution | shell/process/filesystem mutation beyond Orbit handlers | planned; requires consent/sandbox |
| Browser | page navigation, screenshots, interaction | planned |
| Sessions/subagents | spawn/list/send/yield/status | planned |
| Automation | cron, heartbeat, follow-up tasks | planned |
| Media/docs | image/audio/video/pdf/doc/spreadsheet tools | planned |
| Plugins | third-party tool packs and allow/deny policy | planned |

## Safety policy

The direction is "capable by default", not "unsafe by default".

- Read-only and public web tools can execute directly with RuntimeEvent and TraceableEvent audit.
- Low-risk Orbit writes still follow ADR-019: whitelist handlers, Journal, Activity Log.
- High-risk operations require explicit policy before exposure: shell execution, broad filesystem writes, browser side effects, network side effects, credentials, payments, messages, and destructive local commands.
- Web fetch blocks private networks and localhost by default.
- Web content is untrusted input and must not be treated as instructions unless the user explicitly requests that.

## Consequences

Positive:

- Ask-Anywhere can answer live/news/current-info questions through tools instead of apologizing.
- Model switching does not remove web access.
- Orbit aligns more closely with the AI-Native principle: one user-facing agent entry point, many structured capabilities.

Trade-offs:

- Tool policy becomes a product surface, not hidden implementation detail.
- Shell/browser/subagent parity with OpenClaw must be built in phases; copying every powerful tool without policy would violate Orbit's auditability promise.
- Provider-specific native tools, such as OpenAI native web search, should be adapters on top of the same capability family rather than the only implementation.
