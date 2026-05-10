# Project Materials — Scope Model Plan

> **Status**: proposed (design finalized 2026-05-09, implementation pending)
> **Goal**: 给 Project 加一个"素材（Materials）"子系统，让用户在做项目时能把散落在本地/网络的素材有序地组织进来，供 AI 使用。
> **Architecture refs**: `docs/architecture/entity-flow.md` (Project flow), `docs/decisions/ADR-008` (propose-approve authorization chain), `docs/VISION.md` (AI-Native principle)
> **Supersedes**: 本方案经历了 3 轮演进，最终稿，前两稿仅作为思考脉络保留在本文档 §11。

---

## 0. TL;DR

- 项目目录下新增 `assets/` 子系统，核心是 `_manifest.md`。
- 素材粒度是 **Scope**（目录 / glob / URL 等"语义范围"），而非文件清单；精选的单文件叫 **Pin**。
- 本地文件分两种 mode：`reference`（只记路径，文件在原位置）/ `imported`（真复制进项目，供归档固化用）。
- **Agent 不扫磁盘，只用已授权 scope**。用户通过 file-picker / CLI / chat 明示授权；AI 主动建议的 scope 必须走 Inbox 审批。
- 匹配 Orbit 核心哲学：AI-native（AI 通过 CLI 访问）、propose-approve（AI 动文件必审批）、local-first（素材在用户盘上）、认知粒度（scope 对齐人脑里的"文件夹"概念）。

---

## 1. Problem

当前 Project 目录下没有用户素材区：

```text
01_Projects/<slug>/
├── README.md, AGENT.md, config.json
├── tasks/, memories/, skills/, logs/
└── .orbit/           # agent 工作区
```

做一个"埃及游记 vlog 项目"时，用户面对的真实素材情形：

| 素材类型 | 例子 | 体积 | 所在位置 |
|---|---|---|---|
| 视频原片 | 200 GB DJI 素材 | 大 | `~/Movies/Egypt_2024/` |
| 照片 | 14 GB RAW + JPG | 中 | `~/Pictures/Egypt/`、macOS Photos |
| 参考文章 | 维基百科、学术 PDF | 小 | Web / `~/Downloads/` |
| 过程脚本 | `script-v1.md` → `v5.md` | 极小 | 项目内 |
| 最终成品 | `final.mp4`, thumbnail | 中 | 项目内 |

Project Room 里必须有一个地方能让用户：

1. **组织**——看到这个项目涉及哪些素材
2. **使用**——让 AI 基于素材做事（整理、检索、生成脚本、剪 b-roll 建议）
3. **固化**——归档时把关键素材随项目一起留存

约束（必须满足）：
- 大文件不能进 git
- 存量素材不能被强制移动
- AI 访问本地文件的边界必须清晰（不能扫盘、不能越权）
- 要对齐已有 propose-approve + CLI-first 架构

---

## 2. Core model: Scope + Pin

### 2.1 Two-layer granularity

```text
Scope   =  "粗粒度范围"    →  对齐人脑的"文件夹 / 主题"概念
Pin     =  "精选单文件"    →  对齐人脑的"星标 / 重点"概念
```

99% 的素材属于某个 scope，不值得单独记录；1% 的素材值得单独命名（hero shot、片头候选、决赛圈镜头）。

### 2.2 Scope kinds

| Kind | Source 格式 | 说明 |
|---|---|---|
| `folder` | 绝对路径 | 递归包含整个目录 |
| `glob` | glob 表达式 | 跨目录匹配 |
| `file` | 绝对路径 | 单个本地文件（通常配合 pin 使用） |
| `url` | `https://...` | 单个网页 / PDF URL |
| `app-library` (future) | `photos://album/"Egypt 2024"` | macOS Photos 等 app 库 |
| `cloud` (future) | `gdrive://...` / `icloud://...` | 云盘 |

v1 只实现 `folder` / `glob` / `file` / `url` 四种，其余预留。

