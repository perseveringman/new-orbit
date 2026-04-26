---
title: "Agent Playground — 调试基础设施"
status: completed
date: 2026-04-27
phase: "3.0"
depends_on: null
---

# Agent Playground — 调试基础设施

> **定位**：Phase 3 的 Phase 0——先有调试能力，再改代码。
>
> **前置**：无（Phase 3 第一个做的东西）
>
> **产出**：专属测试项目 + scenario harness + 事件录像框架

---

## 1. 为什么先做调试

v2 的 agent 执行链路涉及：runtime 发现 → dispatch → runner → stream-json 解析 → IPC push → renderer 渲染。Phase 3 要改其中每一层。

**没有调试基础设施就改这些，等于盲人摸象。**

调试流程目标：修改任意一层代码后，一键跑 scenario 验证全链路是否正常。

---

## 2. Agent Playground 测试项目

### 2.1 目录结构

```
<test-vault>/01_Projects/agent-playground/
├── README.md                                # 项目说明
├── AGENT.md                                 # agent 上下文（引导 agent 配合测试）
└── tasks/
    ├── scenario-01-simple-chat.md           # 纯文本对话
    ├── scenario-02-single-tool.md           # 一个工具调用（读文件）
    ├── scenario-03-multi-tool.md            # 多工具串联（读+写+验证）
    ├── scenario-04-long-thinking.md         # 触发长 thinking（复杂推理）
    ├── scenario-05-resume.md                # 分两轮对话，第二轮 resume
    ├── scenario-06-error-recovery.md        # 触发 API 错误（mock 或真实）
    ├── scenario-07-concurrent-3.md          # 同时启动 3 个任务
    ├── scenario-08-budget-limit.md          # 循环任务触发预算熔断
    └── scenario-09-long-context.md          # 长上下文触发压缩
```

### 2.2 Scenario 设计

每个 scenario 的 task.md frontmatter 包含验收标准：

```yaml
---
type: task
status: todo
scenario_id: scenario-01-simple-chat
acceptance:
  expected_event_kinds: [message, done]
  markdown_render_live: true
  final_status: done
  max_cost_usd: 2
  max_duration_s: 60
---

# Scenario 01: 简单对话

请回答：Orbit 是什么？用 3 句话描述。

## 验收要求
- Agent 输出包含 "Orbit" 关键字
- 有 message 类型事件
- 以 done 事件结束
- 费用 < $2
```

**Scenario 详解**：

| Scenario | 测试目标 | 预期事件序列 |
|----------|---------|-------------|
| 01 | 基础对话 + 打字机 | message → done |
| 02 | 单工具调用 | thinking → tool_use → tool_result → message → done |
| 03 | 多工具串联 | thinking → tool_use × N → tool_result × N → message → done |
| 04 | 长 thinking | thinking(long) → message → done |
| 05 | Resume | [轮1] message → done → [轮2] resume → message → done |
| 06 | 错误恢复 | error → fallback → message → done |
| 07 | 并发 | 3 个 scenario-01 同时跑，互不干扰 |
| 08 | Budget 熔断 | cost(accumulate) → budget_warning → budget_stop |
| 09 | 长上下文 | thinking → tool_use(many) → context_compress → message → done |

---

## 3. Scenario Harness

### 3.1 CLI 命令

```bash
# 在 src/cli/ 中新增 dev 子命令
orbit dev:scenarios run <scenario-id>           # 跑单个
orbit dev:scenarios run --all                   # 跑全部
orbit dev:scenarios run --concurrent 3 s01 s02 s03  # 并发跑
orbit dev:scenarios verify <scenario-id>        # 验证事件序列 vs golden
orbit dev:scenarios golden update <scenario-id> # 更新 golden file
orbit dev:scenarios golden verify --all         # 全量 golden 验证
```

### 3.2 Harness 实现

```typescript
// src/cli/commands/dev-scenarios.ts（新文件）

async function runScenario(scenarioId: string): Promise<ScenarioResult> {
  // 1. 读取 scenario task.md + acceptance 标准
  const scenario = await loadScenario(scenarioId);

  // 2. 通过 IPC 触发 dispatch（和 UI 走同一条链路）
  const runId = await ipc.invoke('agent:startTask', {
    taskId: scenario.taskId,
    prompt: scenario.content,
  });

  // 3. 收集事件流
  const events: UnifiedAgentEvent[] = [];
  ipc.on('agent:event', (event) => {
    if (event.runId === runId) events.push(event);
  });

  // 4. 等待 done 或 error 或超时
  await waitForCompletion(runId, scenario.acceptance.max_duration_s * 1000);

  // 5. 验证 acceptance
  return validateAcceptance(events, scenario.acceptance);
}
```

