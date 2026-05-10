# Space Gap-Closure Plan

**Date:** 2026-05-09  
**Status:** Draft  
**Scope:** Phase C 收尾 — Resource Space 化 + Area 深度 gap + 全局 Space 基础设施补齐

---

## 背景与目标

Space 统一模型（ADR-018）Phase A/B 已完成，Phase C 对 Project 和 Area 已完成大部分接入。本文档对 Resource 和 Area 做完整代码现状分析，识别所有残留 gap，并给出优先级排序的修复计划。

### 已就绪
- `shared/space.ts` 统一类型 + `shared/constants.ts` 四常量
- `main/space/layout.ts`（`ensureSpaceLayout`）
- `main/space/context.ts`（`buildSpaceContext`）——三类 space 均可解析
- Materials IPC 统一路由（`assets/ipc.ts:58-73`）
- Project + Area 前端已接入 `SpaceMaterialsView`
- `orbit space context <id>` CLI
- `AreaRoomView` 已有完整 tab 结构（dashboard/kanban/materials/outputs/chat/timeline/terminal/sessions）

---

## 一、Area 代码现状分析

### 1.1 存储路径 ✅ 正确

| 常量 | 值 | 对应 PARA |
|------|-----|-----------|
| `AREAS_DIR` | `'02_Areas'` | ✅ 标准 |
| `AREA_ORBIT_DIR` | `'.orbit'` | ✅ |

Area 路径无问题，`listAreas` 正确读取 `02_Areas/`，`createArea` 正确写入该目录。

### 1.2 Schema 与 IPC ✅ 完整

- `shared/area.ts`：`AreaConfig` / `AreaRef` / `AreaDashboardData` 类型完备
- `shared/schemas.ts`：`TaskFrontmatter` 含 `area_uid?: string.optional()`，`TaskRecord` 含 `area_uid?: string`
- `shared/ipc.ts`：`IPC.area.*` 有 list/get/create/update/archive/getConfig/setConfig/dashboard/assign/unassign/suggestAssignments/event，**覆盖完整**
- `area_ipc.ts`：所有 handler 均已注册

### 1.3 Space Context 对 Area 的支持 ✅/⚠️

`context.ts:80-99` Area 分支：
- 正确解析 uid/slug/name/type/status/tags/review_cadence
- `descriptionPath` → `README.md` ✅
- `taskBucket`（第 131 行）：`if (space.type === 'area') return task.area_uid === space.uid` ✅
- **`recent_conversations` 硬编码 `[]`** ⚠️
- **`linked_from` 硬编码 `[]`** ⚠️

### 1.4 前端 AreaRoomView 现状 ✅/⚠️

`AreaRoomView.tsx` 已有完整 8 tab 结构（587 行），且：
- `SpaceMaterialsView` ✅（第 354 行）
- `AreaOutputsTab`（内联组件，第 407 行）✅——调用 `window.orbit.space.context` 读 outputs
- `AreaChatTab` ✅（第 463 行）——创建 scoped conversation
- `AreaTimelineTab` ✅（第 518 行）——过滤今日 area 事件
- `KanbanBoard` ✅——按 `area_uid` 过滤任务
- **`refreshTasks` 调用 `window.orbit.para.listTasks({ area_uid })`**——依赖 `TaskRecord.area_uid`，该字段已存在 ✅

### 1.5 Area gap 汇总

| 编号 | 类别 | 描述 | 严重度 |
|------|------|------|--------|
| A-G1 | context.ts | `recent_conversations` 硬编码 `[]` | P3 |
| A-G2 | context.ts | `linked_from` 硬编码 `[]` | P3 |
| A-G3 | AreaRoomView | Tab 不自动隐藏空 tab（design spec 要求空 tab 隐藏） | P3 |
| A-G4 | CLI | 无 `orbit space list` / `orbit space show`（Area 视角） | P3 |
| A-G5 | IPC | 无 `IPC.space.list` / `IPC.space.get` / `IPC.space.summary` | P3 |
| A-G6 | 测试 | `area_view.test.ts` 未覆盖 Outputs/Materials tab 的 context 集成 | P3 |

> **结论：Area 后端和前端结构基本完整，无 P0/P1 级 gap。**

---

## 二、Resource 代码现状分析

### 2.1 存储路径 ❌ P0 阻塞

`src/main/resource/store.ts` 中（据 working memory 记录）：

```
RESOURCE_ROOT = 'resources'        ← 错误，应为 '03_Resources'
ARCHIVE_ROOT  = 'archives/resources' ← 错误，应为 '04_Archives/resources'
```

**影响**：
- Capture/distill 写入 `03_Resources/`（PARA 标准路径）
- `ResourceStore.list()` 读取 `resources/`（错误路径）
- 两套路径并存，Space context 解析 resource 时找到的是错误目录下的文件
- `buildSpaceContext` 的 resource 分支：`root = path.dirname(path.join(vaultPath, resource.path))`——如果 `resource.path` 错误，整个 context 解析失败

