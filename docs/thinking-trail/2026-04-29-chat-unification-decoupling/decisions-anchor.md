# 核心决策锚点（持续更新）

> **用途**：本次 6 阶段讨论中，用户明确拍板的战略决策按编号沉淀于此。
> 后续阶段 1-5 的所有设计都必须可追溯到这些锚点。
> 任何与这些决策冲突的方案，必须显式记录为"违背 D-X"并给出理由。
>
> **等同于浓缩版 ADR 候选集**—— 本次讨论结束后可能会被提炼成 2~3 份正式 ADR。

---

## D-1 · Agent 层"规划者/执行者"二层结构

**决策**：

用户日常只和 **Ask-Anywhere** 对话，Ask-Anywhere 代用户做**规划**；项目 / Area / 定时任务等位置**各自配置自己的 Role Agents** 作为**执行者**。

**语义锚点**：

> "用户是规划者，执行者是各个 Roles" — 这是 Orbit Agent 层的元语义。

**拒绝的替代方案**：

- 扁平多 Agent + 显式 Intent Router（心智复杂）
- Ask-Anywhere 一切包揽，Role Agents 也消失（丧失专业化 prompt 优势）

**影响模块**：agent/ / orchestration/planner / roles / dispatch / auto_runner

---

## D-2 · Planner Agent 作为独立概念退役

**决策**：

`ProjectPlannerView` + 独立 Planner Agent 的设计**作为独立实体退役**。规划能力由 Ask-Anywhere 承担。Planner 的 proposal canvas 不消失，但作为 Ask-Anywhere 对话的 **Stage View 产物**存在。

**相关**：ADR-005（部分 supersede）、OQ-13（此决策即其答案）

**迁移路径（本次不做，阶段 5 规划）**：

- `ProjectPlannerView` 代码**冻结**一段时间，等 Ask-Anywhere 落地后逐步下线
- `planner_agent.ts` 的 prompt 作为 **Ask-Anywhere skill** 重新打包
- Proposal canvas 组件提取为独立 `<StageProposalCanvas>`，可被 Ask-Anywhere 对话调用渲染

---

## D-3 · Channel 只对接 Ask-Anywhere

**决策**：

所有外部 Channel（Telegram / WhatsApp / Email / iOS Node / ...）**入站消息统一路由到 Ask-Anywhere**。不在 Channel 层做业务路由。意图识别交给 Ask-Anywhere 自己（它就是 LLM）。

**推论**：

- 没有 "Intent Router" 这种中间件
- Gateway 只做消息桥接，不碰业务语义
- 业务模块**完全不感知 Channel 存在**

**拒绝的替代方案**：

- Channel → 专用 Agent 直连（规则复杂、路由难写、用户心智碎片）
- Channel → 业务层 webhook（把 Channel 逻辑污染到业务代码）

---

## D-4 · Gateway 独立 Daemon，不做混合部署

**决策**：

Gateway 采用 **openclaw 路线**：独立 launchd/systemd 用户服务，和 Orbit Electron 主进程解耦。**不做嵌入式 fallback**。

**取舍**：

- 代价：用户要执行 `orbit daemon install`，有额外安装步骤
- 收益：代码只维护一套；Orbit.app 关着也能收外部消息；远程操作是一等公民

**拒绝的替代方案**：

- 嵌入 Electron 主进程（Orbit 不开就收不到消息）
- 分层混合方案（两套代码太复杂）

**待阶段 4 回答的细节**：

- Orbit.app 没开时，Gateway 收到消息能否"唤醒" Orbit？
- Gateway 能否在 Orbit 未开时独立跑一个精简版 Ask-Anywhere 临时回复？（降级）
- 还是就让消息排队，等 Orbit 开了再处理？

---

## D-5 · Conversation 升格为一等公民

**决策**：

`Conversation` 是 Orbit 的**一等实体**，和 Task / Project / Inbox Item 同级。所有对话场景（Task Chat / Inbox Help / Planner / Ask-Anywhere / Channel Thread）都是 Conversation 的 anchor。

**数据模型草案**（阶段 3 细化）：

```
Conversation {
  id: string
  anchors: Array<{
    kind: 'task' | 'inbox_item' | 'ask_anywhere_session' | 'channel_thread' | 'capture_item' | ...
    ref_id: string
  }>
  turns: ConversationTurn[]
  segments: RunSegment[]   // 一个对话可能有多段 runtime 执行
  metadata: { created_at, updated_at, title, status, runtime_hint, ... }
}
```

