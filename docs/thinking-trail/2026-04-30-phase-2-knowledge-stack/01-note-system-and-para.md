# 文档 1：笔记系统 + PARA 扩展 + KB 导入

> **规模**：L（约 3~5 天 AI 实施 + 数据模型改动）
> **依赖**：Phase 1 完成（Chat 解耦、Conversation 一等公民、Ask-Anywhere MVP）
> **产物**：Notes 一级入口 + KB 导入 + Area/Resource/Archive 基础 + 欢迎分析初始化流程

---

## 1. 设计哲学

### 1.1 Forte CODE+PARA 在 Orbit 的落地

| CODE 阶段 | Orbit 实现 |
|----------|-----------|
| **Capture** | Quick Capture UI + `notes/captures/` 目录 + Feed → Library → 收藏 |
| **Organize** | PARA 四象限（Projects / Areas / Resources / Archives） |
| **Distill** | Library 的 annotation + Note 渐进总结 + Ask-Anywhere 的 `orbit-distill` skill |
| **Express** | `notes/longforms/` + Ask-Anywhere 的 `orbit-express` skill |

### 1.2 本体论划分（严格遵守，这是模型灵魂）

```
┌─────────────────────────────────────────────────────────────────┐
│  Output（用户产出）          Input（外部素材）                    │
│  ─────────────────          ─────────────────                  │
│  Note                        LibraryItem（用户主动收藏的）        │
│    type: thought             FeedItem（订阅流入，待筛选）         │
│    type: longform                                               │
│    type: capture             Knowledge Base（存量导入，分层引用） │
│    type: voice_log                                              │
│    type: daily_summary                                          │
│                                                                 │
│  全部是用户自己写的/说的       全部是外部信息                      │
│  → 可进 PARA                  → 素材 → 激活 / distill → Note    │
└─────────────────────────────────────────────────────────────────┘
```

**铁律**：
- Note 是用户产出的统一 primitive
- Library/Feed **不是** Note
- Knowledge Base 的笔记**不是 Orbit 的活跃 Note**，但可以通过"激活"转换

---

## 2. 目录结构（Vault 内）

### 2.1 完整目录树

```
<vault>/
├── notes/                           # 活跃工作区（Output）
│   ├── thoughts/                    # 短想法
│   │   └── 2026-04-30T14-02-ab12.md
│   ├── longforms/                   # 长文 / 文章
│   │   └── building-second-brain.md
│   ├── captures/                    # 捕获（有 source 字段）
│   │   └── 2026-04-30T10-15-cd34.md
│   ├── voice_logs/                  # 语音日志
│   │   └── 2026-04-30T19-30-ef56.md
│   └── daily-summaries/             # AI 生成的每日总结
│       └── 2026-04-30.md
│
├── library/                         # 素材层（Input - 用户主动收藏）
│   ├── articles/                    # 网页文章
│   ├── pdfs/                        # PDF 文件
│   ├── videos/                      # 视频（只存元信息 + 链接）
│   └── bookmarks/                   # URL 书签
│
├── feeds/                           # Feed 订阅（流水，未筛选）
│   ├── _sources.json                # 订阅源配置
│   └── <source-id>/                 # 每个订阅源的 items
│       └── 2026-04-30-<item>.json
│
├── knowledge-base/                  # 存量知识区（Input - 导入）
│   ├── <kb-name>/                   # 每个 KB 独立目录，保持原结构
│   │   └── ... 用户原始笔记结构 ...
│   └── .orbit-kb-meta/              # Orbit 对 KB 的元信息（不污染原文）
│       ├── registry.json            # KB 列表 + 配置
│       ├── annotations/             # 对 KB 笔记的标注（Orbit 侧）
│       └── indexes/                 # 检索索引
│
├── projects/                        # PARA - Projects
├── areas/                           # PARA - Areas
├── resources/                       # PARA - Resources（详见文档 6）
├── archives/                        # PARA - Archives
│
└── .orbit/                          # 系统目录
    ├── conversations/
    ├── events/
    └── config.json
```

### 2.2 路径约定

| 目录 | 谁写入 | Obsidian 可见 | Ask-Anywhere 可操作 |
|------|--------|--------------|---------------------|
| `notes/*` | 用户 + Orbit | ✅ | ✅ 读写 |
| `library/*` | Orbit + 用户 | ✅ | ✅ 读写 |
| `feeds/*` | Orbit 自动 | ✅ | ✅ 只读 |
| `knowledge-base/<kb>/*` | 用户 + Orbit（可读写）| ✅ | ✅ 读写（默认） |
| `knowledge-base/.orbit-kb-meta/*` | Orbit | ✅（但不建议用户改） | ✅ |
| `projects / areas / resources / archives` | 用户 + Orbit | ✅ | ✅ 读写 |
| `.orbit/*` | Orbit | ⚠️ 不建议暴露 | 内部使用 |

