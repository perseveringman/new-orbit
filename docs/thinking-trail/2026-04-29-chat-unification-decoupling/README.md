# Chat 统一规划 + 应用解耦方向讨论 — Thinking Trail

> **起点**：Phase 4.0 lifecycle 解耦代码落地后，进入 dog-food 观察期
> **触发**：用户提出"做应用内 chat 的统一规划"
> **真实命题**（经过 2 轮对话收敛）：以 chat 为契机，完成一次应用级架构解耦
> **状态**：进行中
> **起始日期**：2026-04-29

---

## 本次 Thinking Trail 的特殊性

这次和 2026-04-26 的 v2 方向确立有两点不同：

1. **不是零起点**：v2 方向已定、Phase 3/4.0 代码已落地、TraceableEvent / UnifiedAgentEvent / Runtime capabilities 已是既有事实
2. **是"骨架重整"而不是"功能扩张"**：核心主张是"架构必须先干净，才能长期迭代"，本次讨论成果可能**零代码增量**，但会决定后续所有功能如何接入

用户核心表态（第 2 轮对话）：

> "需要抽象出 chat 和 runtime agent 之间的逻辑，消息协议等等，需要业务无关，才能让这套逻辑在任何应用内的其他业务跑起来……Chat 只负责渲染出 agent 的对话、用户的对话，中间的各种时机抛出各种事件，业务应该由每一个业务的地方去完成……所有模块都解耦，这样才能长期稳定的迭代。这个阶段必须借助 chat 这个契机，把应用当前的架构给解耦到一个干净的地步。"

用户核心补充（第 3 轮对话）：

> "chat ↔ runtime 协议边界需要先调研下 Claude、Codex 这两个最多用户的 runtime 内有哪些协议需要被对应……TraceableEvent 升格为应用总线，这样整个应用的 replay 就更强大了……总线是日志式还是消息式需要讨论优缺点……解耦要从整个应用的所有功能来梳理，不能只盯着解耦，不然没有全局观……可以不做，但是就能知道架构应该先打成什么样。"

---

## 六阶段推进顺序

| 阶段 | 产出 | 状态 |
|------|------|------|
| 0. 全功能盘点（已有 + 未来） | `00-feature-landscape.md` | in_progress |
| 1. Claude/Codex Runtime 协议调研 | `01-runtime-protocol-survey.md` | pending |
| 2. 应用总线形态决策（日志式 vs 消息式） | `02-app-bus-design.md` + ADR 候选 | pending |
| 3. Chat ↔ Runtime 协议定稿 | `03-chat-runtime-protocol.md` + ADR 候选 | pending |
| 4. 用未来功能压测架构 | `04-architecture-stress-tests.md` | pending |
| 5. 现有代码迁移路径 | `05-migration-plan.md` | pending |
| 6. 验收标准 + ADR/plan 定稿 | 正式 ADR + 最终 plan | pending |

每阶段完成后追加到本 trail；讨论中 Agent 的观点、用户的反驳、关键 pivot 都记下来。结束后提炼成 `key-pivots.md` + `decisions-traced.md`。

---

## 文件清单

- `README.md` — 本文件，元信息与索引
- `conversation.md` — 原始对话记录
- `decisions-anchor.md` — **8 个核心决策锚点（D-1 ~ D-8）** ⭐

### 阶段产出

| 阶段 | 文件 | 状态 |
|------|------|------|
| 0 | `00-feature-landscape.md` — 全功能盘点 | ✅ |
| 1 | `01-runtime-protocol-survey.md` — Claude/Codex 协议调研 | ✅ |
| 2 | `02-app-bus-design.md` — AppBus 设计 | ✅ |
| 3 | `03-chat-runtime-protocol.md` — Chat ↔ Runtime 协议定稿 | ✅ |
| 4 | `04-architecture-stress-tests.md` — 5 个场景压测 | ✅ |
| 5 | `05-migration-plan.md` — 迁移路径（8 个 Phase） | ✅ |

### 正式 ADR（已写入 docs/decisions/）

- `ADR-014-chat-decoupling-conversation-first-class.md` — Chat 解耦与 Conversation 一等公民
- `ADR-015-ask-anywhere-as-planner-proxy.md` — Ask-Anywhere 作为规划者代理

---

## 与既有资产的关系

本次讨论会**引用 + 扩展**以下既有资产，不推翻：

- ADR-004（Inbox hub）→ Inbox 订阅总线事件的形态可能细化
- ADR-005（Stage View 通用模式）→ 本次讨论会把它从"UI 模式"升级到"Chat/Runtime/Bus 三层骨架"
- ADR-008（CLI-first）→ 不变
- ADR-011（Runtime 抽象贯通）→ 会被扩展到"Chat ↔ Runtime 双向协议"
- ADR-013（统一事件回放）→ 会被**升格为应用总线 ADR**
- ADR-015（状态机解耦）→ 本次是其方法论的延伸：把"状态机解耦"扩展到"模块解耦"
