---
status: draft
created: 2026-04-23
updated: 2026-04-23
---

# Orbit Capture & Content System 设计方案

> 日期：2026-04-23
> 状态：Draft
> 范围：Quick Capture、全局标签、Voice Log、Scratch Pad、Reading/Notes 模块

---

## 一、背景与动机

Orbit 当前的内容系统围绕 **Task（任务）** 构建——Inbox 收集未分拣任务，OpLog 自动记录 agent 操作，Journal 生成每日回顾。但用户在日常使用中有大量**非任务形态的输入**需要捕获：

- 做项目时突然冒出的想法
- 阅读时的摘录和批注
- 语音形式的碎片化思考
- 不属于任何项目的随手笔记

这些内容目前没有低摩擦的入口。用户必须切换到编辑器、手动创建文件、填写 frontmatter，才能记录一条想法。

---

## 二、架构模型：三层数据流

```
Capture (输入层)  →  Processing (处理层)  →  Reflection (反思层)
```

| 层 | 职责 | 现有模块 | 新增模块 |
|---|---|---|---|
| Capture | 低摩擦输入，快速捕获原始信息 | Inbox (任务) | Quick Capture、Voice Log、Reading |
| Processing | 结构化处理、状态流转、自动记录 | Task Engine、OpLog | — |
| Reflection | 回顾、总结、沉淀为知识 | Journal (每日回顾) | Notes、Scratch Pad |

### 数据流向

```
Quick Capture ──→ Inbox (作为 task/thought 条目)
                    ↓
Voice Log ────→ Inbox (转写后的行动项)
                    ↓
Reading ──────→ 03_Resources/ (摘录)  ──→ Inbox (行动项)

Inbox ────────→ Task Engine ──→ OpLog ──→ Journal
                                           ↑
Scratch Pad ──→ 日末归档 ─────────────────→┘
                                           ↓
Journal ──────→ Inbox (明日建议 → today)

Notes ────────→ 独立存储 (02_Areas/Notes/)
              → 行动项 → Inbox
```

---

## 三、需求清单

### N1: Quick Capture（⌘J 闪念捕获）🔴 P0

**问题**：用户在任何视图（项目、阅读、看板、Journal）中突然想记录一个想法，当前没有不离开上下文的快速入口。

**方案**：全局快捷键 `⌘J` 弹出浮层，输入文本后回车即存入 Inbox，浮层消失。

#### 交互规格

```
┌───────────────────────────────────────────────────┐
│  ⌘J  Quick Capture                    ✕          │
│                                                   │
│  ┌───────────────────────────────────────────┐    │
│  │  买咖啡豆 #生活 #购物_                      │    │
│  └───────────────────────────────────────────┘    │
│                                                   │
│  ┌──────────┐  ┌─────────────────┐               │
│  │ → Inbox  │  │ 📁 无项目关联 ▾  │               │
│  └──────────┘  └─────────────────┘               │
│               当前项目置顶，默认不选中              │
└───────────────────────────────────────────────────┘
```

#### 关键决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| 默认关联当前项目？ | **否** | 用户可能在做 A 项目时想到 B 的事，自动关联会制造噪音 |
| 项目关联方式 | 独立下拉选择器 | `#` 符号保留给标签，项目是结构化元数据 |
| 标签语法 | `#tag` 行内输入 | 全应用统一语义 |
| 目标去向 | 固定进 Inbox | Capture 层只做捕获，分拣是 Processing 层的事 |
| 快捷键 | `⌘J` (macOS) / `Ctrl+J` (其他) | `⌘K` 已被 CommandPalette 占用 |

#### 数据落地

生成一条 TaskRecord 对应的 Markdown 文件：

- **存储路径**：`02_Areas/Captures/YYYY-MM-DD-<nanoid>.md`
- **Frontmatter**：
  ```yaml
  uid: <nanoid(12)>
  type: task
  title: "买咖啡豆"
  status: inbox
  tags: [生活, 购物]
  project_uid: <可选, 用户主动选择时才有>
  created_at: <ISO>
  source: quick-capture
  ```
- 写入后触发 TaskIndex 更新，Inbox 视图自动刷新

#### 实现要点

- 复用 `CommandPalette` 的 overlay 模式（`fixed inset-0 z-40`）
- 在 `VaultView` 中注册 `⌘J` 快捷键（与现有 `⌘K`/`⌘N` 并列）
- 解析 `#tag`：正则 `/#([^\s#]+)/g`
- 项目列表：`window.orbit.project.list()`
- 文件写入：现有 `fs:createFile` + `fs:writeFile` IPC

---

### N2: 全局标签系统 🔴 P0

**问题**：`#` 符号需要在全应用中保持统一语义。当前 `TaskFrontmatter.tags` 已支持标签数组，但没有统一的输入和检索体验。

**方案**：建立全局标签约定。

#### 规格

| 维度 | 规格 |
|---|---|
| 语法 | `#tag-name`，允许中文、英文、数字、连字符 |
| 存储 | frontmatter `tags: [tag1, tag2]`（与现有 TaskFrontmatter 一致） |
| 作用域 | 所有 PARA 实体（task / project / area / resource / archive） |
| `#` 的唯一语义 | 标签。不用于项目关联、不用于其他元数据 |

