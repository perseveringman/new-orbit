import { randomUUID } from 'node:crypto';
import type { BuildWorkContextInput, ContextPacketScope, WorkContextReport } from '@shared/context';
import type { EvidenceChunk, EvidenceScopeRef, EvidenceSelector } from '@shared/evidence';
import type { OpenLoopPayload, WorkContextPayload } from '@shared/synthesis';
import { createEvidenceChunkIndexStore } from '../evidence/chunk-index';
import { buildContextPacket } from './packet-builder';

export async function generateWorkContextReport(
  vaultPath: string,
  input: BuildWorkContextInput & { period: { from: string; to: string } }
): Promise<WorkContextReport> {
  const scope = normalizeWorkScope(input.scope ?? { kind: 'global' });
  const evidenceScope = contextScopeToEvidenceScope(scope);
  const chunkStore = createEvidenceChunkIndexStore(vaultPath);
  const chunks = await chunkStore.list({
    ...(evidenceScope ? { scope: evidenceScope } : {}),
    limit: Math.max(8, input.limit ?? 36)
  });
  const packet = await buildContextPacket(vaultPath, {
    purpose: 'review',
    scope,
    query: input.query ?? '当前焦点 开放回路 阻塞 待决策 下一步',
    max_tokens: 2200,
    evidence_limit: 10,
    graph_limit: 12,
    synthesis_mode: 'lookup'
  });
  const loops = buildOpenLoops(scope, input.period, chunks);
  const activeThreads = buildActiveThreads(chunks, loops.loops.map((loop) => loop.title));
  const workContext: WorkContextPayload = {
    id: `work-context-${randomUUID()}`,
    scope,
    period: input.period,
    current_focus: currentFocus(chunks, packet.sections.map((section) => section.title)),
    active_threads: activeThreads,
    decisions: buildDecisions(chunks),
    open_loops: loops.loops.map((loop) => loop.title)
  };
  return {
    work_context: workContext,
    open_loops: loops,
    evidence: dedupeSelectors([
      ...packet.evidence,
      ...chunks.slice(0, 12).map((chunk) => chunk.selector),
      ...loops.loops.flatMap((loop) => loop.evidence)
    ])
  };
}

function buildOpenLoops(
  scope: WorkContextPayload['scope'],
  period: WorkContextPayload['period'],
  chunks: EvidenceChunk[]
): OpenLoopPayload {
  const loops = chunks
    .flatMap((chunk) => loopCandidatesForChunk(chunk))
    .slice(0, 12);
  return {
    scope,
    period,
    loops
  };
}

function loopCandidatesForChunk(chunk: EvidenceChunk): OpenLoopPayload['loops'] {
  const text = [chunk.title, chunk.text].join('\n');
  const candidates: OpenLoopPayload['loops'] = [];
  const base = {
    id: `open-loop-${randomUUID()}`,
    status: 'candidate' as const,
    evidence: [chunk.selector],
    rationale: `这条内容看起来还没有闭环，可能需要被整理成任务、决策或后续复盘。来源：${chunk.title}`
  };
  if (/\b(todo|next step|follow[- ]?up|remaining|not yet|backlog|later|continue|implement)\b|下一步|待办|继续|补上|实现|后续/iu.test(text)) {
    candidates.push({
      ...base,
      title: titleFromText(chunk.text, '继续处理这件未完成的事'),
      kind: 'task_candidate',
      severity: 'suggestion',
      suggested_actions: [{ kind: 'create_task', title: titleFromText(chunk.text, '继续处理这件未完成的事') }]
    });
  }
  if (/\b(decide|decision pending|open question|trade[- ]?off|whether|should we)\b|待定|拍板|选择|取舍|问题/iu.test(text)) {
    candidates.push({
      ...base,
      id: `open-loop-${randomUUID()}`,
      title: titleFromText(chunk.text, '把这个待决策问题说清楚'),
      kind: text.includes('?') || text.includes('？') ? 'question' : 'decision_pending',
      severity: 'warning',
      suggested_actions: [{ kind: 'schedule_review' }]
    });
  }
  if (/\b(blocked|blocker|stuck|stale|dormant|risk|missing|gap)\b|卡住|阻塞|风险|缺口|过期|停滞/iu.test(text)) {
    candidates.push({
      ...base,
      id: `open-loop-${randomUUID()}`,
      title: titleFromText(chunk.text, '检查这里是否已经停滞或被阻塞'),
      kind: 'stale_context',
      severity: 'warning',
      suggested_actions: [{ kind: 'schedule_review' }]
    });
  }
  return candidates;
}

