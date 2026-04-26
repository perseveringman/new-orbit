---
title: "Activity Timeline UI — 时间线渲染与实时 Markdown"
status: draft
date: 2026-04-27
phase: "3.2"
depends_on: "2026-04-27-runtime-adapter-layer.md (Phase 3.1)"
---

# Activity Timeline UI

> **定位**：让用户看到 agent 在做什么——把黑盒变成透明的执行时间线。
>
> **前置**：Runtime Adapter Layer 已就绪（UnifiedAgentEvent 流到达前端）
>
> **产出**：改造 TaskConversationTab → Activity tab + 全新时间线渲染组件

---

## 1. 改造目标

### Before（当前）
- Chat tab 只显示 user/assistant 文本对话
- 没有 tool_use / tool_result / thinking 展示
- 没有打字机效果
- Markdown 未实时渲染（带语法标记的纯文本）

### After
- Activity tab 展示完整事件时间线
- 每种事件类型有专属渲染卡片
- 打字机效果 + 实时 markdown 渲染
- 参照 BoxAI 的 UI 范式

---

## 2. Tab 改造

### 2.1 改名

```diff
- <Tab label="Chat" />
+ <Tab label="Activity" />
```

### 2.2 数据源切换

当前 `TaskConversationTab.tsx` 从 `TaskConversation.turns` 构建 `TimelineEntry[]`。

改造后：
- 数据源变为 `UnifiedAgentEvent[]`（实时）+ `ConversationEvent[]`（历史持久化）
- 实时流通过 IPC subscription
- 历史记录从 conversation store 读取

```typescript
// 新的 Timeline 数据模型
type TimelineItem =
  | { type: 'user_message'; content: string; timestamp: number }
  | { type: 'thinking'; summary: string; fullText: string; durationMs: number; timestamp: number }
  | { type: 'tool_use'; toolName: string; inputSummary: string; durationMs: number; success?: boolean; timestamp: number }
  | { type: 'tool_result'; success: boolean; outputSummary: string; timestamp: number }
  | { type: 'message'; content: string; timestamp: number; streaming: boolean }
  | { type: 'cost'; totalUsd: number; timestamp: number }
  | { type: 'error'; code: string; message: string; timestamp: number }
  | { type: 'done'; totalDurationMs: number; totalCostUsd: number; timestamp: number }
  | { type: 'segment_start'; runId: string; runtimeProvider: string; timestamp: number }
```

---

## 3. 时间线渲染组件

### 3.1 组件层级

```
ActivityTab
├── ActivityTimeline
│   ├── TimelineItem (repeated)
│   │   ├── UserMessageCard
│   │   ├── ThinkingCard
│   │   ├── ToolUseCard
│   │   ├── AssistantMessageCard  (with streaming markdown)
│   │   ├── CostBadge
│   │   ├── ErrorCard
│   │   └── DoneCard
│   └── StreamingIndicator (当 agent 在运行时)
└── MessageInput (底部输入框)
```

### 3.2 各卡片设计

**ThinkingCard**：
```
> {第一行摘要}  {耗时}s                    ▸
```
- 灰色背景，`>` 前缀
- 默认折叠，显示 thinking 文本第一行 + 耗时
- 点击 ▸ 展开完整 thinking 文本
- 展开后文本用 monospace 字体，灰色

**ToolUseCard**：
```
✓ {工具名}: {参数摘要}  {耗时}s             ▸
```
- 成功 ✓（绿色） / 失败 ✗（红色）
- 工具名加粗
- 参数摘要截断到单行（hover 看全文）
- 点击 ▸ 展开工具输入/输出详情

**AssistantMessageCard**（核心组件）：
- **打字机效果**：token 逐个流入
- **实时 markdown 渲染**：使用 incremental markdown parser
- 不允许"先纯文本再渲染"的抖动——每个 token 加入后立即重新渲染 markdown
- 代码块、标题、列表、链接在打字过程中就呈现最终样式
- Streaming 状态下底部显示 blinking cursor

**CostBadge**：
- 小字，灰色，右对齐
- 格式：`$0.42 · 38s · claude-sonnet`

