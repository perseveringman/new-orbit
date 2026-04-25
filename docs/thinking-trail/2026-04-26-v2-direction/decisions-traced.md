# Decisions Traced — ADR 溯源到对话

> 10 份 ADR 和 8 份 plan 在 2026-04-26 对话中的形成过程。每条条目给出：决策在对话中**何时开始讨论**、**关键对话节点**、**最终拍板**的位置。

对话的完整原文见 [`conversation.md`](./conversation.md)。本文的 "Round N" 指 conversation.md 中按编号标注的轮次。

---

## ADR-001 — 废弃 Night Shift，转向 24×7 Auto-runner

| 阶段 | 轮次 | 关键对话 |
|------|------|---------|
| **首次触发** | Round 3 | 用户明确说 "Night Shift 应该废弃掉" |
| **深入探讨** | Round 4-8 | 讨论 Agent 自主边界、人机分工 |
| **替代方向定型** | Round 9-12 | Auto-runner 概念成型 |
| **最终拍板** | Round 20 | 用户确认方案 + 同意实施顺序 |

**关键洞察**：用户主动澄清"对 agent 的理解有偏差"是决定性瞬间。AI 一开始是"要不要在 Night Shift 上做增强"，用户直接推翻整个前提。

→ [ADR-001](../../decisions/ADR-001-deprecate-night-shift.md)

---

## ADR-002 — Agent 自主边界，子任务折叠进主任务

| 阶段 | 轮次 | 关键对话 |
|------|------|---------|
| **首次触发** | Round 6 | 讨论 agent 自主权边界 |
| **关键澄清** | Round 10 | 用户提出 "看板不是工作日志" |
| **方案确立** | Round 11 | 子任务折叠到 Execution Log 而不是独立 task |
| **propose 例外** | Round 12 | 保留少数"有独立价值"场景走 propose |
| **最终拍板** | Round 20 | 一起确认 |

**关键洞察**：用户说 "Agent 开子任务，这个我有新的想法，如果他要开很多子任务的话，实际上不如就在这个主 Agent 里面全部完成" — 这是设计哲学的转折点。

→ [ADR-002](../../decisions/ADR-002-agent-autonomy-scope.md)

---

## ADR-003 — ExecutionContext 分化，Worktree + Sandbox 双轨

| 阶段 | 轮次 | 关键对话 |
|------|------|---------|
| **首次触发** | Round 14 | 讨论 worktree 对非代码项目的适配问题 |
| **关键纠正** | Round 15 | 用户："有 .git 不代表是代码项目，有可能只是用 .git 来管理" |
| **判定信号重新设计** | Round 16 | 改为以"是否需要 build/test"判定 |
| **抽象层引入** | Round 17 | ExecutionContext 接口分化为 Worktree + Sandbox |
| **Sandbox 留待下期** | Round 18 | 抽象本期落地，Sandbox 详细设计下期 |

**关键洞察**：用户轻飘飘的一句"有 .git 不代表是代码项目"推翻了 AI 的整个判定逻辑。这是 Pivot 2（见 key-pivots.md）。

→ [ADR-003](../../decisions/ADR-003-execution-context-split.md)

---

## ADR-004 — Inbox 作为人机协作统一枢纽

| 阶段 | 轮次 | 关键对话 |
|------|------|---------|
| **首次触发** | Round 21 | 讨论审批事件如何累积 |
| **架构雏形** | Round 22-25 | 左列表 + 右舞台 + Capture/Messages 分层 |
| **BASB 定位介入** | Round 26 | 用户引入 BASB，Inbox 扩展为 Capture + Messages |
| **双通道同步** | Round 23-24 | chat 原地 + Inbox 副本同步 |
| **最终拍板** | Round 30 | 完整架构确认 |

**关键洞察**：用户说 "实际上，Inbox 里面应该基本可以处理所有的消息... chat 其实就可以直接放在内容区" — 让 Inbox 从"审批中心"升格为"通用舞台"。

→ [ADR-004](../../decisions/ADR-004-inbox-as-hub.md)

