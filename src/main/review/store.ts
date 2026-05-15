import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import type { ReviewAction, ReviewFilter, ReviewFinding, ReviewKind, ReviewRun, ReviewRunDetail } from '@shared/review';
import { publishTraceableEvent } from '../events/bus';
import { archiveProjectByUid, createTask } from '../project';
import { createSynthesisStore } from '../synthesis/store';

interface ReviewIndexFile {
  version: 1;
  run_ids: string[];
}

export class ReviewStore {
  constructor(private readonly vaultPath: string) {}

  async list(filter: ReviewFilter = {}): Promise<ReviewRun[]> {
    const index = await this.readIndex();
    const runs = (await Promise.all(index.run_ids.map((id) => this.getRunOnly(id)))).filter((run): run is ReviewRun => Boolean(run));
    return runs
      .filter((run) => !filter.kind || filter.kind === 'all' || run.kind === filter.kind)
      .filter((run) => !filter.status || filter.status === 'all' || run.status === filter.status)
      .filter((run) => !filter.scope_ref || run.scope_ref === filter.scope_ref)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getRun(id: string): Promise<ReviewRunDetail | null> {
    const run = await this.getRunOnly(id);
    if (!run) return null;
    const artifact = run.artifact_id
      ? await createSynthesisStore(this.vaultPath).get(run.artifact_id).catch(() => null)
      : null;
    return {
      run,
      findings: await this.getFindings(id),
      ...(artifact ? { artifact } : {})
    };
  }

  async start(kind: ReviewKind, period: ReviewRun['period'], scopeRef?: string): Promise<ReviewRun> {
    const run: ReviewRun = {
      id: `review-${randomUUID()}`,
      kind,
      ...(scopeRef ? { scope_ref: scopeRef } : {}),
      period,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    await this.writeRun(run, []);
    const index = await this.readIndex();
    index.run_ids.push(run.id);
    await this.writeIndex(index);
    publishReviewEvent('review.run.started', run);
    return run;
  }

  async complete(run: ReviewRun, findings: ReviewFinding[], artifactId?: string): Promise<ReviewRun> {
    const next: ReviewRun = {
      ...run,
      status: 'generated',
      ...(artifactId ? { artifact_id: artifactId } : {})
    };
    await this.writeRun(next, findings);
    publishReviewEvent('review.run.generated', next, { findings: findings.length });
    return next;
  }

  async getFindings(reviewRunId: string): Promise<ReviewFinding[]> {
    const raw = await fs.readFile(this.findingsPath(reviewRunId), 'utf8').catch((error: unknown) => {
      if (isNotFound(error)) return '[]';
      throw error;
    });
    return JSON.parse(raw) as ReviewFinding[];
  }

  async acknowledge(findingId: string): Promise<void> {
    const { run, findings } = await this.findFinding(findingId);
    const next = findings.map((finding) => finding.id === findingId ? { ...finding, acknowledged: true } : finding);
    await this.writeRun(run, next);
    publishReviewEvent('review.finding.acknowledged', run, { finding_id: findingId });
  }

  async executeAction(actionId: string): Promise<ReviewAction> {
    const { run, findings, finding, action } = await this.findAction(actionId);
    await this.performAction(action);
    const executed: ReviewAction = { ...action, executed: true, executed_at: new Date().toISOString() };
    const nextFindings = findings.map((item) => {
      if (item.id !== finding.id) return item;
      const actions = item.suggested_actions.map((candidate) => candidate.id === actionId ? executed : candidate);
      const resolved = actions.every((candidate) => candidate.executed || candidate.kind === 'ignore');
      return { ...item, suggested_actions: actions, ...(resolved ? { resolved_at: executed.executed_at } : {}) };
    });
    const nextRun = maybeActionsDone(run, nextFindings);
    await this.writeRun(nextRun, nextFindings);
    publishReviewEvent('review.action.executed', nextRun, { finding_id: finding.id, action_id: actionId, action_kind: action.kind });
    return executed;
  }

  async archiveRun(id: string): Promise<void> {
    const detail = await this.getRun(id);
    if (!detail) throw new Error(`review_run_not_found:${id}`);
    const next = { ...detail.run, status: 'archived' as const, reviewed_at: new Date().toISOString() };
    await this.writeRun(next, detail.findings);
    publishReviewEvent('review.run.archived', next);
  }

  private async performAction(action: ReviewAction): Promise<void> {
    if (action.executed) return;
    if (action.kind === 'ignore' || action.kind === 'mark_stale' || action.kind === 'refresh_resource' || action.kind === 'assign_area' || action.kind === 'schedule_review' || action.kind === 'send_reminder') return;
    if (action.kind === 'archive_project') {
      const uid = action.target_ref?.replace(/^project:/, '');
      if (!uid) throw new Error('review_action_target_missing');
      await archiveProjectByUid(this.vaultPath, uid);
      return;
    }
    if (action.kind === 'create_task') {
      const target = action.target_ref ?? '';
      if (target.startsWith('project:')) {
        await createTask(this.vaultPath, { project_uid: target.slice('project:'.length), title: action.description });
      } else if (target.startsWith('area:')) {
        await createTask(this.vaultPath, { area_uid: target.slice('area:'.length), title: action.description });
      }
    }
  }

  private async findFinding(findingId: string): Promise<{ run: ReviewRun; findings: ReviewFinding[]; finding: ReviewFinding }> {
    for (const run of await this.list({ status: 'all' })) {
      const findings = await this.getFindings(run.id);
      const finding = findings.find((item) => item.id === findingId);
      if (finding) return { run, findings, finding };
    }
    throw new Error(`review_finding_not_found:${findingId}`);
  }

  private async findAction(actionId: string): Promise<{ run: ReviewRun; findings: ReviewFinding[]; finding: ReviewFinding; action: ReviewAction }> {
    for (const run of await this.list({ status: 'all' })) {
      const findings = await this.getFindings(run.id);
      for (const finding of findings) {
        const action = finding.suggested_actions.find((item) => item.id === actionId);
        if (action) return { run, findings, finding, action };
      }
    }
    throw new Error(`review_action_not_found:${actionId}`);
  }

  private runPath(id: string): string {
    return path.join(this.runsDir(), `${id}.json`);
  }

  private findingsPath(id: string): string {
    return path.join(this.findingsDir(), `${id}.json`);
  }

  private reviewDir(): string {
    return path.join(this.vaultPath, ORBIT_DIR, 'review');
  }

  private runsDir(): string {
    return path.join(this.reviewDir(), 'runs');
  }

  private findingsDir(): string {
    return path.join(this.reviewDir(), 'findings');
  }

  private indexPath(): string {
    return path.join(this.reviewDir(), 'index.json');
  }

  private async getRunOnly(id: string): Promise<ReviewRun | null> {
    try {
      return JSON.parse(await fs.readFile(this.runPath(id), 'utf8')) as ReviewRun;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  private async writeRun(run: ReviewRun, findings: ReviewFinding[]): Promise<void> {
    await fs.mkdir(this.runsDir(), { recursive: true });
    await fs.mkdir(this.findingsDir(), { recursive: true });
    await fs.writeFile(this.runPath(run.id), `${JSON.stringify(run, null, 2)}\n`, 'utf8');
    await fs.writeFile(this.findingsPath(run.id), `${JSON.stringify(findings, null, 2)}\n`, 'utf8');
  }

  private async readIndex(): Promise<ReviewIndexFile> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.indexPath(), 'utf8')) as Partial<ReviewIndexFile>;
      return { version: 1, run_ids: Array.isArray(parsed.run_ids) ? parsed.run_ids.filter((id): id is string => typeof id === 'string') : [] };
    } catch (error) {
      if (isNotFound(error)) return { version: 1, run_ids: [] };
      throw error;
    }
  }

  private async writeIndex(index: ReviewIndexFile): Promise<void> {
    await fs.mkdir(this.reviewDir(), { recursive: true });
    await fs.writeFile(this.indexPath(), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  }
}

export function createReviewStore(vaultPath: string): ReviewStore {
  return new ReviewStore(vaultPath);
}

function maybeActionsDone(run: ReviewRun, findings: ReviewFinding[]): ReviewRun {
  const allResolved = findings.length > 0 && findings.every((finding) => finding.resolved_at || finding.acknowledged);
  return allResolved ? { ...run, status: 'actions_done', reviewed_at: new Date().toISOString() } : run;
}

function publishReviewEvent(type: string, run: ReviewRun, extra: Record<string, unknown> = {}): void {
  publishTraceableEvent({
    source: 'synthesis',
    type,
    summary: `${run.kind} review ${run.status}`,
    payload: { review_run_id: run.id, kind: run.kind, status: run.status, ...extra }
  });
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT');
}
