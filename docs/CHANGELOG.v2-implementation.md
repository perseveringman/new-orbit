# Orbit v2 Implementation Changelog

本文记录 2026-04-26 v2 设计从文档落地到代码的实施结果、偏离、权衡与后续观察项。

## Implementation summary

v2 按 `docs/plans/2026-04-26-execution-model-migration.md` 的阶段顺序实施：

| Phase | Result |
| --- | --- |
| 0 | 完成 `ExecutionContext` 抽象、Activity Log 基础设施、`orbit` CLI 脚手架 |
| 1 | 完成 task 授权 frontmatter / 迁移脚本，以及 Proposal 审批状态机 |
| 2 | 完成 Inbox v2 store / service / IPC / renderer shell 与 Proposal sync |
| 3 | 完成 `depends_on` 拓扑、循环检测、ready-set 与级联阻塞 |
| 4 | 完成 Auto-runner dispatcher / scheduler / settings / event bridge / CLI |
| 5 | 完成 Capture Feed / Library / Thoughts、Quick Capture、CLI 全量覆盖 |
| 6 | 删除 Night Shift 与 MCP runtime 路径，归档 v1 architecture，重写 v2 architecture |

## Major deviations and trade-offs

1. **Sandbox ExecutionContext remains unsupported**：ADR-003 只要求本期抽象出双轨接口；Sandbox 详细实现属于 open question / 后续迭代。当前实现会显式报错，不会静默 fallback。
2. **MCP was removed rather than kept as a runtime fallback**：ADR-008 选择 CLI-first。MCP 代码仍在 Git history 中，若观察期数据证明 CLI 准确度不足，可用独立 ADR 决定是否回补。
3. **24h soak cannot be represented as a unit test**：本轮实施已接入 Auto-runner status/event、Activity Log 与 Inbox 观测面；真实 24h soak 应在用户环境或 CI 长跑任务中记录。
4. **Capture UI remains foundation-level**：Feed / Library / Thoughts 后端、IPC 与 Quick Capture 已落地，但高级来源（手机 share、浏览器插件、voice log）仍在 open questions / 后续路线。
5. **Review Inbox scope narrowed**：Night Shift completed-task review 被移除后，旧 Review Inbox 只保留 terminal / agent permission request review；长期 Review 页面应基于 Activity Log 另建。

## Cleanup decisions

- Removed `src/main/night_shift/` and `tests/night_shift_dispatcher.test.ts`.
- Removed `src/mcp/`, `build:mcp`, packaged MCP extra resources, and MCP tests.
- Removed project `.mcp.json` auto-write and "Enable Orbit Tools" UI.
- Removed Night Shift renderer store, modal, top-bar pill, and history drawer.
- Replaced generated project skill guide `mcp-tools.md` with `orbit-cli.md`.

## Follow-up items

1. Add a dedicated long-running Auto-runner soak workflow if this repository gains CI support for Electron background tasks.
2. Build a first-class Activity Log review timeline UI.
3. Decide Sandbox ExecutionContext implementation scope with a new ADR or plan.
4. Expand Capture beyond the MVP sources only after Feed / Library / Thoughts usage data is available.
5. Revisit MCP only if CLI-first observation data shows agent command accuracy problems.

---

## Phase 3 implementation addendum

Phase 3 ("Agent Observability & Resilience") was implemented after v2 to turn the orchestration
foundation into an observable, resumable execution experience.

| Phase | Result |
| --- | --- |
| 3.0 | Added Agent Playground scenario fixtures, `orbit dev:scenarios`, `orbit dev:golden`, golden files and three-layer run recording |
| 3.1 | Added `UnifiedAgentEvent`, RuntimeAdapter interfaces, Claude adapter and Codex/Copilot stubs, with legacy `AgentEvent` compatibility |
| 3.2 | Changed task Chat to Activity and added timeline cards for message/thinking/tool/cost/error/done events |
| 3.3 | Added task-session resume via `RunSegment.vendorSessionId`, active-run `agent:sendMessage`, fallback rules and budget/stale settings |
| 3.4 | Added TraceableEvent replay store, global event bus, Activity/Agent/Inbox/IPC source bridge, Developer Console and run replay files |
| 3.5 | Rebuilt Dashboard as five quadrants: pending actions, agent status, knowledge growth, thinking trail and system health |

### Phase 3 deviations and trade-offs

1. **Codex / Copilot are adapter stubs, not full production runtimes**：Phase 3 established the adapter seam and capability declarations, but real non-Claude process/event semantics still need vendor-specific implementation.
2. **Fallback rules are foundation-first**：Budget/stale/runtime-priority rules are typed and tested, but live production fallback across real non-Claude runtimes remains gated by adapter completion.
3. **Streaming Markdown is incremental but lightweight**：Timeline rendering avoids the pure-text-to-formatted jump, but it is not a full CommonMark streaming parser.
4. **Event replay uses pragmatic IPC tracing**：Activity, Agent, Inbox and selected IPC events are on the unified bus; wrapping every existing IPC handler remains a possible hardening step.
5. **Dog-food cannot be completed inside the implementation session**：Automated gates are green, but the requested 2-4 day real dog-food observation must happen after this code runs in daily use.

### Phase 3 follow-up items

1. Complete real Codex / Copilot adapter event parsing and process lifecycle support.
2. Wire fallback execution through non-Claude runtimes once adapters are production-ready.
3. Add export/time-range/virtualized playback refinements to Developer Console if event volume grows.
4. Add an automated long-running dog-food/soak workflow for Auto-runner and event replay.
