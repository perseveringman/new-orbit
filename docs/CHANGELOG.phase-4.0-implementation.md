# Orbit Phase 4.0 Implementation Changelog

本文记录 2026-04-28 Phase 4.0 "Task Execution Lifecycle Realignment" 从 plan 落地到代码的实施结果、偏离、权衡与后续观察项。

## Implementation summary

Phase 4.0 按 `docs/plans/2026-04-28-task-execution-lifecycle-realignment.md` 的阶段顺序实施：

| Phase | Result |
| --- | --- |
| 4.0.0 | ADR-015 / ADR-016 accepted；新增 task/session reducer；`RunSegment.sessionStatus` 落地；核心 task status 迁移改为 reducer 驱动 |
| 4.0.1 | 新增 onboarding prompt builder、adapter prompt hook、首条消息审查事件；补齐 project/task CLI 查询与拆分建议入口 |
| 4.0.2 | ADR-012 追加修订；RuntimeAdapter 增加 `getSessionTranscript`；Claude transcript 读取；Switch Runtime 承接框架、continuation prompt 与 token 粗估落地 |
| 4.0.3 | Task Activity runtime 下拉、Inbox B3 快速切换、Kanban awaiting-user 图标 hook、CLI/IPC switch-runtime 入口落地 |
| 4.0.4 | 新增 LifecycleRunner、`orbit dev:lifecycle`、15 个 lifecycle scenario fixture、acceptance parser 与 local/nightly/weekly CI workflows |
| 4.0.5 | 更新 architecture、ROADMAP、plan checklist、ADR index 与 session state |

## Major deviations and trade-offs

1. **Lifecycle real-agent execution is framework-first**：按用户要求真实 lifecycle scenario 不 mock；当前实现默认验证 fixture/parser/CLI 并报告 `SKIP`，只有在具备 Orbit vault 与 vendor agent CLI 的机器设置 `ORBIT_LIFECYCLE_REAL=1` 后才进入真实执行路径。
2. **Switch Runtime compression is heuristic/local**：已实现 token 粗估和 50% context window 决策，但压缩注入目前用本地 summary builder，不在本轮直接调用低价 LLM。
3. **Codex / Copilot transcript remains stub**：接口已补齐并返回 `null`，跨 vendor 历史承接依赖 unified event / segment fallback；真实 vendor session 读取留给 adapter 完成期。
4. **Non-Claude runtime launch still gated**：Switch Runtime 框架、CLI、IPC、UI 均已存在；真实 Codex/Copilot execution 仍受现有 `startTask()` runtime gating 限制。
5. **Kanban awaiting-user icon depends on active segment data**：UI 已支持 `activeRunSegment.sessionStatus === "awaiting_user"` 的图标展示，但 task list 数据模型仍需后续把 active segment 聚合到卡片数据。

## Validation notes

- `npm run typecheck` 通过。
- `npm test` 通过。
- Phase 3 scenarios (`orbit dev:scenarios run --all`) 在 4.0.0 后通过。
- Lifecycle fixtures/parser/CLI smoke (`orbit dev:lifecycle run --all --concurrent 3`) 通过并按当前环境报告 `SKIP`。

## Follow-up items

1. 在具备真实 Claude/Codex/Copilot CLI 的本机 dog-food `ORBIT_LIFECYCLE_REAL=1 orbit dev:lifecycle run --all`，补齐真实 L01-L15 结果。
2. 接通 Codex / Copilot adapter 的真实 process lifecycle、event parsing 与 transcript lookup。
3. 将 Switch Runtime 的 summary compression 替换为可配置低价模型调用，并把压缩结果记录到 Activity/Event replay。
4. 将 active run segment 聚合进 Kanban task records，使 awaiting-user 图标稳定显示。
5. 用 onboarding warning 数据观察协议遵守率，决定是否升级为更强的启动 gate。
