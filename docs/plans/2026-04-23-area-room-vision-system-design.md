---
status: active
created: 2026-04-23
updated: 2026-04-23
---

# Area Room + Vision System 设计方案

## 概述

本方案将 Orbit 的 Area 能力从「扁平 `.md` 文件」升级为「可交互的文件夹单元（Area Room）」，并内置 Vision 模板作为首个落地场景。Vision 是一个基于访谈协议的个人北极星文档系统，帮助用户建立和持续迭代自己的人生愿景。

---

## 设计决策汇总

| 问题 | 决策 |
| --- | --- |
| Area 是否独立 git repo | **否**，共享 vault 根目录 git（与 Project 不同） |
| `02_Areas/` 目录结构 | **扁平**，直接放 action 目录（vision/, exercise/），不嵌套 |
| Area 标签/分组方式 | `.orbit/config.json` 中的 `tags` 数组，侧边栏按 tag 分组展示 |
| Area 能力 | Terminal + Kanban（长期任务），同 Project Room 外壳 |
| Night Shift 支持 | **否**，Area 无独立 git 无法用 worktree |
| Vault 创建时 Vision | **自动 scaffold** `02_Areas/vision/`，作为第一个默认 area |
| 旧格式迁移 | **无需迁移**，当前生产环境无旧格式 area |
| External notes 存储 | vault 根 `.orbit/config.json` 的 `external_notes_paths` 字段，agent 通过环境变量访问 |
| Imported notes 位置 | `03_Resources/notes/`，vault git 追踪 |

---

## 1. Area 数据模型

### 目录结构

```
02_Areas/
├── vision/                    ← vault 创建时自动生成
│   ├── README.md              ← area 描述
│   ├── VISION.md              ← 访谈输出（初始为 placeholder）
│   ├── CHANGELOG.md           ← vision 迭代历史
│   ├── notes-digest.md        ← agent 生成的笔记摘要（访谈时产出）
│   └── .orbit/
│       ├── config.json        ← uid, slug, name, tags, template, created_at
│       └── agent/
│           ├── AGENTS.md      ← vision agent 协议（改造自 /vision/agent.md）
│           ├── questions.yaml ← 45 题题库（7 个维度）
│           ├── rubrics.md     ← 置信度评分规则
│           ├── vision.template.md ← 输出模板
│           ├── tasks/         ← area 级别长期任务
│           ├── sessions/      ← 访谈会话记录（JSON）
│           └── memories/      ← agent 记忆
├── exercise/                  ← 用户自建，tags: ["健康"]
└── career/                    ← 用户自建，tags: ["职业"]
```

### `config.json` Schema

```json
{
  "uid": "area-xxxxxxxx",
  "slug": "vision",
  "name": "Vision",
  "template": "vision",
  "tags": [],
  "created_at": "2026-04-23T00:00:00Z"
}
```

### Vault 级 `.orbit/config.json` 扩展

新增 `external_notes_paths` 字段，存储外部笔记库路径：

```json
{
  "external_notes_paths": [
    "/Users/xxx/obsidian/main-vault",
    "/Users/xxx/bear-exports"
  ]
}
```

Agent 通过环境变量 `ORBIT_EXTERNAL_NOTES_PATHS`（路径以 `:` 分隔）访问。

---

## 2. Vision 模板改造

原始 `/vision/` 文件按以下规则改造为 Orbit Vision 模板：

| 原文件 | 目标位置 | 改造要点 |
| --- | --- | --- |
| `agent.md` | `.orbit/agent/AGENTS.md` | 去除独立文件系统假设，改为相对路径；注入 Orbit 环境变量（`ORBIT_VAULT_PATH`、`ORBIT_AREA_PATH`、`ORBIT_EXTERNAL_NOTES_PATHS`）；添加 Orbit MCP 工具说明 |
| `questions.yaml` | `.orbit/agent/questions.yaml` | 无需改造 |
| `rubrics.md` | `.orbit/agent/rubrics.md` | 无需改造 |
| `vision.template.md` | `.orbit/agent/vision.template.md` | 无需改造 |
| `sessions/session.template.json` | `.orbit/agent/sessions/` | 作为 session 模板 |
| `notes-digest.md` | 根级（vision/ 下） | 动态生成，不作为模板 |

### AGENTS.md 关键改造（Orbit 适配）

