import { Activity, Database, GitBranch, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { EvalCaseResult, EvalRunSummary, ResultsIndex, SuiteSummary } from './types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'empty'; message: string }
  | { kind: 'ready'; index: ResultsIndex; cases: EvalCaseResult[] }
  | { kind: 'error'; message: string };

const suiteLabels: Record<string, string> = {
  longmemeval: 'LongMemEval',
  personamem: 'PersonaMem'
};

export function App(): JSX.Element {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [selectedSuite, setSelectedSuite] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [onlyFailed, setOnlyFailed] = useState(false);

  async function load(runId?: string): Promise<void> {
    setState({ kind: 'loading' });
    try {
      const indexResponse = await fetch('/results/index.json', { cache: 'no-store' });
      if (!indexResponse.ok) {
        setState({ kind: 'empty', message: '还没有评测结果。先运行 npm run eval:run -- --suite both。' });
        return;
      }
      const index = (await indexResponse.json()) as ResultsIndex;
      const activeRunId = runId || selectedRunId || index.latestRunId;
      const activeRun = index.runs.find((run) => run.runId === activeRunId) ?? index.runs[0];
      if (!activeRun) {
        setState({ kind: 'empty', message: '结果索引为空。' });
        return;
      }
      setSelectedRunId(activeRun.runId);
      const caseFiles = activeRun.suites.map((suite) => `/results/${activeRun.runId}/${suite.suite}-${safeSegment(suite.split)}.json`);
      const cases = (await Promise.all(caseFiles.map((file) => fetch(file, { cache: 'no-store' }).then((response) => response.json())))).flat() as EvalCaseResult[];
      setState({ kind: 'ready', index, cases });
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const activeRun = state.kind === 'ready'
    ? state.index.runs.find((run) => run.runId === selectedRunId) ?? state.index.runs[0]
    : null;
  const filteredCases = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const normalizedQuery = query.trim().toLowerCase();
    return state.cases
      .filter((item) => selectedSuite === 'all' || item.suite === selectedSuite)
      .filter((item) => !onlyFailed || !item.score.correct)
      .filter((item) => !normalizedQuery || [item.questionId, item.question, item.answer, item.goldAnswer, item.questionType, item.topic].filter(Boolean).join('\n').toLowerCase().includes(normalizedQuery))
      .slice(0, 300);
  }, [state, selectedSuite, onlyFailed, query]);

  if (state.kind === 'loading') return <Shell><div className="status">正在读取评测结果...</div></Shell>;
  if (state.kind === 'empty') return <Shell><EmptyState message={state.message} /></Shell>;
  if (state.kind === 'error') return <Shell><div className="status error">读取失败：{state.message}</div></Shell>;

  return (
    <Shell>
      <header className="topbar">
        <div>
          <p className="eyebrow">Orbit PMIL Eval</p>
          <h1>记忆系统评测</h1>
        </div>
        <div className="actions">
          <select value={selectedRunId} onChange={(event) => void load(event.target.value)} aria-label="选择运行">
            {state.index.runs.map((run) => (
              <option key={run.runId} value={run.runId}>{formatDate(run.createdAt)} · {run.mode}</option>
            ))}
          </select>
          <button type="button" onClick={() => void load(selectedRunId)}><RefreshCw size={16} />刷新</button>
        </div>
      </header>

      {activeRun ? <RunOverview run={activeRun} /> : null}

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>分桶结果</h2>
            <p>按 benchmark 题型或 topic 查看当前薄弱点。</p>
          </div>
        </div>
        <div className="bucketGrid">
          {activeRun?.suites.flatMap((suite) => suite.byType.slice(0, 8).map((bucket) => (
            <div key={`${suite.suite}:${bucket.key}`} className="bucket">
              <span>{suiteLabels[suite.suite]} · {bucket.key}</span>
              <strong>{percent(bucket.accuracy)}</strong>
              <small>{bucket.correct}/{bucket.total} · score {bucket.avgScore.toFixed(3)}</small>
            </div>
          )))}
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>样例下钻</h2>
            <p>查看问题、答案、召回证据、记忆节点和上下文片段。</p>
          </div>
          <div className="filters">
            <select value={selectedSuite} onChange={(event) => setSelectedSuite(event.target.value)} aria-label="选择数据集">
              <option value="all">全部数据集</option>
              <option value="longmemeval">LongMemEval</option>
              <option value="personamem">PersonaMem</option>
            </select>
            <label className="check"><input type="checkbox" checked={onlyFailed} onChange={(event) => setOnlyFailed(event.target.checked)} />只看失败</label>
            <div className="search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索问题、答案或题型" /></div>
          </div>
        </div>
        <div className="caseList">
          {filteredCases.map((item) => <CaseRow key={`${item.suite}:${item.questionId}`} item={item} />)}
        </div>
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }): JSX.Element {
  return <main className="app">{children}</main>;
}

function EmptyState({ message }: { message: string }): JSX.Element {
  return (
    <div className="empty">
      <Database size={28} />
      <h1>暂无评测结果</h1>
      <p>{message}</p>
      <code>npm run eval:run -- --suite both</code>
    </div>
  );
}

function RunOverview({ run }: { run: EvalRunSummary }): JSX.Element {
  return (
    <section className="overview">
      <div className="runMeta">
        <div><Activity size={16} />{run.mode}</div>
        <div><GitBranch size={16} />{run.git.sha.slice(0, 10)}{run.git.dirty ? ' · dirty' : ''}</div>
        <div>{formatDate(run.completedAt)}</div>
      </div>
      <div className="metrics">
        {run.suites.map((suite) => <SuiteMetric key={`${suite.suite}:${suite.split}`} suite={suite} />)}
      </div>
      <div className="notes">
        {run.notes.map((note) => <span key={note}>{note}</span>)}
      </div>
    </section>
  );
}

function SuiteMetric({ suite }: { suite: SuiteSummary }): JSX.Element {
  return (
    <div className="metric">
      <span>{suiteLabels[suite.suite]} · {suite.split}</span>
      <strong>{percent(suite.accuracy)}</strong>
      <small>{suite.correct}/{suite.total} · 平均 {suite.avgLatencyMs.toFixed(0)}ms · 证据 {suite.avgEvidenceCount.toFixed(1)} · 记忆 {suite.avgMemoryCount.toFixed(1)}</small>
    </div>
  );
}

function CaseRow({ item }: { item: EvalCaseResult }): JSX.Element {
  return (
    <details className={`caseRow ${item.score.correct ? 'pass' : 'fail'}`}>
      <summary>
        <span className="badge">{item.score.correct ? '通过' : '失败'}</span>
        <span className="caseTitle">{suiteLabels[item.suite]} · {item.questionType ?? item.topic ?? 'unknown'}</span>
        <span className="caseQuestion">{item.question}</span>
        <span className="caseScore">{item.score.score.toFixed(3)}</span>
      </summary>
      <div className="caseBody">
        <div className="qa">
          <div><b>系统回答</b><p>{item.answer}</p></div>
          <div><b>标准答案</b><p>{item.goldAnswer ?? item.score.correctOption ?? '-'}</p></div>
          <div><b>指标</b><p>{metricText(item)}</p></div>
        </div>
        <div className="columns">
          <div>
            <h3>召回证据</h3>
            {item.evidenceHits.slice(0, 5).map((hit) => (
              <article key={`${item.questionId}:${hit.sourceId}:${hit.title}`} className="evidence">
                <strong>{hit.title}</strong>
                <small>{hit.score.toFixed(3)} · {hit.why}</small>
                <p>{hit.text}</p>
              </article>
            ))}
          </div>
          <div>
            <h3>记忆节点</h3>
            {item.memoryRefs.length ? item.memoryRefs.map((memory) => (
              <article key={memory.id} className="memory">
                <strong>{memory.title}</strong>
                <small>{memory.stability} · {memory.confidence.toFixed(2)}</small>
                <p>{memory.summary}</p>
              </article>
            )) : <p className="muted">本题没有召回记忆节点。</p>}
            <h3>ContextPacket</h3>
            <p className="chips">{item.contextSectionKinds.map((kind) => <span key={kind}>{kind}</span>)}</p>
          </div>
        </div>
      </div>
    </details>
  );
}

function metricText(item: EvalCaseResult): string {
  if (item.suite === 'personamem') {
    return `选择 ${item.score.selectedOption ?? '-'}，正确 ${item.score.correctOption ?? '-'}，证据 ${item.score.evidenceCount}，记忆 ${item.score.memoryCount}`;
  }
  return `F1 ${item.score.tokenF1?.toFixed(3) ?? '-'}，上下文包含答案 ${item.score.answerInContext ? '是' : '否'}，Session Recall@5 ${item.score.sessionRecallAt5?.toFixed(3) ?? '-'}`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function safeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
}
