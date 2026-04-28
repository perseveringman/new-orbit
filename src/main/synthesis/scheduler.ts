import type { EnsureSynthesisInput, SynthesisArtifact, SynthesisJob } from '@shared/synthesis';
import { createSynthesisJob, SynthesisRunner } from './runner';
import type { SynthesisStore } from './store';

const PRIORITY_WEIGHT: Record<SynthesisJob['priority'], number> = {
  'user-blocking': 0,
  interactive: 1,
  background: 2,
  maintenance: 3
};

export class SynthesisScheduler {
  private queue: SynthesisJob[] = [];
  private running = false;

  constructor(
    private readonly store: SynthesisStore,
    private readonly runner: SynthesisRunner
  ) {}

  async ensure(input: EnsureSynthesisInput): Promise<SynthesisArtifact> {
    const latest = await this.store.latest(input.scope_key);
    if (latest && latest.status === 'fresh' && !input.force) return latest;
    const job = createSynthesisJob({
      ...input,
      reason: input.reason ?? (latest?.status === 'stale' ? 'stale' : input.force ? 'manual' : 'missing')
    });
    this.enqueue(job);
    return this.drainOne(job.id);
  }

  async recompute(scopeKey: string, input?: Partial<EnsureSynthesisInput>): Promise<SynthesisArtifact> {
    const latest = await this.store.latest(scopeKey);
    if (!latest && !input?.kind) throw new Error(`synthesis_scope_not_found:${scopeKey}`);
    return this.ensure({
      kind: input?.kind ?? latest!.kind,
      scope_key: scopeKey,
      sources: input?.sources ?? latest!.sources,
      priority: input?.priority ?? 'user-blocking',
      reason: 'manual',
      force: true,
      budget_usd: input?.budget_usd
    });
  }

  enqueue(job: SynthesisJob): void {
    this.queue.push(job);
    this.queue.sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] || a.created_at.localeCompare(b.created_at));
  }

  queued(): SynthesisJob[] {
    return this.queue.slice();
  }

  private async drainOne(jobId: string): Promise<SynthesisArtifact> {
    if (this.running) {
      const job = this.queue.find((item) => item.id === jobId);
      if (!job) throw new Error(`synthesis_job_not_found:${jobId}`);
      return this.runner.run({ ...job, status: 'running' });
    }
    this.running = true;
    try {
      const index = this.queue.findIndex((job) => job.id === jobId);
      const [job] = this.queue.splice(index >= 0 ? index : 0, 1);
      if (!job) throw new Error(`synthesis_job_not_found:${jobId}`);
      return await this.runner.run({ ...job, status: 'running' });
    } finally {
      this.running = false;
    }
  }
}

