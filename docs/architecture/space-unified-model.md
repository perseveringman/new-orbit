# Space Unified Model

> **Status**: accepted draft · 2026-05-09
> **Companion**: `docs/decisions/ADR-018-space-as-unified-data-primitive.md`
> **Related**: `docs/architecture/entity-flow.md`, `docs/architecture/chat-conversation-surface.md`
> **Purpose**: 定义 Project / Area / Resource 在数据层上作为**统一 Space 原语**的架构，以及 UI 层保留三入口的产品取舍。

---

## 0. One-paragraph summary

Project、Area、Resource 在本质上是**同一种东西**——"一个可以承载信息、任务、素材、产出、对话的研究空间"。它们的唯一区别是**时间结构**（有限期 / 长期承诺 / 间歇兴趣）。因此在**数据层**把三者统一为 `Space` 原语（共享 schema、存储接口、AI context 构建、CLI），在 **UI 层**仍保留 Project / Area / Resource 三个入口以贴合 PARA 的心智模型。这是一次架构收敛 + 产品心智保留的平衡。

---

## 1. Motivation

### 1.1 当前的问题

现状（2026-05-09）有三套并行但几乎重复的实现：

| 方面 | Project | Area | Resource |
|---|---|---|---|
| View 组件 | `ProjectRoomView.tsx` 28 KB + Planner / Sessions / GitHub / Roles 等 5 个 | `AreaRoomView.tsx` 12 KB + `AreaOverview.tsx` 16 KB + `AreaSessionsView.tsx` 3 KB | `ResourceView.tsx` 21 KB |
| 后端模块 | `main/project.ts`, `project_fs.ts`, `project_agent_context.ts` | `main/area.ts` | 分散 |
| Store | `useProjects`, `useProjectRoom`, ... | `useAreas`, `useAreaRoom` | `useResources` |
| Kanban | Project 有 | Area 没有 | Resource 没有 |
| Materials（素材） | 设计中（见 `2026-05-09-project-materials-scope-model.md`） | 缺失 | 缺失 |
| Agent 可对话 | ✅ | ⚠️ | ⚠️ |
| 可归属 Area | ✅ | — | ⚠️ |

三套各自演进，导致：
1. 同一个能力（任务看板、素材管理、产出沉淀、AI 对话）要实现/维护三遍
2. 跨类型的用户动作（"把这个文章既关联到 Project 又关联到 Resource"）难以统一
3. AI 拿 "space context" 时代码路径不一致，AI 看到的视野不对齐
4. Area / Resource 作为"研究空间"能力被低估——Resource 只有浏览，没有任务；Area 只有 sessions，没有 Materials

### 1.2 用户侧的真实工作流

每日主链路已经收敛得很清晰：

```text
Feeds / Library / 定时任务   (被动信息流)
           ↓
    阅读 → 发现有用 → 关联到空间
           ↓
    Project / Area / Resource   (主动研究空间)
      │         │          │
      └─────────┼──────────┘
                ↓
         AI 对话（基于空间上下文）
                ↓
           任务看板 → 产出
                ↓
      归档 / 沉淀 / 持续生长
```

"Project / Area / Resource" 在用户的日常操作里**本来就是一类东西**：都是"我打开一个空间，看信息、做事、跟 AI 聊、拿产出"。差别只在"这个空间是临时的（project）、长期的（area）、还是间歇的（resource）"。

现有架构没有把这个共性抽象出来。

---

## 2. The Space abstraction

### 2.1 Definition

**Space** = 一个承载 `{info, tasks, materials, outputs, conversations, timeline}` 的命名空间，由一个 `SpaceType` 决定时间语义。

