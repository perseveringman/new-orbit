import { useEffect, useState } from 'react';
import type {
  ReviewAgentSessionReport,
  ReviewFinding,
  ReviewKind,
  ReviewRun,
  ReviewRunDetail,
  ReviewSeverity,
  ReviewStatus
} from '@shared/review';
import { AnalysisProgressCard } from '../components/AnalysisProgressCard';

type LoadState = 'loading' | 'success' | 'empty' | 'error';
type ReviewAction = ReviewFinding['suggested_actions'][number];

const REVIEW_ANALYSIS_STEPS = [
  '读取最近的项目、任务和笔记',
  '同步并汇总外部 Agent 会话',
  '检查哪些内容还没有归属领域',
  '寻找沉睡主题和可能过期的资源',
  '扫描已读但还没有提炼的资料',
  '整理最近对话里的未闭环线索',
  '把发现压缩成可执行的下一步'
];

interface ReviewPMILPayload {
  current_focus: string;
  active_threads: Array<{
    title: string;
    summary: string;
    confidence?: number;
    likely_next_steps?: string[];
    blockers?: string[];
  }>;
  open_loops: Array<{
    title: string;
    kind: string;
    severity: string;
    rationale: string;
  }>;
}

export function ReviewView(): JSX.Element {
  const [tab, setTab] = useState<ReviewKind>('weekly');
  const [runs, setRuns] = useState<ReviewRun[]>([]);
  const [detail, setDetail] = useState<ReviewRunDetail | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = async (): Promise<void> => {
    setState('loading');
    setError(null);
    try {
      const next = await window.orbit.review.listRuns({ kind: tab });
      setRuns(next);
      setDetail(next[0] ? await window.orbit.review.getRun(next[0].id) : null);
      setState(next.length ? 'success' : 'empty');
    } catch (err) {
      setError((err as Error).message);
      setState('error');
    }
  };

  useEffect(() => {
    void load();
  }, [tab]);

  async function trigger(): Promise<void> {
    setGenerating(true);
    setState('loading');
    setError(null);
    try {
      const run = await window.orbit.review.triggerReview(tab);
      setRuns([run, ...runs.filter((item) => item.id !== run.id)]);
      setDetail(await window.orbit.review.getRun(run.id));
      setState('success');
    } catch (err) {
      setError((err as Error).message);
      setState('error');
    } finally {
      setGenerating(false);
    }
  }

  async function acknowledge(findingId: string): Promise<void> {
    await window.orbit.review.acknowledge(findingId);
    if (detail) setDetail(await window.orbit.review.getRun(detail.run.id));
  }

  async function execute(actionId: string): Promise<void> {
    await window.orbit.review.executeAction(actionId);
    if (detail) setDetail(await window.orbit.review.getRun(detail.run.id));
  }

  return (
    <ReviewContent
      tab={tab}
      runs={runs}
      detail={detail}
      state={state}
      error={error}
      generating={generating}
      onTab={setTab}
      onTrigger={() => void trigger()}
      onReload={() => void load()}
      onAcknowledge={(id) => void acknowledge(id)}
      onExecute={(id) => void execute(id)}
    />
  );
}