### 2.3 Mode: reference vs imported

| Mode | 文件位置 | 进 git | 用途 |
|---|---|---|---|
| `reference` | 原位置不动 | ❌ 仅 manifest 进 git | 大文件、存量素材、URL |
| `imported` | 复制到 `assets/imported/` | ✅ 视大小决定 git / git-lfs / gitignore | 最终成品、防失效快照、必须随项目走的小文件 |

**语义演化**：`imported/` 不是素材主体，而是"项目自包含性快照 + 防失效副本"。绝大多数素材是 reference。

### 2.4 Lifecycle

```text
①  add scope        "这批素材在那"           manifest 写一条
       ↓
②  AI use           "按需从 scope 里取用"    走 CLI，不扫盘外
       ↓
③  pin file         "这条特别重要"           manifest 加 file 条目
       ↓
④  promote          "固化到项目"             copy 到 imported/
       ↓
⑤  archive          "跟项目一起归档"         Archives/<slug>/imported/
```

---

## 3. Authorization boundary (hard constraint)

> **AI 不扫磁盘。只能访问用户明示授权过的 scope。**

### 3.1 Authorization sources

只有三条路径能写入 scope：

| 路径 | 机制 | `authorized_via` 字段值 |
|---|---|---|
| A. Materials 面板 `+ Add scope` | Electron `dialog.showOpenDialog` | `file-picker` |
| B. CLI `orbit assets add-scope <path>` | 需 `--confirm` 或交互式确认 | `cli-manual` |
| C. 对话中用户说出路径 | AI 调 `add-scope`，manifest 记录原话 | `chat-confirmed` |

**B 和 C 在 CLI 层统一，CLI 做目录 stat 校验**。

### 3.2 What AI cannot do

- ❌ `find ~/ -name "*.mp4"` 等任何扫描命令
- ❌ 列出 `~/` 下的顶层目录
- ❌ 读取未在 scope 内的文件
- ❌ 在对话里提出"我猜你电脑里应该有 xxx 文件夹"这种无依据建议
- ❌ 主动把 URL 加为 reference（除非 URL 来自已授权素材或用户对话）

### 3.3 What AI can do

- ✅ 读 `_manifest.md`，列出所有授权 scope
- ✅ 在已授权 scope 内：列文件、读内容、按 exif/mtime 过滤、聚类、生成缩略图、统计
- ✅ 建议用户**扩展** scope——但**证据必须来自已授权文本**（manifest 内文件、conversation、README 等），且建议走 Inbox 审批
- ✅ 在已授权 scope 里建议 pin

### 3.4 Agent system prompt clause

每个 runtime 的 system prompt 必须注入以下刚性条款：

```text
## Asset access boundary

The only way you can access local files in this project is through scopes
declared in `assets/_manifest.md`.

1. Read `_manifest.md` first to see what you are allowed to access.
2. Never propose file paths the user has not mentioned or authorized.
3. Never run fs globs, `find`, `ls`, or scanning commands outside
   authorized scopes.
4. If you need access to something new, create an Inbox Proposal asking
   the user to authorize a new scope. Wait for approval.

This is a hard constraint. Authorization is user-only.
```

---

## 4. Directory layout

```text
01_Projects/egypt-vlog/
├── README.md, AGENT.md, config.json         # 保留
├── tasks/, memories/, skills/, logs/        # 保留
├── .orbit/                                  # 保留
│   └── assets-cache/                        # ★ scope 扫描结果缓存（不进 git）
│       └── <scope-id>.json
│
├── assets/                                  # ★ 新增
│   ├── _manifest.md                         # ★ 真相源
│   ├── INDEX.md                             # 可读版索引（可选，由 manifest 生成）
│   ├── imported/                            # 真副本
│   │   ├── final-thumbnail.jpg
│   │   └── selected-bgm.mp3
│   ├── references/                          # URL 抓取的 markdown 缓存
│   │   └── khufu-wiki.md
│   └── .gitignore                           # imported/ 大文件默认 ignore
│
└── (未来可选) deliverables/                  # 项目成品的专属目录
```

