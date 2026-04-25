---
status: completed
created: 2026-04-25
updated: 2026-04-25
---

# Task Conversation UI — 详细实施方案

> 日期：2026-04-25
> 状态：Completed
> 范围：任务详情页、对话流 UI、Conversation 数据模型、IPC 通道、Agent 执行对话记录

---

## 一、目标

在看板点击任务卡片 → 打开任务详情页 → 包含两个 Tab：

1. **Detail**：结构化 task.md 展示（现有 TaskEditor）
2. **Chat**：该任务的完整对话流 + 底部输入框

对话流统一承载两类交互：
- **Agent 自动执行**：DispatchService 认领并执行任务时，执行过程的 events 自动写入对话流
- **人工对话**：用户随时打开任务，在输入框发消息，触发 agent run，结果同样写入对话流

---

## 二、数据模型

### 2.1 核心类型

```ts
// src/shared/orchestration.ts 新增

/** 对话流中的一条消息 */
interface ConversationTurn {
  id: string;                          // nanoid
  role: 'user' | 'assistant' | 'system';
  content: string;                     // 主文本（可含 markdown）
  segmentId?: string;                  // 关联到哪个 RunSegment
  createdAt: string;                   // ISO timestamp
}

/** 一次 Agent 执行在对话流中的片段 */
interface RunSegment {
  id: string;                          // nanoid
  taskId: string;                      // orbit task id
  runId: string;                       // orbit runner runId
  leaseId?: string;                    // 关联 TaskLease
  bindingId?: string;                  // 执行者 binding
  vendorSessionId?: string;            // Claude session id（为 resume 预留）
  trigger: 'dispatch' | 'manual';      // 自动调度 or 人工触发
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  summary?: string;                    // 最终摘要
  startedAt: string;
  endedAt?: string;
}

/** 任务对话（per task 1:1） */
interface TaskConversation {
  taskId: string;                      // orbit task id（= file path hash）
  taskUid: string;                     // frontmatter uid
  projectUid?: string;
  segments: RunSegment[];              // 所有执行片段
  turns: ConversationTurn[];           // 有序消息列表
  createdAt: string;
  updatedAt: string;
}
```

### 2.2 存储位置

```
.orbit/orchestration/conversations/<taskUid>.json
```

- 不进 Git（高频变化的 runtime state）
- 与 leases.json、reports.json 同级
- 使用现有 `readJsonFile / writeJsonFile` 工具函数

### 2.3 与现有模型的关系

```
TaskLease (已有)           → RunSegment.leaseId
ImplementationReport (已有) → RunSegment.runId 对齐
AgentEvent (已有)          → 聚合后写入 ConversationTurn.content
ProjectRoleBinding (已有)  → RunSegment.bindingId
```

不修改现有 TaskLease / ImplementationReport 结构，Conversation 是它们的**展示层聚合**。

---

## 三、Main Process 逻辑

### 3.1 新模块：`src/main/orchestration/conversation.ts`

```ts
// 核心 API

/** 获取或创建任务对话 */
export async function getOrCreateConversation(
  vaultPath: string,
  task: { id: string; uid: string; project_uid?: string }
): Promise<TaskConversation>;

/** 追加 turn */
export async function appendTurn(
  vaultPath: string,
  taskUid: string,
  turn: Omit<ConversationTurn, 'id' | 'createdAt'>
): Promise<ConversationTurn>;

/** 开始一个 RunSegment */
export async function startSegment(
  vaultPath: string,
  taskUid: string,
  segment: Omit<RunSegment, 'id' | 'startedAt'>
): Promise<RunSegment>;

/** 完成一个 RunSegment */
export async function completeSegment(
  vaultPath: string,
  taskUid: string,
  segmentId: string,
  result: { status: RunSegment['status']; summary?: string }
): Promise<void>;

/** 人工发送消息并触发 agent run */
export async function sendAndRun(
  vaultPath: string,
  task: TaskRecord,
  message: string
): Promise<{ turnId: string; runId: string; segmentId: string }>;
```

### 3.2 DispatchService 集成（自动执行）

修改点集中在 `dispatch.ts` 的两个位置：

#### `tryDispatchTask` — 认领成功后

```ts
// 现有代码之后追加：
const conversation = await getOrCreateConversation(vaultPath, task);
const segment = await startSegment(vaultPath, task.uid!, {
  taskId: task.id,
  runId: startResult.runId,
  leaseId,
  bindingId: binding.id,
  trigger: 'dispatch',
  status: 'running'
});
await appendTurn(vaultPath, task.uid!, {
  role: 'system',
  content: `🤖 ${binding.id} 认领了任务，开始执行...`,
  segmentId: segment.id
});
```

