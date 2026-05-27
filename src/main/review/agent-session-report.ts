import {
  wholeSourceSelector,
  type EvidenceSelector,
  type EvidenceSource
} from '@shared/evidence';
import type { ReviewAgentSessionReport, ReviewKind, ReviewRun } from '@shared/review';
import type { ExternalSessionDistillPayload, SynthesisArtifact } from '@shared/synthesis';
import { ensureExternalSessionDistillation } from '../context/external-session-synthesis';
import { createOrbitEvidenceProvider, syncExternalAISessionEvidenceSources } from '../evidence/providers';
import { createEvidenceStore } from '../evidence/store';
import type { SynthesisRuntimeRouter } from '../synthesis/runner';

const DEFAULT_ANALYZED_SESSION_LIMIT = 8;
const DEFAULT_SCAN_LIMIT = 500;

export interface BuildAgentSessionReviewReportInput {
  kind: ReviewKind;
  period: ReviewRun['period'];
  router?: SynthesisRuntimeRouter | null;
  analyzedLimit?: number;
  scanLimit?: number;
}

export async function buildAgentSessionReviewReport(
  vaultPath: string,
  input: BuildAgentSessionReviewReportInput
): Promise<ReviewAgentSessionReport> {
  const syncedAt = new Date().toISOString();
  const scanLimit = Math.max(1, input.scanLimit ?? DEFAULT_SCAN_LIMIT);
  await syncExternalAISessionEvidenceSources(vaultPath, { externalAISessionLimit: scanLimit }).catch(() => []);

  const sources = await createEvidenceStore(vaultPath).list({
    kind: 'external_ai_session',
    include_unavailable: true,
    limit: scanLimit
  });
  const available = sources.filter((source) => (
    source.availability === 'available' ||
    source.availability === 'changed' ||
    source.availability === 'snapshotted'
  ));
  const matched = available
    .filter((source) => sourceTouchesPeriod(source, input.period))
    .sort((a, b) => sourceSortTime(b).localeCompare(sourceSortTime(a)));
  const analyzedLimit = Math.max(1, input.analyzedLimit ?? DEFAULT_ANALYZED_SESSION_LIMIT);
  const selected = matched.slice(0, analyzedLimit);
  const sessions: ReviewAgentSessionReport['sessions'] = [];
  for (const source of selected) {
    sessions.push(await analyzeSession(vaultPath, source, input.router ?? null));
  }
  const agents = countAgents(matched.map((source) => sourceAgent(source) ?? 'unknown'));
  const projects = countProjects(matched.map((source) => sourceProject(source) ?? '未识别项目'));
  const openLoops = dedupeSessionItems(sessions.flatMap((session) =>
    session.open_loops.map((loop) => ({ title: loop.title, source_id: session.source_id, evidence: loop.evidence }))
  )).slice(0, 10);
  const nextActions = dedupeSessionItems(sessions.flatMap((session) =>
    session.next_actions.map((title) => ({ title, source_id: session.source_id, evidence: session.evidence }))
  )).slice(0, 10);

  return {
    period: input.period,
    total_sessions: matched.length,
    analyzed_sessions: sessions.length,
    headline: reportHeadline(input.kind, matched.length, agents, projects),
    narrative: reportNarrative(input.kind, matched.length, sessions, openLoops, nextActions),
    agents,
    projects,
    sessions,
    open_loops: openLoops,
    next_actions: nextActions,
    coverage: {
      scanned_sources: sources.length,
      period_matched: matched.length,
      analyzed_limit: analyzedLimit,
      omitted_count: Math.max(0, matched.length - sessions.length),
      synced_at: syncedAt,
      ...(matched.length === 0 ? { message: '这段时间没有同步到外部 Agent 会话。可以检查设置里的“记忆源”，或确认本机 runtime 是否写入了历史记录。' } : {})
    }
  };
}

async function analyzeSession(
  vaultPath: string,
  source: EvidenceSource,
  router: SynthesisRuntimeRouter | null
): Promise<ReviewAgentSessionReport['sessions'][number]> {
  const artifact = await ensureExternalSessionDistillation(vaultPath, source.id, {
    router,
    maxBudgetUsd: 0.25
  }).catch(() => null);
  const payload = externalSessionPayload(artifact) ?? fallbackSessionPayload(source, await readSafeProjection(vaultPath, source));
  const evidence = payload.evidence.length ? payload.evidence : [wholeSourceSelector(source.id, 'safe_projection', 'agent session review')];
  return {
    source_id: source.id,
    title: payload.title || source.title,
    ...(payload.agent || sourceAgent(source) ? { agent: payload.agent ?? sourceAgent(source) } : {}),
    ...(payload.project_ref || sourceProject(source) ? { project_name: payload.project_ref ?? sourceProject(source) } : {}),
    ...(source.time_range?.from ? { started_at: source.time_range.from } : {}),
    ...(source.time_range?.to ? { ended_at: source.time_range.to } : {}),
    updated_at: source.updated_at,
    summary: payload.summary || source.summary || '这条会话暂时没有可用摘要。',
    key_points: payload.key_points.slice(0, 5),
    open_loops: payload.open_loops.slice(0, 5),
    next_actions: payload.next_actions.slice(0, 5),
    evidence
  };
}

function externalSessionPayload(
  artifact: SynthesisArtifact<ExternalSessionDistillPayload> | null
): ExternalSessionDistillPayload | null {
  if (!artifact || artifact.status !== 'fresh' || !artifact.payload || typeof artifact.payload !== 'object') return null;
  const payload = artifact.payload as Partial<ExternalSessionDistillPayload>;
  if (typeof payload.source_id !== 'string' || typeof payload.summary !== 'string') return null;
  return artifact.payload;
}