**Finder 里打开项目目录**：能看到 `imported/` 的真副本和 `references/` 的网页缓存，manifest 是 markdown 人眼可读。reference 类素材**不会**出现在 Finder 里——这是设计决定（Orbit 是唯一入口）。

---

## 5. Manifest schema

`assets/_manifest.md`：

```markdown
---
# Project asset manifest · schema v1
# This file is the source of truth for which assets belong to this project.
# AI MUST read this file before accessing any local resources.

scopes:
  - id: egypt-footage
    title: 埃及旅拍原片
    kind: folder
    source: /Users/you/Movies/Egypt_2024/
    recursive: true
    file_types: [mp4, mov]
    mode: reference                          # reference | imported
    tags: [旅拍, 视频, 埃及]
    note: "所有原始视频，按日期命名"
    authorized_by: user                      # user only; agent cannot write here
    authorized_via: file-picker              # file-picker | cli-manual | chat-confirmed
    authorized_at: 2026-05-01T10:00:00+08:00
    stats:                                   # optional cache, refreshed on demand
      file_count: 342
      total_bytes: 218000000000
      last_scanned_at: 2026-05-01T10:05:00+08:00

  - id: egypt-photos
    title: 埃及照片（含 RAW）
    kind: glob
    source: /Users/you/Pictures/Egypt/**/*.{jpg,raw,heic}
    mode: reference
    tags: [旅拍, 照片]
    authorized_by: user
    authorized_via: chat-confirmed
    authorized_at: 2026-05-01T11:00:00+08:00

  - id: khufu-wiki
    title: Khufu Pyramid Construction
    kind: url
    source: https://en.wikipedia.org/wiki/Khufu
    mode: reference
    cached_md: references/khufu-wiki.md      # 可选：抓取的本地 markdown
    tags: [埃及, 金字塔, 考古]
    authorized_by: user
    authorized_via: chat-confirmed
    authorized_at: 2026-05-02T09:00:00+08:00

  - id: final-thumbnail
    title: 最终封面
    kind: file
    source: assets/imported/final-thumbnail.jpg   # 相对项目根
    mode: imported
    tags: [成品, 封面]
    authorized_by: user
    authorized_via: file-picker
    authorized_at: 2026-05-03T15:00:00+08:00

pins:
  - scope_id: day3-sunset-hero
    title: 片头首选镜头 · 开罗日落
    source: /Users/you/Movies/Egypt_2024/DJI_0432.mp4
    parent_scope: egypt-footage
    tags: [b-roll, hero-shot, day3]
    note: "42s，画质最好的日落，决赛圈"
    pinned_by: user                          # user | agent (via approved proposal)
    pinned_at: 2026-05-04T10:00:00+08:00
---

# Materials

这里可以放人读的说明、工作笔记等。manifest 由 frontmatter 驱动，正文仅供展示。
```

### 5.1 Schema invariants

- `scopes[].authorized_by` 只能是 `user`；不允许 `agent`
- `scopes[].id` 必须全 manifest 唯一
- `scopes[].mode = imported` 时 `source` 必须是相对项目根的路径，指向 `assets/imported/` 内
- `pins[].parent_scope` 必须指向已存在的 scope id
- `url` kind 允许 `cached_md`，其他 kind 不允许

### 5.2 Why single file (not per-asset files)

- v1 项目级素材量级 < 几百 scope，单文件够用
- AI 一次读完整张素材地图，理解成本低
- 比分文件 `assets/_index/<id>.md` 简单
- 等真的超过规模再拆——届时可做 `_manifest.md` 入口 + `_manifest.d/` 分片目录

---

## 6. APIs (IPC + CLI)

### 6.1 IPC (main ↔ renderer)

