# ADR-018: Space as the unified data primitive (UI keeps three entries)

> **Status**: accepted · 2026-05-09
> **Related**: ADR-003 (execution context split), ADR-004 (inbox as hub), ADR-008 (ai-native cli-first), ADR-014 (chat decoupling / conversation first-class), ADR-016 (agent onboarding protocol)
> **Architecture ref**: `docs/architecture/space-unified-model.md`

---

## Context

Orbit 基于 PARA 方法论，实体层有三个"研究空间类"一等公民：**Project** / **Area** / **Resource**。截至 2026-05-09，这三者各自有一套独立的 view、store、IPC、目录结构、AI 上下文构建逻辑。

随着 v3 日常主链路收敛，观察到：

1. **用户对它们的使用模式高度一致**：打开一个空间 → 看信息 → 看任务 → 看素材 → 看产出 → 跟 AI 对话。三者在交互上的差别只是"时间结构"（有限期 / 长期责任 / 间歇兴趣）。
2. **能力需求相同**：Area / Resource 也需要 Kanban（周期任务、探索任务）、Materials（领域常备资料、主题参考库）、Outputs（领域产出履历、主题研究结晶），当前实现里它们几乎没有。
3. **关联操作跨类**：从 Library / Feeds 关联到 "某个 space" 不应该先按类分叉——一条埃及历史文章可以同时关联到 Project（埃及 vlog）、Area（内容创作）、Resource（埃及历史）。
4. **AI context 构建三套各异**：AI 在 Project 里能看到完整上下文，在 Area/Resource 里能看到的字段残缺。用户同一个需求"帮我基于这个空间写点东西"在三种 space 里体验不一致。
5. **代码重复**：三套 Room view 合计 80+ KB，大量重复。Materials 方案如果按"Project 独有"落地，Area / Resource 未来要再做两遍。

方法论上：PARA 是分类法，不是类型系统。Tiago Forte 的原意是"**按可执行性分类**"，而不是"这三者是三种不同的东西"。他自己说 P/A/R 之间可以自由流动（项目变领域、领域派生项目、资源沉淀为领域知识）。这意味着它们**本质上是同一种东西在不同时间结构下的呈现**。

---

## Decision

**把 Project / Area / Resource 在数据层统一为 `Space` 原语，在 UI 层保留三个独立入口。**

具体含义：

### 数据层（Space 统一）

- 引入 `SpaceType = 'project' | 'area' | 'resource'`，作为 frontmatter 和 config 的字段
- 统一 schema：identity、lifecycle、relations、tags 等共享字段 + 少量 type-specific optional 字段
- 统一目录内部结构：所有 space 都有 `tasks/` / `assets/` / `outputs/` / `.orbit/`
- 统一 IPC / CLI：`orbit space ...` 命令族，旧 `orbit project` / `orbit area` 作为 alias delegate
- 统一 AI context 接口：`orbit space context <id>` 返回标准 bundle
- 统一关系图：所有 cross-space / cross-entity 关系走同一张图（`linked_from` / `primary_area` / `distilled_to` 等边）

### UI 层（三入口保留）

- 顶层 nav 继续分 Projects / Areas / Resources 三个入口，**不合并**
- 三入口的列表视图用同一个 `SpaceListView` 组件，通过 config（`SPACE_UI_CONFIG`）驱动视觉差异
- 三入口的详情视图用同一个 `SpaceRoomView` 组件，tab 结构对称（Info / Kanban / Materials / Outputs / Chat / Timeline）
- Type-specific 属性（deadline / review_cadence / depth_stage）通过 panel 条件渲染，不做代码分叉

### 文件系统（PARA 保留）

- `01_Projects/ 02_Areas/ 03_Resources/ 04_Archives/` 物理目录结构**不变**
- vault 对 Obsidian / Finder 的可读性不降级

---

## Rationale

### 为什么数据层要统一

1. **消除三倍实现负担**：Materials、Outputs、Kanban、Context、Scoped Chat 这些 capability 实现一次就够
2. **AI 视野一致**：AI 在任何 space 类型里都拿到同构的 context bundle，提示词与行为一致
3. **跨 type 关系自然表达**：`distilled_to: [resource:埃及历史, area:内容创作]` 这种一对多关系在统一图里是一行，在分裂模型里要三条 API 路径
4. **对齐 PARA 的本意**：PARA 是分类，不是类型。代码曾经把它当类型是误读
5. **Area/Resource 活起来**：它们能拥有 Kanban + Materials + AI 对话 + agent auto-claim，从"收藏夹"变成真正的研究空间

### 为什么 UI 层不合并

1. **PARA 心智是用户资产**：用户花了力气内化 Project/Area/Resource 的判据。如果 UI 合并成 "Spaces"，他们对"这是什么类型"的感知会被削弱
2. **节奏提示**：打开 Projects 期待紧迫感、打开 Areas 期待长期感、打开 Resources 期待探索感。三个入口 = 三种心理模式的切换开关
3. **分类的外部信号**：当你在三个入口分别建 10 个 space 后，你对自己的生活/工作的结构有了更清晰的认识。单一入口会丢失这个信号
4. **对 Obsidian 用户友好**：vault 物理目录 PARA 分桶，UI 入口也 PARA 分桶，一致性拉满
5. **代价低**：三个 UI 入口只是三个薄 wrapper + 一份 config，不是三份实现

### 为什么不走"完全统一 UI + type filter" 的方案

考虑过让 UI 只有一个 "Spaces" 入口，通过顶部 tab 按 type 过滤。拒绝原因：