function buildActiveThreads(
  chunks: EvidenceChunk[],
  openLoopTitles: string[]
): WorkContextPayload['active_threads'] {
  return chunks.slice(0, 8).map((chunk, index) => ({
    title: chunk.title,
    summary: snippet(chunk.text, 320),
    evidence: [chunk.selector],
    confidence: Number((0.55 + Math.max(0, 4 - index) * 0.05).toFixed(2)),
    likely_next_steps: likelyNextSteps(chunk, openLoopTitles),
    ...(hasBlocker(chunk.text) ? { blockers: [titleFromText(chunk.text, '检查这个阻塞点')] } : {})
  }));
}

function buildDecisions(chunks: EvidenceChunk[]): WorkContextPayload['decisions'] {
  return chunks
    .filter((chunk) => /\b(decision|decided|ADR|choose|chosen|because)\b|决定|选择|取舍|因为/iu.test([chunk.title, chunk.text].join('\n')))
    .slice(0, 6)
    .map((chunk) => ({
      title: titleFromText(chunk.text, chunk.title),
      status: /\b(pending|whether|should)\b|待定|是否/iu.test(chunk.text) ? 'pending' as const : 'made' as const,
      evidence: [chunk.selector]
    }));
}

function likelyNextSteps(chunk: EvidenceChunk, openLoopTitles: string[]): string[] {
  const explicit = openLoopTitles.find((title) => title && chunk.text.includes(title.slice(0, 20)));
  if (explicit) return [explicit];
  if (hasBlocker(chunk.text)) return ['先确认卡点，再决定一个最小的推进动作。'];
  if (/\b(decision|whether|should)\b|待定|是否|选择/iu.test(chunk.text)) return ['把待决策问题写成一个明确选择。'];
  return ['判断这条线索应该变成任务、笔记，还是主题更新。'];
}

function currentFocus(chunks: EvidenceChunk[], fallbackTitles: string[]): string {
  const entities = new Map<string, number>();
  for (const chunk of chunks.slice(0, 12)) {
    for (const entity of chunk.entities.slice(0, 6)) {
      entities.set(entity, (entities.get(entity) ?? 0) + 1);
    }
  }
  const topEntities = Array.from(entities.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([entity]) => entity);
  if (topEntities.length) return topEntities.join(', ');
  const titles = chunks.slice(0, 3).map((chunk) => chunk.title).filter(Boolean);
  if (titles.length) return titles.join(' / ');
  return fallbackTitles.join(' / ') || '暂时没有发现明确焦点';
}

function titleFromText(text: string, fallback: string): string {
  const sentence = text
    .replace(/\s+/gu, ' ')
    .split(/[。！？.!?]\s*/u)
    .map((part) => part.trim())
    .find((part) => part.length >= 8);
  const title = sentence ?? fallback;
  return title.length > 96 ? `${title.slice(0, 93)}...` : title;
}

function hasBlocker(text: string): boolean {
  return /\b(blocked|blocker|stuck|risk|missing|gap)\b|卡住|阻塞|风险|缺口/iu.test(text);
}

function snippet(text: string, limit: number): string {
  const trimmed = text.replace(/\s+/gu, ' ').trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 3)}...`;
}

function normalizeWorkScope(scope: ContextPacketScope): WorkContextPayload['scope'] {
  if (scope.kind === 'project' || scope.kind === 'area' || scope.kind === 'resource') {
    return scope.ref ? { kind: scope.kind, ref: scope.ref } : { kind: 'global' };
  }
  return { kind: 'global' };
}

function contextScopeToEvidenceScope(scope: WorkContextPayload['scope']): EvidenceScopeRef | null {
  if (scope.kind === 'global' || !scope.ref) return null;
  return { kind: scope.kind, ref: scope.ref };
}

function dedupeSelectors(selectors: EvidenceSelector[]): EvidenceSelector[] {
  const seen = new Set<string>();
  const out: EvidenceSelector[] = [];
  for (const selector of selectors) {
    const key = `${selector.source_id}:${selector.kind}:${selector.range?.from ?? ''}:${selector.range?.to ?? ''}:${selector.content_view}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(selector);
  }
  return out;
}