export function ReviewContent(props: {
  tab: ReviewKind;
  runs: ReviewRun[];
  detail: ReviewRunDetail | null;
  state: LoadState;
  error: string | null;
  generating: boolean;
  onTab(tab: ReviewKind): void;
  onTrigger(): void;
  onReload(): void;
  onAcknowledge(id: string): void;
  onExecute(id: string): void;
}): JSX.Element {
  const findings = props.detail?.findings ?? [];
  const pmil = readPMILPayload(props.detail);
  const agentSessionReport = readAgentSessionReport(props.detail);
  const unresolvedFindings = findings.filter((finding) => !finding.resolved_at && !finding.acknowledged);
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 p-6 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">行动复盘</p>
              <h1 className="mt-1 text-2xl font-semibold">把未闭环的事变成下一步</h1>
              <p className="mt-2 max-w-3xl text-sm text-neutral-500">
                基于你的笔记、项目、资料、主题和最近对话，找出需要整理、提炼、推进或暂时放下的事情。
              </p>
            </div>
            <button disabled={props.generating} onClick={props.onTrigger} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white disabled:cursor-wait disabled:opacity-70 dark:bg-neutral-100 dark:text-neutral-950">
              {props.generating ? '复盘中…' : '立即复盘'}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(['daily', 'weekly', 'monthly', 'area', 'resource'] as const).map((kind) => (
              <button key={kind} onClick={() => props.onTab(kind)} className={`rounded-full border px-3 py-1.5 text-xs ${props.tab === kind ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300' : 'border-neutral-300 text-neutral-500 dark:border-neutral-700'}`}>
                {reviewKindLabel(kind)}
              </button>
            ))}
          </div>
        </section>

        {props.generating ? (
          <AnalysisProgressCard
            title="正在生成行动复盘"
            description="Orbit 正在从你的真实资料里找出需要整理、提炼、推进或放下的事项。"
            steps={REVIEW_ANALYSIS_STEPS}
          />
        ) : props.state === 'loading' ? (
          <div className="h-36 animate-pulse rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
        ) : props.state === 'error' ? (
          <StateCard title="复盘失败" body={props.error ?? '未知复盘错误。'} actionLabel="重试" onAction={props.onReload} />
        ) : props.state === 'empty' ? (
          <StateCard title="暂无复盘记录" body="运行一次复盘，看看哪些笔记需要归属、哪些主题需要重新触碰、哪些资料值得提炼成自己的知识。" actionLabel="立即复盘" onAction={props.onTrigger} />
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-4">
              <HealthCard label="运行次数" value={props.runs.length} detail={`${reviewKindLabel(props.tab)}历史`} />
              <HealthCard label="待看事项" value={unresolvedFindings.length} detail="当前复盘" />
              <HealthCard label="警告" value={findings.filter((finding) => finding.severity === 'warning').length} detail="需要关注" />
              <HealthCard label="已处理" value={findings.filter((finding) => finding.resolved_at || finding.acknowledged).length} detail={props.detail?.run.status ? reviewStatusLabel(props.detail.run.status) : '未知'} />
            </section>
            <ReviewBrief findings={findings} />
            {agentSessionReport ? <AgentSessionReviewPanel report={agentSessionReport} /> : null}
            {pmil ? <PMILReviewPanel payload={pmil} /> : null}
            <section className="grid gap-3">
              {findings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} onAcknowledge={props.onAcknowledge} onExecute={props.onExecute} />
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function ReviewBrief({ findings }: { findings: ReviewFinding[] }): JSX.Element {
  const actionable = findings.find((finding) => finding.severity === 'warning' && !finding.acknowledged && !finding.resolved_at)
    ?? findings.find((finding) => !finding.acknowledged && !finding.resolved_at)
    ?? findings[0];
  const action = actionable?.suggested_actions.find((candidate) => candidate.kind !== 'ignore' && !candidate.executed);
  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sky-950 shadow-sm dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">本次结论</p>
      <h2 className="mt-2 text-lg font-semibold">
        {actionable ? findingTitle(actionable) : '目前状态比较稳定'}
      </h2>
      <p className="mt-2 text-sm leading-6">
        {actionable ? findingRationale(actionable) : '这次复盘暂时没有发现需要处理的事项。'}
      </p>
      {action ? <p className="mt-3 text-sm font-medium">建议先做：{actionLabel(action)}</p> : null}
    </section>
  );
}

function PMILReviewPanel({ payload }: { payload: ReviewPMILPayload }): JSX.Element {
  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm dark:border-violet-900 dark:bg-violet-950/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">工作线索</p>
          <h2 className="mt-1 text-lg font-semibold">最近值得接住的线索</h2>
        </div>
        <span className="rounded-full border border-violet-300 px-2 py-1 text-xs text-violet-700 dark:border-violet-800 dark:text-violet-300">
          {payload.open_loops.length} 个未闭环线索
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-neutral-700 dark:text-neutral-200">
        当前可能聚焦在：{payload.current_focus}
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {payload.active_threads.slice(0, 4).map((thread) => (
          <article key={thread.title} className="rounded-xl border border-violet-200 bg-white p-3 dark:border-violet-900 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{thread.title}</h3>
              {typeof thread.confidence === 'number' ? <span className="text-xs text-neutral-500">相关度 {Math.round(thread.confidence * 100)}%</span> : null}
            </div>
            <p className="mt-2 text-xs leading-5 text-neutral-600 dark:text-neutral-300">{thread.summary}</p>
            {thread.likely_next_steps?.length ? (
              <p className="mt-2 text-xs text-violet-700 dark:text-violet-300">下一步：{thread.likely_next_steps[0]}</p>
            ) : null}
          </article>
        ))}
      </div>
      {payload.open_loops.length ? (
        <div className="mt-4 flex flex-col gap-2">
          {payload.open_loops.slice(0, 5).map((loop) => (
            <div key={`${loop.kind}:${loop.title}`} className="rounded-xl border border-violet-200 bg-white px-3 py-2 dark:border-violet-900 dark:bg-neutral-900">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-violet-300 px-2 py-0.5 text-xs text-violet-700 dark:border-violet-800 dark:text-violet-300">{openLoopKindLabel(loop.kind)}</span>
                <span className="text-xs text-neutral-500">{openLoopSeverityLabel(loop.severity)}</span>
              </div>
              <p className="mt-1 text-sm font-medium">{loop.title}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function AgentSessionReviewPanel({ report }: { report: ReviewAgentSessionReport }): JSX.Element {
  const primarySessions = report.sessions.slice(0, 5);
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">AI 会话复盘</p>
          <h2 className="mt-1 text-lg font-semibold">{report.headline}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-neutral-700 dark:text-neutral-200">{report.narrative}</p>
        </div>
        <span className="rounded-full border border-emerald-300 px-2 py-1 text-xs text-emerald-700 dark:border-emerald-800 dark:text-emerald-300">
          {report.analyzed_sessions}/{report.total_sessions} 条已分析
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <HealthCard label="外部会话" value={report.total_sessions} detail="当前周期" />
        <HealthCard label="已分析" value={report.analyzed_sessions} detail={report.coverage.omitted_count ? `另有 ${report.coverage.omitted_count} 条未展开` : '全部展开'} />
        <HealthCard label="未闭环" value={report.open_loops.length} detail="从会话中提取" />
        <HealthCard label="下一步" value={report.next_actions.length} detail="候选动作" />
      </div>

      {report.agents.length || report.projects.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {report.agents.slice(0, 4).map((item) => (
            <span key={`agent:${item.agent}`} className="rounded-full bg-white px-2 py-1 text-xs text-emerald-700 dark:bg-neutral-900 dark:text-emerald-300">
              {item.agent} · {item.count}
            </span>
          ))}
          {report.projects.slice(0, 4).map((item) => (
            <span key={`project:${item.project}`} className="rounded-full bg-white px-2 py-1 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
              {item.project} · {item.count}
            </span>
          ))}
        </div>
      ) : null}

      {primarySessions.length ? (
        <div className="mt-4 grid gap-3">
          {primarySessions.map((session) => (
            <article key={session.source_id} className="rounded-xl border border-emerald-200 bg-white p-4 dark:border-emerald-900 dark:bg-neutral-900">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{session.title}</h3>
                  <p className="mt-1 text-xs text-neutral-500">
                    {[session.agent, session.project_name, formatReviewDate(session.ended_at ?? session.updated_at)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {session.next_actions[0] ? (
                  <span className="max-w-sm rounded-lg bg-emerald-100 px-2 py-1 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                    下一步：{session.next_actions[0]}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-neutral-700 dark:text-neutral-200">{session.summary}</p>
              {session.open_loops.length ? (
                <p className="mt-2 text-xs leading-5 text-neutral-500">
                  未闭环：{session.open_loops.slice(0, 3).map((loop) => loop.title).join('；')}
                </p>
              ) : session.key_points.length ? (
                <p className="mt-2 text-xs leading-5 text-neutral-500">
                  重点：{session.key_points.slice(0, 3).join('；')}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-emerald-300 bg-white p-4 text-sm text-neutral-500 dark:border-emerald-900 dark:bg-neutral-900">
          {report.coverage.message ?? '这段时间没有可分析的外部 Agent 会话。'}
        </p>
      )}
    </section>
  );
}

function readPMILPayload(detail: ReviewRunDetail | null): ReviewPMILPayload | null {
  const payload = detail?.artifact?.payload;
  if (!payload || typeof payload !== 'object' || !('pmil' in payload)) return null;
  const pmil = (payload as { pmil?: unknown }).pmil;
  if (!pmil || typeof pmil !== 'object') return null;
  const record = pmil as Partial<ReviewPMILPayload>;
  if (typeof record.current_focus !== 'string') return null;
  return {
    current_focus: record.current_focus,
    active_threads: Array.isArray(record.active_threads) ? record.active_threads : [],
    open_loops: Array.isArray(record.open_loops) ? record.open_loops : []
  };
}

function readAgentSessionReport(detail: ReviewRunDetail | null): ReviewAgentSessionReport | null {
  const payload = detail?.artifact?.payload;
  if (!payload || typeof payload !== 'object' || !('agent_session_report' in payload)) return null;
  const report = (payload as { agent_session_report?: unknown }).agent_session_report;
  if (!report || typeof report !== 'object') return null;
  const record = report as Partial<ReviewAgentSessionReport>;
  if (typeof record.headline !== 'string' || typeof record.narrative !== 'string') return null;
  return {
    period: normalizePeriod(record.period),
    total_sessions: numberValue(record.total_sessions),
    analyzed_sessions: numberValue(record.analyzed_sessions),
    headline: record.headline,
    narrative: record.narrative,
    agents: Array.isArray(record.agents) ? record.agents : [],
    projects: Array.isArray(record.projects) ? record.projects : [],
    sessions: Array.isArray(record.sessions) ? record.sessions : [],
    open_loops: Array.isArray(record.open_loops) ? record.open_loops : [],
    next_actions: Array.isArray(record.next_actions) ? record.next_actions : [],
    coverage: normalizeAgentSessionCoverage(record.coverage)
  };
}

function FindingCard(props: { finding: ReviewFinding; onAcknowledge(id: string): void; onExecute(id: string): void }): JSX.Element {
  const tone = props.finding.severity === 'warning' ? 'text-amber-700 dark:text-amber-300' : props.finding.severity === 'suggestion' ? 'text-sky-700 dark:text-sky-300' : 'text-neutral-500';
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs font-semibold uppercase tracking-[0.16em] ${tone}`}>{reviewSeverityLabel(props.finding.severity)}</span>
        <span className="rounded-full border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700">{findingCategoryLabel(props.finding.category)}</span>
        {props.finding.acknowledged && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">已确认</span>}
      </div>
      <h2 className="mt-3 text-lg font-semibold">{findingTitle(props.finding)}</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">{findingRationale(props.finding)}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {props.finding.suggested_actions.map((action) => (
          <button key={action.id} disabled={action.executed} onClick={() => props.onExecute(action.id)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs disabled:opacity-40 dark:border-neutral-700">
            {action.executed ? '已完成' : actionLabel(action)}
          </button>
        ))}
        <button onClick={() => props.onAcknowledge(props.finding.id)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
          我知道了
        </button>
      </div>
    </article>
  );
}

function HealthCard({ label, value, detail }: { label: string; value: number; detail: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{detail}</p>
    </div>
  );
}

function StateCard(props: { title: string; body: string; actionLabel: string; onAction(): void }): JSX.Element {
  return (
    <section className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center dark:border-neutral-700 dark:bg-neutral-900">
      <h2 className="text-lg font-semibold">{props.title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-neutral-500">{props.body}</p>
      <button onClick={props.onAction} className="mt-4 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">{props.actionLabel}</button>
    </section>
  );
}

function findingTitle(finding: ReviewFinding): string {
  const count = leadingCount(finding.title);
  if (finding.category === 'unassigned-note') return count ? `有 ${count} 条笔记还没有归属领域` : '有笔记还没有归属领域';
  if (finding.category === 'dormant-resource') return count ? `有 ${count} 个主题已经很久没有触碰` : '有主题已经很久没有触碰';
  if (finding.category === 'library-undistilled') return count ? `有 ${count} 条已读资料还没有提炼` : '有已读资料还没有提炼';
  if (finding.category === 'unassigned-project') return count ? `有 ${count} 个活跃项目还没有对齐领域` : '有活跃项目还没有对齐领域';
  if (finding.category === 'healthy') return containsChinese(finding.title) ? finding.title : '这次复盘没有发现明显问题';
  return finding.title;
}

function findingRationale(finding: ReviewFinding): string {
  if (finding.category === 'unassigned-note') return '这些笔记已经进入你的知识库，但还没有连接到长期负责的领域。补上归属后，之后复盘和提问时更容易把它们唤回来。';
  if (finding.category === 'dormant-resource') return '这些主题可能已经过期，也可能值得重新推进。建议选一个最相关的主题更新、归档或补一次触达记录。';
  if (finding.category === 'library-undistilled') return '这些资料已经读完，但还没有沉淀成自己的笔记或主题素材。时间越久，能复用的细节越容易流失。';
  if (finding.category === 'unassigned-project') return '项目如果没有归属领域，就很难判断它服务于哪个长期方向，也不容易在周/月复盘时看出精力分布。';
  if (finding.category === 'healthy') return containsChinese(finding.rationale) ? finding.rationale : '当前项目、领域、主题、资料和笔记之间没有发现明显的停滞、沉睡或未归属状态。';
  if (finding.category.startsWith('open-loop:') && !containsChinese(finding.rationale)) return '这条线索看起来还没有闭环，可能需要被整理成任务、决策或后续复盘。';
  return finding.rationale;
}

function findingCategoryLabel(category: string): string {
  if (category === 'unassigned-note') return '笔记归属';
  if (category === 'dormant-resource') return '主题触达';
  if (category === 'library-undistilled') return '资料提炼';
  if (category === 'unassigned-project') return '项目对齐';
  if (category === 'healthy') return '状态正常';
  if (category.startsWith('open-loop:')) return openLoopKindLabel(category.slice('open-loop:'.length));
  return category;
}

function actionLabel(action: ReviewAction): string {
  if (containsChinese(action.description)) return action.description;
  if (action.kind === 'ignore') return '这次先略过';
  if (action.kind === 'assign_area') return action.target_ref?.startsWith('project:') ? '为项目选择所属领域' : '整理归属领域';
  if (action.kind === 'refresh_resource') return '检查这个主题是否还值得保留';
  if (action.kind === 'create_task') return '创建一个后续任务';
  if (action.kind === 'archive_project') return '归档这个项目';
  if (action.kind === 'mark_stale') return '标记为需要回看';
  if (action.kind === 'schedule_review') return '保留到下次复盘继续看';
  if (action.kind === 'send_reminder') return '稍后提醒我';
  return action.description;
}

function openLoopKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    task_candidate: '可行动事项',
    decision_pending: '待决策',
    question: '待回答问题',
    stale_context: '可能停滞'
  };
  return labels[kind] ?? kind;
}

function openLoopSeverityLabel(severity: string): string {
  const labels: Record<string, string> = {
    warning: '需要关注',
    suggestion: '建议处理',
    info: '可了解'
  };
  return labels[severity] ?? severity;
}

function leadingCount(text: string): string | null {
  return text.match(/^\D*(\d+)/u)?.[1] ?? null;
}

function normalizePeriod(period: unknown): ReviewAgentSessionReport['period'] {
  if (!period || typeof period !== 'object') return { from: '', to: '' };
  const record = period as Partial<ReviewAgentSessionReport['period']>;
  return {
    from: typeof record.from === 'string' ? record.from : '',
    to: typeof record.to === 'string' ? record.to : ''
  };
}

function normalizeAgentSessionCoverage(coverage: unknown): ReviewAgentSessionReport['coverage'] {
  if (!coverage || typeof coverage !== 'object') {
    return {
      scanned_sources: 0,
      period_matched: 0,
      analyzed_limit: 0,
      omitted_count: 0,
      synced_at: ''
    };
  }
  const record = coverage as Partial<ReviewAgentSessionReport['coverage']>;
  return {
    scanned_sources: numberValue(record.scanned_sources),
    period_matched: numberValue(record.period_matched),
    analyzed_limit: numberValue(record.analyzed_limit),
    omitted_count: numberValue(record.omitted_count),
    synced_at: typeof record.synced_at === 'string' ? record.synced_at : '',
    ...(typeof record.message === 'string' ? { message: record.message } : {})
  };
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatReviewDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function containsChinese(text: string): boolean {
  return /[\u3400-\u9fff]/u.test(text);
}

function reviewKindLabel(kind: ReviewKind): string {
  const labels: Record<ReviewKind, string> = {
    daily: '每日',
    weekly: '每周',
    monthly: '每月',
    quarterly: '季度',
    area: '领域',
    resource: '主题',
    project: '项目'
  };
  return labels[kind];
}

function reviewSeverityLabel(severity: ReviewSeverity): string {
  const labels: Record<ReviewSeverity, string> = {
    info: '信息',
    suggestion: '建议',
    warning: '警告'
  };
  return labels[severity];
}

function reviewStatusLabel(status: ReviewStatus): string {
  const labels: Record<ReviewStatus, string> = {
    pending: '待处理',
    generating: '生成中',
    generated: '已生成',
    reviewed: '已复盘',
    actions_done: '动作完成',
    archived: '已归档'
  };
  return labels[status];
}
