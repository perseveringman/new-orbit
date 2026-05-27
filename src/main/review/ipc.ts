import { randomUUID } from 'node:crypto';
import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { ReviewAction, ReviewFilter, ReviewFinding, ReviewKind, ReviewRun } from '@shared/review';
import type { ContextPacketScope } from '@shared/context';
import type { EvidenceSelector } from '@shared/evidence';
import type { OpenLoopPayload, SynthesisProvenance, SynthesisSource } from '@shared/synthesis';
import { generateWorkContextReport } from '../context/work-context';
import { getSDKRuntime } from '../runtime/sdk/ipc';
import { createSynthesisStore } from '../synthesis/store';
import { buildAgentSessionReviewReport } from './agent-session-report';
import { discoverReviewFindings } from './discovery';
import { reviewPeriod } from './scheduler';
import { createReviewStore, type ReviewStore } from './store';

let current: { vaultPath: string; store: ReviewStore } | null = null;

export function getReviewRuntime(vaultPath: string): { store: ReviewStore } {
  if (current?.vaultPath === vaultPath) return current;
  current = { vaultPath, store: createReviewStore(vaultPath) };
  return current;
}

export function registerReviewSystemIpc(getVaultPath: () => string | null): void {
  const runtime = () => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('no vault open');
    return { vaultPath, ...getReviewRuntime(vaultPath) };
  };

  ipcMain.handle(IPC.review.listRuns, (_event, filter?: ReviewFilter) => runtime().store.list(filter));
  ipcMain.handle(IPC.review.getRun, (_event, id: string) => runtime().store.getRun(id));
  ipcMain.handle(IPC.review.triggerReview, async (_event, kind: ReviewKind, scopeRef?: string) => {
    const { vaultPath, store } = runtime();
    const run = await store.start(kind, reviewPeriod(kind), scopeRef);
    const { findings, health } = await discoverReviewFindings(vaultPath, run);
    const synthesisStore = createSynthesisStore(vaultPath);
    const agentSessionReport = await buildAgentSessionReviewReport(vaultPath, {
      kind,
      period: run.period,
      router: getSDKRuntime(vaultPath).router
    });
    const pmilReport = await generateWorkContextReport(vaultPath, {
      scope: reviewScope(kind, scopeRef),
      period: run.period,
      query: `${kind} review current focus open loops blockers decisions`
    });
    const provenance: SynthesisProvenance = {
      runtime: 'local:heuristic',
      model: 'orbit-review-discovery',
      prompt_version: `review.${kind}.v1`,
      generated_at: new Date().toISOString(),
      tokens: { input: findings.length, output: JSON.stringify(findings).length }
    };
    const workArtifact = await synthesisStore.writeFresh({
      kind: 'work.context',
      scope_key: workContextScopeKey(run),
      sources: sourcesFromEvidenceSelectors(pmilReport.evidence),
      provenance: { ...provenance, prompt_version: 'work.context.v1' },
      payload: pmilReport.work_context
    });
    const openLoopsArtifact = await synthesisStore.writeFresh({
      kind: 'report.open_loops',
      scope_key: openLoopsScopeKey(run),
      sources: sourcesFromEvidenceSelectors(pmilReport.evidence),
      provenance: { ...provenance, prompt_version: 'report.open_loops.v1' },
      payload: pmilReport.open_loops
    });
    const pmilFindings = reviewFindingsFromOpenLoops(run, pmilReport.open_loops, openLoopsArtifact.id);
    const allFindings = [...pmilFindings, ...findings];
    const artifact = await synthesisStore.writeFresh({
      kind: kind === 'monthly' ? 'summary.monthly' : kind === 'daily' ? 'summary.daily' : 'review.weekly',
      scope_key: `review:${kind}:${run.period.from.slice(0, 10)}:${scopeRef ?? 'global'}`,
      sources: [
        { kind: 'raw', ref: run.id, title: `${kind} review`, metadata: { health } },
        ...sourcesFromEvidenceSelectors(agentSessionReport.sessions.flatMap((session) => session.evidence))
      ],
      provenance,
      payload: {
        findings: allFindings,
        health,
        agent_session_report: agentSessionReport,
        pmil: {
          work_context_artifact_id: workArtifact.id,
          open_loops_artifact_id: openLoopsArtifact.id,
          current_focus: pmilReport.work_context.current_focus,
          active_threads: pmilReport.work_context.active_threads.slice(0, 4),
          open_loops: pmilReport.open_loops.loops.slice(0, 8)
        }
      }
    });
    return store.complete(run, allFindings, artifact.id);
  });
  ipcMain.handle(IPC.review.acknowledge, (_event, findingId: string) => runtime().store.acknowledge(findingId));
  ipcMain.handle(IPC.review.executeAction, (_event, actionId: string) => runtime().store.executeAction(actionId));
  ipcMain.handle(IPC.review.archiveRun, (_event, id: string) => runtime().store.archiveRun(id));
}

function reviewScope(kind: ReviewKind, scopeRef?: string): ContextPacketScope {
  if (kind === 'area' && scopeRef) return { kind: 'area', ref: scopeRef };
  if (kind === 'resource' && scopeRef) return { kind: 'resource', ref: scopeRef };
  if (kind === 'project' && scopeRef) return { kind: 'project', ref: scopeRef };
  return { kind: 'global' };
}

function workContextScopeKey(run: ReviewRun): string {
  return `work:${run.scope_ref ?? 'global'}:${run.period.from.slice(0, 10)}:${run.period.to.slice(0, 10)}`;
}

function openLoopsScopeKey(run: ReviewRun): string {
  return `open-loops:${run.scope_ref ?? 'global'}:${run.period.from.slice(0, 10)}:${run.period.to.slice(0, 10)}`;
}

function sourcesFromEvidenceSelectors(selectors: EvidenceSelector[]): SynthesisSource[] {
  return selectors.slice(0, 30).map((selector) => ({
    kind: 'raw',
    ref: selector.source_id,
    title: `Evidence ${selector.kind}`,
    metadata: { selector }
  }));
}

function reviewFindingsFromOpenLoops(
  run: ReviewRun,
  payload: OpenLoopPayload,
  artifactId: string
): ReviewFinding[] {
  return payload.loops.slice(0, 8).map((loop) => ({
    id: `finding-${randomUUID()}`,
    review_run_id: run.id,
    severity: loop.severity,
    category: `open-loop:${loop.kind}`,
    title: loop.title,
    rationale: loop.rationale,
    evidence: loop.evidence.map((selector) => ({
      kind: 'evidence_selector',
      description: `${selector.source_id}#${selector.kind}`,
      ref: selector.source_id
    })),
    suggested_actions: reviewActionsFromOpenLoop(loop, artifactId)
  }));
}

function reviewActionsFromOpenLoop(
  loop: OpenLoopPayload['loops'][number],
  artifactId: string
): ReviewAction[] {
  const createTask = loop.suggested_actions.find((action) => action.kind === 'create_task');
  return [
    {
      id: `action-${randomUUID()}`,
      kind: 'create_task',
      ...(createTask && 'project_ref' in createTask && createTask.project_ref
        ? { target_ref: `project:${createTask.project_ref}` }
        : {}),
      description: createTask && 'title' in createTask ? createTask.title : `继续处理：${loop.title}`,
      executed: false
    },
    {
      id: `action-${randomUUID()}`,
      kind: 'schedule_review',
      target_ref: `synthesis:${artifactId}`,
      description: '保留到下次复盘继续看',
      executed: false
    },
    {
      id: `action-${randomUUID()}`,
      kind: 'ignore',
      description: '这次先略过',
      executed: false
    }
  ];
}
