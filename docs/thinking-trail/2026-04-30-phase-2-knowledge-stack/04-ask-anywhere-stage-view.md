# 文档 4：Ask-Anywhere Stage View（产物舞台）

> **规模**：M（约 2~3 天 AI 实施）
> **依赖**：文档 1 完成（需要 Note/Library 概念）；Phase 1 Ask-Anywhere MVP 完成
> **产物**：Ask-Anywhere 页面增加右侧产物区，展示对话中创建/引用的实体

---

## 1. 设计哲学

### 1.1 问题

现状：Ask-Anywhere 的对话里 AI 说"好的，我给你创建了一个 note"，但用户**看不到**这个 note 长什么样、在哪里、能不能点进去。产物（artifact）是埋在对话流里的。

这样不行，因为：
1. 用户没有"具体做了什么"的实感
2. 产物无法被直接操作（修改、删除、打开）
3. 用户要回去找这个产物必须切到 Notes 页

### 1.2 设计

Ask-Anywhere 页面分成三区：

```
┌──────────────────┬──────────────────────────┬──────────────────────┐
│   Context        │     对话流（Chat）         │    Stage（产物舞台）│
│   (可折叠)        │                          │                      │
│                  │                          │  ┌────────────────┐ │
│   · 当前锚定       │  你: 帮我记一下 ...       │  │  📝 New Note   │ │
│     的实体         │                          │  │  "Resource..." │ │
│                  │  AA: 好，已捕获。          │  │  [打开] [编辑] │ │
│   · 激活的 skills │                          │  └────────────────┘ │
│                  │  你: 查一下 second-brain  │                      │
│   · Context hints│                          │  ┌────────────────┐ │
│                  │  AA: 找到 8 条相关...     │  │  🔍 Retrieved  │ │
│                  │                          │  │  8 notes       │ │
│                  │                          │  │  [展开列表]     │ │
│                  │                          │  └────────────────┘ │
└──────────────────┴──────────────────────────┴──────────────────────┘
```

### 1.3 核心概念

**Artifact**：对话中产生或引用的具体实体。
- 由 AA 在调用 skill tool 时"挂上舞台"
- 用户可以直接在 stage 上操作（打开、编辑、删除、确认/取消提议）
- 舞台是**按时间累积**的——新的 artifact 往下加，旧的不消失（但可以折叠）

---

## 2. 数据模型

### 2.1 Artifact

```typescript
// src/shared/ask-anywhere/stage-types.ts

export type ArtifactKind = 
  // 产物（AA 创建的）
  | 'note.created'
  | 'library.item.added'
  | 'feed.source.added'
  | 'project.created'
  | 'area.created'
  | 'resource.created'
  | 'scheduled_task.created'
  | 'conversation.anchor_changed'
  
  // 引用（AA 检索到的）
  | 'notes.retrieved'
  | 'library.items.retrieved'
  | 'kb.items.retrieved'
  
  // 提议（AA 建议但未执行）
  | 'proposal.create_note'
  | 'proposal.create_project'
  | 'proposal.update_para'
  | 'proposal.run_task'
  
  // 状态/分析
  | 'analysis.result'
  | 'welcome_analysis.result';

export interface Artifact {
  id: string;                       // 舞台内唯一
  conversation_id: string;
  message_id?: string;              // 对应哪条 AI message
  kind: ArtifactKind;
  created_at: string;
  
  title: string;                    // 卡片标题
  summary?: string;                 // 一句话描述
  
  // 引用的实体
  refs?: Array<{
    kind: 'note' | 'library_item' | 'project' | 'area' | 'resource' | 'scheduled_task' | 'kb_item';
    ref: string;                    // 路径或 id
    label?: string;
  }>;
  
  // 用于渲染的 payload
  payload: any;                     // kind 相关数据
  
  // 状态
  status: 'proposed' | 'confirmed' | 'rejected' | 'stale';
  
  // 可用动作
  actions?: ArtifactAction[];
}

export interface ArtifactAction {
  id: string;
  label: string;                    // "打开"、"编辑"、"确认"、"取消"
  kind: 'navigate' | 'execute' | 'dismiss' | 'edit_inline';
  target?: any;                     // kind=navigate 时的路由
  execute_fn?: string;              // kind=execute 时的 tool 名
}
```

### 2.2 Stage（一个 Conversation 的舞台）

```typescript
export interface ConversationStage {
  conversation_id: string;
  artifacts: Artifact[];            // 按 created_at 排序
  last_updated: string;
}
```

持久化：
- 存于 `.orbit/conversations/<conv-id>/stage.json`
- 也可以从 TraceableEvent 重建（artifact 都来自事件）

---

## 3. 如何产生 Artifact

### 3.1 Skill tool 调用时自动生成

每个 skill 在执行 tool 后声明对应的 artifact：

