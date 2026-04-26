---
title: "Runtime Fallback 决策规则与 Budget 熔断"
status: draft
date: 2026-04-27
adr: ADR-014
phase: "3.3"
depends_on: "2026-04-27-runtime-adapter-layer.md (Phase 3.1)"
---

# Runtime Fallback 决策规则与 Budget 熔断

> **定位**：让 agent 执行有自愈能力——一个 runtime 挂了自动切下一个，费用失控自动停。
>
> **前置**：Runtime Adapter Layer 已就绪
>
> **产出**：FallbackEngine + BudgetGuard + 改造 dispatch

---

## 1. Fallback 决策引擎

### 1.1 FallbackEngine

```typescript
// src/main/agent/fallback/engine.ts（新文件）

interface FallbackConfig {
  /** runtime 优先级列表（按 provider） */
  priority: string[];  // ['claude', 'codex', 'copilot']

  /** 卡死超时（ms） */
  staleTimeoutMs: number;  // 默认 15 * 60 * 1000

  /** 切换后冷却期（ms）——防止抖动 */
  cooldownMs: number;  // 默认 5 * 60 * 1000
}

class FallbackEngine {
  private failureHistory: Map<string, { lastFailure: number; count: number }> = new Map();

  constructor(private config: FallbackConfig) {}

  /** 进程退出时的决策 */
  onProcessExit(
    currentRuntimeId: string,
    exitCode: number,
    errorCode?: string,
    adapter?: RuntimeAdapter
  ): FallbackDecision {
    if (exitCode === 0) return { action: 'completed' };

    const nonRetryable = adapter?.getNonRetryableErrors() ?? [];
    if (errorCode && nonRetryable.includes(errorCode)) {
      return this.tryNextRuntime(currentRuntimeId);
    }

    // 可重试错误但 runtime 自己放弃了（退出了）—— 也切
    return this.tryNextRuntime(currentRuntimeId);
  }

  /** 卡死超时时的决策 */
  onStaleTimeout(currentRuntimeId: string): FallbackDecision {
    return this.tryNextRuntime(currentRuntimeId);
  }

  /** 找下一个可用 runtime */
  private tryNextRuntime(failedRuntimeId: string): FallbackDecision {
    this.recordFailure(failedRuntimeId);
    const provider = extractProvider(failedRuntimeId);
    const idx = this.config.priority.indexOf(provider);
    const remaining = this.config.priority.slice(idx + 1);

    for (const nextProvider of remaining) {
      const runtime = findOnlineRuntime(nextProvider);
      if (runtime && !this.isInCooldown(runtime.runtimeId)) {
        return { action: 'switch_runtime', nextRuntimeId: runtime.runtimeId };
      }
    }
    return { action: 'give_up', reason: 'All runtimes exhausted or in cooldown' };
  }
}

type FallbackDecision =
  | { action: 'completed' }
  | { action: 'switch_runtime'; nextRuntimeId: string }
  | { action: 'give_up'; reason: string };
```

### 1.2 卡死检测器

```typescript
// src/main/agent/fallback/stale-detector.ts（新文件）

class StaleDetector {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  /** 开始监控一个 session */
  watch(runId: string, session: AdapterSession, onStale: () => void): void {
    const check = () => {
      const age = Date.now() - session.lastEventAt();
      if (age > this.staleTimeoutMs && session.isAlive()) {
        onStale();
      }
    };
    this.timers.set(runId, setInterval(check, 60_000));  // 每分钟检查
  }

  /** session 有新事件时重置 */
  touch(runId: string): void {
    // heartbeat 事件也算 touch
  }

  /** 停止监控 */
  unwatch(runId: string): void {
    const timer = this.timers.get(runId);
    if (timer) clearInterval(timer);
    this.timers.delete(runId);
  }
}
```

### 1.3 不可重试错误列表

每个 adapter 声明自己的，通用列表在 engine 里兜底：

```typescript
const UNIVERSAL_NON_RETRYABLE = [
  'rate_limit_exceeded',
  'quota_exceeded',
  'authentication_failure',
  'invalid_api_key',
  'model_not_available',
  'billing_error',
];
```

---

## 2. Budget 熔断

### 2.1 BudgetGuard

```typescript
// src/main/agent/fallback/budget-guard.ts（新文件）

interface BudgetGuardConfig {
  defaultLimitUsd: number;      // 默认 20
  warningThreshold: number;     // 0.8 (80%)
}

class BudgetGuard {
  private accumulated: Map<string, number> = new Map();  // runId → cumulative USD

  /** 处理 cost 事件 */
  onCostEvent(event: UnifiedAgentEvent): BudgetAction {
    if (event.kind !== 'cost' || !event.costUsd) return { action: 'continue' };

    const runId = event.runId;
    const current = this.accumulated.get(runId) ?? 0;
    const updated = Math.max(current, event.costUsd);  // cumulative max
    this.accumulated.set(runId, updated);

    const limit = this.getLimit(event.taskUid);

    if (updated >= limit) {
      return { action: 'stop', reason: `Budget exceeded: $${updated.toFixed(2)} >= $${limit}` };
    }
    if (updated >= limit * this.config.warningThreshold) {
      return { action: 'warn', remaining: limit - updated };
    }
    return { action: 'continue' };
  }

  /** 获取 task 的 budget 限制 */
  private getLimit(taskUid: string): number {
    // 1. 先查 task frontmatter 的 budget_limit
    // 2. 没有就用 settings.autoRunner.defaultBudgetPerTask
    // 3. 都没有就用 config.defaultLimitUsd
  }
}

type BudgetAction =
  | { action: 'continue' }
  | { action: 'warn'; remaining: number }
  | { action: 'stop'; reason: string };
```

