---
id: ADR-027
title: Ask Runtime as event-driven orchestration layer
status: accepted
date: 2026-06-02
builds_on:
  - ADR-013
  - ADR-020
  - ADR-023
---

## Context

Ask-Anywhere had grown into Orbit's universal agent surface, but the main send
path still behaved like a single synchronous prompt builder:

- append user message;
- build scoped context, connector context, and PMIL ContextPacket;
- choose runtime;
- only then begin model streaming.

That made slow work look like model streaming. When PMIL `ensure`, connector
live inventory, or synthesis stalled, the UI could say "流式输出中" even though
the model had not started. The architecture also lacked a first-class place for
intent routing, route escalation, context lane budgets, and semantic answer
state.

## Decision

Introduce Ask Runtime as the event-driven orchestration layer behind
Ask-Anywhere.

Ask Runtime owns:

- `RunController`: accepts a run, emits phase events, and makes pre-model work
  cancellable.
- `Intent Router`: deterministic cascade for `direct_answer`, `vault_qa`,
  `connector_inventory`, `research_workflow`, and `agent_action`.
- `Context Orchestrator`: Fast / Retrieval / Slow lanes with explicit budgets
  and user-visible status.
- `Route Escalation`: late evidence can upgrade an under-confident route
  instead of silently answering on the wrong path.
- `Semantic Answer Surface`: UI renders route, lane, phase, and escalation
  events as user-friendly state instead of leaking PMIL / selector internals.

Ask Runtime does not replace the SDK runtime router, the tool registry, Agent
Authority, PMIL, or External Gateway. Those remain separate layers:

- `src/main/runtime/router.ts` chooses model/endpoint/track.
- `src/main/agent-tools/*` owns tool definitions, execution, authority, and
  journal/audit boundaries.
- `src/main/context/*` owns ContextPacket and evidence-first PMIL.
- `src/main/external-orchestrator/*` remains the external ingress gateway.

## Rationale

This follows the current agent-system consensus: keep orchestration explicit,
stream runtime state separately from model text, expose only route-scoped tools,
and treat context as a budgeted runtime dependency rather than a giant prompt
append.

The selected router is a hybrid cascade, not a blocking LLM classifier. It can
ack immediately, route high-confidence cases deterministically, and let later
evidence trigger a visible route escalation. This preserves first-response
latency while avoiding the "guess once, be wrong forever" failure mode.

The context contract is:

- Fast lane is the hard gate and should complete quickly with scoped Orbit
  context or a fallback.
- Retrieval lane has a short budget and may feed the initial answer.
- Slow lane may run synthesis `ensure` and attach artifacts later, but it must
  not block the first token.

## Research alignment

This ADR was checked against the current production-agent literature and vendor
runtime patterns:

- Anthropic's "Building Effective Agents" separates predefined workflows from
  more autonomous agents, and names routing, parallelization,
  orchestrator-workers, and evaluator-optimizer as composable patterns. Ask
  Runtime uses the same separation: a deterministic workflow gates common Ask
  paths, while agentic work remains behind explicit routes and approval
  boundaries.
- OpenAI Agents SDK streaming separates assistant text from the full event
  stream, where tools, handoffs, approvals, and agent updates are observable
  independently. Ask Runtime applies that distinction to Orbit's UI: context
  retrieval, route choice, and model text are separate event families.
- OpenAI Agents SDK tracing treats an agent run as nested spans over model
  generations, tool calls, handoffs, guardrails, and custom events. Ask Runtime
  keeps phase and context-lane events first-class so they can later become trace
  spans without inventing another diagnostic model.
- LangGraph persistence/checkpointing frames human-in-the-loop, memory, time
  travel, and fault tolerance as runtime-state features rather than prompt
  features. Ask Runtime follows that direction by making pre-model work
  cancellable and observable, while leaving durable history and approvals in
  Orbit's existing authority/event layers.
- MCP's architecture keeps tools, resources, prompts, lifecycle, and
  notifications at the protocol layer. Ask Runtime mirrors that boundary:
  connector inventory and tool availability are runtime dependencies, not
  hidden prose stuffed into every prompt.
- Recent context-engineering research argues that agents need relevance,
  sufficiency, isolation, economy, and provenance across their whole
  informational environment. The Fast / Retrieval / Slow lanes are Orbit's
  runtime form of that constraint: enough context early, richer evidence when
  affordable, and provenance-preserving artifacts later.

References:

- <https://www.anthropic.com/engineering/building-effective-agents>
- <https://openai.github.io/openai-agents-js/guides/streaming/>
- <https://openai.github.io/openai-agents-python/tracing/>
- <https://langchain-5e9cc07a.mintlify.app/oss/python/langgraph/persistence>
- <https://modelcontextprotocol.io/docs/learn/architecture>
- <https://arxiv.org/abs/2603.09619>

## Consequences

Positive:

- The UI can distinguish "accepted", "routing", "retrieving context",
  "streaming model text", "calling tools", and "background enrichment".
- The first user-visible state is not coupled to PMIL or connector latency.
- Future routes can be added without forking Ask-Anywhere, External Gateway, or
  SDK runtime routing.
- Misroutes become observable and recoverable through `runtime.route_escalation`.

Trade-offs:

- More RuntimeEvent kinds must remain backward-compatible with generic chat
  surfaces.
- Deterministic routing is fast and inspectable, but it will need telemetry and
  fixtures to tune ambiguous language over time.
- Slow-lane artifacts can improve follow-up context, but they must not rewrite a
  response that has already started.

## Implementation

Current implementation:

- `src/shared/ask-runtime/*`
- `src/main/ask-runtime/*`
- `src/main/ask-anywhere/orchestrator.ts`
- `src/renderer/src/components/chat/ChatView.tsx`
- `src/renderer/src/components/conversation/RuntimeStatusBar.tsx`
- `src/renderer/src/views/ask-anywhere/ContextBar.tsx`

2026-06-02 update:

- Intent routing now uses recent conversation turns as routing input, so
  follow-up messages such as "这个合理吗" or "把它提成任务" can be resolved
  against the active conversation instead of being classified as isolated
  one-shot questions.
- Ask Runtime first attempts a low-latency fast-model classifier through the
  configured SDK fast tier (`modelTier=fast`) and falls back to the deterministic
  router on timeout, missing endpoint, or invalid structured output.
- The model router returns a structured route decision only; it never answers
  the user and emits no chat message events. Obvious Orbit mutations are not
  allowed to downgrade below `agent_action`, preserving approval boundaries.
- Conversation history injected into the answer prompt is now bounded by recent
  complete user turns with an older-turn sketch, instead of blindly appending
  the full transcript.

Validation:

- `tests/ask_runtime_router.test.ts`
- `tests/chat_view.test.ts`
- `tests/ask_anywhere_ux.test.ts`
- `tests/ask_anywhere_pmil_context.test.ts`