### 2.2 Task schema 缺 `resource_uid` ❌ P1

`TaskFrontmatter`（schemas.ts:74-127）只有：
```
project_uid?: string.optional()
area_uid?:    string.optional()
```
**缺少 `resource_uid?: string.optional()`**

`context.ts:129` resource 分支：
```ts
if (space.type === 'resource') return false;  // ← 硬编码，Kanban 永远空
```

修复需：
1. `TaskFrontmatter` + `TaskRecord` 加 `resource_uid?: string`
2. `context.ts taskBucket` 加 `if (space.type === 'resource') return task.resource_uid === space.uid`

### 2.3 前端 ResourceView 未 Space 化 ❌ P1

现有 `ResourceView`/`ResourceRoomView`（~450 行）使用旧式 refs/sections/suggestions UI，无统一 Space tab 结构（无 Kanban/Materials/Outputs/Chat tab）。

需新建 `ResourceRoomView.tsx`，对齐 `AreaRoomView.tsx` 结构：

| Tab | 实现方式 |
|-----|----------|
| Dashboard | 现有 ResourceOverview 内容复用 |
| Kanban | 按 `resource_uid` 过滤任务 |
| Materials | `SpaceMaterialsView spaceId={resource.uid}` |
| Outputs | 内联 `ResourceOutputsTab`（同 `AreaOutputsTab`） |
| Chat | 内联 `ResourceChatTab`（scope `{ kind: 'resource', resource_slug }` ） |
| Timeline | 内联 `ResourceTimelineTab` |
| Terminal | `TerminalManager cwd={resourcePath}` |

### 2.4 Resource gap 汇总

| 编号 | 类别 | 描述 | 严重度 |
|------|------|------|--------|
| R-G1 | store.ts | `RESOURCE_ROOT = 'resources'`，应为 `'03_Resources'` | **P0** |
| R-G2 | store.ts | `ARCHIVE_ROOT = 'archives/resources'`，应为 `'04_Archives/resources'` | **P0** |
| R-G3 | store.ts | 无 migration 脚本，旧数据留在 `resources/` 无法读取 | **P0** |
| R-G4 | schemas.ts | `TaskFrontmatter` / `TaskRecord` 缺 `resource_uid` | P1 |
| R-G5 | context.ts | `taskBucket` resource 分支 `return false` | P1 |
| R-G6 | renderer | `ResourceRoomView` 无 Space tab 结构 | P1 |
| R-G7 | context.ts | `recent_conversations` / `linked_from` 硬编码 `[]` | P3 |
| R-G8 | CLI | 无 `orbit space list/show` resource 视角 | P3 |
| R-G9 | IPC | 无 `IPC.space.list/get/summary` | P3 |
| R-G10 | 测试 | 无 resource space context 集成测试 | P3 |

---

## 三、全局 Space 基础设施 gap

| 编号 | 描述 | 严重度 |
|------|------|--------|
| G-G1 | `IPC.space` 只有 `context`，缺 `list` / `get` / `summary` | P3 |
| G-G2 | CLI 无 `orbit space list` / `orbit space show` | P3 |
| G-G3 | `recent_conversations` 跨三类 space 均硬编码 `[]` | P3 |
| G-G4 | `linked_from` 跨三类 space 均硬编码 `[]` | P3 |
| G-G5 | 空 tab 未自动隐藏（design spec 要求） | P3 |

---

## 四、修复优先级与实施计划

### P0：Resource 路径迁移（阻塞所有 Resource Space 功能）

**目标文件：** `src/main/resource/store.ts`

**步骤：**
1. 将 `RESOURCE_ROOT` 改为 `'03_Resources'`，`ARCHIVE_ROOT` 改为 `'04_Archives/resources'`
2. 新建 `src/main/migrations/resource-path-v1.ts` migration 脚本：
   - 检测 `vaultPath/resources/` 是否存在
   - 将所有文件移动到 `vaultPath/03_Resources/`
   - 更新文件内 frontmatter 的 `path` 字段（如有）
   - 写入 migration marker（`.orbit/migrations/resource-path-v1.done`）
3. 在 `main/index.ts` vault open 时检测并自动触发 migration（或提示用户手动运行）
4. 在 `IPC.migrations` 下加 `runResourcePathMigration` handler

**验证：**
```bash
orbit space context <resource-uid>  # 应返回完整 context 而非空
```

---

### P1a：Task schema 加 `resource_uid`

**目标文件：** `src/shared/schemas.ts`，`src/main/space/context.ts`

**步骤：**
1. `TaskFrontmatter` 加 `resource_uid: z.string().optional()`
2. `TaskRecord` interface 加 `resource_uid?: string`
3. `context.ts taskBucket` 第 132 行加分支：
   ```ts
   if (space.type === 'resource') return task.resource_uid === space.uid;
   ```
4. `src/main/tasks.ts` 的 `tasksOfFile` 解析时透传 `resource_uid`

---

