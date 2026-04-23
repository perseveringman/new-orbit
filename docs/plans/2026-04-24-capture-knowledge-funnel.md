---
status: draft
created: 2026-04-24
updated: 2026-04-24
---

# Orbit Capture & Knowledge Funnel 设计方案

> 日期：2026-04-24
> 状态：Draft
> 范围：Quick Capture、Resource Workspace、Reading Capture、Draft Mode、Voice（延后）

---

## 一、问题重述

2026-04-23 的 `Capture & Content System` 草案已经不再适配 Orbit 当前形态。

它提出的问题是对的：Orbit 缺少低摩擦输入入口，用户难以在不中断当前工作的情况下快速记下一条想法、摘录一个链接、沉淀一段笔记。

但它依赖的产品前提已经过时：

- Orbit 不再只是 “Inbox + Journal + Task Engine”
- Orbit 已经形成 **Vision / Areas / Projects / Sessions / Distillation / External Notes / Resources** 的主链
- 当前真正缺的是 **Capture 前半段** 与 **一等的 Resource / Knowledge 工作区**

所以新的方案不再从“新增几个模块”出发，而从“如何把任意输入稳定转成 task / resource，并接入现有 review、distill、retrieval 链路”出发。

---

## 二、当前系统现实

### 已经存在的后半段能力

| 能力 | 当前状态 | 含义 |
| --- | --- | --- |
| Inbox / Today / Kanban | 已落地 | 行动项已有完整分拣与执行面 |
| Journals / Daily Review | 已落地 | 反思层已经存在 |
| Distillation | 已落地 | 项目经验可以沉淀为 reusable resource |
| External Notes Import | 已落地 | 外部笔记已能进入 Orbit |
| Vision / Area Room | 已落地 | Area 已成为一等工作单元 |
| Session History | 已落地 | agent 对话与执行过程可回看 |
| Vector Wake-up / Resource Search | 已落地 | 资源已经参与唤醒与推荐 |

### 当前缺口

1. **没有统一 Capture 入口**
2. **没有一等 Resource Workspace**
3. **输入内容缺少稳定路由**
4. **Reading / Notes / Voice 仍停留在概念层，且旧设计方向偏离当前主干**

---

## 三、设计原则

### P1. 先定义 canonical entity，再设计入口

Orbit 的输入系统不应该先发明 `Scratch`、`Voice`、`Reading` 这样的孤立模块，而应该先定义最终会落成什么。

本方案只承认两类主要输出：

1. **Action capture** → `type: task`
2. **Knowledge capture** → `type: resource`

---

### P2. 内容沉淀统一进入 `03_Resources/`

当前 `03_Resources/` 已经承载：

- distill 输出
- external notes 导入
- vector 检索与 wake-up 的核心语料

因此，手动笔记、阅读摘录、转写文本等知识内容，都应该优先进入 `03_Resources/`，而不是再在 `02_Areas/` 下平行发明新的 Notes / Reading 子系统。

---

### P3. Capture 只做低摩擦输入，不做过早分拣

Capture 的职责是：

- 快速记录
- 补充最少必要结构化信息
- 把内容交给现有系统继续处理

Capture 不应在第一步就变成复杂编辑器。

---

### P4. Area / Project 都是一等上下文

旧方案只考虑 `project_uid`，这已经落后于当前产品结构。

现在用户很多输入天然发生在：

- 当前 Project
- 当前 Area（尤其是 Vision Area）
- 无上下文全局空间

所以新的 capture 模型必须支持：

- `project_uid`
- `area_uid`
- 无关联

---

### P5. Markdown / Git-first 不动摇

Orbit 的 canonical artifact 仍然应该是：

- 明确 frontmatter 的 Markdown
- 可索引、可版本化、可被 agent 消费

这意味着像 Voice 这样的能力，如果进入系统，最终 canonical 也应是 transcript markdown，而不是音频二进制。

---

## 四、目标架构

### 总体漏斗

