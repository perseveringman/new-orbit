import { useEffect, useState } from 'react';
import type { ReviewFinding, ReviewKind, ReviewRun, ReviewRunDetail, ReviewSeverity, ReviewStatus } from '@shared/review';

type LoadState = 'loading' | 'success' | 'empty' | 'error';

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
    setState('loading');
    const run = await window.orbit.review.triggerReview(tab);
    setRuns([run, ...runs.filter((item) => item.id !== run.id)]);
    setDetail(await window.orbit.review.getRun(run.id));
    setState('success');
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
  onTab(tab: ReviewKind): void;
  onTrigger(): void;
  onReload(): void;
  onAcknowledge(id: string): void;
  onExecute(id: string): void;
}): JSX.Element {
  const findings = props.detail?.findings ?? [];
  const pmil = readPMILPayload(props.detail);
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 p-6 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">复盘系统</p>
              <h1 className="mt-1 text-2xl font-semibold">发现停滞、未归属和沉睡的工作</h1>
              <p className="mt-2 max-w-3xl text-sm text-neutral-500">
                基于 Layer 1 真相和可追踪事件生成每日、每周、每月、Area 与 Resource 复盘。
              </p>
            </div>
            <button onClick={props.onTrigger} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-950">
              立即复盘
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

        {props.state === 'loading' ? (
          <div className="h-36 animate-pulse rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
        ) : props.state === 'error' ? (
          <StateCard title="复盘失败" body={props.error ?? '未知复盘错误。'} actionLabel="重试" onAction={props.onReload} />
        ) : props.state === 'empty' ? (
          <StateCard title="暂无复盘记录" body="运行一次复盘，生成停滞项目、未归属笔记、沉睡资源以及等待提炼的资料库条目的发现。" actionLabel="立即复盘" onAction={props.onTrigger} />
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-4">
              <HealthCard label="运行次数" value={props.runs.length} detail={`${reviewKindLabel(props.tab)}历史`} />
              <HealthCard label="发现" value={findings.length} detail="当前复盘" />
              <HealthCard label="警告" value={findings.filter((finding) => finding.severity === 'warning').length} detail="需要关注" />
              <HealthCard label="已处理" value={findings.filter((finding) => finding.resolved_at || finding.acknowledged).length} detail={props.detail?.run.status ? reviewStatusLabel(props.detail.run.status) : '未知'} />
            </section>
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

function PMILReviewPanel({ payload }: { payload: ReviewPMILPayload }): JSX.Element {
  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm dark:border-violet-900 dark:bg-violet-950/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">个人记忆智能</p>
          <h2 className="mt-1 text-lg font-semibold">当前工作上下文</h2>
        </div>
        <span className="rounded-full border border-violet-300 px-2 py-1 text-xs text-violet-700 dark:border-violet-800 dark:text-violet-300">
          {payload.open_loops.length} 个开放回路
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-neutral-700 dark:text-neutral-200">
        焦点：{payload.current_focus}
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {payload.active_threads.slice(0, 4).map((thread) => (
          <article key={thread.title} className="rounded-xl border border-violet-200 bg-white p-3 dark:border-violet-900 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{thread.title}</h3>
              {typeof thread.confidence === 'number' ? <span className="text-xs text-neutral-500">{Math.round(thread.confidence * 100)}%</span> : null}
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
                <span className="rounded-full border border-violet-300 px-2 py-0.5 text-xs text-violet-700 dark:border-violet-800 dark:text-violet-300">{loop.kind}</span>
                <span className="text-xs text-neutral-500">{loop.severity}</span>
              </div>
              <p className="mt-1 text-sm font-medium">{loop.title}</p>
            </div>
          ))}
        </div>
      ) : null}
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

function FindingCard(props: { finding: ReviewFinding; onAcknowledge(id: string): void; onExecute(id: string): void }): JSX.Element {
  const tone = props.finding.severity === 'warning' ? 'text-amber-700 dark:text-amber-300' : props.finding.severity === 'suggestion' ? 'text-sky-700 dark:text-sky-300' : 'text-neutral-500';
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs font-semibold uppercase tracking-[0.16em] ${tone}`}>{reviewSeverityLabel(props.finding.severity)}</span>
        <span className="rounded-full border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700">{props.finding.category}</span>
        {props.finding.acknowledged && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">已确认</span>}
      </div>
      <h2 className="mt-3 text-lg font-semibold">{props.finding.title}</h2>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{props.finding.rationale}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {props.finding.suggested_actions.map((action) => (
          <button key={action.id} disabled={action.executed} onClick={() => props.onExecute(action.id)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs disabled:opacity-40 dark:border-neutral-700">
            {action.executed ? '已完成' : action.description}
          </button>
        ))}
        <button onClick={() => props.onAcknowledge(props.finding.id)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
          确认
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

function reviewKindLabel(kind: ReviewKind): string {
  const labels: Record<ReviewKind, string> = {
    daily: '每日',
    weekly: '每周',
    monthly: '每月',
    quarterly: '季度',
    area: 'Area',
    resource: 'Resource',
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
