# 文档模板

所有产出文档的标准结构。写入时严格按这些模板，保证跨项目一致性。

## overview.md

```markdown
# {Project Name}

> 一句话定位：{one-liner}
>
> 最近更新：{date} · 当前 MVP 阶段：{phase}

## 1. 愿景与动机

### 要解决的问题
{具体问题描述}

### 为什么现有方案不够
{对比分析}

### 个人动机
{为什么你做}

### 成功标准
- 定性：{...}
- 定量：{具体指标}

### 预见的失败模式
{最可能失败的原因}

## 2. 目标用户与场景

### 首要用户画像
- **典型用户**：{职业、生活状态、当前工具}
- **典型场景**：{时间、地点、前置动作、情绪}
- **当前处理方式**：{现在怎么做这件事}

### 次要用户（Post-MVP）
{简述}

### 明确不服务
{谁不是目标用户}

## 3. 价值主张与差异化

### 对标物
| 对标 | 相似点 | 差异 |
|------|--------|------|
| X | ... | ... |
| Y | ... | ... |
| Z | ... | ... |

### 差异化点
1. {...}
2. {...}

### Aha Moment
用户第一次感到"这东西有用"的那一刻：{描述}

### 护城河
{被抄袭后还剩什么}

## 4. 核心用户流程

### 首次使用（Onboarding）
{流程图或有序步骤}

### 常规使用
{流程图或有序步骤}

### 异常/中断分支
- {分支 1}
- {分支 2}

## 5. 模块列表

| 模块 | 定位 | 详细文档 |
|------|------|----------|
| {name-1} | 一行描述 | `features/{name-1}.md` |
| {name-2} | 一行描述 | `features/{name-2}.md` |
| ... | ... | ... |

## 6. 跨模块关切

### 数据模型概览
{顶层 entities 和关系}

### 权限模型
{规则}

### 状态管理
{全局 / 跨模块状态的方案}

### 事件与通知
{事件总线 / 直接调用 / polling 的选择}

### 错误处理统一规则
{...}

### 可观测性
{log / metric / trace 方案}

## 7. MVP 与 Roadmap

### MVP 范围（必须做）
1. {...}
2. {...}
3. {...}

### MVP 不做清单
- {...}
- {...}

### MVP 成功指标
- 定量：{具体数字}
- 时间预期：{周数}

### Post-MVP Roadmap
- **v2**：{方向}
- **v3**：{方向}

### 破产砍功能顺序
1. 最先砍：{...}
2. 次砍：{...}

## 8. Top 风险

| 风险 | 类别 | 严重度 | 缓解策略 |
|------|------|--------|----------|
| R1 | 技术/产品/资源/时间/依赖 | 高/中/低 | ... |

## 9. 相关文档

- [Open Questions](./open-questions.md)
- [Changelog](./changelog.md)
- [Decisions](./decisions/)
```

---

## features/{name}.md

```markdown
# Feature: {Name}

> **模块定位**：{一句话}
>
> **关联模块**：{name-a, name-b}
>
> **状态**：draft / confirmed / in-build / shipped

---

## Part A — 产品设计

### A.1 核心动作
| # | 动作 | 输入 | 输出 | 触发时机 |
|---|------|------|------|----------|
| 1 | ... | ... | ... | ... |

### A.2 状态模型
{如有状态机，用 mermaid 或文字描述}

状态迁移规则：
- {from-state} → {to-state}：当 {条件}

### A.3 交互流程
用户视角的端到端流程：
1. ...
2. ...

与其他模块的交互：
- 调用 {module-a} 的 {接口}，场景：{...}
- 被 {module-b} 调用，场景：{...}

### A.4 异常与失败体验
- {场景}：{用户看到什么}
- {场景}：{用户看到什么}

### A.5 边界（这个模块不做什么）
- 不做 {...}
- 不做 {...}

---

## Part B — 技术架构

### B.1 数据模型
```
{Entity}
├── field: type  # 说明
├── ...
```

索引/查询模式：{...}

### B.2 运行位置
- **前端**：{...}
- **后端**：{...}
- **Agent/Worker**：{...}
- **外部服务**：{...}

### B.3 实时性要求
- {哪些需要实时}：{方案：websocket / subscription / polling}
- {哪些可以批量}：{...}

### B.4 依赖
- 内部：{其他模块/服务}
- 外部：{API / 模型 / SDK}

### B.5 选型对比
| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| A | ... | ... | ✅ 选 |
| B | ... | ... | ❌ |
| C | ... | ... | ❌ |

**决策理由**：{为什么选 A}

如果该决策足够重大，额外写入 `decisions/ADR-NNN-{title}.md`。

### B.6 性能与规模
- 预期规模：{并发用户 / QPS / 数据量}
- 瓶颈预测：{哪里会先扛不住}
- 扩展策略：{...}

### B.7 扩展点预留
- {预留钩子 1}
- {预留钩子 2}

---

## C. 未决问题

- Q1: {...}（已同步到 open-questions.md）
- Q2: ...
```