### P1b：新建 ResourceRoomView

**目标文件：** `src/renderer/src/views/ResourceRoomView.tsx`（新建）

**参照：** `AreaRoomView.tsx`（587 行），结构完全对齐

关键差异：
- header 显示 resource 的 `title` / `depth` / `tags`
- Kanban 按 `resource_uid` 过滤（需 P1a 完成）
- Chat scope：`{ kind: 'resource', resource_slug: resource.slug }`（需确认 `ConversationScope` 类型支持）
- Terminal env：`ORBIT_RESOURCE_UID` / `ORBIT_RESOURCE_SLUG` / `ORBIT_RESOURCE_PATH`

---

### P2：SpaceOutputsView 通用组件（可选重构）

`AreaOutputsTab`（内联）和 `ResourceOutputsTab` 逻辑完全相同，可提取为 `SpaceOutputsView.tsx`：

```tsx
// src/renderer/src/views/SpaceOutputsView.tsx
export function SpaceOutputsView({ spaceId }: { spaceId: string }): JSX.Element
```

三类 RoomView 统一引用，消除重复代码。

---

### P3：Space 基础设施补齐

优先级较低，可在 P0/P1 完成后进行：

1. **`IPC.space.list/get/summary`**
   - `shared/ipc.ts` 加三个 key
   - `main/space/ipc.ts`（新建）注册 handler，复用 `resolveSpace` / `listProjects` / `listAreas` / `resourceStore.list`

2. **CLI `orbit space list/show`**
   - `src/main/cli/runner.ts` 加两个 command
   - `list`：遍历三类，输出 uid/name/type/status
   - `show`：调用 `buildSpaceContext` 并 JSON 输出

3. **`recent_conversations` 实现**
   - `context.ts` 调用 `chat.findConversationsByAnchor(space.type, space.uid)`
   - 返回最近 5 条会话 meta

4. **`linked_from` 实现**
   - 遍历 vault tasks / notes / library，查找引用该 space uid/slug 的实体
   - 性能敏感，可加缓存或仅在 `!options.summary` 时计算

5. **空 tab 自动隐藏**
   - `AreaRoomView` / `ResourceRoomView` 在 context 加载后，根据实际数据决定 tab visibility
   - 例如：outputs 为空则隐藏 Outputs tab

---

## 五、完成度评估

| 维度 | 当前 | 目标 | 差距 |
|------|------|------|------|
| Project Space 化 | 95% | 100% | P3 gap（conversations/linked_from） |
| Area Space 化 | 90% | 100% | P3 gap（conversations/linked_from/tab hide） |
| Resource Space 化 | 15% | 100% | P0 路径 + P1 schema/前端 |
| Space 基础设施 | 40% | 100% | P3 IPC/CLI |
| **整体** | **~60%** | **100%** | — |

---

## 六、实施顺序建议

```
Week 1
├── P0: Resource 路径迁移（store.ts + migration 脚本）    [~4h]
│
Week 2
├── P1a: Task schema 加 resource_uid                      [~1h]
├── P1b: ResourceRoomView 新建                            [~6h]
│
Week 3
├── P2: SpaceOutputsView 通用组件提取（可选）              [~2h]
├── P3a: IPC.space.list/get/summary                       [~3h]
├── P3b: CLI orbit space list/show                        [~2h]
│
Week 4
└── P3c: conversations/linked_from 实现 + 测试补齐        [~4h]
```

**总估算：** ~22h 工作量，约 3-4 个工作日可完成 P0+P1，全部 gap 约 2 周。

---

## 附录：关键文件索引

| 文件 | 作用 |
|------|------|
| `src/shared/constants.ts` | PARA 路径常量（AREAS_DIR / PROJECTS_DIR 等） |
| `src/shared/schemas.ts` | TaskFrontmatter / TaskRecord / AreaConfig schema |
| `src/shared/area.ts` | AreaConfig / AreaDashboardData 类型 |
| `src/shared/ipc.ts` | 全量 IPC key + OrbitApi 类型 |
| `src/main/area.ts` | Area CRUD / Dashboard / Assignment 逻辑 |
| `src/main/area_ipc.ts` | Area IPC handler 注册 |
| `src/main/space/context.ts` | buildSpaceContext（三类 space 解析） |
| `src/main/space/layout.ts` | ensureSpaceLayout（目录结构保证） |
| `src/main/resource/store.ts` | ResourceStore（P0 路径 bug 在此） |
| `src/renderer/src/views/AreaRoomView.tsx` | Area 前端（完整 8 tab，可作 Resource 模板） |
| `src/renderer/src/views/ProjectMaterialsView.tsx` | SpaceMaterialsView 通用组件 |
| `tests/area_store.test.ts` | Area 集成测试（已覆盖 dashboard/assign/suggest） |
| `docs/architecture/space-unified-model.md` | Space 统一模型架构文档 |
| `docs/decisions/ADR-018-space-as-unified-data-primitive.md` | ADR |