```typescript
// renderer/src/types/assets.ts
export type AssetScopeKind = 'folder' | 'glob' | 'file' | 'url';
export type AssetMode = 'reference' | 'imported';
export type AuthorizedVia = 'file-picker' | 'cli-manual' | 'chat-confirmed';

export interface AssetScope {
  id: string;
  title: string;
  kind: AssetScopeKind;
  source: string;
  mode: AssetMode;
  recursive?: boolean;
  file_types?: string[];
  cached_md?: string;
  tags: string[];
  note?: string;
  authorized_by: 'user';
  authorized_via: AuthorizedVia;
  authorized_at: string;
  stats?: AssetScopeStats;
}

export interface AssetScopeStats {
  file_count: number;
  total_bytes: number;
  last_scanned_at: string;
}

export interface AssetPin {
  scope_id: string;          // pin 自己的 id（为保持一致，复用 id 字段空间）
  title: string;
  source: string;
  parent_scope?: string;
  tags: string[];
  note?: string;
  pinned_by: 'user' | 'agent';
  pinned_at: string;
}
```

IPC 方法（projectUid 入参隐含）：

- `assets.manifest.get(projectUid)` → `{ scopes, pins }`
- `assets.scope.add(projectUid, partial, source: AuthorizedVia)` → scope
- `assets.scope.remove(projectUid, scopeId)`
- `assets.scope.update(projectUid, scopeId, patch)`
- `assets.scope.scan(projectUid, scopeId, opts?)` → `{ files: AssetFileEntry[], stats }` 只扫已授权 scope
- `assets.scope.stat(projectUid, scopeId)` → `stats` 仅元数据
- `assets.pin.add(projectUid, pin)`
- `assets.pin.remove(projectUid, pinId)`
- `assets.import.fromPath(projectUid, absPath, opts)` → 复制文件进 `imported/`
- `assets.import.promoteScope(projectUid, scopeId)` → reference 固化成 imported（适用小文件）
- `assets.import.fetchUrl(projectUid, url)` → 抓 URL 成 markdown 入 `references/`
- `assets.import.revealInFinder(projectUid, scopeIdOrPath)`
- `assets.import.openExternal(projectUid, scopeIdOrPath)`
- `assets.health.check(projectUid)` → 检查 scope 是否 dangling / URL 是否 200

### 6.2 CLI (for AI)

AI 只能通过 CLI 访问素材。CLI 在执行时对 scope 边界做 enforcement。

```bash
orbit assets list                                   # 列 scope + pin
orbit assets show <scope-id>                        # 单个 scope 详情
orbit assets scan <scope-id> [--filter <glob>] [--limit N]
                                                    # 扫授权 scope 内文件（不跨 scope）
orbit assets stat <scope-id>                        # 统计（不读内容）
orbit assets read <abs-path-or-scope-relative>      # 读文件（验证落在某 scope 内）

orbit assets add-scope <abs-path> [--title T] [--kind folder|glob|url]
                                                    # 交互式确认 或 --confirm
                                                    # 写入 authorized_via: cli-manual
orbit assets propose-scope <abs-path> --title T
                                                    # 仅下发提议到 Inbox，不直接写 manifest
orbit assets pin <file-abs-path> [--parent <scope-id>] [--title T]
orbit assets unpin <pin-id>

orbit assets import <abs-path> [--dest imported/...]
                                                    # 复制进 imported/
orbit assets promote <scope-id>                     # reference → imported
orbit assets fetch-url <url>                        # URL → cached_md
```

**AI 绝对不能调用的命令**（CLI 层不提供）：

- `orbit assets scan <path-outside-scope>` → 返回 "scope not authorized"
- `orbit assets find ~/...` → 命令不存在
- 任意 shell `find` / `ls` / `glob` 走 orbit fs 能力 → fs 层校验 scope 白名单

### 6.3 Enforcement point

核心 enforcement 在 `main/assets/access-control.ts`（新增）：