- 过滤 tab 的心智强度比独立 nav 项弱，PARA 感知会淡化
- 三个独立入口能承载不同的默认排序、列表列、空状态引导（`SPACE_UI_CONFIG`）
- 用户输入路径上的肌肉记忆（"我要看 Resources" → 直接点 nav）比"进 Spaces 再过滤"顺
- 三个入口的工程成本是一份薄 wrapper，不值得省

### 为什么不走"三层 UI + 三套数据" 的现状延续

- 三套数据每加一个 capability 要实现三遍，不可持续
- Materials 方案如果只做 Project 特有，Area/Resource 将永远是弱能力空间
- AI 视野不一致会让"对话即交互"的产品叙事（v3 核心哲学）在 Area/Resource 里破产
- 代码库技术债持续积累

---

## Consequences

### 正面

- Materials、Outputs、Kanban、Scoped Chat 等能力**一次实现三处生效**
- Area 和 Resource 真正成为一等公民的研究空间，不再是弱能力兄弟
- AI 在任何 space 里的上下文视野一致，提示词与行为可预测
- 代码裁减约 80-100 KB view 代码 + 大量重复 store/IPC
- 跨 space 关系可以用统一图表达，查询/回溯/backlink 变简单
- 未来扩展（如新 SpaceType，或 Space 间层级）有清晰的扩展点

### 负面 / 代价

- **迁移成本**：现有 Project/Area/Resource 代码要逐步迁移到 Space 抽象。需要 4 个 phase 的渐进迁移（见架构文档 §6.3）
- **schema 扩展**：现有 Area/Resource 的 frontmatter 要补 `type` 字段和其他共享字段
- **目录补齐**：现有 Area/Resource 要 mkdir `tasks/` `assets/` `outputs/`，自动补齐时需健壮处理"目录已手动创建"等边界
- **命名分裂时期**：迁移期间会有 `orbit project` 和 `orbit space` 并存，文档需要说清楚
- **测试覆盖**：三套原有测试要合并/重构，短期有回归风险
- **心智调整**：代码贡献者要习惯"Project 不是特殊的，只是 space 的一个 type"

### 不影响

- 用户侧 vault 文件结构、PARA 分桶、Obsidian 兼容性
- 用户侧三个顶层 UI 入口（Projects / Areas / Resources）
- 现有的 propose-approve、CLI-first、activity log、worktree 等基础设施

---

## Alternatives considered

### Alt 1: 保持三套独立，各自补齐能力

为 Area / Resource 单独实现 Kanban、Materials、Outputs。

**拒绝**：三倍实现成本，AI context 仍不一致，跨 type 操作仍要分叉，PARA 本意被误读的问题还在。

### Alt 2: 数据层 + UI 层完全统一

只有一个 "Spaces" 顶层入口，三 type 用 filter tab 区分。

**拒绝**：PARA 心智被削弱，节奏切换信号丢失，用户资产（方法论内化）贬值，工程节省的成本有限。

### Alt 3: 三层 UI + 共享子组件（不上升到统一 Space 原语）

UI 独立三个 Room view，但抽共享 Kanban / Materials 组件出来。

**拒绝**：只解决表层重复，没解决数据模型分裂；AI context 三套、跨 type 关系仍需分叉逻辑。是半吊子方案。

### Alt 4: 只做数据层统一，UI 层合并成一个入口

**拒绝**：见上面"为什么不走完全统一 UI"。

---

## Implementation sketch

详见 `docs/architecture/space-unified-model.md §6`。概要：

| Phase | 内容 | 可独立发布 |
|---|---|---|
| 0 | schema extension（type 字段、config.json 补齐） | ✅ |
| 1 | directory layout completion（Area/Resource 补 tasks/assets/outputs） | ✅ |
| 2 | API unification（`orbit space` CLI 上线，旧命令 delegate） | ✅ |
| 3 | UI refactor（SpaceListView + SpaceRoomView 共享组件） | ✅ |
| 4 | deprecation（旧 IPC/CLI 删除） | ✅ |

每个 phase 独立可发、独立可回滚。

---

## Verification

ADR 生效的判定信号：

- [ ] `shared/space.ts` 存在，定义统一 schema
- [ ] 新建 Area / Resource 时目录里自动有 `tasks/` `assets/` `outputs/`
- [ ] `orbit space context <id>` CLI 对三种 type 返回同构 bundle
- [ ] AI 在 Area / Resource 的 Chat tab 里能看到完整 context（tasks/materials/outputs 可见）
- [ ] Library 的 "Link to..." picker 显示所有 type 的 space，不分叉
- [ ] 三个顶层 nav 入口仍在，点进去走同一个 `SpaceRoomView` 组件
- [ ] Materials plan 的能力自然延伸到 Area / Resource 而不需要重新设计

---

## Related decisions

- **ADR-003** 确立 ExecutionContext 抽象（worktree/sandbox），是本 ADR 的先例：把 Project 内的执行模式抽象出来。本 ADR 把这种"抽象 + 多实现"思路推广到整个 space 概念
- **ADR-008** AI-native CLI-first：`orbit space context` 是这条路径的新公民
- **ADR-014** conversation first-class + scoped：space 是 conversation 的主要 scope 宿主
- **ADR-016** agent onboarding protocol：agent 进入任何 space 时的 onboarding 应基于统一 context bundle

---

## References

- Tiago Forte, *Building a Second Brain* (2022), PARA chapter —— PARA 作为分类法而非类型系统的原始论述
- 本项目对话历史 2026-05-09 —— 用户提出"数据结构上可以变成一个 space，但 UI 上还是三个"的关键取舍