```text
Space = 研究空间原语

┌─────────────────────────────────────┐
│  Space                              │
│  ┌──────────────────────────────┐   │
│  │ type: project | area |       │   │
│  │       resource               │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │ Info        (说明/笔记)       │   │
│  │ Tasks       (Kanban)          │   │
│  │ Materials   (scope + pin)     │   │
│  │ Outputs     (产出列表)        │   │
│  │ Conversations (scoped chats)  │   │
│  │ Timeline    (事件流)          │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

### 2.2 Three types = three temporal modes

`SpaceType` 只是"时间结构"的差异，**不是能力的差异**：

| Type | 时间语义 | 开始 | 结束 | 典型例子 |
|---|---|---|---|---|
| `project` | 有限期、目标驱动 | 明确启动 | 截止 → Archive | "埃及 vlog"、"写 Q3 OKR"、"搭 Orbit v3" |
| `area` | 长期承诺、身份/责任 | 长期 | 身份退役 → dormant / archived | "内容创作"、"健康"、"父亲"、"Orbit 产品负责人" |
| `resource` | 间歇性、兴趣/主题 | 兴趣萌芽 | 兴趣消退 → dormant / archived | "埃及历史"、"vlog 制作技艺"、"能量基模型研究" |

**关键判据**（沿用 Tiago Forte 原版）：

- 有 deadline → project
- "如果一年不碰会感到失职" → area
- "如果一年不碰只是兴趣暂停" → resource

### 2.3 Capabilities: identical

所有 Space 都拥有**完整六大能力**，不因 type 而裁剪：

| Capability | Project | Area | Resource |
|---|---|---|---|
| Info（说明 + 笔记） | ✅ | ✅ | ✅ |
| Tasks（Kanban + agent dispatch） | ✅ | ✅（节奏轻） | ✅（探索型） |
| Materials（scope + pin） | ✅ | ✅ | ✅ |
| Outputs（产出列表） | ✅ | ✅ | ✅ |
| Conversations（scoped chat） | ✅ | ✅ | ✅ |
| Timeline（事件流） | ✅ | ✅ | ✅ |

Area 和 Resource 此前缺 Kanban / Materials，是历史实现债，不是本质差别。

### 2.4 Capabilities: type-specific attributes

各 type 可有自己的**属性字段**（schema 里的 optional 字段），但不是独立 capability：

| 属性 | Project | Area | Resource |
|---|---|---|---|
| `deadline` | ✅ 常用 | — | — |
| `dormant_since` | — | ✅ | ✅ |
| `depth_stage` (exploring/practicing/mastered/teaching) | — | — | ✅（resource 独有） |
| `review_cadence`（月度/季度 review） | — | ✅ | ⚠️ 可选 |
| `execution_context` (worktree/sandbox) | ✅ | ⚠️ | ⚠️ |
| `git_repo` | ✅ 代码项目 | — | — |
| 子目录（`_canonical/` 等） | — | — | ✅ |

属性差异通过 frontmatter optional field + type-specific panel 实现，**不在 view 层分叉**。

---

## 3. Data model

### 3.1 Shared schema

```typescript
// shared/space.ts
export type SpaceType = 'project' | 'area' | 'resource';
export type SpaceStatus =
  | 'active'     // 正在使用
  | 'dormant'    // 休眠（area/resource 常用）
  | 'done'       // 完成（project 专用）
  | 'archived';  // 归档（跨 type 通用）

export interface SpaceFrontmatter {
  // Identity
  uid: string;
  slug: string;
  name: string;
  type: SpaceType;

  // Lifecycle
  status: SpaceStatus;
  created_at: string;
  updated_at: string;
  dormant_since?: string;       // area/resource
  deadline?: string;            // project
  archived_at?: string;

  // Relations
  primary_area_uid?: string;    // project/resource 可归属 area
  secondary_area_uids?: string[];
  vision_ref?: string;
  tags: string[];