---

## 3. Note 数据模型

### 3.1 TypeScript 类型

```typescript
// src/shared/note/types.ts

export type NoteType = 
  | 'thought'         // 短想法
  | 'longform'        // 长文
  | 'capture'         // 捕获（有来源）
  | 'voice_log'       // 语音日志
  | 'daily_summary';  // AI 生成的每日总结

export type NotePARAKind = 
  | 'floating'        // 尚未归属
  | 'project'         // 归属某 project
  | 'area'            // 归属某 area
  | 'resource'        // 归属某 resource
  | 'archive';        // 归档

export interface NoteFrontmatter {
  // 标识
  id: string;
  type: NoteType;
  title?: string;
  created: string;              // ISO timestamp
  updated: string;
  
  // PARA 归属
  para_kind: NotePARAKind;
  para_ref?: string;            // e.g. "projects/orbit-v2"、"resources/second-brain"
  
  // 标签
  tags: string[];
  
  // 来源（仅 type=capture 有）
  source?: {
    kind: 'library' | 'kb' | 'url' | 'conversation' | 'feed' | 'manual';
    ref?: string;               // 指向来源的引用
    excerpt?: string;           // 原文片段
  };
  
  // Voice log 特有
  audio?: {
    path: string;               // 相对路径
    duration_sec: number;
    transcribed: boolean;
  };
  
  // 双向链
  links_out: string[];          // 出链（wikilink 目标）
  backlinks: string[];          // 反向链（自动维护）
  
  // 元数据
  word_count?: number;
  author?: string;              // 默认用户自己
  visibility?: 'normal' | 'private';  // future-proof 隐私
}

export interface Note {
  frontmatter: NoteFrontmatter;
  body: string;                 // Markdown 正文
  path: string;                 // 相对 vault 的路径
}
```

### 3.2 Frontmatter 示例

**thought**:
```yaml
---
id: note-2026-04-30T14-02-ab12
type: thought
created: 2026-04-30T14:02:33+08:00
updated: 2026-04-30T14:02:33+08:00
para_kind: resource
para_ref: resources/second-brain
tags: [second-brain, distill, insight]
links_out: ["[[Tiago Forte]]"]
backlinks: []
---

渐进式总结对定时任务设计很有启发 —— 每次评审不是从头读，
而是在前一次的基础上再薄一层墨。这本身就是一种时间复利。
```

**capture** (from library):
```yaml
---
id: note-2026-04-30T10-42-cd34
type: capture
created: 2026-04-30T10:42:00+08:00
updated: 2026-04-30T10:42:00+08:00
para_kind: floating
para_ref: null
tags: [second-brain]
source:
  kind: library
  ref: library/articles/building-a-second-brain-2025.md
  excerpt: "Progressive summarization creates a multi-layer cake of insights..."
links_out: []
backlinks: []
---

这个比喻很有意思。我想记下来应用到 Orbit 的定时任务设计。
```

**longform**:
```yaml
---
id: note-longform-orbit-philosophy
type: longform
title: Orbit 是第二大脑的执行层
created: 2026-04-30T14:00:00+08:00
updated: 2026-04-30T15:40:12+08:00
para_kind: project
para_ref: projects/orbit-v2
tags: [orbit, second-brain, philosophy]
word_count: 3421
links_out: ["[[para-in-orbit]]", "[[code-in-orbit]]", "[[Tiago Forte]]"]
backlinks: ["resources/second-brain/index.md"]
---

# Orbit 是第二大脑的执行层

……正文……
```

---

## 4. Library / Feed 数据模型

### 4.1 LibraryItem

```typescript
// src/shared/library/types.ts

export type LibraryItemKind = 
  | 'article'         // Web 文章（纯文字）
  | 'pdf'             // PDF
  | 'video'           // 视频（只存链接 + 元信息）
  | 'bookmark';       // URL 书签

export type LibraryItemStatus = 
  | 'unread'
  | 'reading'
  | 'read'
  | 'distilled'       // 已提炼成 Note
  | 'archived';

export interface LibraryItemFrontmatter {
  id: string;
  kind: LibraryItemKind;
  title: string;
  url?: string;
  author?: string;
  published_at?: string;
  added_at: string;
  status: LibraryItemStatus;
  
  // PARA 关联
  para_refs?: string[];           // 可属于多个 project/area/resource
  
  // 标签
  tags: string[];
  
  // Distill 关联
  distilled_into?: string[];      // 产生的 Note id 列表
  annotations_count: number;
  
  // 文件位置（本地有副本时）
  local_path?: string;            // e.g. "library/pdfs/xxx.pdf"
}

export interface LibraryItem {
  frontmatter: LibraryItemFrontmatter;
  body?: string;                  // markdown 正文（article 类型）
  annotations: LibraryAnnotation[];
}

export interface LibraryAnnotation {
  id: string;
  at: string;                     // 时间
  range: { start: number; end: number };
  type: 'highlight' | 'underline' | 'bold' | 'comment';
  text: string;                   // 标注的原文
  comment?: string;               // 用户评论
  color?: string;
  note_id?: string;               // 如果这条 annotation 转成了 note
}
```