```text
Capture Source
  ├─ Quick Capture
  ├─ Link / URL
  ├─ External Notes
  ├─ Reading Highlight
  └─ Voice Transcript

      ↓ normalize

Canonical Entity
  ├─ task
  └─ resource

      ↓ route

Operational Surfaces
  ├─ Inbox / Today / Kanban
  ├─ Resource Workspace
  ├─ Area / Vision context
  ├─ Daily Review / Journal
  └─ Distillation / Wake-up
```

### 输出实体

| 输入类型 | 最终实体 | 默认落点 |
| --- | --- | --- |
| 一句话行动项 | `task` | Capture Area / Inbox |
| 一段思考 / 笔记 | `resource` | `03_Resources/notes/` |
| 一个 URL / 文章摘录 | `resource` | `03_Resources/clippings/` |
| 外部笔记导入 | `resource` | `03_Resources/notes/` |
| 语音转写 | `resource` 或 `task` | `03_Resources/voice/` 或 Inbox |

---

## 五、存储布局

```text
<vault>/
├── 01_Projects/
├── 02_Areas/
│   ├── Journal/
│   └── Capture/
│       ├── README.md
│       └── tasks/
├── 03_Resources/
│   ├── notes/
│   ├── clippings/
│   ├── distilled/
│   └── voice/         # 仅在 transcript-first 方案落地后启用
├── 04_Archives/
└── .orbit/
```

### 说明

- `02_Areas/Capture/` 是一个真实的内建 Area，而不是散落目录
- Capture Area 主要承载未归属的 `task`
- 所有知识型内容统一进入 `03_Resources/`

---

## 六、核心方案

### N1. Universal Quick Capture（P0）

以全局快捷键 `⌘J` / `Ctrl+J` 打开统一 Capture Composer。

#### 交互目标

- 不离开当前页面
- 1 次打开，1 次提交
- 允许快速升级为多行输入
- 允许最小上下文绑定

#### Composer 结构

| 区块 | 内容 |
| --- | --- |
| Mode | `Task / Note / Link` |
| Input | 单行起步，可展开 multiline |
| Context | `No context / current area / current project` |
| Tags | 行内 `#tag` |
| Submit | 根据 mode 路由到 task/resource |

#### 路由规则

| Mode | 结果 |
| --- | --- |
| Task | 创建 `type: task`，`status: inbox` |
| Note | 创建 `type: resource`，落 `03_Resources/notes/` |
| Link | 创建 `type: resource`，落 `03_Resources/clippings/`，带 `source_url` |

#### 关键决策

| 决策点 | 结论 |
| --- | --- |
| 默认绑定当前项目？ | 否 |
| 默认绑定当前 area / project 作为建议项？ | 是 |
| `#` 的唯一语义 | 标签 |
| Capture 是否固定进 Inbox？ | 否，只对 Task 模式如此 |
| 一条 capture 是否允许无上下文？ | 是 |

---

### N2. Resource Workspace（P0 / P1）

Orbit 当前已经有 Resource 数据，但没有一个一等工作区去浏览、过滤、打开和复用它们。

这是旧方案遗漏的关键能力。

#### Resource Workspace 应承担的职责

1. 统一展示：
   - captured notes
   - imported notes
   - distilled resources
   - future clippings
2. 提供基础过滤：
   - tags
   - source type
   - linked project
   - linked area
3. 支持从 resource 继续派生：
   - 发送到 Inbox
   - 关联到 Project / Area
   - 用作 agent context

#### 为什么优先级高

没有 Resource Workspace，新的 Capture 只会继续把内容写进磁盘，但用户无法稳定消费这些内容，系统会再次陷入“能存，不能用”。

---

### N3. Reading Capture（P1）

旧方案把 Reading 放到 `02_Areas/Reading/`，这已经不合适。

Reading 的本质是：把外部信息转成资源。

#### 输入形式

- 输入 URL
- 粘贴正文
- 粘贴摘录 + 自己批注

#### 输出形式

统一生成 `type: resource`：

- 路径：`03_Resources/clippings/`
- frontmatter 建议：