```typescript
// 所有 AI 发起的文件访问请求都过这个函数
export function assertPathAuthorized(
  projectRoot: string,
  manifest: AssetManifest,
  targetAbsPath: string
): void {
  // 遍历所有 scope，检查 targetAbsPath 是否落在某个 folder/glob/file scope 内
  // 落入任何一个 authorized scope 则放行
  // 否则 throw AuthorizationError
}
```

这个函数被 CLI handler、IPC handler、runtime adapter（如果有 file-read tool）统一调用。

---

## 7. UI — Materials panel in Project Room

### 7.1 Placement

在 `ProjectRoomView.tsx` 的 tab 组里新增 `Materials` tab（与 Overview / Kanban / Terminal / Sessions 并列）。不是顶层导航。

### 7.2 Layout

```text
┌─ Materials ────────────────────────────────────────────────────────┐
│  [Map] [Pinned] [Imported] [Search]         [+ Add scope] [🤖 Ask] │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  📁 埃及旅拍原片              342 files · 218 GB      🔗 reference │
│     /Users/you/Movies/Egypt_2024/                                  │
│     tags: 旅拍 · 视频 · 埃及                                        │
│     [Browse] [Scan with AI] [Reveal] [Remove]                      │
│     ┌─ 2 pinned from this scope ────────────────────────────┐      │
│     │ 🎬 day3-sunset-hero    决赛圈 · 42s                    │      │
│     │ 🎬 day5-market-crowd   市集人群 · 1:12                 │      │
│     └──────────────────────────────────────────────────────┘      │
│                                                                    │
│  📁 埃及照片（含 RAW）       8432 files · 64 GB       🔗 reference │
│     glob: ~/Pictures/Egypt/**/*.{jpg,raw,heic}                    │
│                                                                    │
│  🔗 Khufu Pyramid Construction                         🔗 URL     │
│     wikipedia.org · cached ✓                                      │
│                                                                    │
│  📦 imported/ (project-local)                                     │
│     2 files · 8 MB                                                │
│     └ final-thumbnail.jpg, selected-bgm.mp3                       │
└────────────────────────────────────────────────────────────────────┘
```

### 7.3 Tab semantics

| Tab | 展示 |
|---|---|
| **Map** | scope 列表（主视图）。每条 scope 一卡，显示 stats、tags、note、关联的 pins |
| **Pinned** | 所有 pin 的扁平列表。便于"找精选" |
| **Imported** | `imported/` 目录的真副本。树视图 + 文件图标 |
| **Search** | 跨 scope 搜索（仅已授权范围）。按 filename / tag / note 搜 |

### 7.4 Key interactions

1. **`+ Add scope`** 下拉：
   - `From folder...` → Electron openDialog(directory)
   - `From file...` → openDialog(file)
   - `From URL...` → 文本输入框
   - `From glob...` → 文本输入框，实时预览匹配
   - 全部走 `file-picker` 或等价 UI 授权，不走 AI

2. **`🤖 Ask`** 按钮 → 打开 Ask-Anywhere 弹窗，scope 预设为当前项目。用户可以说：
   - "在埃及旅拍里找日落镜头"
   - "把 ~/Movies/Egypt_2024/ 加为素材范围" → AI 调 `add-scope`（chat-confirmed）
   - "把这三条 pin 起来"

3. **scope 卡片的 `[Scan with AI]`**：快捷入口，等同于打开 Ask-Anywhere 并预填 "在 scope X 内帮我..."

4. **dangling 提示**：health check 失败的 scope 卡片显示 ⚠️ 红色边 + [Locate / Remove] 按钮

5. **Pin 的创建**：Scope browser 内选中一个文件 → 右键 / 快捷键 → "Pin to project"；或 AI 在对话里提议 → 进 Inbox 审批 → approve 后写 manifest

### 7.5 Right-side drawer (shared with other views)

点击任意素材 → 右侧抽屉打开对应 reader：

