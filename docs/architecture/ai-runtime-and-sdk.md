# Orbit AI Runtime and SDK Architecture

> **Status**: accepted draft
> **Purpose**: 定义 Orbit 的双轨 AI runtime：外部 Agent CLI 与原生 SDK，并说明为什么先接 Anthropic SDK。

---

## 1. Two-track runtime

Orbit has two runtime tracks:

| Track | Name | Primary use |
|---|---|---|
| A | External Agent CLI | long-running task execution, tool-heavy work, worktree/sandbox mutation |
| B | Native SDK Agent | Ask-Anywhere universal agent surface, synthesis, summaries, short interactions, background analysis |

Track A examples:

- Claude Code CLI
- Codex CLI
- Gemini CLI

Track B examples:

- Anthropic SDK official endpoint
- MiniMax Anthropic-compatible endpoint
- DeepSeek Anthropic-compatible endpoint
- future local proxy exposing Anthropic-compatible API

---

## 2. Decision: Anthropic SDK first

Orbit should integrate `@anthropic-ai/sdk` first and not start with OpenAI SDK.

Reasons:

1. The current ecosystem already centers on Claude Code and Anthropic-style stream events.
2. MiniMax and DeepSeek expose Anthropic-compatible APIs, so one SDK can cover the user's available keys.
3. Track B workloads are mostly messages + streaming + JSON outputs, where Anthropic SDK is sufficient.
4. OpenAI SDK can be added later as a separate endpoint family; it should not block the first SDK track.

---

## 3. Unified event contract

Both tracks must emit the same abstract events:

```typescript
type AgentEvent =
  | { type: 'run.started'; run_id: string; runtime: string }
  | { type: 'assistant.delta'; text: string }
  | { type: 'assistant.message'; text: string }
  | { type: 'tool.use'; name: string; input: unknown }
  | { type: 'tool.result'; name: string; result: unknown; ok: boolean }
  | { type: 'cost'; input_tokens: number; output_tokens: number; usd?: number }
  | { type: 'run.completed'; run_id: string }
  | { type: 'run.failed'; run_id: string; error: string };
```

UI, trace replay, budget, timeline developer mode, and synthesis provenance consume only this abstract layer.

---

## 4. Directory layout

```text
src/main/runtime/
├── index.ts
├── router.ts
├── capabilities.ts
├── cli/
│   ├── claude-adapter.ts
│   ├── codex-adapter.ts
│   └── gemini-adapter.ts
└── sdk/
    ├── anthropic-sdk-adapter.ts
    ├── endpoint-registry.ts
    ├── key-vault.ts
    └── cost.ts
```

---

## 5. Endpoint registry

```typescript
export interface SDKEndpoint {
  id: string;
  label: string;
  provider: 'anthropic' | 'minimax' | 'deepseek' | 'custom';
  protocol: 'anthropic-compatible';
  baseURL: string;
  keyRef: string;
  defaultModel: string;
  modelAlias?: Record<string, string>;
  costProfile?: {
    inputPerMTok: number;
    outputPerMTok: number;
    cacheReadPerMTok?: number;
  };
  enabled: boolean;
}
```

Built-in endpoint templates:

- Anthropic official
- MiniMax Anthropic-compatible
- DeepSeek Anthropic-compatible
- Custom Anthropic-compatible

API keys are stored through system keychain, never in Markdown, prompt, logs, or `.orbit/config.json` plaintext.

---

## 6. Invocation router

```typescript
interface InvokeOptions {
  mode: 'task' | 'ask' | 'synthesis' | 'background';
  endpointHint?: string;
  modelHint?: string;
  budgetHint?: number;
  trace_id?: string;
}
```

Default route:

| mode | default track |
|---|---|
| `task` | Track A |
| `ask` | Track B |
| `synthesis` | Track B |
| `background` | Track B |

The router applies:

1. mode default
2. user settings
3. endpoint/model hint
4. capability requirement
5. budget pre-check
6. fallback rules

---

## 7. Ask-Anywhere

Ask-Anywhere is Orbit's universal agent surface, not an internal-only planning chat.

Design direction:

- The user should be able to ask for Orbit work, live web research, file inspection, model switching, and future external tool work from the same surface.
- Tool capability is model-independent. A model switch changes the reasoning model, not whether `orbit_web_search`, `orbit_web_fetch`, vault tools, or future browser/system tools exist.
- Track B is the default for interactive Ask-Anywhere because it gives low-latency streaming and structured tool_use loops.
- Track A remains the execution track for long-running, code-heavy, worktree/sandbox mutations, and workflows where an external CLI agent already provides a richer tool runtime.
- Ask-Anywhere may escalate or delegate to Track A, but it should not answer "I cannot do that" merely because the current model provider lacks a native tool.

Current Track B tool families:

- Orbit vault and workflow tools: `orbit_search`, `orbit_read`, task/project/resource/inbox/activity tools.
- Web tools: `orbit_web_search`, `orbit_web_fetch`, implemented in Orbit's tool layer so all Anthropic-compatible SDK endpoints can use live web access.
- Conversation runtime commands: `/model`, `/endpoint`, and related status/list commands for per-conversation routing hints.

Safety boundary:

- Read-only tools execute directly and are fully traced.
- Low-risk writes execute directly only when handlers whitelist fields and Activity/Journal records are written.
- High-risk destructive work, broad filesystem mutation, shell execution, browser automation, and external side effects must be introduced as explicit tool families with policy, consent, audit, and rollback design before being exposed.

---

## 8. Synthesis

Synthesis always uses Track B unless a particular synthesis kind requires filesystem/tool-heavy execution.

Examples:

- Daily Summary → Track B
- Resource emergence → Track B
- Feed digest → Track B
- Codebase architectural synthesis → maybe Track A, if it needs code search and tools

---

## 9. Fallback

SDK fallback rules are simpler than CLI fallback:

- auth failure → disable endpoint until user fixes key
- rate limit / quota → try next enabled endpoint with same protocol
- model unavailable → try model alias fallback
- parse failure → retry once with stricter format prompt
- budget exceeded → halt and emit Inbox/Activity event

No request-level retry loops beyond one parse retry.

---

## 10. Acceptance criteria

- Track A and B both emit unified AgentEvent.
- Anthropic official / MiniMax / DeepSeek endpoint templates exist.
- Ask-Anywhere can stream through SDK.
- Synthesis can call SDK and record provenance.
- Cost accounting works for SDK calls.
- Settings UI can manage SDK endpoints and keys without exposing secret values.