  // Type-specific (optional)
  execution_context?: 'worktree' | 'sandbox' | 'none';   // project
  git_repo?: string;                                     // project
  depth_stage?: 'exploring' | 'practicing' | 'mastered' | 'teaching'; // resource
  review_cadence?: 'weekly' | 'monthly' | 'quarterly';   // area
}
```

### 3.2 Unified directory layout

PARA 的物理目录**保留不变**（UI 分类 + Obsidian/Finder 友好）：

```text
<vault>/
├── 01_Projects/
│   └── <slug>/                       # type=project
│       ├── README.md                 # Space 的 Info
│       ├── config.json               # Space 的 frontmatter 摘要
│       ├── AGENT.md
│       ├── tasks/                    # Kanban 数据
│       ├── assets/                   # Materials (scope + pin)
│       ├── outputs/                  # ★ 新增：产出列表
│       ├── memories/, skills/, logs/
│       └── .orbit/
│
├── 02_Areas/
│   └── <slug>/                       # type=area
│       ├── README.md, config.json, AGENT.md
│       ├── tasks/                    # ★ 新增：Area 也有 Kanban
│       ├── assets/                   # ★ 新增：Area 也有 Materials
│       ├── outputs/                  # ★ 新增
│       └── .orbit/
│
├── 03_Resources/
│   └── <slug>/                       # type=resource
│       ├── README.md, config.json, AGENT.md
│       ├── _canonical/               # resource 独有子结构
│       ├── _distilled/
│       ├── _related/
│       ├── _people/
│       ├── _projects-touched/
│       ├── _timeline/
│       ├── tasks/                    # ★ 新增
│       ├── assets/                   # ★ 新增
│       ├── outputs/                  # ★ 新增
│       └── .orbit/
│
└── 04_Archives/
    └── <slug>/                       # 跨 type 的归档，保留原 type 在 frontmatter
```

**三类 space 的目录内部高度同构**（tasks/、assets/、outputs/、.orbit/ 相同），只有 resource 多出 `_canonical/` 等主题组织子目录。

### 3.3 Outputs: a new first-class section

新增 `outputs/` 目录是本次模型的一个增量：

```text
<space>/outputs/
├── _manifest.md              # 产出清单（frontmatter）
├── <output-1>/               # 产出单元（可以是一个目录）
│   ├── README.md
│   └── ...
└── <output-2>.md             # 也可以是单文件
```

`outputs/_manifest.md`：

```yaml
---
outputs:
  - id: egypt-vlog-final
    title: 埃及之旅 vlog 成片
    kind: video                    # video | article | deck | code | dataset | other
    status: published              # draft | review | published | archived
    path: outputs/egypt-vlog-final/
    created_at: 2026-05-08
    published_at: 2026-05-09
    distilled_to:                  # 归档时沉淀去向
      - resource:埃及历史
      - resource:vlog-制作
      - area:内容创作
    tags: [vlog, 埃及]