```typescript
// e.g. orbit-capture skill 的 create_thought tool
{
  name: 'create_thought',
  async execute(params) {
    const note = await IPC.notes.create({ type: 'thought', ... });
    
    // 返回 tool result 的同时声明 artifact
    return {
      result: { note_id: note.frontmatter.id },
      artifact: {
        kind: 'note.created',
        title: 'Thought 已创建',
        summary: truncate(note.body, 120),
        refs: [{ kind: 'note', ref: note.path, label: note.frontmatter.title }],
        payload: { preview: note.body },
        status: 'confirmed',
        actions: [
          { id: 'open', label: '打开', kind: 'navigate', target: `/notes/${note.frontmatter.id}` },
          { id: 'delete', label: '删除', kind: 'execute', execute_fn: 'delete_note' },
        ],
      },
    };
  },
}
```

### 3.2 Runtime 层捕获

Ask-Anywhere runtime 适配器在收到 `tool_use_result` 事件时：
1. 检查 payload 里是否带 `artifact`
2. 有则 emit `StageArtifactAdded` 事件
3. Stage store 收到后更新 `stage.json`

### 3.3 Proposal 流（建议但未执行）

某些 skill 可能需要用户确认才执行：

```typescript
// 用户："帮我立一个项目叫 XXX"
// AA 回复里带 proposal artifact（status: 'proposed'）

{
  kind: 'proposal.create_project',
  title: '建议创建项目',
  summary: '名称：XXX，描述：...，初始 milestone：...',
  status: 'proposed',
  actions: [
    { id: 'confirm', label: '确认创建', kind: 'execute', execute_fn: 'create_project_confirmed' },
    { id: 'modify', label: '修改', kind: 'edit_inline' },
    { id: 'reject', label: '取消', kind: 'dismiss' },
  ],
}
```

用户点"确认创建" → 调用真正的 tool → artifact 从 `proposed` → `confirmed`，同时更新 refs。

---

## 4. UI 设计

### 4.1 Stage 区位置

在 Ask-Anywhere ChatView 里：
- 桌面模式（宽屏）：右侧固定 stage panel（默认 320~400px 宽，可拖拽）
- 移动/窄屏：stage 折叠为底部抽屉，点 🎭 icon 展开

### 4.2 Stage Panel

```
┌─ Stage ──────────────────────── [折叠] ─┐
│                                         │
│ ━━━━━ 14:02 ━━━━━━━━━━━━━━━━━━━━━━━    │
│ ┌───────────────────────────────────┐  │
│ │ 📝 Note 已创建                     │  │
│ │ "渐进式总结对定时任务设计很有启发..."│  │
│ │ thought · resources/second-brain   │  │
│ │ [打开] [编辑] [删除]                │  │
│ └───────────────────────────────────┘  │
│                                         │
│ ━━━━━ 14:05 ━━━━━━━━━━━━━━━━━━━━━━━    │
│ ┌───────────────────────────────────┐  │
│ │ 🔍 检索到 8 条相关笔记             │  │
│ │ second-brain 主题                 │  │
│ │ ┌─────────────────────────────┐   │  │
│ │ │ · 2026-04-28 "Forte 原意.."  │   │  │
│ │ │ · 2026-04-20 "Library 和.."  │   │  │
│ │ │ · 2026-03-15 "PARA 是一个.."│   │  │
│ │ │ ... [展开全部]              │   │  │
│ │ └─────────────────────────────┘   │  │
│ └───────────────────────────────────┘  │
│                                         │
│ ━━━━━ 14:08 ━━━━━━━━━━━━━━━━━━━━━━━    │
│ ┌───────────────────────────────────┐  │
│ │ ⚠️ 建议创建项目                    │  │
│ │ 名称: orbit-resource-system        │  │
│ │ 描述: 围绕 Resource 工作站的...    │  │
│ │ 初始 milestones: 3 个              │  │
│ │                                    │  │
│ │ [✓ 确认创建]  [✎ 修改]  [✕ 取消]  │  │
│ └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 4.3 卡片样式（按 kind 分）

| Kind | icon | 颜色 | 必备动作 |
|------|------|------|---------|
| `note.created` | 📝 | 蓝 | 打开、编辑、删除 |
| `library.item.added` | 📚 | 紫 | 打开、归档 |
| `scheduled_task.created` | ⏰ | 绿 | 查看、立即执行、删除 |
| `notes.retrieved` | 🔍 | 灰 | 展开列表 |
| `proposal.*` | ⚠️ | 橙 | 确认、修改、取消 |
| `welcome_analysis.result` | 🌟 | 金 | 应用建议 |

### 4.4 Context 区（左侧）

```
┌─ Context ──────────────────── [折叠] ─┐
│                                       │
│ 锚定实体                                │
│ ┌────────────────────────────────┐   │
│ │ 🎯 projects/orbit-v2            │   │
│ │   Phase 4.0 dog-food 观察期     │   │
│ │ [切换]                          │   │
│ └────────────────────────────────┘   │
│                                       │
│ 激活的 Skills                          │
│ · orbit-retrieve                       │
│ · orbit-planning                       │
│                                       │
│ Context Hints                          │
│ · 最近 7 天: 12 个 thoughts            │
│ · 相关 Library: 3 条                   │
│ · KB 命中: 5 条                        │
│                                       │
└───────────────────────────────────────┘
```

---

## 5. Inline artifact（聊天流里的产物预览）

有些场景 stage 不够直观，用户希望在聊天流里直接看到：

```
AA: 好，我给你创建了：

    ┌──────────────────────────────────┐
    │ 📝 Thought                        │
    │ "渐进式总结对定时任务设计..."       │
    │ resources/second-brain            │
    │ [打开]                            │
    └──────────────────────────────────┘

    还要我为它起个标题吗？