**ErrorCard**：
- 红色边框
- 显示 error code + message
- 如果有 fallback 信息，显示 "切换到 {next runtime}"

---

## 4. 实时 Markdown 渲染方案

### 4.1 技术选型

**方案**：使用 incremental markdown rendering

```typescript
// 核心思路
class StreamingMarkdownRenderer {
  private buffer: string = '';
  private renderedHtml: string = '';

  /** 追加 token */
  append(token: string): string {
    this.buffer += token;
    // 解析当前 buffer 为 markdown AST
    // 渲染为 HTML
    // 返回完整渲染后的 HTML
    this.renderedHtml = renderMarkdown(this.buffer);
    return this.renderedHtml;
  }

  /** 结束流式 */
  finalize(): string {
    return renderMarkdown(this.buffer);
  }
}
```

**关键细节**：
- 使用现有的 markdown 渲染库（项目中已有 `MarkdownEditor.tsx`）
- 每次 token 到达时**整体重新渲染**（对于中等长度的文本性能可接受）
- 对于超长输出（>10KB），切换为**尾部增量渲染**（只重新渲染最后一段）
- Code block 内部不做增量——等 closing ``` 再渲染整个 block

### 4.2 抖动控制

- markdown 渲染用 `requestAnimationFrame` 节流（每帧最多渲染一次）
- 新 token 立即加入 buffer，渲染在下一帧
- 用户不会看到"纯文本闪成 markdown"的跳变

---

## 5. 输入框状态感知

```
Agent 状态:

idle（没有 active session）
  → 输入框提示 "发送消息启动 agent"
  → 发送 = 新建 session + startSession

running（有 active session）
  → 输入框提示 "追加消息给正在运行的 agent"
  → 发送 = session.sendMessage()（双向 stream）
  → 输入框旁边显示 🟢 运行中 indicator

waiting（session 结束，等用户下一步）
  → 输入框提示 "继续对话"
  → 发送 = resumeSession()
```

---

## 6. 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/renderer/src/components/Tasks/TaskConversationTab.tsx` | 重写 | → ActivityTab，改为时间线渲染 |
| `src/renderer/src/components/Timeline/ActivityTimeline.tsx` | 新建 | 时间线容器组件 |
| `src/renderer/src/components/Timeline/ThinkingCard.tsx` | 新建 | Thinking 折叠卡片 |
| `src/renderer/src/components/Timeline/ToolUseCard.tsx` | 新建 | Tool use 卡片 |
| `src/renderer/src/components/Timeline/AssistantMessageCard.tsx` | 新建 | 流式 markdown 消息 |
| `src/renderer/src/components/Timeline/UserMessageCard.tsx` | 新建 | 用户消息气泡 |
| `src/renderer/src/components/Timeline/ErrorCard.tsx` | 新建 | 错误卡片 |
| `src/renderer/src/components/Timeline/CostBadge.tsx` | 新建 | 费用标签 |
| `src/renderer/src/components/Timeline/StreamingMarkdown.tsx` | 新建 | 流式 markdown 渲染器 |
| `src/renderer/src/components/Timeline/index.ts` | 新建 | barrel export |
| `src/renderer/src/stores/taskConversationStore.ts` | 修改 | 事件流订阅 + timeline 数据模型 |
| `src/renderer/src/stores/agentSessionStore.ts` | 新建 | 当前 session 状态管理 |

---

## 7. 验收标准

- [ ] Activity tab 正确渲染完整时间线（user / thinking / tool_use / tool_result / message）
- [ ] Thinking 卡片默认折叠，显示第一行 + 耗时，可展开
- [ ] Tool use 卡片显示工具名 + 参数摘要 + 成功/失败 + 耗时
- [ ] Assistant message 有打字机效果，token 逐个流入
- [ ] Markdown 在打字过程中实时渲染（无纯文本→markdown 的跳变）
- [ ] 代码块、标题、列表、链接在流式中正确呈现
- [ ] Cost badge 实时更新
- [ ] Error card 红色边框 + 错误信息
- [ ] 输入框根据 agent 状态（idle/running/waiting）切换提示和行为
- [ ] 9 个 Playground scenario 都有正确的时间线渲染
- [ ] 性能：50 events/秒的渲染不掉帧