#### `handlePoolEvent` — run 完成后

```ts
// 现有代码之后追加：
const events = snapshot?.events ?? [event.event];
const assistantContent = events
  .filter(e => e.kind === 'message' || e.kind === 'text')
  .map(e => e.text ?? '')
  .filter(Boolean)
  .join('\n\n');

if (assistantContent) {
  await appendTurn(vaultPath, task.uid!, {
    role: 'assistant',
    content: assistantContent,
    segmentId: segment.id  // 通过 lease.reportId 或 runId 关联
  });
}
await completeSegment(vaultPath, task.uid!, segmentId, {
  status: event.event.kind === 'done' ? 'completed' : 'failed',
  summary: timeline.summary
});
```

### 3.3 人工对话流程（`sendAndRun`）

```ts
export async function sendAndRun(vaultPath, task, message) {
  // 1. 写入 user turn
  const userTurn = await appendTurn(vaultPath, task.uid!, {
    role: 'user',
    content: message
  });

  // 2. 创建 segment
  const segment = await startSegment(vaultPath, task.uid!, {
    taskId: task.id,
    runId: '',  // 待填
    trigger: 'manual',
    status: 'running'
  });

  // 3. 追加 system turn
  await appendTurn(vaultPath, task.uid!, {
    role: 'system',
    content: '⏳ 正在执行...',
    segmentId: segment.id
  });

  // 4. 调用现有 startTask，把 message 作为 instructions
  const result = await startTask({
    taskId: task.id,
    instructions: message
  });

  if (result.kind !== 'ok') {
    await completeSegment(vaultPath, task.uid!, segment.id, {
      status: 'failed',
      summary: result.message
    });
    await appendTurn(vaultPath, task.uid!, {
      role: 'system',
      content: `❌ 执行失败: ${result.message}`,
      segmentId: segment.id
    });
    return { turnId: userTurn.id, runId: '', segmentId: segment.id };
  }

  // 5. 更新 segment 的 runId
  // segment.runId = result.runId (持久化)

  // 6. run 完成后由 handlePoolEvent → completeSegment 闭环
  return { turnId: userTurn.id, runId: result.runId, segmentId: segment.id };
}
```

### 3.4 实时事件推送

**不新增 IPC channel**，复用现有 `agent:event`。

Renderer 端已经通过 `useAgent` store 监听 `agent:event`，Chat tab 只需根据 `taskId` 过滤当前任务的 events，实时显示正在执行的 agent 输出。

Run 完成后 reload conversation 即可获得聚合后的完整对话。

---

## 四、IPC 新增

```ts
// src/shared/ipc.ts — IPC 定义新增
conversation: {
  get: 'conversation:get',           // (taskId) → TaskConversation | null
  send: 'conversation:send',         // (taskId, message) → { turnId, runId, segmentId }
  event: 'conversation:event'        // 广播 turn 新增事件
}
```

```ts
// src/shared/ipc.ts — OrbitAPI 类型新增
conversation: {
  get(taskId: string): Promise<TaskConversation | null>;
  send(taskId: string, message: string): Promise<{
    turnId: string;
    runId: string;
    segmentId: string;
  }>;
  onEvent(cb: (ev: { taskId: string; turn: ConversationTurn }) => void): () => void;
};
```

总共 **3 个 IPC 通道**：1 个查询、1 个写入、1 个广播。

---

## 五、前端 UI

### 5.1 入口变更：看板卡片点击行为

**当前**：点击 TaskRow → `openPath(task.filePath)` → 跳转编辑器。

**改为**：点击 TaskRow → 打开 `TaskDetailsModal`（已有组件）。

修改 `TaskRow.tsx` 中 `jump()` 函数：

```ts
// 之前
async function jump() {
  await openPath(task.filePath);
  setView({ kind: 'editor' });
}

// 之后
function jump() {
  setTaskDetailOpen(task);  // 打开 modal，传入 task
}
```

### 5.2 TaskDetailsModal 内部结构

