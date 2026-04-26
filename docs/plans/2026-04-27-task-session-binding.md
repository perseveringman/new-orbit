---
title: "Task-Session 绑定 — 通用 Resume 与双向 Stream"
status: draft
date: 2026-04-27
adr: ADR-012
phase: "3.3"
depends_on: "2026-04-27-runtime-adapter-layer.md (Phase 3.1)"
---

# Task-Session 绑定

> **定位**：让 agent 不再失忆。一个 task 一个长期 session，后续对话通过原生 resume 接续。
>
> **前置**：Runtime Adapter Layer 已就绪（AdapterSession 接口已定义）
>
> **产出**：修改 dispatch.ts / conversation.ts / agent ipc / renderer 的 session 管理逻辑

---

## 1. 现状问题

### 已有但没用的
- `RunSegment.vendorSessionId` 字段存在，`completeSegment()` 写入了 vendorSessionId
- `agent/ipc.ts` 有 `enrichTerminalAgentSession()` 能构建 `claude --resume ${sessionId}`
- `RuntimeDescriptor.capabilities.supportsResume` 已声明

### 断裂点
- `dispatch.ts` 的 `tryDispatchTask()` 启动新 run 时**不读历史 vendorSessionId**
- `runner.ts` 的 `SpawnOpts` 没有 `vendorSessionId` 参数
- 每次 `agent:startTask` 都是**全新进程、全新 session**
- 现有 resume 逻辑只在 terminal agent（手动 session）里用，orchestration 的自动 dispatch 完全没接

---

## 2. 设计方案

### 2.1 Task-Session 生命周期

```
Task 创建（inbox → todo）
  ↓
首次 dispatch → adapter.startSession() → 记录 vendorSessionId
  ↓
Agent 完成/暂停 → 保存 vendorSessionId 到 RunSegment
  ↓
后续 dispatch（继续对话/新消息）
  ↓
  检查最近 RunSegment 的 vendorSessionId
  ├── 有 + runtime.capabilities.supportsResume → adapter.resumeSession()
  └── 无 或 runtime 不支持 resume → adapter.startSession()（带历史上下文）
  ↓
Task 完成 (done)
  ↓
Session 资源清理（可选，vendor session 文件在用户本地）
```

### 2.2 Session ID 存储位置

沿用现有结构——存在 `RunSegment.vendorSessionId`：

```typescript
interface RunSegment {
  // ... 现有字段 ...
  vendorSessionId?: string;  // 已有，继续用
}
```

**获取最新 session ID 的逻辑**：

```typescript
function getLatestSessionId(conversation: TaskConversation): string | null {
  // 倒序扫 segments，找到最近一个有 vendorSessionId 的
  for (let i = conversation.segments.length - 1; i >= 0; i--) {
    const seg = conversation.segments[i];
    if (seg.vendorSessionId && seg.status !== 'cancelled') {
      return seg.vendorSessionId;
    }
  }
  return null;
}
```

### 2.3 Session Reset

用户可以在 Task 详情页主动 reset session（丢弃历史，下次从头开始）：

- UI 上在 Activity tab 顶部加 "Reset Session" 按钮
- 实现：把当前 vendorSessionId 置空
- 下次 dispatch 自动走 startSession 而不是 resumeSession

---

## 3. Dispatch 改造

### 3.1 tryDispatchTask 流程