```yaml
uid: <uid>
type: resource
title: <title>
source: reading-capture
source_url: <optional>
tags: []
project_uid: <optional>
area_uid: <optional>
created_at: <iso>
```

#### 与 task 的关系

Reading 本身不是 task；但用户可以从 clipping 中一键提炼行动项送入 Inbox。

---

### N4. Draft Mode（P1）

旧方案的 `Scratch Pad` 方向需要被替换。

问题不是“缺一个右侧 tab”，而是“用户有时需要在不切换视图的情况下从一句话升级到几段文字”。

因此新方案把它改成：

- Capture Composer 内的 multiline / draft 模式
- 或后续扩展成临时草稿页

#### 原则

- 不再新增旧式全局 `Scratch` sidebar tab
- 不单独创造新的 canonical entity
- 草稿最终仍需显式转成 `task` 或 `resource`

---

### N5. Voice（P2，延后）

Voice 仍然有价值，但不应在当前阶段优先。

#### 进入实施前的前提

1. 先明确 transcript-first 方案
2. Markdown transcript 才是 canonical artifact
3. 音频文件只是附件或可选保留
4. 至少能进入 Resource Workspace / Daily Review / Inbox 链路

#### 暂不采用的旧路线

- 不以 `.webm` 作为主存储实体
- 不优先做独立 Voice 导航页
- 不把二进制音频作为 Git 主内容

---

## 七、数据模型建议

### Task capture

```yaml
uid: <uid>
type: task
title: <title>
status: inbox
tags: []
area_uid: <optional>
project_uid: <optional>
source: quick-capture
created_at: <iso>
```

### Knowledge capture

```yaml
uid: <uid>
type: resource
title: <title>
tags: []
area_uid: <optional>
project_uid: <optional>
source: quick-capture | reading-capture | external-notes | voice-transcript
source_url: <optional>
created_at: <iso>
```

---

## 八、与现有系统的集成点

| 集成点 | 当前现状 | 新方案要求 |
| --- | --- | --- |
| `VaultView` / 全局快捷键 | 已有 `⌘K` 等快捷键模式 | 增加 `⌘J` Capture Composer |
| `CommandPalette` | 当前更偏文件搜索 | 不直接替代，可复用 overlay 壳层 |
| `fs:*` / markdown 写入 | 已具备 | 继续复用 |
| task index / Inbox | 已具备 | Task mode 直接接入 |
| external notes | 已具备 | 与 resource workspace 汇合 |
| distill | 已具备 | 作为 resource source 之一 |
| vector wake-up | 已具备 | 消费更丰富的 resource 语料 |
| Area / Vision | 已具备 | capture 允许绑定 `area_uid` |
| Daily Review | 已具备 | 后续消费 draft / reading / voice transcript 摘要 |

---

## 九、实施顺序

### Phase 1

- Universal Quick Capture
- `Task / Note / Link` 三模式
- `#tag` 统一语义
- `area_uid / project_uid` 绑定

### Phase 2

- Resource Workspace
- Resource 过滤与打开体验
- captured / imported / distilled 统一入口

### Phase 3

- Reading Capture
- clipping → resource
- resource → task 派生

### Phase 4

- Draft Mode 扩展
- 更平滑的多段输入与稍后整理

### Phase 5

- Voice transcript-first

---

## 十、明确不做

以下方向不再作为当前方案的一部分：

1. 在 `02_Areas/` 下新增独立 `Notes/Reading/Voice` 平行子系统
2. 新增旧式右侧栏 `Scratch` 固定 tab
3. 让 `.webm` 成为 Voice 的 canonical artifact
4. 让 `#` 同时承载标签与项目关联语义

---

## 十一、预期收益

新方案落地后，Orbit 的信息链路会变成：

**任何输入**
→ 迅速进入 task / resource
→ 被当前执行系统与知识系统消费
→ 最终进入 review、distill、wake-up、agent context

这样 Orbit 才会真正形成从输入到沉淀的闭环，而不是继续堆叠彼此分离的内容模块。