### 2.2 Settings 扩展

```typescript
// 在现有 settings schema 中扩展
autoRunner: {
  enabled: boolean;
  maxConcurrent: number;        // 现有
  defaultBudgetPerTask: number; // 新增，默认 20
  staleTimeoutMinutes: number;  // 新增，默认 15
  runtimePriority: string[];    // 新增，默认 ['claude', 'codex', 'copilot']
}
```

### 2.3 Task Frontmatter 扩展

```yaml
type: task
status: doing
budget_limit: 50  # 覆盖全局默认，单位 USD
```

---

## 3. 集成到 Dispatch

```typescript
// dispatch.ts 改造
private async handleRunEvents(
  session: AdapterSession,
  runId: string,
  taskUid: string,
  runtimeId: string
): Promise<void> {
  const budgetGuard = new BudgetGuard(budgetConfig);
  const staleDetector = new StaleDetector(staleConfig);

  staleDetector.watch(runId, session, async () => {
    // 卡死 → kill + fallback
    await session.stop('stale_timeout');
    const decision = fallbackEngine.onStaleTimeout(runtimeId);
    await this.handleFallbackDecision(decision, taskUid);
  });

  try {
    for await (const event of session.events) {
      staleDetector.touch(runId);

      // Budget 检查
      const budgetAction = budgetGuard.onCostEvent(event);
      if (budgetAction.action === 'stop') {
        await session.stop(budgetAction.reason);
        await emitInboxAlert(taskUid, 'budget_exceeded', budgetAction.reason);
        break;
      }
      if (budgetAction.action === 'warn') {
        await emitInboxAlert(taskUid, 'budget_warning', `$${budgetAction.remaining.toFixed(2)} remaining`);
      }

      // 正常处理事件
      this.emit('agent:event', event);
    }
  } catch (error) {
    // 进程异常退出
    const decision = fallbackEngine.onProcessExit(runtimeId, session.exitCode, error.code);
    await this.handleFallbackDecision(decision, taskUid);
  } finally {
    staleDetector.unwatch(runId);
  }
}

private async handleFallbackDecision(decision: FallbackDecision, taskUid: string): Promise<void> {
  switch (decision.action) {
    case 'switch_runtime':
      // 用新 runtime 重新 dispatch 这个 task
      await this.redispatchWithRuntime(taskUid, decision.nextRuntimeId);
      break;
    case 'give_up':
      // 所有 runtime 都失败
      await emitInboxAlert(taskUid, 'all_runtimes_failed', decision.reason);
      await this.markTaskNeedsAttention(taskUid);
      break;
  }
}
```

---

## 4. 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/agent/fallback/engine.ts` | 新建 | FallbackEngine |
| `src/main/agent/fallback/stale-detector.ts` | 新建 | 卡死检测 |
| `src/main/agent/fallback/budget-guard.ts` | 新建 | Budget 熔断 |
| `src/main/agent/fallback/index.ts` | 新建 | barrel export |
| `src/main/orchestration/dispatch.ts` | 修改 | 集成 fallback + budget |
| `src/main/settings.ts` / schema | 修改 | 新增 autoRunner 配置项 |
| `src/shared/schemas.ts` | 修改 | task frontmatter 新增 budget_limit |
| `tests/fallback_engine.test.ts` | 新建 | 单元测试 |
| `tests/budget_guard.test.ts` | 新建 | 单元测试 |
| `tests/stale_detector.test.ts` | 新建 | 单元测试 |

---

## 5. 验收标准

- [ ] FallbackEngine 在 runtime 不可重试错误时正确切换到下一个 runtime
- [ ] StaleDetector 在 15 分钟无事件时触发 kill + fallback
- [ ] BudgetGuard 在 cost 达到 80% 时 warn，100% 时 stop
- [ ] Fallback 后用新 runtime 重新 dispatch 成功
- [ ] 所有 runtime 都失败时 emit Inbox 告警 + task 标记 needs_attention
- [ ] 冷却期内不会切回刚失败的 runtime
- [ ] Task frontmatter `budget_limit` 能覆盖全局默认
- [ ] Settings 中的配置项生效
- [ ] Playground scenario-06（error recovery）+ scenario-08（budget limit）通过
- [ ] 单元测试覆盖核心逻辑
- [ ] `npm run typecheck` 0 error