---

## decisions/ADR-NNN-{title}.md

```markdown
# ADR-{NNN}: {Title}

- **Date**: {YYYY-MM-DD}
- **Status**: proposed / accepted / superseded-by-ADR-XXX
- **Mode**: bootstrap / onboard / evolve

## Context
{背景：为什么要做这个决策，当时遇到了什么}

## Options Considered
1. **Option A**: {...}
   - Pros: ...
   - Cons: ...
2. **Option B**: {...}
   - Pros: ...
   - Cons: ...

## Decision
{选了哪个}

## Rationale
{为什么这样选，关键考量是什么}

## Consequences
- **正面**：{...}
- **负面/trade-off**：{...}
- **回退计划**：如果这个决策错了，怎么撤销或补救

## Affected Documents
- overview.md §{section}
- features/{name}.md §{section}
```

**编号规则**：按时间递增，ADR-001, ADR-002, ... 不复用编号，被废弃的 ADR status 改为 superseded-by-ADR-XXX。

---

## changelog.md

```markdown
# Changelog

倒序记录，最新在上。每次 Evolve 会话结束追加。

## {YYYY-MM-DD}
**Mode**: evolve · **Session**: {brief}

- 变更: {什么变了}
- 影响文档: {列表}
- 相关 ADR: ADR-{NNN}（如有）

## {YYYY-MM-DD}
**Mode**: onboard · **Session**: baseline

- Project onboarded from {source}
- Baseline documented (see ADR-001-onboard-baseline)
- {N} features identified

## {YYYY-MM-DD}
**Mode**: bootstrap · **Session**: initial

- Project brainstorm initiated
- Vision and target users defined
- {N} modules identified
```

---

## open-questions.md

```markdown
# Open Questions

悬而未决的问题清单。每条含：问题描述、类型、建议时点、状态。

## 🔴 Build 前必须解决

### Q1. {问题标题}
- **描述**: {详细问题}
- **来源**: {Phase X / Session YYYY-MM-DD}
- **阻塞**: {不解决会影响什么}
- **状态**: open / in-discussion / resolved-by-ADR-XXX

## 🟡 可边做边定

### Q2. ...

## 🟢 长期探索

### Q3. ...

---

## 已解决（Archive）

### Q0. {历史问题}
- **解决方式**: {...}
- **解决于**: {date}，见 ADR-XXX
```

---

## .session.json

```json
{
  "project_name": "ai-native-workspace",
  "mode": "bootstrap",
  "current_phase": "phase-6-module-deep-dive",
  "current_sub_topic": "inbox module technical architecture",
  "phases_covered": ["phase-1", "phase-2", "phase-3", "phase-4", "phase-5"],
  "checklist_status": {
    "phase-1": "complete",
    "phase-2": "complete",
    "phase-3": "complete",
    "phase-4": "complete",
    "phase-5": "complete",
    "phase-6": "in-progress"
  },
  "features_identified": ["onboarding", "inbox", "project-hub", "task-executor", "reading-notes"],
  "features_drafted": ["onboarding", "project-hub"],
  "pending_questions": [
    {"id": "Q1", "topic": "Agent 认领任务的冲突处理策略", "priority": "must-resolve"}
  ],
  "last_session_summary": "讨论了 inbox 的状态模型和通知路由，技术选型候选到 pg LISTEN/NOTIFY vs Redis Streams",
  "next_suggested_topic": "敲定 inbox 的推送机制选型",
  "created_at": "2026-04-20T10:00:00Z",
  "last_updated": "2026-04-25T15:30:00Z"
}
```

**字段职责**：
- `mode`：当前模式，决定下次启动走哪个流程
- `current_phase`：Bootstrap 阶段 / evolve 的具体话题
- `phases_covered` + `checklist_status`：完整性追踪
- `features_identified` vs `features_drafted`：已识别但未细化的 vs 已写完 feature 文档的
- `pending_questions`：open-questions 的指针（摘要形式）
- `last_session_summary` + `next_suggested_topic`：下次启动的"上次聊到哪了"提示
