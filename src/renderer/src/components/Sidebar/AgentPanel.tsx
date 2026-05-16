import { useEffect, useRef, useState } from 'react';
import type { AgentEvent } from '@shared/agent';
import type { DistillSuggestHit } from '@shared/ipc';
import { buildAgentEventKey } from '../../lib/agentEventKeys';
import { useAgent } from '../../store/agent';

/**
 * Right-sidebar Agent panel. Shows install banner when Claude Code is not
 * detected, active runs list, and the selected run's live log + cost.
 */
export function AgentPanel(): JSX.Element {
  const detect = useAgent((s) => s.detect);
  const runs = useAgent((s) => s.runs);
  const activeRunId = useAgent((s) => s.activeRunId);
  const select = useAgent((s) => s.select);
  const stop = useAgent((s) => s.stop);
  const runList = Object.values(runs).sort((a, b) =>
    b.summary.startedAt.localeCompare(a.summary.startedAt)
  );
  const active = activeRunId ? runs[activeRunId] : undefined;

  return (
    <div className="flex h-full flex-col">
      {detect && !detect.available && (
        <div className="mb-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
           <p className="font-semibold">未检测到 Claude Code CLI</p>
           <p className="mt-1">
             安装 CLI 后即可分发 Agent。{' '}
            <a
              href="https://docs.claude.com/claude-code"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
               安装文档
            </a>
          </p>
          {detect.error && (
            <p className="mt-1 text-[10px] opacity-70">{detect.error}</p>
          )}
        </div>
      )}

      <h3 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
         活跃运行
      </h3>
      {runList.length === 0 ? (
        <div className="rounded border border-dashed border-neutral-300 px-3 py-4 text-xs text-neutral-500 dark:border-neutral-700">
           <p className="font-medium text-neutral-700 dark:text-neutral-200">还没有全局 Agent 运行。</p>
           <p className="mt-1">
             这个标签页会追踪 Orbit 管理的运行，例如自动运行器和已分发的任务 Agent。
           </p>
           <p className="mt-1">
             通过终端启动的 Claude/Codex 会话会显示在 <span className="font-medium">会话</span> 标签页。
          </p>
        </div>
      ) : (
        <ul className="mb-2 space-y-0.5">
          {runList.map((r) => (
            <li key={r.summary.runId}>
              <button
                onClick={() => select(r.summary.runId)}
                className={
                  'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60 ' +
                  (r.summary.runId === activeRunId
                    ? 'bg-neutral-200/80 dark:bg-neutral-800/80'
                    : '')
                }
              >
                <StatusPill status={r.summary.status} />
                <span className="flex-1 truncate">{r.summary.title ?? r.summary.runId}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {active && (
        <div className="flex flex-1 min-h-0 flex-col border-t border-neutral-200 pt-2 dark:border-neutral-800">
          <ExperienceChip runId={active.summary.runId} />
          {active.halt && (
            <div className="mb-2 rounded border border-red-500/50 bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-300">
               <p className="font-semibold">预算停止：{active.halt.reason}</p>
               <p className="mt-1">
                 停止于 {active.halt.tokens.toLocaleString()} tok · $
                {active.halt.usd.toFixed(4)}.
              </p>
              <button
                disabled
                 title="未来里程碑中提供"
                className="mt-2 rounded border border-red-400/40 px-2 py-0.5 text-[10px] text-red-600 opacity-50 dark:text-red-300"
              >
                 使用覆盖指令重试
              </button>
            </div>
          )}
          <div className="mb-1 flex items-center justify-between px-1 text-[11px] uppercase tracking-wider text-neutral-500">
             <span>日志</span>
            <div className="flex gap-1">
              <button
                onClick={() => void navigator.clipboard.writeText(logText(active.events))}
                className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                 复制
              </button>
              {(active.summary.status === 'running' ||
                active.summary.status === 'starting') && (
                <button
                  onClick={() => void stop(active.summary.runId)}
                  className="rounded border border-red-400/50 px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-500/10 dark:text-red-300"
                >
                   停止
                </button>
              )}
            </div>
          </div>
          <LogStream scope={active.summary.runId} events={active.events} />
          <CostRow />
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }): JSX.Element {
  const color =
    status === 'running' || status === 'starting'
      ? 'bg-emerald-500'
      : status === 'done'
        ? 'bg-neutral-400'
        : status === 'killed'
          ? 'bg-amber-500'
          : 'bg-red-500';
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

function LogStream({ scope, events }: { scope: string; events: AgentEvent[] }): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);
  return (
    <div
      ref={ref}
      className="mb-2 flex-1 min-h-0 overflow-auto rounded bg-neutral-950/5 p-2 font-mono text-[11px] leading-relaxed text-neutral-700 dark:bg-neutral-950/40 dark:text-neutral-300"
    >
      {events.length === 0 ? (
         <p className="text-neutral-500">（无事件）</p>
      ) : (
        events.map((e, order) => (
          <div key={buildAgentEventKey(scope, e, order)} className="whitespace-pre-wrap break-words">
            <span className="text-neutral-500">[{e.kind}]</span>{' '}
            {renderEventText(e)}
          </div>
        ))
      )}
    </div>
  );
}

function renderEventText(e: AgentEvent): string {
  if (e.text) return e.text;
  if (e.kind === 'cost') {
    const parts = [
      typeof e.input_tokens === 'number' ? `in=${e.input_tokens}` : '',
      typeof e.output_tokens === 'number' ? `out=${e.output_tokens}` : '',
      typeof e.total_cost_usd === 'number' ? `$${e.total_cost_usd.toFixed(4)}` : ''
    ].filter(Boolean);
    return parts.join(' ');
  }
  if (e.toolName) return e.toolName;
  return '';
}

function logText(events: AgentEvent[]): string {
  return events.map((e) => `[${e.at}] [${e.kind}] ${renderEventText(e)}`).join('\n');
}

function CostRow(): JSX.Element | null {
  const active = useAgent((s) => (s.activeRunId ? s.runs[s.activeRunId] : undefined));
  if (!active) return null;
  const c = active.cost;
  if (!c) return (
    <p className="px-1 text-[11px] text-neutral-500">成本：待计算…</p>
  );
  return (
    <p className="px-1 text-[11px] text-neutral-500">
       成本：输入 {c.tokens.in} · 输出 {c.tokens.out} · 估算 ${c.estUSD.toFixed(4)}（
       {c.source})
    </p>
  );
}

function ExperienceChip({ runId }: { runId: string }): JSX.Element | null {
  const [hits, setHits] = useState<DistillSuggestHit[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void window.orbit.distill.experienceFor(runId).then((h) => {
      if (!cancelled) setHits(h);
    });
    return () => {
      cancelled = true;
    };
  }, [runId]);
  if (hits.length === 0) return null;
  return (
    <div className="mb-2 relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"
      >
         已注入 {hits.length} 条资源
      </button>
      {open && (
        <div className="mt-1 rounded border border-neutral-200 bg-white p-2 text-[11px] shadow dark:border-neutral-700 dark:bg-neutral-900">
           <p className="mb-1 font-semibold">已注入提示词的过往经验</p>
          <ul className="space-y-0.5">
            {hits.map((h) => (
              <li key={h.id}>
                <span className="font-semibold">{h.meta.title}</span>{' '}
                <span className="text-neutral-500">
                   · {h.meta.relPath}（分数 {h.score.toFixed(2)}）
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