async function readSafeProjection(vaultPath: string, source: EvidenceSource): Promise<string> {
  const read = await createOrbitEvidenceProvider(vaultPath)
    .read(wholeSourceSelector(source.id, 'safe_projection', 'agent session review fallback'))
    .catch(() => null);
  return read?.excerpts.map((excerpt) => excerpt.text).join('\n\n').trim() ?? '';
}

function fallbackSessionPayload(source: EvidenceSource, projection: string): ExternalSessionDistillPayload {
  const selector = wholeSourceSelector(source.id, 'safe_projection', 'agent session review fallback');
  const lines = meaningfulLines(projection || source.summary || source.title);
  const openLoopLines = lines
    .filter((line) => /\?|？|todo|follow|next|block|blocked|remaining|待办|下一步|后续|问题|卡住|阻塞/iu.test(line))
    .slice(0, 5);
  return {
    source_id: source.id,
    title: source.title,
    ...(sourceAgent(source) ? { agent: sourceAgent(source) } : {}),
    ...(sourceProject(source) ? { project_ref: sourceProject(source) } : {}),
    ...(source.time_range ? { period: source.time_range } : {}),
    summary: trimSentence((projection || source.summary || source.title).replace(/\s+/gu, ' '), 520),
    key_points: lines.slice(0, 5).map((line) => trimSentence(line, 180)),
    decisions: lines
      .filter((line) => /decision|decided|choose|选择|决定|结论|必须|应该/iu.test(line))
      .slice(0, 4)
      .map((line) => ({ title: trimSentence(line, 160), evidence: [selector] })),
    open_loops: openLoopLines.map((line) => ({ title: trimSentence(line, 160), evidence: [selector] })),
    next_actions: openLoopLines.map((line) => trimSentence(line, 140)),
    entities: [],
    evidence: [selector],
    source_hash: source.fingerprint.value
  };
}

function sourceTouchesPeriod(source: EvidenceSource, period: ReviewRun['period']): boolean {
  const from = Date.parse(period.from);
  const to = Date.parse(period.to);
  const start = parseTime(source.time_range?.from) ?? parseTime(source.updated_at);
  const end = parseTime(source.time_range?.to) ?? parseTime(source.updated_at);
  if (start === null || end === null || Number.isNaN(from) || Number.isNaN(to)) return false;
  return end >= from && start <= to;
}

function sourceSortTime(source: EvidenceSource): string {
  return source.time_range?.to ?? source.updated_at;
}

function parseTime(value?: string): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function sourceAgent(source: EvidenceSource): string | undefined {
  return stringMetadata(source, 'agent');
}

function sourceProject(source: EvidenceSource): string | undefined {
  return stringMetadata(source, 'project_name');
}

function stringMetadata(source: EvidenceSource, key: string): string | undefined {
  const value = source.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function countAgents(values: string[]): ReviewAgentSessionReport['agents'] {
  return countValues(values).map(([agent, count]) => ({ agent, count }));
}

function countProjects(values: string[]): ReviewAgentSessionReport['projects'] {
  return countValues(values).map(([project, count]) => ({ project, count }));
}

function countValues(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8);
}

function dedupeSessionItems<T extends { title: string; source_id: string; evidence: EvidenceSelector[] }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.title.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function reportHeadline(
  kind: ReviewKind,
  total: number,
  agents: ReviewAgentSessionReport['agents'],
  projects: ReviewAgentSessionReport['projects']
): string {
  if (total === 0) return `${kindLabel(kind)}没有同步到外部 Agent 会话`;
  const agentText = agents.slice(0, 3).map((item) => `${item.agent} ${item.count} 条`).join('、');
  const projectText = projects.slice(0, 2).map((item) => item.project).join('、');
  return `${kindLabel(kind)}同步到 ${total} 条外部 Agent 会话${agentText ? `，主要来自 ${agentText}` : ''}${projectText ? `，集中在 ${projectText}` : ''}`;
}

function reportNarrative(
  kind: ReviewKind,
  total: number,
  sessions: ReviewAgentSessionReport['sessions'],
  openLoops: ReviewAgentSessionReport['open_loops'],
  nextActions: ReviewAgentSessionReport['next_actions']
): string {
  if (total === 0) {
    return '这次复盘没有拿到外部 Agent 工作记录，所以无法判断你在外部工具里推进了哪些事。';
  }
  const first = sessions[0];
  const threadText = first ? `最明显的一条主线是「${first.title}」：${first.summary}` : '';
  const loopText = openLoops.length ? `还留下 ${openLoops.length} 个未闭环线索。` : '没有发现明显未闭环线索。';
  const actionText = nextActions.length ? `建议优先接住「${nextActions[0].title}」。` : '暂时没有提取到明确下一步。';
  return [`这次${kindLabel(kind)}聚合了外部 Agent 的实际会话记录。`, threadText, loopText, actionText]
    .filter(Boolean)
    .join(' ');
}

function kindLabel(kind: ReviewKind): string {
  const labels: Record<ReviewKind, string> = {
    daily: '每日复盘',
    weekly: '每周复盘',
    monthly: '每月复盘',
    quarterly: '季度复盘',
    area: '领域复盘',
    resource: '主题复盘',
    project: '项目复盘'
  };
  return labels[kind];
}

function meaningfulLines(text: string): string[] {
  return text
    .split(/\r?\n|[。！？!?]\s*/u)
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter((line) => line.length >= 8)
    .filter((line, index, arr) => arr.indexOf(line) === index)
    .slice(0, 30);
}

function trimSentence(text: string, limit: number): string {
  const trimmed = text.replace(/\s+/gu, ' ').trim();
  if (!trimmed) return '没有可用内容。';
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 3)}...`;
}