### 4.2 FeedItem & FeedSource

```typescript
// src/shared/feed/types.ts

export type FeedSourceKind = 'rss' | 'newsletter' | 'youtube' | 'twitter' | 'manual';

export interface FeedSource {
  id: string;
  kind: FeedSourceKind;
  name: string;
  url: string;
  last_fetched_at?: string;
  fetch_interval_minutes: number;
  active: boolean;
  tags?: string[];
}

export type FeedItemStatus = 
  | 'new'
  | 'seen'
  | 'saved_to_library'   // 用户 save 进 library 了
  | 'dismissed';

export interface FeedItem {
  id: string;
  source_id: string;
  title: string;
  url: string;
  summary?: string;
  published_at: string;
  fetched_at: string;
  status: FeedItemStatus;
  saved_to_library_ref?: string;  // library item path
}
```

### 4.3 存储

**LibraryItem**：每个是一个目录（因为可能有大文件 + annotation）
```
library/articles/<id>/
  index.md          # frontmatter + body
  annotations.json  # 标注列表（或嵌入 frontmatter）
  assets/           # 图片等资源
```

或简化为单文件（MVP 推荐）：
```
library/articles/<slug>.md   # frontmatter + body + annotations 嵌入
```

**FeedSource**：单个配置文件 `feeds/_sources.json`
**FeedItem**：单 JSON 文件，按 source 分子目录 `feeds/<source-id>/<item-id>.json`

---

## 5. Knowledge Base（KB）数据模型

### 5.1 KB Registry

```typescript
// src/shared/knowledge-base/types.ts

export interface KnowledgeBase {
  id: string;                      // 内部 id
  name: string;                    // 用户起的名
  path: string;                    // 相对 vault 的路径，如 "knowledge-base/obsidian-2023"
  source_type: 'obsidian' | 'markdown-folder' | 'notion-export' | 'generic';
  imported_at: string;
  last_scanned_at?: string;
  
  // 权限（P2-D3 默认可读写）
  writable: boolean;
  
  // 索引状态
  index_status: 'pending' | 'indexing' | 'ready' | 'error';
  item_count: number;
  
  // 元数据
  description?: string;
  welcome_analysis_done: boolean;
}
```

### 5.2 Registry 文件

```
knowledge-base/.orbit-kb-meta/registry.json
```

```json
{
  "kbs": [
    {
      "id": "kb-obsidian-2023",
      "name": "Obsidian 2023 Archive",
      "path": "knowledge-base/obsidian-2023",
      "source_type": "obsidian",
      "imported_at": "2026-04-30T09:00:00+08:00",
      "writable": true,
      "index_status": "ready",
      "item_count": 1247,
      "welcome_analysis_done": true
    }
  ]
}
```

### 5.3 激活机制的数据关系

当用户从 KB 激活一段到活跃区：

```yaml
# 在 notes/thoughts/xxx.md 新建：
---
id: note-2026-04-30T14-02-activated
type: capture
source:
  kind: kb
  ref: kb-obsidian-2023/folder/original.md
  excerpt: "原始段落内容..."
para_kind: floating
---

（用户可编辑）我对这段的新理解...
```

**原 KB 文件不动**。只是在 `.orbit-kb-meta/annotations/` 里记录一条 activation：

```json
// knowledge-base/.orbit-kb-meta/annotations/<kb-id>/<original-file>.json
{
  "activations": [
    {
      "at": "2026-04-30T14:02:00+08:00",
      "source_range": { "start": 120, "end": 280 },
      "activated_to": "notes/thoughts/note-2026-04-30T14-02-activated.md"
    }
  ]
}
```

这样 KB 原文保持纯净，但 Orbit 知道"这段被激活过"。

---

## 6. PARA 扩展（Area / Resource / Archive 基础能力）

> **说明**：Resource 详细设计见文档 6。本节只给 Area / Archive / Resource 的基础数据模型和目录结构。

### 6.1 Project（已有，本次不改）

