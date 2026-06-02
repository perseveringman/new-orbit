# ADR-026 — Vision 是规范性 Layer-1 真相，与 Memory Synthesis 分离

**Date**: 2026-06-02
**Status**: draft
**Builds on**: ADR-018（Space as unified primitive）, ADR-023（Evidence-first Personal Memory）
**Related**: `docs/architecture/data-layering.md`, `docs/architecture/synthesis-layer.md`

## Context

随着 Personal Memory（ADR-023）落地，Memory 开始从对话、活动、agent session 等证据中抽取
`MemoryNode`，其 `MEMORY_KINDS` 中已包含 `goal`（见 `src/shared/memory/types.ts`）。

这引出一个边界问题：既然 Memory 能抽出 goal-like 的事实（"用户最近常提想做播客"），
那 **Vision 是否应该并入 Memory，作为一种高置信度记忆？** 还是应当保持为独立功能？

如果不澄清，会出现两种风险：

1. Vision 被降级为可重算、带 `confidence`、会 `stale` 的 Synthesis 产物——
   而 Vision 是被注入每个 agent system prompt 的"北极星"，是评判一切（drift、alignment、
   推荐任务）的**基准**。基准本身一旦可被 AI 自动改写或漂移，整个对齐体系失去锚点。
2. `MemoryKind='goal'` 与 `VisionGoal` 语义重叠，缺乏明确的流转规则，导致两套数据
   各自演进、互相污染。

## Decision

**Vision 保持为独立功能，是用户声明的规范性 Layer-1 真相；Memory 是 AI 抽取的描述性
Layer-2 Synthesis。二者分开存储，Memory 单向供给 Vision，不得反向定义或覆写 Vision。**

### 1. 分层归属

| | Vision | Memory |
|---|---|---|
| 数据本质 | `VisionGoal` / `VisionMilestone`，用户主动声明的目标层级（life/5y/1y/quarter） | `MemoryNode`，从证据抽取的事实（interest/preference/pattern/lesson/...） |
| 来源 | 人写（`create/update` 由用户输入） | AI 抽（`MemoryExtractionInput`，带 sources/confidence/evidence_count） |
| 分层 | **Layer 1 真相**（用户意志，无置信度概念） | **Layer 2 Synthesis**（可重算、provenance-bound、会 stale） |
| 方向 | 规范性 normative — "我**要去**哪" | 描述性 descriptive — "我**是**谁 / **做过**什么" |
| 生命周期 | 用户驱动：active/paused/completed/dropped | 系统驱动：volatile → stable → core（按证据自动演化） |

### 2. 两极张力是设计意图，不是冗余

Orbit 的智能来自这两极的**对照**：用 Memory（实际行为证据）对照 Vision（声明目标），
算出 `VisionDriftWarning`（neglect / overgrowth / inactivity）与 `VisionAlignmentMap`。
若合并为一，对照失去两个独立锚点，等于让"实际"定义"应该"，逻辑塌缩。

### 3. 收紧 `MemoryKind='goal'` 的语义

`MemoryKind='goal'` **只能作为"建议用户设立目标"的信号（suggestion）**，
永远不等同于 `VisionGoal`，不得自动写入 Vision store。

新增 promotion gate，与已有的 `promoteMemoryToProject` / `promoteMemoryToResource` 同构：

```text
Memory 抽出 goal-like 信号（Layer 2，带置信度）
        │
        ▼  promoteMemoryToVisionGoal（需用户确认）
   materialize 成 VisionGoal（进入 Layer 1，成为规范性真相）
        │
        ▼  发出 promote.memory_to_vision_goal TraceableEvent
```

promote 后，VisionGoal 不再携带 confidence / stale 语义；原 MemoryNode 保留作为该
goal 的证据来源（可在 alignment 计算中被引用）。

## Rationale

- 保住 `data-layering.md` 的核心铁律：**Synthesis 不是真相，不直接修改 Layer 1。**
- 北极星必须稳定、可被 system prompt 信任，不能继承 Memory 的自动演化与漂移属性。
- 复用既有 promotion gate 模式，无需引入新的流转范式；与 ADR-023 的 evidence/citation
  模型一致——Vision 可引用 Memory 作为对齐证据，但归属仍在 Layer 1。

## Consequences

Positive:
- Vision 作为评判基准的稳定性得到保证。
- drift / alignment 计算保有两个独立锚点。
- Memory 的 goal 信号有了明确、可审计的归宿。

Costs / Follow-ups:
- 需新增 `promoteMemoryToVisionGoal`（main + shared + IPC + Inbox 审批入口）。
- Memory recall 注入 agent context 时，需明确区分"已声明的 Vision"与"goal 信号"，
  避免 agent 把未确认的 goal 当作既定方向。
- UI 需在 Memory Explorer 暴露"提升为 Vision 目标"动作。

Open questions:
- `promote.memory_to_vision_goal` 是否复用现有 proposal 审批状态机（ADR-006）还是
  走轻量 quick-capture-action？倾向复用 proposal，保持单一审批面。
- 是否允许 Vision 反向"软提示"Memory 抽取（如围绕活跃 goal 优先抽取相关 pattern）？
  本 ADR 暂不决定，留待 alignment 实测后评估。

## Implementation

待排期。最小落地：`src/main/memory/` 增 promote 方法 + `src/shared/memory/types.ts`
增 `PromoteMemoryToVisionGoalResult`，并在 Inbox 增审批子类型。
