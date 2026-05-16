import { useEffect, useState } from 'react';
import type { VisionAlignmentMap, VisionDriftWarning, VisionGoal } from '@shared/vision';

type LoadState = 'loading' | 'success' | 'empty' | 'error';

export function VisionView(): JSX.Element {
  const [goals, setGoals] = useState<VisionGoal[]>([]);
  const [alignment, setAlignment] = useState<VisionAlignmentMap[]>([]);
  const [drift, setDrift] = useState<VisionDriftWarning[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setState('loading');
    setError(null);
    try {
      const [nextGoals, nextAlignment, nextDrift] = await Promise.all([
        window.orbit.vision.listGoals(),
        window.orbit.vision.getAlignment(),
        window.orbit.vision.detectDrift()
      ]);
      setGoals(nextGoals);
      setAlignment(nextAlignment);
      setDrift(nextDrift);
      setState(nextGoals.length ? 'success' : 'empty');
    } catch (err) {
      setError((err as Error).message);
      setState('error');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  async function createGoal(): Promise<void> {
    const title = window.prompt('目标标题');
    if (!title) return;
    const area = window.prompt('这个目标对应的 Area slug');
    await window.orbit.vision.createGoal({
      title,
      horizon: 'quarter',
      description: '',
      area_refs: area ? [area] : [],
      priority: 50
    });
    await load();
  }

  async function review(): Promise<void> {
    await window.orbit.vision.triggerReview();
    await load();
  }

  return (
    <VisionContent
      goals={goals}
      alignment={alignment}
      drift={drift}
      state={state}
      error={error}
      onCreate={() => void createGoal()}
      onReview={() => void review()}
      onReload={() => void load()}
    />
  );
}

export function VisionContent(props: {
  goals: VisionGoal[];
  alignment: VisionAlignmentMap[];
  drift: VisionDriftWarning[];
  state: LoadState;
  error: string | null;
  onCreate(): void;
  onReview(): void;
  onReload(): void;
}): JSX.Element {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 p-6 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">愿景仪表盘</p>
              <h1 className="mt-1 text-2xl font-semibold">目标、对齐与漂移</h1>
              <p className="mt-2 max-w-3xl text-sm text-neutral-500">将 Area、项目、Resource 与里程碑追溯到长期目标。</p>
            </div>
            <div className="flex gap-2">
              <button onClick={props.onReview} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">季度复盘</button>
              <button onClick={props.onCreate} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-950">+ 目标</button>
            </div>
          </div>
        </section>

        {props.state === 'loading' ? (
          <div className="h-36 animate-pulse rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
        ) : props.state === 'error' ? (
          <StateCard title="愿景加载失败" body={props.error ?? '未知愿景错误。'} actionLabel="重试" onAction={props.onReload} />
        ) : props.state === 'empty' ? (
          <StateCard title="暂无结构化目标" body="创建一个目标，把 Vision 与 Area、项目、Resource 和里程碑复盘连接起来。" actionLabel="创建目标" onAction={props.onCreate} />
        ) : (
          <>
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="font-semibold">目标树</h2>
              <div className="mt-3 grid gap-3">
                {props.goals.map((goal) => <GoalCard key={goal.id} goal={goal} alignment={props.alignment.find((item) => item.goal_id === goal.id)} />)}
              </div>
            </section>
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="font-semibold">漂移提醒</h2>
              {props.drift.length ? (
                <div className="mt-3 grid gap-3">
                  {props.drift.map((warning) => (
                    <div key={`${warning.goal_id}-${warning.area_slug}-${warning.drift_type}`} className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                      <strong>{warning.severity}: {warning.area_slug}</strong>
                      <p className="mt-1">{warning.rationale}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-neutral-500">未检测到漂移。</p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function GoalCard({ goal, alignment }: { goal: VisionGoal; alignment?: VisionAlignmentMap }): JSX.Element {
  const score = alignment?.alignment_score ?? 0;
  return (
    <article className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700">{goal.horizon}</span>
        <span className="rounded-full border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700">{goal.status}</span>
      </div>
      <h3 className="mt-3 font-semibold">{goal.title}</h3>
      <p className="mt-1 text-sm text-neutral-500">{goal.description || goal.target_outcome || '暂无描述。'}</p>
      <div className="mt-3 h-2 rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div className="h-2 rounded-full bg-violet-500" style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <p className="mt-2 text-xs text-neutral-500">对齐度 {score}% · Areas：{goal.area_refs.join(', ') || '无'}</p>
    </article>
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