### 3.3 验证逻辑

```typescript
function validateAcceptance(
  events: UnifiedAgentEvent[],
  acceptance: ScenarioAcceptance
): ValidationResult {
  const checks: Check[] = [];

  // 检查事件类型序列
  if (acceptance.expected_event_kinds) {
    const actualKinds = events.map(e => e.kind);
    checks.push({
      name: 'event_kinds',
      pass: containsSubsequence(actualKinds, acceptance.expected_event_kinds),
      actual: actualKinds,
      expected: acceptance.expected_event_kinds,
    });
  }

  // 检查最终状态
  if (acceptance.final_status) {
    const lastEvent = events.at(-1);
    checks.push({
      name: 'final_status',
      pass: lastEvent?.kind === acceptance.final_status,
    });
  }

  // 检查费用
  if (acceptance.max_cost_usd) {
    const totalCost = events.filter(e => e.kind === 'cost').at(-1)?.costUsd ?? 0;
    checks.push({
      name: 'cost',
      pass: totalCost <= acceptance.max_cost_usd,
      actual: totalCost,
    });
  }

  return { scenarioId, checks, allPassed: checks.every(c => c.pass) };
}
```

---

## 4. 事件录像框架

Phase 3.0 先搭框架，Phase 3.4（event-replay-infrastructure）做完整实现。

```typescript
// src/main/events/run-recorder.ts（新文件，框架版）

class RunRecorder {
  private streams: Map<string, { raw: fs.WriteStream; abstract: fs.WriteStream; ui: fs.WriteStream }> = new Map();

  /** 开始录制 */
  startRecording(runId: string): void {
    const dir = path.join(vaultPath, '.orbit', 'events', 'runs', runId);
    mkdirSync(dir, { recursive: true });
    this.streams.set(runId, {
      raw: fs.createWriteStream(path.join(dir, 'raw-vendor.ndjson')),
      abstract: fs.createWriteStream(path.join(dir, 'abstract.ndjson')),
      ui: fs.createWriteStream(path.join(dir, 'ui-render.ndjson')),
    });
  }

  /** 写入事件 */
  recordRaw(runId: string, rawEvent: unknown): void { /* append to raw */ }
  recordAbstract(runId: string, event: UnifiedAgentEvent): void { /* append to abstract */ }
  recordUi(runId: string, event: UnifiedAgentEvent): void { /* append to ui */ }

  /** 停止录制 */
  stopRecording(runId: string): void { /* close streams */ }
}
```

---

## 5. 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `tests/fixtures/agent-playground/README.md` | 新建 | Playground 项目说明 |
| `tests/fixtures/agent-playground/AGENT.md` | 新建 | Agent 上下文 |
| `tests/fixtures/agent-playground/tasks/scenario-*.md` | 新建 | 9 个 scenario |
| `src/cli/commands/dev-scenarios.ts` | 新建 | CLI scenario harness |
| `src/cli/commands/dev-golden.ts` | 新建 | Golden file 管理 |
| `src/main/events/run-recorder.ts` | 新建 | 事件录像框架 |
| `tests/helpers/scenario-runner.ts` | 新建 | Scenario 执行器 |
| `tests/helpers/golden-compare.ts` | 新建 | Golden file 比对 |

---

## 6. 验收标准

- [ ] 9 个 scenario task.md 文件就绪，acceptance 标准明确
- [ ] `orbit dev:scenarios run scenario-01` 能跑通（调用真实 Claude）
- [ ] `orbit dev:scenarios run --all` 能依次跑完所有 scenario
- [ ] `orbit dev:scenarios run --concurrent 3` 能并发跑
- [ ] 事件录像三个 NDJSON 文件有正确内容
- [ ] `orbit dev:golden update` 能生成 golden file
- [ ] `orbit dev:golden verify` 能比对事件序列
- [ ] Scenario 结果输出清晰（✓/✗ + 详情）