#### 输入点

| 场景 | 输入方式 |
|---|---|
| Quick Capture | 行内 `#tag` 自动解析 |
| Markdown 编辑器 | frontmatter `tags:` 字段（现有） |
| 未来: 标签管理视图 | 独立 UI，列出所有标签及关联条目数 |

#### 检索

- 扩展现有 `TaskFilter`，`tag` 字段已存在
- 未来可在 CommandPalette (`⌘K`) 中支持 `#tag` 前缀搜索

---

### N3: 项目关联机制 🔴 P0

**问题**：在 Quick Capture 等非项目上下文中，需要一种方式让用户**主动选择**关联项目，而不是自动推断。

**方案**：独立 UI 控件（下拉选择器），不占用任何符号位。

#### 规格

| 维度 | 规格 |
|---|---|
| 控件类型 | 下拉选择器 (select / combobox) |
| 默认值 | "无项目关联" |
| 选项排序 | 当前活跃项目（基于视图上下文）置顶 → 其余按最近使用排序 |
| 存储 | frontmatter `project_uid` 字段（与现有 TaskFrontmatter 一致） |
| 何时出现 | Quick Capture 浮层、未来的 Scratch Pad、Voice Log 详情 |

#### 与标签的边界

```
#生活          → tags: [生活]         → 分类标记，可以有多个
📁 orbit-app  → project_uid: xxx    → 项目关联，最多一个
```

---

### N4: Scratch Pad（随手便签）🟡 P1

**问题**：Quick Capture 适合一句话，但有时用户想"多写几段又不想离开当前视图"。

**方案**：在右侧 sidebar 新增 `scratch` tab。

#### 交互规格

- 右侧 sidebar tab 栏增加 `Scratch` 标签（与 files / backlinks / agent 并列）
- 内容区是一个可持续追加的文本框，每次写入自动加时间戳分隔
- 布局：竖向时间轴，最新在上

```
┌─ Scratch ──────────────────────┐
│                                │
│  ┌────────────────────────┐    │
│  │ 输入新内容…             │    │
│  └────────────────────────┘    │
│                                │
│  14:32 ─────────────────────   │
│  刚才看到一篇文章提到 RAG 的    │
│  chunk 策略可以参考…            │
│  #阅读                         │
│                                │
│  11:15 ─────────────────────   │
│  Night Shift 跑完了，结果不错   │
│                                │
│  09:20 ─────────────────────   │
│  今天先把 MCP 上下文方案定了    │
│  #orbit-dev                    │
│                                │
└────────────────────────────────┘
```

#### 数据落地

- 存储路径：`02_Areas/Scratch/YYYY-MM-DD.md`，每天一个文件，追加写入
- 格式：
  ```markdown
  ---
  uid: <nanoid(12)>
  type: area
  title: "Scratch 2026-04-23"
  ---

  ## 14:32

  刚才看到一篇文章提到 RAG 的 chunk 策略可以参考… #阅读

  ## 11:15

  Night Shift 跑完了，结果不错
  ```
- 日末（或 Daily Review 生成时）将当天 Scratch 内容注入 Journal 作为"零散记录"板块

---

### N5: Voice Log（语音日志）🟡 P1

**问题**：语音是最低摩擦的输入方式，用户希望随时录几段话，以时间轴展示。

**方案**：独立视图 + 录音能力。

#### 交互规格

- 左侧 sidebar 新增导航项 `Voice`（与 Inbox / Today / Journal 并列）
- 主视图为竖向时间轴，每段录音一个卡片

```
┌─ Voice Log ────────────────────────────────────┐
│                                                │
│  [🔴 开始录音]                                  │
│                                                │
│  2026-04-23                                    │
│  ┌──────────────────────────────────────────┐  │
│  │ 14:32  ▶ ━━━━━━━━━━━━━━━  0:42          │  │
│  │ #orbit-dev  📁 orbit-app                 │  │
│  │ (转写: 今天把 MCP 上下文方案定了…)         │  │
│  └──────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  │
│  │ 11:15  ▶ ━━━━━━━━━━━━━━━  1:23          │  │
│  │ #生活                                    │  │
│  │ (转写: 下午记得买咖啡豆…)                  │  │
│  └──────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  │
│  │ 09:20  ▶ ━━━━━━━━━━━━━━━  0:15          │  │
│  │ (未转写)                                  │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  2026-04-22                                    │
│  ...                                           │
└────────────────────────────────────────────────┘
```

#### 数据落地

- 存储路径：
  ```
  02_Areas/Voice/
  └── YYYY-MM-DD/
      ├── index.json
      ├── 143200-<nanoid>.webm
      ├── 111500-<nanoid>.webm
      └── 092000-<nanoid>.webm
  ```
- `index.json` 结构：
  ```json
  {
    "date": "2026-04-23",
    "entries": [
      {
        "id": "<nanoid>",
        "filename": "143200-abc123.webm",
        "recordedAt": "2026-04-23T14:32:00+08:00",
        "durationMs": 42000,
        "tags": ["orbit-dev"],
        "projectUid": "xxx",
        "transcript": "今天把 MCP 上下文方案定了…"
      }
    ]
  }
  ```