| Kind | Reader |
|---|---|
| video / audio | media player（HTML5 video/audio） |
| image | lightbox |
| pdf | PDF viewer（保留占位，v1 可 fallback Reveal） |
| url | markdown reader（读 cached_md）+ "Open in browser" |
| markdown | MarkdownEditor |
| other | 文件元数据 + "Open with..." |

抽屉底部始终有一个 `[💬 Chat about this asset]`，打开一个 scoped conversation（对齐 `docs/architecture/chat-conversation-surface.md`）。

---

## 8. Interaction flows

### 8.1 用户新建项目后首次加素材

```text
User: 创建项目 egypt-vlog
Orbit: 项目建好。Materials 面板空。
User: [点 Materials] → [+ Add scope] → [From folder...] → 选 ~/Movies/Egypt_2024/
Orbit: 加一条 scope（authorized_via: file-picker）
       自动后台 stat 统计 file_count 和 total_bytes
       Map 视图刷新
```

### 8.2 AI 整理存量素材（对话驱动）

```text
User: "把我埃及旅行的素材整理一下"
AI:   "我现在不知道它们在哪。告诉我目录路径，或者你在 Materials 面板点 + 号。"
User: "原片在 ~/Movies/Egypt_2024/，照片在 ~/Pictures/Egypt/"
AI:   [调 orbit assets add-scope ~/Movies/Egypt_2024/ --title "埃及旅拍原片"]
      [调 orbit assets add-scope ~/Pictures/Egypt/ --title "埃及照片"]
      → 两条 scope 写入 manifest（authorized_via: chat-confirmed）
      "加好了。埃及旅拍原片 342 个文件 218GB，照片 8432 个 64GB。
       要我看看有没有值得 pin 的精选镜头吗？"
User: "好"
AI:   [调 orbit assets scan egypt-footage --filter "*.mp4"] 
      → 根据文件名 / exif 聚类，选出 5 个候选
      → 生成 Inbox Proposal："建议 pin 这 5 个镜头，原因..."
User: [去 Inbox 审批] → approve 3 / reject 2
      → 3 条 pin 写入 manifest（pinned_by: agent → 但经 user approve）
```

### 8.3 AI 在已授权 scope 内做事

```text
User: "在埃及素材里找日落镜头，给我候选"
AI:   [读 manifest]
      [调 orbit assets scan egypt-footage --filter "*.mp4" --limit 100]
      [按文件名关键词 sunset/dusk + 按 exif 拍摄时间段过滤]
      → 返回 7 个候选 + 缩略图（缩略图由 main 进程后台生成，缓存在 .orbit/assets-cache/）
      → 用户在 chat 里能看到 inline 预览
User: "第 3、5 个 pin 一下"
AI:   [调 orbit assets pin <path> --parent egypt-footage]
```

### 8.4 AI 越界的处理

```text
User: "看看我还有什么别的视频素材"
AI:   "我只能看到你授权过的 scope。目前有：
       - egypt-footage (~/Movies/Egypt_2024/)
       - egypt-photos (~/Pictures/Egypt/)
       如果有别的目录，告诉我路径。"
```

AI 不会主动 ls `~/Movies/`，即使用户语义上在问"别的"。

### 8.5 归档时的固化

```text
User: [点 "结项 / Close project"]
Orbit: "这个项目有 47 条 reference 素材。
        检测到 deliverables 提到了其中 12 条。
        [固化这 12 条] [全部 reference 丢弃] [自己挑]"
User: [固化这 12 条]
      → 12 条 reference 被 copy 到 imported/
      → manifest 更新 mode 为 imported
      → 整个项目搬到 04_Archives/egypt-vlog/
      → Archive 自包含，即使几年后用户清理硬盘也不烂
```

---

## 9. Interactions with existing subsystems

