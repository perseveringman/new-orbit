# 文档 6：Resource 主题工作站

> **规模**：L
> **依赖**：文档 1（Note / Library / KB）、文档 5（Daily Timeline）
> **产物**：Resource 一级入口 + `resources/<topic>/` 主题工作站 + 自下而上涌现机制 + Timeline 集成

---

## 1. 设计哲学

Resource 不是收藏夹，也不是 tag。按 Tiago Forte PARA 的原意，Resource 是：

> **A topic or theme of ongoing interest.**

在 Orbit 里，Resource 是“时间复利的物化”：一个长期持续感兴趣、没有明确 deadline 的主题空间。它聚合用户自己的 Note、外部 Library、Feed 流入、KB 激活片段、相关项目和这个主题在 Timeline 上的演化。

---

## 2. Resource 与其他实体的边界

| 实体 | 本质 | 与 Resource 的关系 |
| ---- | ---- | ------------------ |
| Note | 用户自己的输出 | 可归属 / 引用到某个 Resource |
| LibraryItem | 外部素材 | 可作为 canonical 或 related material |
| FeedItem | 信息流水 | save to Library 后才进入 Resource |
| KB | 存量知识 | 激活后成为 Note，或作为外部引用被 Resource 索引 |
| Project | 有目标和截止日期 | 可以由 Resource 孵化，也可反哺 Resource |
| Area | 长期责任 | 可以引用 Resource，但 Area 有 commitment，Resource 没有 |
| Archive | 已完成 / 失效 | dormant Resource 可归档或演化到新 Resource |

---

## 3. Vault 目录结构

每个 Resource 是一个独立主题工作站：

```text
resources/
  second-brain/
    index.md
    _canonical/
      README.md
    _distilled/
      README.md
    _related/
      README.md
    _people/
      README.md
    _projects-touched/
      README.md
    _timeline/
      README.md
    .orbit-resource.json
```

六个子目录的含义：

| 目录 | 用途 |
| ---- | ---- |
| `_canonical/` | 这个主题最关键、最稳定、最值得反复引用的材料 |
| `_distilled/` | 用户围绕该主题产生的提炼笔记 / 长文 |
| `_related/` | 相关但还未成为 canonical 的素材、Note、KB 片段 |
| `_people/` | 该主题关联的人物、作者、思想源头 |
| `_projects-touched/` | 由该主题启发或反哺该主题的 Project |
| `_timeline/` | 从 TraceableEvent 投影出的主题演化记录 |

`.orbit-resource.json` 是 Orbit 的结构化索引缓存；`index.md` 和各 README 让 Obsidian 用户也能直接浏览。

---

## 4. 数据模型

```typescript
export type ResourceStatus = 'active' | 'dormant' | 'evolved' | 'archived';
export type ResourceDepth = 'exploring' | 'practicing' | 'mastered' | 'teaching';

export interface ResourceFrontmatter {
  id: string;
  type: 'resource';
  title: string;
  slug: string;
  status: ResourceStatus;
  depth: ResourceDepth;
  created: string;
  updated: string;
  last_engaged?: string;
  engagement_count: number;
  tags: string[];
  evolved_to?: string;
}

export interface ResourceRef {
  id: string;
  kind: 'note' | 'library_item' | 'feed_source' | 'kb_item' | 'project' | 'area' | 'person' | 'url';
  ref: string;
  title?: string;
  summary?: string;
  section: 'canonical' | 'distilled' | 'related' | 'people' | 'projects_touched';
  added_at: string;
}

export interface Resource {
  frontmatter: ResourceFrontmatter;
  body: string;
  path: string;
  refs: ResourceRef[];
  counts: Record<ResourceRef['section'] | 'timeline', number>;
}
```

---

## 5. 核心流转

### 5.1 Feed → Library → Resource

用户从 Feed 保存文章到 Library 后，可以把 LibraryItem link 到 Resource。Resource 的 `_related/` 增加引用；如果用户多次引用同一材料，可提升为 `_canonical/`。

### 5.2 Note → Resource（自下而上涌现）

Resource 不要求用户先建一个空壳。Orbit 会从 Notes 中扫描 tags / 标题 / 内容关键词：

1. 某个 tag 或主题在多个 Note 里持续出现
2. 达到阈值后生成 Resource suggestion
3. 用户确认后创建 Resource，并把样本 Note link 到 `_distilled/` 或 `_related/`

### 5.3 Resource → Project

