import { EventEmitter } from 'node:events';
import type { AgentEvent, RunSummary } from '@shared/agent';
import type { UnifiedAgentEvent } from '@shared/agent-event';
import { AgentRunner, type SpawnOpts } from './runner';
import { agentEventToUnifiedAgentEvent } from './adapter/compat';

export interface PoolEvent {
  runId: string;
  event: AgentEvent;
  unifiedEvent: UnifiedAgentEvent;
}

export class RunnerPool extends EventEmitter {
  private runners = new Map<string, AgentRunner>();
  private byTask = new Map<string, string>(); // taskId -> runId

  list(): RunSummary[] {
    return [...this.runners.values()].map((r) => r.summary);
  }

  get(runId: string): AgentRunner | undefined {
    return this.runners.get(runId);
  }

  /**
   * Spawn a new runner. Rejects with `already_running` when a runner
   * already exists for the same `taskId`.
   */
  async spawn(opts: SpawnOpts): Promise<AgentRunner> {
    if (opts.taskId && this.byTask.has(opts.taskId)) {
      const err = new Error(`already_running for task ${opts.taskId}`) as Error & {
        code?: string;
      };
      err.code = 'already_running';
      throw err;
    }
    const r = new AgentRunner(opts);
    this.runners.set(r.runId, r);
    if (opts.taskId) this.byTask.set(opts.taskId, r.runId);
    r.on('event', (ev: AgentEvent) => {
      const unifiedEvent = agentEventToUnifiedAgentEvent(ev, {
        runId: r.runId,
        taskId: opts.taskId,
        runtime: {
          provider: opts.runtimeProvider ?? 'claude',
          runtimeId: opts.runtimeId,
          name: opts.runtimeName
        }
      });
      this.emit('event', { runId: r.runId, event: ev, unifiedEvent } satisfies PoolEvent);
    });
    r.on('exit', () => {
      if (opts.taskId && this.byTask.get(opts.taskId) === r.runId) {
        this.byTask.delete(opts.taskId);
      }
    });
    await r.start();
    return r;
  }

  async kill(runId: string, reason = 'stopped'): Promise<void> {
    const r = this.runners.get(runId);
    if (!r) return;
    await r.stop(reason);
  }

  async killAll(reason = 'app_quit'): Promise<void> {
    await Promise.all([...this.runners.values()].map((r) => r.stop(reason)));
  }
}

let singleton: RunnerPool | null = null;

export function getPool(): RunnerPool {
  if (!singleton) singleton = new RunnerPool();
  return singleton;
}

export function resetPoolForTesting(): void {
  singleton = null;
}