| 子系统 | 关系 |
|---|---|
| **PARA / entity-flow** | Scope 是 Project 的私有素材地图。归档时 imported/ 进 Archive。distill 阶段可把 pin 相关 note → Resource。 |
| **Inbox / propose-approve** | AI 建议加 scope、pin、promote 都走 Inbox。approve 后才写 manifest。 |
| **CLI-first (ADR-008)** | 素材访问全部走 `orbit assets` CLI。fs 层做 scope 白名单校验。 |
| **Ask-Anywhere** | Materials 面板的 `🤖 Ask` 打开 Ask-Anywhere，scope 预设为当前项目。 |
| **Conversation scope** | 素材抽屉里的 Chat 是 scoped conversation（scope = 这条素材）。 |
| **Activity log** | add-scope / import / promote 等动作都 emit event 入 activity log。 |
| **Timeline** | Scope 添加、imported 固化、归档时的素材 distillation 是 timeline 事件。 |
| **Library (vault 级)** | v1 项目 scope 和 vault Library 独立。v2 考虑：URL 型 scope 可以共享 Library entry。 |
| **Memory / KB** | 不干扰。素材是项目私有，不自动进 memory。 |

---

## 10. Implementation plan

### Phase A — Data layer foundation (2-3 d)

- [ ] `shared/constants.ts` 加 `PROJECT_ASSETS_DIR = 'assets'`、`ASSETS_MANIFEST = '_manifest.md'`、`ASSETS_IMPORTED_DIR = 'imported'`、`ASSETS_REFERENCES_DIR = 'references'`
- [ ] `shared/assets.ts` 定义 `AssetScope` / `AssetPin` / `AssetManifest` + frontmatter schema + zod validator
- [ ] `main/assets/manifest.ts` 读写 `_manifest.md`（frontmatter read/update）
- [ ] `main/assets/access-control.ts` 实现 `assertPathAuthorized`
- [ ] 向后兼容：旧项目打开时，`ensureProjectAssetsLayout()` 自动 mkdir + 写空 manifest

### Phase B — IPC & CLI (2-3 d)

- [ ] IPC handler: `assets.manifest.*` / `assets.scope.*` / `assets.pin.*` / `assets.import.*` / `assets.health.*`
- [ ] CLI: `orbit assets list/show/scan/stat/read/add-scope/propose-scope/pin/unpin/import/promote/fetch-url`
- [ ] CLI 所有文件读写过 `assertPathAuthorized`
- [ ] Agent system prompt 加 "Asset access boundary" 段（`main/agent/persona.ts`）

### Phase C — Materials panel UI (3-4 d)

- [ ] `views/ProjectMaterialsView.tsx` 新 view；注入 `ProjectRoomView` tab
- [ ] Map tab（scope 卡片列表）
- [ ] Pinned tab（扁平 pin 列表）
- [ ] Imported tab（`imported/` 树视图）
- [ ] `+ Add scope` 下拉 + 各 kind 的对话框
- [ ] 右侧抽屉 reader（v1 先支持 markdown / image / video / url）
- [ ] dangling 健康提示

### Phase D — AI integration (2 d)

- [ ] Ask-Anywhere 在 Materials 面板打开时预设项目 scope
- [ ] AI propose-scope → Inbox Proposal 卡片
- [ ] AI propose-pin → Inbox Proposal 卡片
- [ ] 素材抽屉的 "Chat about this asset" → scoped conversation

### Phase E — Archive integration (1 d)

- [ ] `distill.project` 之前加一步："scope 固化提议"对话框
- [ ] 归档时 imported/ 原样带走；references/ 按策略处理

### Phase F — Polish (1-2 d)

- [ ] scope 增量扫描（基于 dir mtime，缓存到 `.orbit/assets-cache/`）
- [ ] URL scope 的 fetch-url 后台任务
- [ ] 缩略图生成（video/image）缓存
- [ ] E2E 测试：从 add-scope 到 pin 到 promote 到 archive 的完整路径

**总计**：约 11-15 人日。

---

## 11. Design journey (for context, not implementation)

本方案经历三轮讨论演进，记录演进路径便于未来 review：

### V1 — Symlink-based (discarded)