```
┌─────────────────────────────────────────────────┐
│ header: task.title + status badge + close        │
├─────────────────────────────────────────────────┤
│ [Detail]  [Chat]                    ← tab bar   │
├─────────────────────────────────────────────────┤
│                                                  │
│   Detail tab:                                    │
│     现有 TaskEditor 原封不动嵌入                   │
│                                                  │
│   Chat tab:                                      │
│   ┌─────────────────────────────────────────┐    │
│   │ system: 任务已创建                       │    │
│   │ system: 🤖 executor 认领了任务           │    │
│   │ assistant: 分析了代码结构...              │    │
│   │ system: ✅ 执行完成                      │    │
│   │ user: 换个思路，先看测试覆盖率            │    │
│   │ system: ⏳ 正在执行...                   │    │
│   │ assistant: 测试覆盖率为 78%...            │    │
│   │                          ← 消息列表      │    │
│   ├─────────────────────────────────────────┤    │
│   │ [输入框..................] [Send] [▶ Run] │    │
│   └─────────────────────────────────────────┘    │
│                                                  │
└─────────────────────────────────────────────────┘
```

### 5.3 Chat Tab 组件树

```
TaskChatTab
├── SegmentDivider          // "── RunSegment #1 · executor · dispatch ──"
├── ChatBubble (system)     // "🤖 executor 认领了任务"
├── ChatBubble (assistant)  // agent 输出（markdown 渲染）
├── ChatBubble (system)     // "✅ 执行完成"
├── SegmentDivider          // "── RunSegment #2 · manual ──"
├── ChatBubble (user)       // 人的消息
├── ChatBubble (assistant)  // agent 回复
├── LiveEventStream         // 如果当前有 running segment，实时显示 events
└── ChatComposer            // 输入框 + Send 按钮
```

### 5.4 ChatBubble 样式

复用 `ProjectPlannerView.tsx` 中 `PlannerChatMessage` 的气泡样式：
- user: 右对齐，深色背景
- assistant: 左对齐，浅色边框背景，顶部有 agent label
- system: 居中，小字，neutral 色，无气泡

### 5.5 LiveEventStream

当任务有正在执行的 run 时（通过 `useAgent` store 匹配 `runId`），实时展示 agent events：

```tsx
function LiveEventStream({ runId }: { runId: string }) {
  const run = useAgent(s => s.runs[runId]);
  if (!run || run.summary.status !== 'running') return null;

  return (
    <div className="border-l-2 border-sky-400 pl-3 space-y-1">
      {run.events.filter(e => e.kind === 'message' || e.kind === 'text').map(event => (
        <p key={event.idx} className="text-xs text-neutral-600 dark:text-neutral-400">
          {event.text}
        </p>
      ))}
      <div className="flex items-center gap-2 text-xs text-sky-500">
        <span className="animate-pulse">●</span> Agent is working...
      </div>
    </div>
  );
}
```

### 5.6 ChatComposer

```tsx
function ChatComposer({ taskId, disabled }: { taskId: string; disabled: boolean }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await window.orbit.conversation.send(taskId, text.trim());
      setText('');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder="Send a message to the agent..."
        disabled={disabled || sending}
        className="flex-1 resize-none rounded border border-neutral-300 px-3 py-2 text-sm ..."
        rows={2}
      />
      <button onClick={send} disabled={disabled || sending || !text.trim()}>
        {sending ? '⏳' : '▶ Send'}
      </button>
    </div>
  );
}
```

### 5.7 SegmentDivider

用于在对话流中标记不同的执行段落：

```tsx
function SegmentDivider({ segment }: { segment: RunSegment }) {
  const label = segment.trigger === 'dispatch' ? '🤖 Auto' : '👤 Manual';
  const statusIcon = {
    running: '⏳',
    completed: '✅',
    failed: '❌',
    cancelled: '⚫'
  }[segment.status];

  return (
    <div className="flex items-center gap-2 py-2 text-[11px] text-neutral-400">
      <hr className="flex-1 border-neutral-200 dark:border-neutral-800" />
      <span>{statusIcon} {label} · {segment.bindingId ?? 'agent'} · {timeAgo(segment.startedAt)}</span>
      <hr className="flex-1 border-neutral-200 dark:border-neutral-800" />
    </div>
  );
}
```

### 5.8 Zustand Store

```ts
// src/renderer/src/store/conversation.ts

interface ConversationStore {
  /** 当前打开的 task conversation */
  conversation: TaskConversation | null;
  loading: boolean;

  /** 加载指定任务的对话 */
  load(taskId: string): Promise<void>;

  /** 清空（关闭 modal 时） */
  clear(): void;
}
```

不缓存多个 conversation——同时只打开一个任务详情，切换时重新 load。

---

## 六、Prompt 层任务边界约束

在 `composePrompt` 中追加硬性指令：

```
# Boundary

你当前负责的任务是：「${task.title}」(uid: ${task.uid})。

- 只执行这个任务范围内的工作
- 如果发现需要额外工作，使用 create_task 创建新任务，不要在本次执行中越界
- 不要修改其他任务的状态
- 完成后明确输出完成摘要
```