现有 `projects/<slug>/` 目录结构保持不变。本次新增的是**让 Note/Library 能 link 到 Project**（通过 `para_ref`）。

### 6.2 Area

```
areas/
  engineering-lead/
    index.md                  # Area 主页：职责/承诺/评审频率
    _commitments.md           # 具体承诺（e.g. "每周写一篇技术周报"）
    _reviews/                 # 周/月评审记录
      2026-04-week-17.md
      2026-04.md
    _projects-active.md       # 当前活跃 projects（自动生成的 link 列表）
    _notes-linked.md          # 关联 notes（自动生成）
```

**Area frontmatter**:
```yaml
---
type: area
title: Engineering Lead
created: 2026-01-01
review_cadence: weekly       # weekly | monthly | quarterly | none
last_reviewed_at: 2026-04-24
health: active               # active | stagnant | dormant
commitments: 
  - "每周写一篇技术周报"
  - "每月做一次团队 1on1"
tags: [engineering, leadership]
---
```

### 6.3 Resource（见文档 6，此处略）

目录预留 `resources/`。

### 6.4 Archive

```
archives/
  projects/
    2025-10-rewrite-auth-system/    # 完整搬迁过来
  areas/
  notes/                             # 归档的长文（很少见）
  resources/
```

**归档操作**：
```
archive(entity) {
  from = entity.path
  to = "archives/" + entity.type + "/" + entity.slug
  move file(s)
  update links (wikilink 不变但 Orbit 记录重定向)
  emit event: para.archived
}
```

---

## 7. Notes 一级入口 UI（最小可用 + 扩展路径）

### 7.1 路由

- 左侧栏新增一级入口：`Notes`（icon: `NotebookPen` from lucide-react）
- 位置：Ask-Anywhere 之下，Projects 之上
- 路由：`/notes`

### 7.2 MVP UI 布局