**存储路径草案**：

```
<vault>/.orbit/conversations/<conv-id>.ndjson
```

**拒绝的替代方案**：

- 每个场景各自的 Conversation 数据 + UI 层聚合（跨对话搜索 / 迁移 / Thinking Trail 自动化无法实现）

**推论**：

- "统一对话中心"（左栏一级入口 / 悬浮球）直接映射为 Conversation list view
- 一个 Conversation 可以有多个 anchor（比如 Ask-Anywhere 聊着聊着决定"立项"，该 Conversation 被加上 anchor to newly-created task）
- Thinking Trail 自动化的数据基础就位

---

## D-6 · "各地方自己配置自己的 auto agent"

**决策**：

业务模块**自带 worker**，彼此间只通过 CLI / AppBus event 通信。

具体形态：

- **Project**：配置自己的 Role Agents（已有）
- **Area**：配置自己的 Reviewer Agent（Area Room 雏形已有）
- **Capture**：可配置自动 summarize / tag agent（未来）
- **Scheduled Task**：每个定时任务声明自己用哪个 runtime（未来）
- **Ask-Anywhere**：作为"规划者"，不承担执行 worker 的角色

**含义**：解耦从目标变成结果，模块间零直接耦合。

---

## D-7 · 用户心智锁定：规划者 vs 执行者

**决策（语义层的元锚点）**：

> **用户 = 规划者（自己 + Ask-Anywhere 代理）**
> **Roles = 执行者（专业化的后台 worker）**

所有设计取舍，当在"谁来做这件事"上纠结时，回到这个语义：

- 做规划类工作（创建项目 / 拆任务 / 分析安排）→ 规划者
- 做执行类工作（跑代码 / 写文档 / 做研究）→ 执行者

这条元锚点决定 Agent 层如何分工，不随场景变化。

---

## 核心决策引发的"新挑战"（不是决策，是要回答的开放问题）

| 挑战 | 归属阶段 |
|------|---------|
| Ask-Anywhere Prompt / Context 膨胀风险（skills / compact / context retrieval） | 阶段 3 + Ask-Anywhere 落地实施 |
| Gateway Daemon 安装 UX | 阶段 4 压测 |
| 既有 Planner 代码命运（冻结 / 迁移 / 删除） | 阶段 5 迁移 |
| Ask-Anywhere 规划质量要不低于原 Planner Agent | Ask-Anywhere 落地实施 |
| Ask-Anywhere 没开 Orbit 时 Gateway 怎么处理入站 | 阶段 4 压测 |
| Conversation 数据模型的版本迁移（现有 TaskConversation 怎么搬） | 阶段 5 迁移 |

---

## 与既有 ADR 的关系摘要

| 既有资产 | 本次决策的影响 |
|---------|--------------|
| ADR-005（Plan Chat reframing） | **D-2 部分 supersede**——Planner 不是"Stage View 的一个实例"，而是退役 |
| ADR-008（AI-Native + CLI-first） | **D-1/D-6 强化**——CLI 是 AI 的接口，Ask-Anywhere 第一次真正用上 |
| ADR-011（Runtime 抽象贯通） | **D-1 间接扩展**——Ask-Anywhere 是一种特殊 runtime user |
| ADR-004（Inbox 枢纽） | **D-5 间接影响**——Inbox 内联 chat 变成 Conversation + anchor |
| OQ-13（Stage View 完整化） | **D-2 回答**——Planner 不重构，退役 |
| OQ-4（Quick Capture 扩展） | **D-3 间接影响**——Channel 变成 Quick Capture 的一种形态 |


---

## D-8 · 架构先行，跑通后说

**决策**：

本次讨论优先**完成 6 阶段架构规划**（盘点 → 协议调研 → 总线设计 → Chat 协议 → 压测 → 迁移路径 → ADR），产出可执行方案。

"任务全流程跑通一次"作为后续落地阶段的验收标准，**不在本次讨论期间强制完成**。

**取舍**：

- 代价：本次讨论结束时可能仍没有真实跑通过一次（缺乏真实数据验证）
- 收益：避免"跑通"和"架构想清楚"两件事互相阻塞；先把架构想清楚，再做增量验证

**后续可选动作**：

- 阶段 4 压测可以用 **dry-run / trace replay** 方式做模拟验证
- 架构定稿后，用户自己手动跑通一次，对账模拟结果