---

## ADR-005 — Plan Chat 定位修正，通用 chat + 产物舞台

| 阶段 | 轮次 | 关键对话 |
|------|------|---------|
| **首次触发** | Round 22 | 讨论 Plan Chat 和 Inbox 右侧舞台的关系 |
| **发现通用模式** | Round 23 | AI 识别 Planner / Task Conversation / Inbox 共享抽象 |
| **明确不重构 v1** | Round 24 | 新 feature 采用 Stage View，旧 Planner 保留 |

**关键洞察**：用户在讨论 Inbox 时说 "chat 其实就可以直接放在内容区" — 让 AI 意识到 "Plan Chat" 和 "Inbox 右侧" 本质是同一个抽象。

→ [ADR-005](../../decisions/ADR-005-plan-chat-reframing.md)

---

## ADR-006 — 任务授权模型，propose-approve 两阶段

| 阶段 | 轮次 | 关键对话 |
|------|------|---------|
| **首次触发** | Round 13 | 讨论 agent 能否擅自 create_task |
| **明确审批原则** | Round 14 | "Agent 调用 create_task 之前需要主动告诉用户" |
| **授权链路字段** | Round 16 | 设计 created_by / approved_by / proposed_during_task 等字段 |
| **审批是 chat 基建** | Round 18 | 用户："能不能直接在 chat 页面也加这个审批能力" |
| **双通道同步** | Round 19 | chat 卡片 + Inbox 条目共享 proposal_id |
| **最终拍板** | Round 20 | 方案 B（工具内建审批）+ chat 原地 + Inbox 副本 |

**关键洞察**：用户的"人主动拆分的任务"定义 — "不一定是人手动添加任务，也可以是人允许 AI 按照 AI 的方式去添加" — 确立了授权可以是批准 proposal 而不只是手动创建。

→ [ADR-006](../../decisions/ADR-006-task-authorization-model.md)

---

## ADR-007 — 任务依赖模型，depends_on + 拓扑解锁

| 阶段 | 轮次 | 关键对话 |
|------|------|---------|
| **首次触发** | Round 17 | Auto-runner 需要处理任务顺序 |
| **方案选择** | Round 19 | 用户选"方案 A"（不改状态机，独立字段） |
| **边界策略** | Round 19-20 | 循环检测 / 依赖被删 / 卡住警示 / 不支持跨项目 |
| **衍生 vs 依赖区分** | Round 20 | 用户："衍生关系没有问题，看板内的任务都是独立的，但能看出衍生关系就够了" |

**关键洞察**：用户明确要求 Task editor / Planner publish 时做循环依赖检测 — 把检测放在入口而不是运行时，避免"保存成功但 agent 卡住"的迷惑行为。

→ [ADR-007](../../decisions/ADR-007-task-dependency-model.md)

---

## ADR-008 — AI-Native 原则与 CLI-first 迁移

| 阶段 | 轮次 | 关键对话 |
|------|------|---------|
| **AI-Native 原则首次提出** | Round 28 | 用户："这个应用里面尽量所有的能力都可以让 AI 去做" |
| **MCP 膨胀问题** | Round 29 | AI 分析 30+ MCP 工具的 token 开销 |
| **CLI 初步方案** | Round 29 | 混合方案：CLI 主打 CRUD，MCP 保留流程控制 |
| **关键纠正** | Round 30 | 用户："你的取舍应该只考虑 Agent，而不需要考虑用户" |
| **纯 CLI 定型** | Round 31 | AI 撤回"用户心智一致"伪论点，认可纯 CLI |
| **最终拍板** | Round 32 | 用户："完全废弃，能力全部迁移到 CLI。后续观察..." |

**关键洞察**：这是 Pivot 5（见 key-pivots.md）。AI 的混合方案被用户"只考虑 agent"一句话推翻。之前几轮 AI 自己引入的"用户和 AI 共享 CLI 心智"是噪音，撤掉后决策立刻锋利。