当某个 Resource 中累积足够多的 distilled notes 或 project hints，Ask-Anywhere 可以提议立项。项目完成后，它的产物再反哺 `_projects-touched/` 和 `_distilled/`。

### 5.4 Resource → Timeline

每次创建 Resource、link 引用、手动 engage、从 suggestion 创建 Resource，都写入 TraceableEvent：

- `resource.created`
- `resource.updated`
- `resource.ref.linked`
- `resource.engagement`
- `resource.archived`

Timeline 日视图展示这些事件；Resource 页面内的 `_timeline/` 是按 resource ref 过滤后的主题时间轴。

### 5.5 Resource → Archive / Evolve

dormant Resource 不直接删除。用户可以：

- 归档：移动到 `archives/resources/<slug>/`
- 演化：保留旧 Resource，设置 `status: evolved` 和 `evolved_to`
- 保留：手动 engage，继续 active

---

## 6. IPC / API

```typescript
IPC.resources = {
  list(filter?: ResourceFilter): Promise<ResourceSummary[]>;
  get(resourceIdOrSlug: string): Promise<Resource | null>;
  create(input: CreateResourceInput): Promise<Resource>;
  update(resourceIdOrSlug: string, patch: UpdateResourceInput): Promise<Resource>;
  archive(resourceIdOrSlug: string): Promise<Resource>;

  linkRef(resourceIdOrSlug: string, input: LinkResourceRefInput): Promise<Resource>;
  unlinkRef(resourceIdOrSlug: string, refId: string): Promise<Resource>;
  engage(resourceIdOrSlug: string, input?: ResourceEngagementInput): Promise<ResourceEngagement>;

  suggestFromNotes(options?: ResourceSuggestionOptions): Promise<ResourceSuggestion[]>;
  createFromSuggestion(input: CreateResourceFromSuggestionInput): Promise<Resource>;
};
```

---

## 7. UI 设计

Resource 一级入口采用三栏工作站：

```text
┌───────────────┬───────────────────────────────┬────────────────────┐
│ Resource List │ index.md / section references │ Suggestions / Meta  │
│ + suggestions │ canonical / distilled / ...   │ Timeline / Actions  │
└───────────────┴───────────────────────────────┴────────────────────┘
```

MVP 必须支持：

1. 查看所有 Resource
2. 创建 Resource
3. 查看 six-section 工作站
4. link Note / Library / URL / Project 到 Resource
5. 手动 engage
6. 从 Note tags 生成 Resource suggestions，并一键创建

---

## 8. 实施步骤

### Step 1：Shared contract

1. `src/shared/resource.ts`
2. `IPC.resources`
3. `OrbitApi.resources`
4. Resource 事件 payload 映射

### Step 2：Main store + IPC

1. `src/main/resource/store.ts`
2. `src/main/resource/ipc.ts`
3. 创建 Resource 时生成 6 子目录和 README
4. `.orbit-resource.json` 保存 refs
5. 从 `notes/` 扫描 tags 生成 suggestions
6. 所有 mutation 发布 TraceableEvent

### Step 3：Renderer workbench

1. `src/renderer/src/views/ResourceView.tsx`
2. 顶部导航增加 `Resources`
3. `VaultView` 路由接入
4. 右侧栏 surface 接入

### Step 4：Timeline / Scheduled 集成

1. Timeline Layer 1 纳入 Resource 事件
2. Resource health scan 系统任务指向 Resource API
3. Resource 页面展示最近 engagement

---

## 9. 验收标准

- [ ] README 中声明的 `06-resource-workstation.md` 存在
- [ ] `resources/<slug>/` 创建后包含 6 个子目录和 `index.md`
- [ ] Resource 一级入口可见
- [ ] 可以创建 / 查看 / 更新 / 归档 Resource
- [ ] 可以 link Note / Library / URL / Project 到 Resource
- [ ] 可以手动 engage，且 engagement_count / last_engaged 更新
- [ ] Notes 中重复 tag 能生成 Resource suggestion
- [ ] 从 suggestion 创建 Resource 后，样本 Note 被 link 到 Resource
- [ ] Resource 事件进入 TraceableEvent，并能被 Timeline 消费

---

## 10. Future-Proof

- Resource split / merge
- canonical material promotion workflow
- Resource-scoped Ask-Anywhere context
- Resource monthly review Inbox item
- Resource graph（Resource ↔ Project / Area / Person / Note）
- Resource depth 自动评估（exploring → teaching）