```markdown
## 环境

- Vault 根目录：`$ORBIT_VAULT_PATH`
- 当前 Area 路径：`$ORBIT_AREA_PATH`
- 外部笔记路径：`$ORBIT_EXTERNAL_NOTES_PATHS`（冒号分隔）
- 可用 MCP 工具：search_vault, get_file, create_task, save_memory, search_memories

## 文件路径

- 本 AGENTS.md：`$ORBIT_AREA_PATH/.orbit/agent/AGENTS.md`
- 题库：`$ORBIT_AREA_PATH/.orbit/agent/questions.yaml`
- 规则：`$ORBIT_AREA_PATH/.orbit/agent/rubrics.md`
- 输出模板：`$ORBIT_AREA_PATH/.orbit/agent/vision.template.md`
- 输出文件：`$ORBIT_AREA_PATH/VISION.md`
- 笔记摘要：`$ORBIT_AREA_PATH/notes-digest.md`
```

---

## 3. UI 设计

### 3.1 侧边栏

Areas 区块展开后按 tag 分组显示：

```
▼ Areas
  📌 Vision                  ← 置顶（无 tag 或特殊标记）
  ──────────────────
  [健康]
    运动计划
  [职业]
    职业发展
  [未分类]
    家庭资产
```

点击 area 进入 Area Room。

### 3.2 Area Room 结构

沿用 Project Room 外壳，三个外层标签：**Kanban / Terminal / Sessions**。

```
┌─────────────────────────────────────────────────────┐
│  Vision  ·  [Kanban]  [Terminal]  [Sessions]         │
│                                            [按钮区]  │
├─────────────────────────────────────────────────────┤
│                                                      │
│  主内容区（Kanban 默认 / Terminal 嵌入 / Sessions 列表）│
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 3.3 Vision Room 特殊状态

Vision area 的主内容区有两个状态：

**冷启动态**（VISION.md 为 placeholder 或未生成）：

```
┌──────────────────────────────────────────┐
│  Step 1: 连接你的笔记（可选）              │
│                                          │
│  [📁 导入到 Vault]  [🔗 链接外部目录]  [跳过] │
│                                          │
│  ✓ 已链接: /Users/xxx/obsidian (3,241 篇) │
├──────────────────────────────────────────┤
│  Step 2: 启动愿景访谈                     │
│                                          │
│  [✨ 启动愿景访谈]                        │
└──────────────────────────────────────────┘
```

**活跃态**（VISION.md 有内容）：

```
┌────────────────────────────────────────────────────────┐
│  VISION.md Markdown 渲染                  [🔄 回顾愿景] │
│  （带 frontmatter 摘要：confidence / next_review 等）  │
└────────────────────────────────────────────────────────┘
```

### 3.4 按钮行为

| 状态 | 按钮 | 点击动作 |
| --- | --- | --- |
| 冷启动 | ✨ 启动愿景访谈 | Terminal 标签激活 + 预填冷启动指令 |
| 活跃 | 🔄 回顾愿景 | Terminal 标签激活 + 预填 review 指令 |

**冷启动预填指令：**

```
请读取 .orbit/agent/AGENTS.md、questions.yaml、rubrics.md、vision.template.md，按协议启动愿景访谈。先检查 $ORBIT_EXTERNAL_NOTES_PATHS 是否有可用笔记，有则先生成 notes-digest.md。然后从第 1 题开始。访谈结束后将结果写入 VISION.md，变化写入 CHANGELOG.md。
```

**Review 预填指令：**

```
请读取 .orbit/agent/AGENTS.md 和当前 VISION.md，进入 review 模式。检查价值观、工作观/人生观、动机真实性和上次 milestones 完成度。有明显变化则更新 VISION.md，记录至 CHANGELOG.md，刷新 next_review。
```

---

## 4. 完整用户旅程

### 4.1 首次创建 Vault

```
创建 Vault
  → scaffoldVault() 自动创建 02_Areas/vision/（带完整 .orbit/ 模板）
  → 旧根目录 Vision.md 弃用（如存在，软提示迁移）
  → 侧边栏 Areas 区显示 Vision（置顶）
  → 自动导航至 Vision Area Room
```

### 4.2 冷启动访谈流程

```
用户进入 Vision Room
  → 看到「Step 1: 连接笔记 / Step 2: 启动访谈」界面
  → [可选] 链接外部笔记目录 / 导入到 Vault
  → 点击「✨ 启动愿景访谈」
    → Terminal 标签激活
    → 预填指令自动填入（用户确认后按 Enter）
    → Agent 读取笔记 → 生成 notes-digest.md
    → 开始 45 题访谈（7 个维度，约 60-90 分钟）
    → 写入 VISION.md（含置信度 frontmatter）
    → 写入 CHANGELOG.md（首条记录）
    → 会话保存到 sessions/<timestamp>.json
  → 主区自动切换为 VISION.md 渲染态