```

**实现**：AI message 的内容支持 markdown + 自定义 `artifact-card` fence：

````markdown
好，我给你创建了：

```artifact
{
  "kind": "note.created",
  "refs": [{ "kind": "note", "ref": "notes/thoughts/xxx.md" }],
  "title": "Thought",
  "summary": "渐进式总结..."
}
```
````

ChatMessage 渲染时识别 `artifact` fence → 渲染成卡片。**同一个 artifact 同时出现在 stage 和 inline**（是同一条数据）。

---

## 6. IPC / API

```typescript
IPC.stage = {
  // 获取某个对话的 stage
  get: (conversationId: string) => Promise<ConversationStage> => {},
  
  // 订阅变化
  subscribe: (conversationId: string, cb: (stage: ConversationStage) => void) => () => void => {},
  
  // 动作执行（按 artifact action）
  execAction: (conversationId: string, artifactId: string, actionId: string, params?: any) => Promise<void> => {},
  
  // 手动移除 artifact（用户"从舞台撤下"）
  removeArtifact: (conversationId: string, artifactId: string) => {},
};
```

---

## 7. 事件

```typescript
export const STAGE_EVENT_KINDS = [
  'stage.artifact.added',
  'stage.artifact.updated',
  'stage.artifact.removed',
  'stage.artifact.action_executed',
] as const;
```

这些事件也上 TraceableEvent。

---

## 8. 实施步骤

### Step 1: 数据模型 + 存储（半天）
1. `src/shared/ask-anywhere/stage-types.ts`
2. `src/main/ask-anywhere/stage-store.ts`（持久化到 `.orbit/conversations/<id>/stage.json`）
3. 事件定义 + 发布

### Step 2: Skill tool → Artifact 机制（半天）
1. Skill tool 返回结构扩展 `artifact` 字段
2. Runtime 适配器捕获 artifact 并发事件
3. 改造现有的 skill stub（`orbit-capture`, `orbit-retrieve`, `orbit-welcome-analysis`）

### Step 3: Stage Panel UI（1 天）
1. `src/renderer/views/ask-anywhere/StagePanel.tsx`
2. `src/renderer/views/ask-anywhere/ArtifactCard.tsx`（各 kind 的渲染）
3. `src/renderer/hooks/useStage.ts`
4. 接入 ChatView 布局（三栏）

### Step 4: Artifact 动作执行（半天）
1. `IPC.stage.execAction`
2. navigate/dismiss 动作
3. execute 动作（调用对应 skill tool）
4. edit_inline（打开 modal 编辑 payload）

### Step 5: Proposal 流（半天）
1. Proposal artifact 状态机：proposed → confirmed/rejected
2. 确认时二次调 tool
3. 修改时弹出编辑器

### Step 6: Inline artifact（半天）
1. ChatMessage renderer 识别 `artifact` fence
2. 渲染成卡片（复用 ArtifactCard）
3. 和 stage 共享数据

### Step 7: Context 区（半天）
1. `src/renderer/views/ask-anywhere/ContextPanel.tsx`
2. 锚定实体显示 + 切换
3. 激活的 skills 列表
4. Context hints 计算

### Step 8: 测试 + 打磨（半天）
1. 端到端走几个典型场景（capture/retrieve/propose project/welcome analysis）
2. 移动/窄屏折叠
3. 空态（无 artifact）

**总计：约 4~5 天 AI 实施**

---

## 9. 验收标准

- [ ] Ask-Anywhere 页面三栏布局
- [ ] Stage Panel 能实时展示 artifact
- [ ] 至少支持以下 artifact kind:
  - note.created / library.item.added / scheduled_task.created
  - notes.retrieved / library.items.retrieved
  - proposal.create_project
  - welcome_analysis.result
- [ ] 每种 kind 有对应的卡片样式
- [ ] 卡片动作可执行（打开、删除、确认、取消）
- [ ] Proposal 流工作：建议 → 用户确认 → 真执行
- [ ] Inline artifact 在聊天流内也能渲染
- [ ] 切换 conversation 时 stage 正确切换
- [ ] Stage 状态持久化，重启后恢复

---

## 10. Future-Proof

- **Artifact 分类 tab**：历史多了后，按 kind 筛选（所有 note / 所有 proposal / ...）
- **Artifact 全局检索**：跨 conversation 搜索"我让 AA 做过什么"
- **Artifact 历史复盘**：某个 artifact 被引用的次数（"时间复利"度量）
- **协作 artifact**：未来多人共享对话时，artifact 的权限控制