---
```

Outputs 和 Materials 的区别：

| | Materials | Outputs |
|---|---|---|
| 属性 | 输入 | 输出 |
| 来源 | 外部 / 关联 / 用户 add | 本 Space 产生 |
| 生命周期 | scope 级 | 单个产出级 |
| 沉淀 | 归档时固化 imported/ | 归档时登记 distilled_to |

### 3.4 Context bundle (for AI)

每个 Space 都能导出一个**标准化的 context bundle**，供 AI 使用：

```typescript
export interface SpaceContext {
  space: SpaceFrontmatter;
  info: {
    description: string;
    notes: NoteRef[];              // info tab 的短笔记
  };
  tasks: {
    todo: TaskSummary[];
    doing: TaskSummary[];
    awaiting_user: TaskSummary[];
    done_recent: TaskSummary[];    // 近 N 条
  };
  materials: {
    scopes: AssetScope[];          // 仅元数据（AI 按需 scan）
    pins: AssetPin[];
  };
  outputs: OutputSummary[];
  recent_conversations: ConversationSummary[];
  linked_from: Array<{
    source_kind: 'library' | 'space' | 'note';
    source_ref: string;
    linked_at: string;
  }>;
  related_spaces: Array<{
    space_uid: string;
    type: SpaceType;
    relation: 'primary_area' | 'secondary_area' | 'inspired_by' | 'distilled_to';
  }>;
}
```

通过 CLI 提供：

```bash
orbit space context <space-id>               # 完整 bundle
orbit space context <space-id> --summary     # 摘要版（小 context 场景）
orbit space context <space-id> --section tasks,materials   # 仅需要的部分
```

**关键**：context 构建是 space 自治的——每个 space 知道自己有什么，AI 进入 space 就自动加载。对齐 ADR-008（CLI-first）。

---

## 4. UI layer: three entries preserved

### 4.1 Principle

> **数据层统一（Space 原语），UI 层分三个入口（Project / Area / Resource）**。

这是本 ADR 的核心权衡。原因：

1. **PARA 心智已内化**：用户在 Tiago Forte 方法论里学到 Project/Area/Resource 的区分，统一入口会让他们失去分类感。
2. **视觉分类的信号价值**：三个入口 = 三种节奏的提示。打开 Projects 期待看 deadline、打开 Areas 期待看长期、打开 Resources 期待看兴趣堆。
3. **UI 分类不等于 UI 重复**：底层组件一份，外层 wrapping 三个即可。
4. **与 Obsidian / Finder 的物理目录对应**：保留 `01_Projects / 02_Areas / 03_Resources` 的目录结构是对用户资产主权的尊重。

### 4.2 Shared component structure

```text
views/
├── SpaceRoom/                     # ★ 共享组件
│   ├── SpaceRoomView.tsx          # 主容器：tab 切换 + sidebar
│   ├── tabs/
│   │   ├── InfoTab.tsx
│   │   ├── KanbanTab.tsx          # 复用 KanbanView 的核心逻辑
│   │   ├── MaterialsTab.tsx
│   │   ├── OutputsTab.tsx
│   │   ├── ChatTab.tsx
│   │   └── TimelineTab.tsx
│   └── panels/
│       ├── TypeSpecificInfoPanel.tsx   # project 显示 deadline，area 显示 review cadence...
│       └── ...
│
├── SpaceList/                     # ★ 共享列表组件
│   ├── SpaceListView.tsx          # 按 type 过滤的列表
│   └── SpaceCard.tsx
│
├── ProjectsView.tsx               # 顶层入口 = <SpaceListView type="project" />
├── AreasView.tsx                  # 顶层入口 = <SpaceListView type="area" />
├── ResourcesView.tsx              # 顶层入口 = <SpaceListView type="resource" />
└── SpaceDetailRouter.tsx          # 根据 uid 判断 type，展示 SpaceRoomView
```

**三个入口只是顶层导航的分桶**：点进去都是同一个 `SpaceRoomView`，只是 `spaceType` prop 不同。

### 4.3 Type-specific visual differences

三个入口通过**配置**而非分支代码实现差异：

```typescript
const SPACE_UI_CONFIG: Record<SpaceType, SpaceUIConfig> = {
  project: {
    label: 'Projects',
    icon: 'rocket',
    nav_order: 1,
    list_default_sort: 'deadline-asc',
    list_columns: ['name', 'status', 'deadline', 'primary_area', 'tasks_progress'],
    card_accent_field: 'deadline',
    visible_tabs: ['info', 'kanban', 'materials', 'outputs', 'chat', 'timeline'],
    tab_default: 'kanban',
    empty_state: '还没有项目。开始一个新项目？',
  },
  area: {
    label: 'Areas',
    icon: 'compass',
    nav_order: 2,
    list_default_sort: 'review-due',
    list_columns: ['name', 'status', 'review_cadence', 'last_reviewed', 'outputs_count'],
    card_accent_field: 'last_reviewed',
    visible_tabs: ['info', 'kanban', 'materials', 'outputs', 'chat', 'timeline'],
    tab_default: 'info',
    empty_state: '设置你的责任领域。',
  },
  resource: {
    label: 'Resources',
    icon: 'book',
    nav_order: 3,
    list_default_sort: 'updated-desc',
    list_columns: ['name', 'depth_stage', 'items_count', 'projects_touched_count'],
    card_accent_field: 'depth_stage',
    visible_tabs: ['info', 'kanban', 'materials', 'outputs', 'chat', 'timeline'],
    tab_default: 'info',
    empty_state: '收藏你感兴趣的主题。',
  },
};
```

**所有差异都是数据驱动**，代码路径一条。

### 4.4 Tab availability strategy

所有 type 的 `visible_tabs` 默认都包含全部六个 tab。但：

- Tab 内如果**完全无内容且无历史**，渲染空引导（"这里还没有 X，点 + 号添加"）
- 不自动隐藏 tab（避免 UI 在不同 space 里不一致）
- 例外：code-first project 可以额外显示 Terminal / GitHub tab（通过 `execution_context` 属性判断）

### 4.5 Top-level navigation

```text
顶层 Nav:
├── Dashboard
├── Inbox
├── Projects            ← 入口 1（type=project 过滤）
├── Areas               ← 入口 2（type=area 过滤）
├── Resources           ← 入口 3（type=resource 过滤）
├── Library
└── Feeds
（其余降级为 ⌘K 或 Settings）
```

导航层的三分不等于实现层的三份。

---

## 5. Cross-cutting concerns

### 5.1 Relations: unified graph

统一 Space 带来最大的架构红利：**所有 space 间/space 与其他实体的关系走同一张图**。

```text
Relations（边类型）:

space →primary_area→ space(type=area)
space →secondary_area→ space(type=area)
space(project) →inspired_by→ space(resource)
space(project) →distilled_to→ space(resource|area)
space →linked_from→ library_item / note / conversation
space →linked_to→ space（通用"相关"边）
```

实现：`<space>/.orbit/relations.json` 存所有出边，建立反向索引（`.orbit/backlinks/`）。

### 5.2 Quick link UX (across spaces)

用户在 Library / Feeds / Notes / Conversation 里点 `🔗 Link to...`：

```text
┌──────────────────────────────┐
│ Link this item to a space... │
│                              │
│ 🔍 Search all spaces...      │
│                              │
│ Recent:                      │
│  🚀 Project: 埃及 vlog        │
│  🧭 Area: 内容创作            │
│  📚 Resource: 埃及历史         │
│                              │
│ [+ Create new space...]      │
└──────────────────────────────┘
```

picker **不区分 space type**——显示所有 space，用户按 type icon 识别。这是数据统一的直接红利。

### 5.3 AI context loading

`Ask Anywhere` / `Chat` tab / `scoped conversation` 在任何 space 内打开时，自动加载 `orbit space context <id>` 到 AI system prompt。

**对齐 ADR-014**（Conversation first-class）：conversation 可以 scope 到 `global | space:<id> | task:<id> | note:<id> | library_item:<id>`。space 级 scope 是最常见的一类。

### 5.4 Agent auto-claim across types

Auto-runner（已存在）扫描所有 space 的 Kanban，不只是 Project：

- Project Kanban → 交付型任务，正常流
- Area Kanban → 周期性任务（"本月写一篇 X 领域文章"）
- Resource Kanban → 探索型任务（"深入研究埃及第四王朝"）

这让 Area 和 Resource 真正"活起来"——有 AI 持续为它们工作，而不是静态收藏夹。

### 5.5 Archive path

Space 归档统一进 `04_Archives/`：

```text
04_Archives/
├── <slug-1>/                    # 原 type 保留在 frontmatter
│   ├── config.json              # type: project, status: archived
│   ├── README.md
│   └── ...（原内容）
```

归档流程（对齐 Materials plan §8.5）：

1. 用户触发 Close / Archive
2. AI 提议 distillation：这个 space 的可复用内容沉淀到哪些其他 space？
3. 用户 approve → 复制 notes / materials / outputs 到目标 space + 建 `distilled_to` 反向关系
4. 本体移到 `04_Archives/`

三类 space 的归档路径一致。

---

## 6. Implications for existing code

### 6.1 Code consolidation

按优先级裁剪：

**P0 — 合并为 Space Room**
| 现有 | 归宿 |
|---|---|
| `ProjectRoomView.tsx` (28 KB) | `SpaceRoom/SpaceRoomView.tsx` |
| `AreaRoomView.tsx` (12 KB) + `AreaOverview.tsx` (16 KB) | 同上 |
| `ResourceView.tsx` (21 KB) | 同上 |
| `AreaSessionsView` / `ProjectSessionsView` | `SpaceRoom/tabs/ConversationsTab.tsx` |

**P1 — 共享核心 tab**
| 现有 | 归宿 |
|---|---|
| `KanbanView.tsx` | `SpaceRoom/tabs/KanbanTab.tsx`（核心逻辑） |
| `TimelineView.tsx`（当前是顶层） | `SpaceRoom/tabs/TimelineTab.tsx` + 可选的全局 Timeline |
| `ProjectPlannerView` (31 KB) | 下沉为 `SpaceRoom/tabs/InfoTab` 的一个 AI-planner 面板 |

**P2 — 保留但降级**
| 现有 | 归宿 |
|---|---|
| `ProjectGitHubView` (19 KB) | Type-specific panel，只在 `execution_context=worktree` 时显示 |
| `ProjectRolesView` (23 KB) | 降级为 Settings 或合并到 AgentsLibrary |

粗估裁减：**80-100 KB view 代码**，更多同构 store / IPC 代码。

### 6.2 New code

| 模块 | 作用 |
|---|---|
| `shared/space.ts` | 统一 schema |
| `main/space/` | 统一 CRUD（替代 `project.ts` / `area.ts` 中的重复部分） |
| `main/space/context.ts` | context bundle 构建 |
| `views/SpaceRoom/` | 共享 UI |
| CLI `orbit space ...` | 统一命令（保留 `orbit project` 等作为 alias） |
| `orbit space context <id>` | AI context 导出 |
| Area / Resource 的 `tasks/` 和 `outputs/` 目录支持 | 补齐能力对称 |

### 6.3 Data migration

向后兼容策略（对齐 ADR-003 曾用的渐进迁移思路）：

1. **Phase 0 — schema extension**：给现有 Project/Area/Resource frontmatter 加 `type` 字段（inferred from directory if absent），`config.json` 加缺失字段
2. **Phase 1 — directory layout completion**：现有 Area/Resource 自动 mkdir `tasks/`、`assets/`、`outputs/`（空目录不破坏）
3. **Phase 2 — API unification**：新 `space.*` IPC 上线，旧 `project.*` / `area.*` 保留并 delegate 到 space
4. **Phase 3 — UI refactor**：三个顶层入口改成 `SpaceListView` wrapper，Room view 合并
5. **Phase 4 — deprecation**：旧 IPC/CLI 标 deprecated，下个版本删

每个 phase 独立可发，不需要一次性迁移。

---

## 7. Non-goals

明确本架构**不改变**的事：

- **PARA 物理目录结构**：`01_Projects / 02_Areas / 03_Resources / 04_Archives` 保留不变。用户在 Finder/Obsidian 里打开 vault 看到的目录结构和今天一致。
- **文件格式**：README.md + frontmatter + markdown 的组合保持。space 不引入二进制或专有格式。
- **UI 入口数量**：仍是 Projects / Areas / Resources 三个顶层入口，不合并。
- **PARA 心智**：用户依旧按"有截止 / 长期 / 兴趣"做分类决策，UI 提示沿用 Tiago Forte 术语。
- **AI 边界**：Materials 的"不扫盘 + 授权驱动"约束对 Space 同样适用，不放松。

---

## 8. Open questions

1. **Space 之间的层级关系是否支持？** 例如 Resource "vlog 制作技艺" 下挂子 Resource "Premiere 工作流"。v1 不做，v2 可选（frontmatter 加 `parent_space_uid`）。
2. **跨 space 的聚合视图**：在 Project 内看"本项目关联的所有 Resource 的最新动态"——是 Project 内置 widget 还是全局 Dashboard 的 query？倾向后者。
3. **Space template**：从 Resource 开新 Project 时是否预填 AGENT.md / materials scope？v1 手动，v2 可加 template。
4. **Area 的 review cadence 提醒**：Space 模型支持了 `review_cadence` 字段，但触发提醒的调度放哪？定时任务子系统？
5. **Conversation 作为 first-class space 的一员**：conversation 已经在 `chat-conversation-surface.md` 里是 first-class，它跟 space 的关系是"属于 space" 还是"可平行存在"？当前模型是前者。

---

## 9. Acceptance of this document

这份架构文档被接受意味着后续所有涉及 Project / Area / Resource 的新功能设计，**默认在 Space 层面设计**，不再为某一 type 单独做特化（除非确实是 type-specific 属性）。

Materials 方案（`docs/plans/2026-05-09-project-materials-scope-model.md`）应视为"Space 的一个 capability"，而非"Project 独有"——后续扩展到 Area / Resource 是自然延伸，不是新工作。

具体实施计划见独立 plan 文档：`docs/plans/2026-05-09-space-unified-rollout.md`（待创建）。

决策论据见：`docs/decisions/ADR-018-space-as-unified-data-primitive.md`。