```

### 4.3 愿景迭代（随时触发）

```
用户任意时间进入 Vision Room
  → 主区渲染当前 VISION.md（含 next_review 提示）
  → 点击「🔄 回顾愿景」
    → Terminal 激活，预填 review 指令
    → Agent 聚焦变化维度，缩短版访谈
    → 更新 VISION.md（版本号递增）
    → 更新 CHANGELOG.md
    → 刷新 next_review 字段
```

### 4.4 笔记路径两种模式

| 模式 | 文件去向 | 配置位置 | 适用场景 |
| --- | --- | --- | --- |
| **导入** | 复制到 `03_Resources/notes/` | vault git 追踪 | 想在 Orbit 内全局搜索旧笔记 |
| **链接外部** | 文件留在原位 | vault `.orbit/config.json` → `external_notes_paths` | 笔记库很大 / 用其他工具同步维护 |

两种模式不互斥，可同时存在。

### 4.5 日常 Area 使用

```
用户创建新 area（非 vision）
  → 选择模板：vision / 空白 / 从 GitHub 导入
  → 输入名称 + tags
  → 进入 Area Room（Kanban 默认激活）

用户在 area 开终端
  → 注入 ORBIT_AREA_PATH、ORBIT_AREA_UID、ORBIT_AREA_SLUG
  → 注入 ORBIT_EXTERNAL_NOTES_PATHS（全局）

用户添加长期任务
  → Kanban + .orbit/agent/tasks/（与 Project 相同结构）
```

---

## 5. 技术实现要点

### 5.1 主进程变更

- `scaffoldArea(slug, template, tags)` — 新建 area 目录（类似 `scaffoldProject` 但不 init git）
- `scaffoldVault()` — 调用 `scaffoldArea('vision', 'vision', [])` 作为默认步骤
- `listAreas()` — 扫描 `02_Areas/`，读取每个子目录的 `.orbit/config.json`
- `getAreaConfig()` / `setAreaConfig()` — 读写 area config（含 tags）
- `getVaultConfig()` / `setVaultConfig()` — 读写 vault 级 `.orbit/config.json`（含 external_notes_paths）

### 5.2 IPC 新增

```typescript
// src/shared/ipc.ts
AREA_LIST = 'area:list'
AREA_CREATE = 'area:create'
AREA_GET_CONFIG = 'area:getConfig'
AREA_SET_CONFIG = 'area:setConfig'
VAULT_GET_CONFIG = 'vault:getConfig'
VAULT_SET_CONFIG = 'vault:setConfig'
```

### 5.3 Schema 变更

```typescript
// src/shared/schemas.ts
export const AreaConfigSchema = z.object({
  uid: z.string(),
  slug: z.string(),
  name: z.string(),
  template: z.string().optional(),
  tags: z.array(z.string()).default([]),
  created_at: z.string(),
})

export const VaultConfigSchema = z.object({
  external_notes_paths: z.array(z.string()).default([]),
  // ... 其他 vault 级配置
})
```

### 5.4 终端环境变量扩展

在 TerminalPane 或 area terminal 启动时注入：

```
ORBIT_AREA_PATH=/Users/.../02_Areas/vision
ORBIT_AREA_UID=area-xxxxxxxx
ORBIT_AREA_SLUG=vision
ORBIT_EXTERNAL_NOTES_PATHS=/Users/xxx/obsidian:/Users/xxx/bear
```

### 5.5 新组件

- `AreaRoomView.tsx` — Area Room 主视图（三标签框架）
- `VisionRoomContent.tsx` — Vision 特有主内容区（冷启动态 / 活跃态）
- `NotesConnectPanel.tsx` — 笔记连接面板（导入 / 链接 / 已配置列表）
- `AreaList.tsx` — 侧边栏 Area 列表（支持 tag 分组折叠）

### 5.6 旧 AreaFrontmatter 兼容

当前生产无旧格式 area，直接用新格式。`inferTypeFromPath` 逻辑需更新：目录下有 `.orbit/config.json` 的 `02_Areas/` 子目录 = area。

---

## 6. 未解决的小细节（实现时处理）

1. **Vision Room 主内容切换时机**：VISION.md 从 placeholder 变成有内容后，是自动切换视图还是刷新按钮要求手动？建议：监听文件变化（chokidar），有内容则自动切换。
2. **notes-digest.md 是否展示在 UI 里**：不展示在主区，作为 agent 内部上下文文件即可。
3. **next_review 日期提醒**：Daily Review 机制是否读取 `VISION.md` frontmatter 的 `next_review` 字段来触发提醒？留待 Daily Review 模块扩展。
4. **Area tag 编辑 UI**：Area Room 右侧栏 Overview tab 中提供 tag 编辑，目前设计不含专用 tag 管理界面。
5. **从 GitHub 导入 area**：沿用 Project 的 GitHub import 流程，但不 init git、不创建 worktree。