→ [ADR-008](../../decisions/ADR-008-ai-native-cli-first.md)

---

## ADR-009 — Activity Log 系统级用户行为留痕

| 阶段 | 轮次 | 关键对话 |
|------|------|---------|
| **首次触发** | Round 30 | 用户补充："操作记录实际上我是希望能够作为用户每天的留痕" |
| **BASB 方法论关联** | Round 30 | Activity Log 是 Progressive Summarization 的数据基础 |
| **本期实施决定** | Round 32 | 用户："Activity Log 本期一起实施" |
| **Review UI 延后** | Round 30 | 基础设施本期，UI 下期 |

**关键洞察**：用户从"要做 review 页面"引出"需要系统级留痕"，这其实是把一个 UI 需求**升级为一个基础设施需求**。这种从"功能"到"基础设施"的跃升是成熟产品设计的标志。

→ [ADR-009](../../decisions/ADR-009-activity-log-infrastructure.md)

---

## ADR-010 — Capture 三分，Feed / Library / Thoughts

| 阶段 | 轮次 | 关键对话 |
|------|------|---------|
| **BASB 定位引入** | Round 26 | 用户："这整体是基于 BASB 的" |
| **初步三分法** | Round 27 | 最初提出 Feed / Library / Thoughts |
| **Feed vs Library 详述** | Round 28 | 用户澄清 Feed 低信号 / Library 高信号 |
| **Thoughts 单独一类** | Round 29 | 用户："灵感笔记确实应该单独一类" |
| **Feed History 独立** | Round 30 | 用户："Feed 归档不应该和其他内容放到一个 archive view 里" |
| **Promote to Resource** | Round 28 | Library → 03_Resources 的连接 |
| **Quick Capture 最小版** | Round 31 | 本期只做 Thought，其他延后 |
| **最终拍板** | Round 32 | 全部确认 |

**关键洞察**：用户提出 Feed vs Library 的信号浓度区分是**重大进步**——BASB 原著其实没有 Feed 这个概念，用户在适配到 Orbit 时扩展了 BASB 方法论本身。

→ [ADR-010](../../decisions/ADR-010-capture-tri-partition.md)

---

## 8 份 plan 的来源

每份 plan 对应 1 份或多份 ADR，是 ADR 在对话中确立后才展开的实施方案：

| Plan | 对应 ADR | 在对话中展开时机 |
|------|---------|------------------|
| `execution-model-migration.md` | 001/002/003/006/007 | 总览，写 ADR 时整理出的"实施顺序" |
| `auto-runner-dispatcher.md` | 001/002/006 | 对话中讨论 Auto-runner 实现细节时的笔记 |
| `task-dependency-system.md` | 007 | 对话中"方案 A"决定后的细节展开 |
| `inbox-v2-architecture.md` | 004/005 | Inbox 设计几乎全部在对话 Round 22-30 展开 |
| `capture-foundation.md` | 010 | Capture 分三类之后的详细落地 |
| `activity-log-infrastructure.md` | 009 | Round 30 讨论后的技术设计 |
| `cli-migration.md` | 008 | Round 32 后新写的详细方案 |
| `quick-capture-mvp.md` | 004/010 | Capture 讨论中确定"本期只做 Thought"后的最小实现 |

---

## 对话结构观察

这次对话的产出速度之所以高，有几个结构上的特点：

1. **先高层后细节**：前 10 轮几乎全在确立"价值观"，20 轮后才进入"细节"
2. **不一次性问太多**：AI 每轮只问 1-3 个开放问题，避免信息过载
3. **用户反复给"一句话定性"**：每轮用户回复都简短但尖锐，很多决策一句话就定
4. **共识清单持续累积**：AI 每轮末尾维护"共识条目编号"，对话结束时已累积到 40+ 条，直接变成 ADR/plan 的素材

这个结构未来可以作为 Orbit **Thinking Trail 子系统**的参考模板：
- 原始对话完整保留
- 共识清单定期浓缩
- 关键 pivot 主动识别
- 最终决策从清单映射到 ADR