```typescript
private async tryDispatchTask(vaultPath: string, task: TaskRecord, allTasks: TaskRecord[]): Promise<void> {
  // 1. 选择 runtime（现有逻辑保留）
  const runtime = this.selectRuntime(task);

  // 2. 获取 adapter
  const adapter = getAdapterForRuntime(runtime);
  if (!adapter) throw new Error(`No adapter for runtime ${runtime.provider}`);

  // 3. 读取 conversation，检查是否有历史 session
  const conversation = await getOrCreateConversation(vaultPath, task);
  const vendorSessionId = getLatestSessionId(conversation);

  // 4. 构建 prompt（现有逻辑）
  const prompt = await buildTaskPrompt(task, allTasks);

  // 5. 启动 session
  const traceId = generateTraceId();
  let session: AdapterSession;

  if (vendorSessionId && adapter.getCapabilities().supportsResume) {
    // resume 现有 session
    session = adapter.resumeSession({
      runtimeDescriptor: runtime,
      prompt,  // resume 时 prompt 是追加消息
      vendorSessionId,
      cwd: task.projectPath,
      taskUid: task.uid,
      runId: generateRunId(),
      traceId,
    });
  } else {
    // 新建 session
    session = adapter.startSession({
      runtimeDescriptor: runtime,
      prompt,
      cwd: task.projectPath,
      taskUid: task.uid,
      runId: generateRunId(),
      traceId,
    });
  }

  // 6. 创建 RunSegment 并绑定
  const segment = await startSegment(vaultPath, task.uid, {
    taskId: task.id,
    runId: session.runId,
    trigger: 'dispatch',
  });

  // 7. 消费事件流 + 记录 vendorSessionId
  // ... (转交给 runner 或直接消费)
}
```

### 3.2 Session ID 回写

在 segment 完成时回写 vendorSessionId：

```typescript
await completeSegment(vaultPath, task.uid, segmentId, {
  status: resultStatus,
  summary: resultSummary,
  vendorSessionId: session.getVendorSessionId(),  // 关键：保存 session ID
});
```

---

## 4. 双向 Stream 实现

### 4.1 阶段一：输出方向（Phase 3.3 首先做）

已经由 RuntimeAdapter 的 `events: AsyncIterable<UnifiedAgentEvent>` 覆盖。

### 4.2 阶段二：输入方向（Phase 3.3 后半段）

用户在 Activity tab 中输入追加消息，agent 正在运行时：

```
用户输入 → renderer IPC → main → AdapterSession.sendMessage(message) → stdin pipe → agent
```

**ClaudeAdapter 的实现**：

```typescript
class ClaudeAdapterSession implements AdapterSession {
  private child: ChildProcess;

  async sendMessage(message: string): Promise<void> {
    if (!this.isAlive()) throw new Error('Session not running');
    // stream-json input format
    const payload = JSON.stringify({
      type: 'user_message',
      content: message,
    });
    this.child.stdin?.write(payload + '\n');
  }
}
```

**IPC 新增**：

```typescript
// src/shared/ipc.ts
IPC.agent.sendMessage = 'agent:sendMessage';

// Handler
async sendMessage(args: { runId: string; message: string }): Promise<void> {
  const session = getActiveSession(args.runId);
  if (!session) throw new Error('No active session');
  await session.sendMessage(args.message);
}
```

**UI 变化**：
- Activity tab 底部输入框：当 agent 运行中时，发送不再杀进程重启
- 输入框状态：idle（agent 没跑）→ send as new prompt / running（agent 在跑）→ send as append
- 发送后在时间线中立即显示用户消息气泡

---

## 5. 文件改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/orchestration/dispatch.ts` | 修改 | tryDispatchTask 加 resume 逻辑 |
| `src/main/orchestration/conversation.ts` | 修改 | 新增 getLatestSessionId 函数 |
| `src/main/agent/ipc.ts` | 修改 | 新增 agent:sendMessage handler |
| `src/shared/ipc.ts` | 修改 | 新增 agent:sendMessage 定义 |
| `src/renderer/src/components/Tasks/TaskConversationTab.tsx` | 修改 | 输入框状态感知（idle vs running）|
| `src/renderer/src/stores/taskConversationStore.ts` | 修改 | 新增 sendMessage action |

---

## 6. 验收标准

- [ ] 新 task 首次 dispatch 创建新 session，vendorSessionId 写入 RunSegment
- [ ] 同一 task 第二次 dispatch 使用 `--resume` 接续（Claude adapter）
- [ ] Resume 后 agent 能看到上一轮对话的上下文
- [ ] Session reset 后下次 dispatch 走 startSession
- [ ] 不支持 resume 的 runtime（Gemini/OpenCode）走 startSession + context 拼接
- [ ] 双向 stream 输出方向：事件正确流式传输
- [ ] 双向 stream 输入方向：用户在 agent 运行中发送消息，agent 能收到
- [ ] Playground scenario-05（resume）跑通
- [ ] `npm run typecheck` 0 error
- [ ] `npm test` 相关测试绿