最初设想：`assets/linked/` 目录下为每个 reference 素材建 symlink，`assets/imported/` 是真副本。

**问题**：
- symlink 跨平台兼容性差（Windows junction、iCloud 破坏）
- git 对 symlink 处理混乱
- 几百个素材 = 几百个 symlink，git diff 噪音大
- 用户原目录结构变了 → 一片 dangling link

### V2 — Manifest-only, per-file (discarded)

改为取消 symlink，每个素材在 manifest 里一行 YAML。

**问题**：
- manifest 几百行，加素材负担大
- AI 要读一大堆路径，理解负担高
- git diff 变成 "文件列表级" 而非 "语义级"

### V3 — Scope + Pin (adopted, this doc)

从"索引文件"跃迁到"索引语义单元"：

- 目录/URL 作为 scope 是**主力**
- 精选单文件作为 pin 是**补充**
- Manifest 从"清册"变成"地图"
- 匹配人脑认知（文件夹 > 星标文件）
- AI 读一张地图，而非一个清单

### V4 refinement — Authorization boundary (adopted)

在 V3 基础上加上"**不扫盘**"硬约束：

- 消除 FDA 权限请求、隐私焦虑、性能问题
- AI 的角色从"主动侦察"降级为"仓库管理员"
- 跟 v2 propose-approve 架构无缝对齐
- 实施复杂度大幅下降

最终方案 = V3 模型 + V4 边界。

---

## 12. Open questions (for future)

这些问题本次 plan 不回答，留作 v2：

1. **Cross-project scope sharing**：同一个 "Khufu Wikipedia" 同时服务多个埃及项目时，是否支持 vault 级 `.orbit/vault-scopes.md` + project include 语法？
2. **macOS Photos.app 集成**：直接读 Photos library（SQLite）还是强制用户先导出？
3. **Cloud storage**：iCloud Drive 占位符、Google Drive、Dropbox 的 scope kind。
4. **Scope 与 vault 级 Library 的关系**：URL 型 scope 可否自动 upsert 到 Library？双向引用如何设计？
5. **Thumbnail / preview cache 的 GC 策略**：`.orbit/assets-cache/` 何时清理？项目归档时是否随归档？
6. **Full-text scope**：对 scope 内所有 markdown / text / PDF 做索引，支持跨 scope 语义搜索。可能复用 vector indexer。
7. **权限降级**：scope 存在但 OS 权限被撤销（比如 macOS TCC 变更）如何优雅提示？

---

## 13. Acceptance criteria

实施完成的判定标准：

- [ ] 旧项目打开时自动建 `assets/` 目录和空 manifest，不破坏现有功能
- [ ] 用户可通过 file-picker / CLI / chat 三种路径加 scope，manifest `authorized_via` 正确记录
- [ ] AI **无法**通过任何途径访问未授权目录（e2e 测试验证：模拟 AI 调 `orbit assets read <unauthorized-path>` 必返 error）
- [ ] AI 在 scope 内可 list / read / 按过滤条件扫描
- [ ] AI 提议加 scope / pin 时走 Inbox 审批，approve 后才写 manifest
- [ ] Materials 面板 Map / Pinned / Imported / Search 四 tab 可用
- [ ] 右侧抽屉支持 markdown / image / video / url 四种 reader
- [ ] 归档时触发 scope 固化对话，imported/ 原样带进 Archives
- [ ] dangling scope 健康检查提示准确
- [ ] 所有 assets 相关动作产生 activity log 事件

---

## 14. Related docs

- `docs/architecture/entity-flow.md` — Project / Conversation / Resource entity flow
- `docs/decisions/ADR-008-cli-first-ai-native.md` — CLI 作为 AI 主通道
- `docs/plans/2026-04-26-inbox-v2-architecture.md` — Inbox propose-approve 审批链
- `docs/plans/2026-04-28-ask-anywhere-ux-revamp.md` — Ask-Anywhere 集成
- `docs/VISION.md` — AI-Native 原则