---

## 七、用户旅程

### 旅程 1：Agent 自动执行任务

```
1. 用户在 Planner 画布中规划任务图并 Publish
   → 任务进入看板 waiting/todo 列

2. DispatchService 每 15s tick
   → 发现 Task A 满足条件（todo + autonomous + 无 owner）
   → 原子认领：status→doing, owner→binding
   → 创建 RunSegment + system turn "🤖 executor 认领了任务"
   → spawn claude 子进程

3. 用户打开看板，看到 Task A 在 doing 列，owner badge 显示 executor
   → 点击 Task A → 弹出 TaskDetailsModal
   → 默认进入 Chat tab（因为有正在执行的 run）
   → 看到:
     - system: "🤖 executor 认领了任务，开始执行..."
     - LiveEventStream: agent 实时输出（tool_use, message...）
     - 底部 composer 可用（可以随时介入）

4. Agent 执行完成
   → handlePoolEvent 触发
   → agent 输出聚合为 assistant turn 写入 conversation
   → system turn "✅ 执行完成: 已实现 XX 功能"
   → RunSegment 标记 completed
   → task status → done
   → 用户在 Chat tab 看到完整对话历史

5. Agent 执行失败
   → system turn "❌ 执行失败: ..."
   → RunSegment 标记 failed
   → task status → blocked
   → 用户可以在 composer 里输入修正指令，触发新一轮 run
```

### 旅程 2：人工主动对话执行任务

```
1. 用户在看板看到一个 todo 任务，不想等自动调度
   → 点击 Task B → TaskDetailsModal
   → 切换到 Chat tab

2. 用户在 composer 输入："先分析一下这个模块的依赖关系，给我建议"
   → 点击 Send
   → user turn 写入 conversation
   → startTask({ taskId, instructions: message }) 触发
   → system turn "⏳ 正在执行..."
   → agent 开始执行

3. 实时看到 agent 输出
   → LiveEventStream 显示 agent 正在分析...
   → agent 完成 → assistant turn 写入

4. 用户看了结果，继续追问："方案 B 更好，按这个思路实现"
   → 再次 Send → 新的 RunSegment
   → agent 再次执行（当前是新 spawn；未来可 resume）

5. 满意后，用户可以手动将 task 标记为 done
```

### 旅程 3：Agent 执行中途人工介入

```
1. Agent 自动执行 Task C，进入 doing
   → 用户在 Chat tab 看到 LiveEventStream

2. 用户发现 agent 方向不对
   → 先 Stop（通过 agent store 的 stop 能力）
   → agent run 被 kill → RunSegment 标记 cancelled

3. 用户在 composer 输入修正指令
   → 触发新的 RunSegment（manual trigger）
   → agent 按新指令执行

4. 或者，用户不 Stop，直接在 composer 发消息
   → 当前 run 仍在执行（不中断）
   → 消息先记录为 user turn
   → 当前 run 完成后，下一次 send 会触发新 run
```

### 旅程 4：换 Agent 继续执行

```
1. Agent 执行 Task D 失败，binding 降级为 degraded
   → Chat tab 显示:
     ── RunSegment #1 · 🤖 Auto · executor · 2min ago ──
     system: "🤖 executor 认领了任务"
     assistant: "尝试实现但遇到了 type error..."
     system: "❌ 执行失败: type check failed"

2. 用户 release 任务（通过 dispatch:releaseTask）
   → task owner 清空，status 回到 todo
   → system turn: "🔄 任务已释放"

3. 用户手动修改 task 的 recommended_role 或 role_binding_id
   → 或者由 DispatchService 自动匹配到另一个 binding

4. 新 binding 认领
   → Chat tab 继续追加:
     ── RunSegment #2 · 🤖 Auto · reviewer · just now ──
     system: "🤖 reviewer 认领了任务"
     assistant: "重新分析问题..."
   → 同一个 conversation，不同的 segment
```

---

## 八、验证清单

### Phase 1：数据层验证

- [ ] `conversation.ts` 模块的 CRUD 单元测试
  - 创建 conversation → 文件写入 `.orbit/orchestration/conversations/<uid>.json`
  - appendTurn → turns 有序追加
  - startSegment / completeSegment → segments 正确记录

### Phase 2：DispatchService 集成验证

- [ ] 自动执行一个 todo + autonomous 任务
  - 验证 conversation 文件被创建
  - 验证 system turn "认领" 被写入
  - 验证 run 完成后 assistant turn 被写入
  - 验证 segment 状态为 completed