```
┌──────────────────────────────────────────────────────────────────┐
│  Notes                                       [+ 新建] [🔍] [⚙️]   │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  ┌─── 筛选栏 ────────────────────────────────────────────────┐   │
│  │ 类型: [全部] [thought] [longform] [capture] [voice] [daily]│   │
│  │ PARA: [全部] [project] [area] [resource] [floating]        │   │
│  │ 标签: [#second-brain] [#orbit] [+]                         │   │
│  │ 排序: [最近更新 ▼]                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌── 列表 ────────────────────────────────────────────────────┐ │
│  │ 💭 渐进式总结对定时任务设计很有启发                         │ │
│  │    thought · resources/second-brain · 10 分钟前              │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ ✍️  Orbit 是第二大脑的执行层                                │ │
│  │    longform · 3421 字 · projects/orbit-v2 · 40 分钟前       │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ 📌 这个比喻很有意思                                          │ │
│  │    capture · 来自 library · 3 小时前                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [← 上一页]  [1 / 5]  [下一页 →]                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 7.3 笔记详情 / 编辑视图

点击进入单笔记：

```
┌──────────────────────────────────────────────────────────────────┐
│  ← 返回   [保存] [删除] [归档] [...]                              │
│                                                                  │
│  💭 渐进式总结对定时任务设计很有启发                              │
│  ────────────────────────────────────────────────────────────── │
│  thought · resources/second-brain · 2026-04-30 14:02             │
│                                                                  │
│  ┌── frontmatter (可折叠) ──────────────────────────────────┐    │
│  │ para_kind: resource                                     │    │
│  │ para_ref: resources/second-brain                        │    │
│  │ tags: [second-brain, distill, insight]                  │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌── 正文 (markdown 编辑器) ────────────────────────────────┐    │
│  │ 渐进式总结对定时任务设计很有启发 —— 每次评审不是从头读，      │    │
│  │ 而是在前一次的基础上再薄一层墨。这本身就是一种时间复利。     │    │
│  │                                                         │    │
│  │ [[Tiago Forte]]                                         │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌── 反向链 (backlinks) ─────────────────────────────────┐       │
│  │ · resources/second-brain/index.md                     │       │
│  │ · projects/orbit-v2/notes/distill-explorations.md     │       │
│  └───────────────────────────────────────────────────────┘       │
│                                                                  │
│  [💬 和 Ask-Anywhere 讨论这条笔记]                                │
└──────────────────────────────────────────────────────────────────┘
```

### 7.4 编辑器技术选型

- 用现有 markdown editor（项目应该已有，如 `react-markdown` + 简单 textarea，或 `codemirror`）
- **不引入** Monaco / Tiptap 等重型编辑器
- 支持：frontmatter 折叠、wikilink 自动补全（输入 `[[` 弹出笔记列表）、tag 自动补全（`#`）

### 7.5 MVP 不做但要预留的扩展点

在文档中**明确标记这些是后续迭代方向**，现在不做但架构不要挡路：

- 🔮 **图谱视图**（双链可视化）
- 🔮 **日历视图**（按时间看笔记创建分布）
- 🔮 **Tag 云**
- 🔮 **全文搜索增强**（向量检索、语义搜索）
- 🔮 **协作编辑 / 分享**
- 🔮 **版本历史**（git-like）
- 🔮 **Templates**（笔记模板）
- 🔮 **Diagrams**（Mermaid / Excalidraw 嵌入）

---

## 8. 欢迎分析 + 初始化流程

### 8.1 触发条件

- 用户首次打开 Orbit（没有 vault 或 vault 是空的）
- 用户主动点击"重新分析"（设置里）

### 8.2 初始化流程（5 步）

```
┌─ Step 1: 欢迎 ───────────────────────────────────────────┐
│  "欢迎使用 Orbit。我是你的规划者代理 Ask-Anywhere。       │
│   在开始前，我想了解一下你。"                             │
│                                                         │
│  [开始] [跳过初始化]                                     │
└─────────────────────────────────────────────────────────┘

┌─ Step 2: Vault 位置 ─────────────────────────────────────┐
│  "你的 Orbit vault 放在哪里？"                            │
│                                                         │
│  ○ 新建一个 vault                                        │
│  ○ 使用已有的 Obsidian vault                             │
│  ○ 稍后设置                                              │
└─────────────────────────────────────────────────────────┘

┌─ Step 3: 存量笔记导入 ───────────────────────────────────┐
│  "你有存量的笔记 / 知识库想导入吗？                        │
│   我会读它们来了解你，并给你建议 PARA 初始结构。"          │
│                                                         │
│  [导入文件夹]  [添加更多]  [跳过]                         │
│                                                         │
│  已添加:                                                 │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 📂 Obsidian 2023 Archive                         │    │
│  │    /Users/.../obsidian-vault                     │    │
│  │    ✓ 1247 个笔记                                  │    │
│  │    权限: ⦿ 可读写  ○ 只读                         │    │
│  │    [移除]                                        │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘

┌─ Step 4: 欢迎分析（进行中）──────────────────────────────┐
│  "我在读你的笔记..."                                     │
│  [████████████░░░░░░░░]  62%                            │
│                                                         │
│  扫描中: obsidian-2023/projects/...                      │
│  已发现: 47 个主题、12 个人物、3 个活跃项目               │
└─────────────────────────────────────────────────────────┘

┌─ Step 5: 分析结果 + 初始化建议 ──────────────────────────┐
│  "我读完了。以下是我的观察："                             │
│                                                         │
│  📚 核心主题（可立为 Resource）:                          │
│    ⦿ Second Brain / 知识管理 (42 次提及)                 │
│    ⦿ 工程领导力 (28 次)                                   │
│    ⦿ 创业与商业洞察 (19 次)                              │
│    ○ AI 与 Agent (14 次)                                  │
│    [手动调整]                                            │
│                                                         │
│  🎯 看起来在做的项目（可立为 Project）:                   │
│    ⦿ Orbit 应用开发 (最近活跃)                           │
│    ⦿ 个人知识库迁移                                       │
│    [手动调整]                                            │
│                                                         │
│  🗺️ 责任领域（可立为 Area）:                              │
│    ⦿ 工程 team lead                                       │
│    ⦿ 家庭与健康                                           │
│    [手动调整]                                            │
│                                                         │
│  📅 下一步建议:                                          │
│    "你的愿景还没设置。完成 PARA 初始化后，                │
│     我建议你花 10 分钟和我对话，一起梳理愿景。"           │
│                                                         │
│  [应用以上建议]  [逐项确认]  [全部跳过]                   │
└─────────────────────────────────────────────────────────┘
```

### 8.3 欢迎分析的实现（Ask-Anywhere Skill）

在 Phase 1 的 Skill 清单里我们标记过：`orbit-welcome-analysis`。

实现要点：

```typescript
// src/main/ask-anywhere/skills/welcome-analysis.ts

export const welcomeAnalysisSkill: Skill = {
  id: 'orbit-welcome-analysis',
  name: '欢迎分析',
  trigger: 'explicit',  // 不是自动激活，由初始化流程显式调用
  
  async analyze(kbPaths: string[]): Promise<WelcomeAnalysisResult> {
    // 1. 扫描所有 KB，提取 markdown 文件
    // 2. 用 LLM 批量处理（分批避免 context 爆炸），提取:
    //    - 高频主题（标签 / 关键词 tf-idf）
    //    - 活跃项目（最近修改 + 有明确目标的笔记）
    //    - 责任领域（长期出现但无具体项目）
    //    - 人物（@提及、[[人名]] 链接）
    // 3. 返回结构化结果
  }
};

interface WelcomeAnalysisResult {
  topics: Array<{ name: string; mentions: number; sample_notes: string[]; suggested_as: 'resource' }>;
  projects: Array<{ name: string; recent_activity: string; suggested_as: 'project' }>;
  areas: Array<{ name: string; commitment_hints: string[]; suggested_as: 'area' }>;
  people: Array<{ name: string; context: string }>;
}
```

### 8.4 Vision 初始化钩子（本 Phase 不实现，但预留）

在 Step 5 之后，初始化流程**建议**用户继续做 Vision 初始化：

```
"你的愿景还没设置。这对 Orbit 很重要——它决定了我帮你怎么规划。
 花 10 分钟和我对话设置？"

[去设置愿景]  [稍后]
```

点击"去设置愿景"跳转到 Vision 初始化界面（本 Phase 不实现，返回 "Coming Soon"）。

代码里保留这个路由和跳转逻辑，待 Vision Phase 填充。

---

## 9. Ask-Anywhere 相关 Skill 接入

本文档涉及 3 个 skill 的 stub 实现（skill 完整设计见未来单独讨论）：

### 9.1 `orbit-capture`（捕获）
- 触发：用户说"记一下"、"捕获"、"想到"、"保存"
- 行为：创建 `notes/captures/` 或 `notes/thoughts/` 笔记
- 自动判断 PARA 归属：基于当前 active focus + 近期笔记主题相似度

### 9.2 `orbit-retrieve`（检索）
- 触发：用户说"我之前写过"、"有没有笔记关于"、"查一下"
- 行为：跨 notes / library / kb 语义搜索
- 返回：Note/Library 列表 + 相关度

### 9.3 `orbit-welcome-analysis`（首次导入后分析）
- 触发：初始化流程 / 用户手动
- 行为：如 8.3 节

**skill 完整清单**：Phase 1 定义 10 个，本 Phase 实装上面 3 个 stub，其余后续。

---

## 10. IPC / API 接口

### 10.1 Main Process

```typescript
// src/main/note/ipc.ts

IPC.notes = {
  // 列表
  list: (filter?: NoteFilter): Promise<Note[]> => {},
  
  // 单个
  get: (noteId: string): Promise<Note | null> => {},
  getByPath: (path: string): Promise<Note | null> => {},
  
  // 创建/更新/删除
  create: (input: CreateNoteInput): Promise<Note> => {},
  update: (noteId: string, patch: Partial<NoteFrontmatter> & { body?: string }): Promise<Note> => {},
  delete: (noteId: string): Promise<void> => {},
  archive: (noteId: string): Promise<void> => {},
  
  // 搜索
  search: (query: string, options?: SearchOptions): Promise<Note[]> => {},
  
  // 订阅变化（双工：Orbit UI 改动 + Obsidian 外部改动）
  subscribe: (cb: (event: NoteChangeEvent) => void): () => void => {},
};

IPC.library = {
  list: (filter?: LibraryFilter) => {},
  get: (id: string) => {},
  addUrl: (url: string) => {},                   // 从 URL 抓取文章
  addFile: (path: string) => {},                 // 导入本地文件
  addBookmark: (url: string, metadata?: {...}) => {},
  annotate: (itemId: string, annotation: LibraryAnnotation) => {},
  distillToNote: (itemId: string, annotationId?: string) => Promise<Note> => {},
};

IPC.feeds = {
  sources: {
    list: () => {},
    add: (source: FeedSource) => {},
    remove: (sourceId: string) => {},
    update: (sourceId: string, patch: Partial<FeedSource>) => {},
  },
  items: {
    list: (filter?: FeedFilter) => {},
    saveToLibrary: (itemId: string) => {},
    dismiss: (itemId: string) => {},
  },
  refresh: (sourceId?: string) => {},             // 立即拉取
};

IPC.knowledgeBase = {
  list: () => {},                                 // 所有 KB
  import: (input: {
    name: string;
    sourcePath: string;
    sourceType: KnowledgeBase['source_type'];
    writable?: boolean;
  }) => Promise<KnowledgeBase> => {},
  remove: (kbId: string, deleteFiles?: boolean) => {},
  rescan: (kbId: string) => {},
  search: (kbId: string | 'all', query: string) => {},
  
  // 激活机制
  activate: (input: {
    kbId: string;
    sourceFile: string;
    excerpt: string;
    targetType?: 'thought' | 'capture';
    userText?: string;                             // 用户追加的文字
  }) => Promise<Note> => {},
};

IPC.para = {
  archive: (entityRef: string) => {},
  unarchive: (archiveRef: string) => {},
  move: (entityRef: string, newParaKind: NotePARAKind, newParaRef?: string) => {},
};

IPC.onboarding = {
  status: () => Promise<OnboardingStatus> => {},   // 初始化到了哪一步
  skip: () => {},
  runWelcomeAnalysis: (kbIds: string[]) => Promise<WelcomeAnalysisResult> => {},
  applySuggestions: (suggestions: WelcomeAnalysisResult) => {},
};
```

### 10.2 事件发布（进 TraceableEvent）

```typescript
// 在 src/shared/events/kinds.ts 新增
export const NOTE_EVENT_KINDS = [
  'note.created',
  'note.updated',
  'note.deleted',
  'note.archived',
] as const;

export const LIBRARY_EVENT_KINDS = [
  'library.item.added',
  'library.item.annotated',
  'library.item.status_changed',
  'library.item.distilled',
] as const;

export const FEED_EVENT_KINDS = [
  'feed.source.added',
  'feed.source.removed',
  'feed.items.fetched',
  'feed.item.saved_to_library',
  'feed.item.dismissed',
] as const;

export const KB_EVENT_KINDS = [
  'kb.imported',
  'kb.removed',
  'kb.scanned',
  'kb.activated',                    // 激活一段到 notes
  'kb.welcome_analysis_completed',
] as const;

export const PARA_EVENT_KINDS = [
  'para.archived',
  'para.unarchived',
  'para.moved',
] as const;
```

这些事件会被 Daily Timeline 消费（见文档 5）。

---

## 11. 迁移 / 兼容策略

### 11.1 现有数据处理

| 现有内容 | 迁移策略 |
|---------|---------|
| 现有的 thoughts（如果有散落的） | 扫描 + 移动到 `notes/thoughts/`，补齐 frontmatter |
| 现有的 library（Phase 1 之前有的话）| 原结构保留，迁移到 `library/` 顶层 |
| projects / areas（Phase 1 已有）| 不动 |

迁移脚本：`src/main/migrations/phase2-note-system.ts`
- 启动时检查 vault 里是否有"旧结构"
- 有则提示用户"发现旧数据，自动迁移？"
- 用户同意后执行（原子操作，失败回滚）
- 迁移完成后写入 `.orbit/migrations.json` 标记

### 11.2 Obsidian vault 兼容

- 如果用户的 vault 原本就是 Obsidian vault，导入时**识别 `.obsidian/`** 目录，不破坏
- 用户在 Obsidian 里改动笔记（外部修改）→ Orbit 文件系统 watcher 感知 → 更新内存索引 → UI 刷新
- Orbit 写入的 frontmatter 对 Obsidian **完全兼容**（YAML 格式、标准字段名）

### 11.3 冲突处理

- 文件系统 win：Orbit 内存状态以磁盘为准
- 用户同时在 Orbit 和 Obsidian 编辑同一文件：**磁盘最后写入的胜出**，Orbit 收到文件变化事件后丢弃内存未保存的改动（但弹出提示）

---

## 12. 实施步骤（AI 执行顺序）

**每一步完成后必须 build 通过，可独立 commit。**

### Step 1: 数据模型 + 存储基础（半天）
1. 新建 `src/shared/note/types.ts`
2. 新建 `src/shared/library/types.ts`
3. 新建 `src/shared/feed/types.ts`
4. 新建 `src/shared/knowledge-base/types.ts`
5. 新建 `src/main/note/store.ts`（CRUD + frontmatter 解析）
6. 新建 `src/main/library/store.ts`
7. 新建 `src/main/feed/store.ts`
8. 新建 `src/main/knowledge-base/store.ts`
9. 补齐 `src/shared/events/kinds.ts` 新增事件

### Step 2: IPC + 事件发布（半天）
1. `src/main/note/ipc.ts`
2. `src/main/library/ipc.ts`
3. `src/main/feed/ipc.ts`
4. `src/main/knowledge-base/ipc.ts`
5. `src/main/para/ipc.ts`
6. `src/main/onboarding/ipc.ts`
7. preload 暴露
8. 所有 CUD 操作发布 TraceableEvent

### Step 3: Notes 一级入口 UI MVP（1 天）
1. 新建 `src/renderer/views/NotesView.tsx`
2. 新建 `src/renderer/components/NoteList.tsx`
3. 新建 `src/renderer/components/NoteEditor.tsx`（基础 markdown 编辑）
4. 新建 `src/renderer/components/NoteFilters.tsx`
5. 左侧栏添加入口
6. 路由 `/notes`、`/notes/:noteId`

### Step 4: Library 基础 UI（半天）
1. 新建 `src/renderer/views/LibraryView.tsx`
2. LibraryItem 列表 + 详情
3. "Add from URL" / "Add PDF" / "Add Bookmark" 入口
4. 集成到 Ask-Anywhere（用户说"我保存一下这个链接..."）

### Step 5: Feed 基础 UI（半天）
1. `src/renderer/views/FeedView.tsx`
2. 订阅源管理
3. Feed items 浏览 + save/dismiss
4. 定时拉取机制（与定时任务系统协同，详见文档 2）

### Step 6: Knowledge Base 导入 + 激活（1 天）
1. KB 导入向导（文件夹选择 + 类型检测）
2. KB 扫描 + 索引（全文 + 简单向量）
3. 激活机制 UI（在 KB 笔记里选中段落 → 激活按钮）
4. 激活后创建 Note 并跳转编辑

### Step 7: 欢迎分析 + 初始化流程（1 天）
1. 初始化检测逻辑（`src/main/onboarding/manager.ts`）
2. 初始化向导 UI（5 步流程）
3. `orbit-welcome-analysis` skill stub 实现
4. 应用建议的 Project/Area/Resource 初始化
5. Vision 初始化钩子（跳转占位）

### Step 8: Obsidian 兼容（文件系统 watcher，半天）
1. `chokidar` 或 Node `fs.watch` 监听 `notes/` 和 `knowledge-base/`
2. 外部变化 → 重新加载 → 发事件到 UI
3. 冲突处理（磁盘 win + UI 提示）

### Step 9: 迁移脚本（半天）
1. 扫描旧数据
2. 迁移 UI + 进度条
3. 回滚机制

### Step 10: 测试 + 收尾（半天）
1. 集成测试：完整流程走一遍（导入 KB → 欢迎分析 → 创建 note → 编辑 → 激活）
2. Obsidian 兼容验证（在 Obsidian 里改，Orbit 能同步）
3. CHANGELOG + ADR-016（本文档定稿为 ADR）

**总计：约 6~7 天 AI 实施**

---

## 13. 验收标准

### 功能
- [ ] Notes 一级入口可见，能看到所有笔记
- [ ] 能创建 4 种类型的 note（thought/longform/capture/voice_log），frontmatter 正确
- [ ] 能编辑、删除、归档
- [ ] wikilink 自动补全工作（输入 `[[` 弹出列表）
- [ ] 反向链自动计算
- [ ] Library 能添加 URL 文章、PDF、书签
- [ ] Feed 能订阅 RSS / Newsletter
- [ ] KB 能导入（至少 obsidian 类型）
- [ ] 激活机制工作（从 KB 选段 → 生成 note，原 KB 文件不变）
- [ ] 欢迎分析初始化流程走通
- [ ] PARA 归属能正确设置
- [ ] 归档能正常移动文件

### 数据
- [ ] 所有写入 `notes/` 的文件是标准 markdown + YAML frontmatter
- [ ] Obsidian 能打开 vault 并正常显示
- [ ] 在 Obsidian 里编辑笔记，Orbit 能感知并刷新
- [ ] 删除文件的原子性保证（失败不留半截）

### 事件
- [ ] CRUD 操作都发布对应 TraceableEvent
- [ ] 事件能在 DeveloperConsoleView 看到

### 兼容
- [ ] 旧数据迁移工作（如果有）
- [ ] Phase 1 的 Task / Conversation / Ask-Anywhere 功能不受影响

---

## 14. Future-Proof 预留

架构上预留但本 Phase 不实现：

- **笔记加密**：`NoteFrontmatter.visibility: 'private'` 字段已定义，未来可扩展为加密存储
- **笔记版本历史**：考虑在 `.orbit/note-history/<id>/<version>.md` 存历史
- **协作/同步**：frontmatter 已有 `author` 字段，未来扩展多人
- **Templates**：`notes/_templates/` 目录预留
- **AI 增强编辑**：编辑器组件设计时预留 plugin 接口

---

## 附录：和既有决策的映射

| Phase 1 决策 | 本文档如何承接 |
|------------|---------------|
| D-5 Conversation 一等公民 | Note 也可作为 Conversation 的 anchor（讨论某条笔记） |
| D-6 各地方自己配置 auto agent | Note / Library 也可以配置自动 agent（如自动打标签） |
| ADR-014 Chat 解耦 | Notes 页面里的"💬 和 Ask-Anywhere 讨论" 按钮复用 ChatView |
| ADR-015 Ask-Anywhere 规划者 | 欢迎分析是 Ask-Anywhere 的第一个 skill 实战 |