- 录音：浏览器 `MediaRecorder` API（Electron renderer 原生支持）
- 编码：WebM/Opus（无需额外依赖）
- 转写：预留接口，V1 可选手动输入，后续接 Whisper API
- `.webm` 文件加入 `.gitignore`（二进制不进 git）

#### 与其他模块的数据流

- 转写文本中的行动项 → 用户手动发送到 Inbox
- 录音摘要 → Daily Review Journal 中增加"语音记录"板块

---

### N6: Reading 模块 🔵 P2（概念阶段）

**定位**：Capture 层的另一个输入源。

**核心能力**：
- 导入文章/网页（URL 或粘贴文本）
- 高亮标注 + 批注
- 摘录自动存为 `03_Resources/` 下的 Markdown
- 批注中的行动项可发送到 Inbox

**存储路径**：`02_Areas/Reading/`

暂不展开，待 N1-N5 落地后细化。

---

### N7: Notes 模块 🔵 P2（概念阶段）

**定位**：Reflection 层，与 Journal 并列。

**与 Journal 的区别**：

| | Journal | Notes |
|---|---|---|
| 生成方式 | 半自动（模板 + LLM） | 纯手动 |
| 时间绑定 | 一天一篇 | 自由 |
| 内容来源 | OpLog + Task 状态 | 用户思考 |
| 用途 | 复盘 | 沉淀知识 |

**存储路径**：`02_Areas/Notes/`

暂不展开。

---

## 四、三级书写梯度

| 层级 | 入口 | 容量 | 去向 | 适用场景 |
|---|---|---|---|---|
| **闪念** | `⌘J` Quick Capture | 1-2 行 | → Inbox | 突然想到一句话 |
| **随手** | 右侧 Scratch tab | 多段话 | → 日末归档 Journal | 不想离开当前视图 |
| **深度** | 主视图 Journal / Notes | 无限 | 原地保存 | 长篇思考和总结 |

---

## 五、存储路径总览

```
<vault>/
├── 01_Projects/              # 现有
├── 02_Areas/
│   ├── Journal/              # 现有 — 每日回顾
│   ├── Captures/             # 新增 — Quick Capture 条目 (N1)
│   ├── Scratch/              # 新增 — Scratch Pad 日志 (N4)
│   ├── Voice/                # 新增 — 语音日志 (N5)
│   ├── Reading/              # 预留 — 阅读模块 (N6)
│   └── Notes/                # 预留 — 笔记模块 (N7)
├── 03_Resources/             # 现有
├── 04_Archives/              # 现有
└── .orbit/
```

---

## 六、实现路线

```
Phase 1 (P0):  N1 Quick Capture + N2 全局标签 + N3 项目关联
               ├─ 最小可用，解决"随时想写"的核心痛点
               ├─ renderer: 1 组件 (QuickCapture.tsx)
               ├─ main: 复用现有 fs IPC，无需新 handler
               └─ shared: TaskFrontmatter 已兼容，无 schema 改动

Phase 2 (P1):  N4 Scratch Pad + N5 Voice Log
               ├─ 丰富输入形态，补齐右侧面板和语音能力
               ├─ N4: 右侧 sidebar 新 tab + 追加写入逻辑
               ├─ N5: 新视图 + MediaRecorder + voice IPC namespace
               └─ N5 转写功能可后接，V1 先支持手动输入

Phase 3 (P2):  N6 Reading + N7 Notes
               ├─ 完成内容系统全貌
               └─ 需要新的编辑器交互（高亮批注等），独立设计
```

---

## 七、与现有系统的集成点

| 集成点 | 涉及文件 | 改动性质 |
|---|---|---|
| 快捷键注册 | `src/renderer/src/views/VaultView.tsx` | 增加 `⌘J` handler |
| Quick Capture 组件 | `src/renderer/src/components/QuickCapture.tsx` | 新建 |
| 文件写入 | `src/main/fs.ts` | 复用现有 `createFile` / `writeFile` |
| TaskIndex 兼容 | `src/main/tasks.ts` | `02_Areas/Captures/` 下 `type: task` 文件自动入 Inbox |
| 标签解析 | `src/shared/schemas.ts` | `tags` 字段已存在，无需改 schema |
| 项目列表 | `src/shared/ipc.ts` | `project:list` 已存在 |
| Scratch tab | `src/renderer/src/views/vaultRightSidebarModel.ts` | 增加 tab 定义 |
| Voice 视图 | `src/renderer/src/views/VoiceLogView.tsx` | 新建 |
| Voice IPC | `src/shared/ipc.ts` | 新增 `voice` namespace |
| Voice 存储 | `src/main/voice.ts` | 新建 |
| Daily Review 集成 | `src/main/review/daily.ts` | `collectDailyData` 增加 Scratch / Voice 汇总 |
| 侧边栏导航 | `src/renderer/src/components/Sidebar/ProjectsNav.tsx` | 增加 Voice 导航项 |
| `.gitignore` | `src/main/templates/` | Voice `.webm` 文件排除 |