- [ ] 执行失败场景
  - 验证 segment 状态为 failed
  - 验证 system turn 包含失败原因

### Phase 3：IPC 验证

- [ ] `conversation:get` 返回正确的 conversation
- [ ] `conversation:send` 写入 user turn + 触发 run
- [ ] `conversation:event` 广播 turn 新增

### Phase 4：UI 验证

- [ ] 看板点击任务 → 弹出 TaskDetailsModal
- [ ] Detail tab 展示 TaskEditor（与现有行为一致）
- [ ] Chat tab 展示 conversation turns
- [ ] SegmentDivider 正确显示
- [ ] LiveEventStream 在 run 进行时实时更新
- [ ] Composer 发送消息 → 触发 agent run
- [ ] Run 完成后 → 对话流更新

### Phase 5：端到端验证

手动执行完整用户旅程 1-4，确认：

- [ ] Planner publish → task 进入 todo → agent 自动认领 → 对话流记录完整
- [ ] 人工 send → agent 执行 → 结果显示 → 追问 → 第二轮执行
- [ ] 执行失败 → release → 换 agent → 同一 conversation 继续
- [ ] 多个 segment 在同一 conversation 中正确显示分隔

---

## 九、不在本方案范围内

- `--resume` vendor session（预留字段，不实现）
- 对话历史搜索
- 对话导出
- 多任务并排对话
- Conversation 的 Git 版本化

---

## 十、文件清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/main/orchestration/conversation.ts` | Conversation CRUD + sendAndRun |
| `src/renderer/src/components/TaskChat/TaskChatTab.tsx` | Chat tab 主组件 |
| `src/renderer/src/components/TaskChat/ChatBubble.tsx` | 消息气泡 |
| `src/renderer/src/components/TaskChat/ChatComposer.tsx` | 输入框 |
| `src/renderer/src/components/TaskChat/SegmentDivider.tsx` | 执行段落分隔 |
| `src/renderer/src/components/TaskChat/LiveEventStream.tsx` | 实时事件流 |
| `src/renderer/src/store/conversation.ts` | Zustand store |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/shared/orchestration.ts` | 新增 ConversationTurn / RunSegment / TaskConversation 类型 |
| `src/shared/ipc.ts` | 新增 `conversation:*` IPC 定义 + OrbitAPI 类型 |
| `src/main/orchestration/ipc.ts` | 注册 conversation IPC handlers |
| `src/main/orchestration/dispatch.ts` | tryDispatchTask / handlePoolEvent 追加 conversation 写入 |
| `src/main/orchestration/storage.ts` | 新增 `vaultConversationsDir` 路径函数 |
| `src/main/agent/persona.ts` | composePrompt 追加任务边界约束 |
| `src/renderer/src/components/TaskRow.tsx` | 点击行为改为打开 TaskDetailsModal |
| `src/renderer/src/components/Modals/TaskDetailsModal.tsx` | 内部增加 tab (Detail / Chat) |
| `src/preload/index.ts` | 暴露 `conversation.*` API 到 renderer |

### 不修改

| 文件 | 原因 |
|------|------|
| `src/main/agent/runner.ts` | 执行链路不变 |
| `src/main/agent/pool.ts` | Pool 事件机制不变 |
| `src/main/agent/ipc.ts` | startTask 接口不变 |
| `src/shared/agent.ts` | AgentEvent 类型不变 |

---

## 十一、落地顺序

### Step 1：数据层（~1 天）

1. `shared/orchestration.ts` 新增类型
2. `orchestration/storage.ts` 新增路径函数
3. `orchestration/conversation.ts` 实现 CRUD
4. 单元测试

### Step 2：DispatchService 集成（~0.5 天）

1. `dispatch.ts` 中 tryDispatchTask 追加 conversation 写入
2. `dispatch.ts` 中 handlePoolEvent 追加 conversation 写入
3. 集成测试：自动执行一个任务，检查 conversation 文件

### Step 3：IPC + Preload（~0.5 天）

1. `shared/ipc.ts` 新增定义
2. `orchestration/ipc.ts` 注册 handlers
3. `preload/index.ts` 暴露 API

### Step 4：UI（~1.5 天）

1. `TaskDetailsModal` 增加 tab
2. `TaskChatTab` + 子组件
3. `conversation.ts` store
4. `TaskRow.tsx` 点击行为修改
5. `ChatComposer` → `conversation:send` → agent run

### Step 5：Prompt 边界 + 验证（~0.5 天）

1. `persona.ts` 追加边界约束
2. 手动走完旅程 1-4
3. 修复边界问题
