import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { Conversation } from '@shared/conversation';
import type { RuntimeEvent } from '@shared/chat-protocol';
import {
  askContextLaneLabel,
  askIntentRouteLabel,
  type AskContextLane,
  type AskIntentRoute
} from '@shared/ask-runtime';

const DEFAULT_SKILLS = [
  'orbit-capture',
  'orbit-retrieve',
  'orbit-scheduling',
  'orbit-welcome-analysis'
];

export function ContextBar({
  conversation,
  events = []
}: {
  conversation: Conversation | null;
  events?: RuntimeEvent[];
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const anchors = conversation?.anchors ?? [];
  const route = latestRoute(events);
  const lanes = laneStatuses(events);

  return (
    <section className="shrink-0 border-b border-neutral-200 bg-white/75 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/50">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-wrap items-center gap-2 px-4 py-2 text-left text-xs text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-900/60"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-semibold">上下文</span>
        <span className="text-neutral-400">·</span>
        <span>{anchors.length} 个锚点</span>
        <span className="text-neutral-400">·</span>
        <span>{DEFAULT_SKILLS.length} 个技能</span>
        {route ? (
          <>
            <span className="text-neutral-400">·</span>
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200">
              {askIntentRouteLabel(route)}
            </span>
          </>
        ) : null}
        {lanes.length > 0 ? (
          <span className="ml-auto flex flex-wrap gap-1">
            {lanes.map((lane) => (
              <span key={lane.lane} className={laneChipClassName(lane.status)}>
                {askContextLaneLabel(lane.lane)}
              </span>
            ))}
          </span>
        ) : null}
      </button>
      {expanded ? (
        <div className="grid max-h-[220px] gap-3 overflow-y-auto border-t border-neutral-200 px-4 py-3 text-xs dark:border-neutral-800 lg:grid-cols-3">
          <div className="rounded-lg border border-neutral-200 bg-white/70 p-3 dark:border-neutral-800 dark:bg-neutral-900/40">
            <div className="font-medium text-neutral-700 dark:text-neutral-200">锚点</div>
            <div className="mt-2 space-y-1 text-neutral-500 dark:text-neutral-400">
              {anchors.length === 0 ? (
                <div>暂无锚点。</div>
              ) : (
                anchors.map((anchor) => (
                  <div key={`${anchor.kind}:${anchor.refId}`} className="truncate">
                    <span className="font-medium text-neutral-600 dark:text-neutral-300">
                      {anchor.kind}
                    </span>
                    : {anchor.refId}
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white/70 p-3 dark:border-neutral-800 dark:bg-neutral-900/40">
            <div className="font-medium text-neutral-700 dark:text-neutral-200">运行路线</div>
            <div className="mt-2 space-y-2 text-neutral-500 dark:text-neutral-400">
              {route ? (
                <div>
                  <div className="text-neutral-700 dark:text-neutral-200">
                    {askIntentRouteLabel(route)}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed">
                    {latestRouteReason(events) ?? '本轮使用确定性路由器判定。'}
                  </p>
                </div>
              ) : (
                <div>发送消息后显示本轮路由。</div>
              )}
              <div className="flex flex-wrap gap-1">
                {(lanes.length ? lanes : defaultLaneStatuses()).map((lane) => (
                  <span key={lane.lane} className={laneChipClassName(lane.status)}>
                    {askContextLaneLabel(lane.lane)} · {laneStatusLabel(lane.status)}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white/70 p-3 dark:border-neutral-800 dark:bg-neutral-900/40">
            <div className="font-medium text-neutral-700 dark:text-neutral-200">启用技能</div>
            <p className="mt-1 text-[11px] text-neutral-400">
              当前使用默认集合；动态路由稍后接入。
            </p>
            <ul className="mt-2 grid gap-1 text-neutral-500 dark:text-neutral-400 sm:grid-cols-2">
              {DEFAULT_SKILLS.map((skill) => (
                <li
                  key={skill}
                  className="truncate rounded-md bg-neutral-100 px-2 py-1 dark:bg-neutral-800/70"
                >
                  {skill}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function latestRoute(events: RuntimeEvent[]): AskIntentRoute | null {
  return latestRouteEvent(events)?.payload.route ?? null;
}

function latestRouteReason(events: RuntimeEvent[]): string | null {
  return latestRouteEvent(events)?.payload.reason ?? null;
}

function latestRouteEvent(events: RuntimeEvent[]): RuntimeEvent<'runtime.route'> | null {
  return (
    [...events]
      .reverse()
      .find((event): event is RuntimeEvent<'runtime.route'> => event.kind === 'runtime.route') ??
    null
  );
}

function laneStatuses(
  events: RuntimeEvent[]
): Array<{ lane: AskContextLane; status: RuntimeEvent<'runtime.context'>['payload']['status'] }> {
  const byLane = new Map<AskContextLane, RuntimeEvent<'runtime.context'>['payload']['status']>();
  for (const event of events) {
    if (event.kind !== 'runtime.context') continue;
    const context = event as RuntimeEvent<'runtime.context'>;
    byLane.set(context.payload.lane, context.payload.status);
  }
  return defaultLaneStatuses()
    .map((lane) => ({ ...lane, status: byLane.get(lane.lane) ?? lane.status }))
    .filter((lane) => lane.status !== 'skipped' || byLane.has(lane.lane));
}

function defaultLaneStatuses(): Array<{
  lane: AskContextLane;
  status: RuntimeEvent<'runtime.context'>['payload']['status'];
}> {
  return [
    { lane: 'fast', status: 'skipped' },
    { lane: 'retrieval', status: 'skipped' },
    { lane: 'slow', status: 'skipped' }
  ];
}

function laneStatusLabel(status: RuntimeEvent<'runtime.context'>['payload']['status']): string {
  if (status === 'started') return '进行中';
  if (status === 'completed') return '已就绪';
  if (status === 'attached') return '已挂载';
  if (status === 'failed') return '失败';
  return '跳过';
}

function laneChipClassName(status: RuntimeEvent<'runtime.context'>['payload']['status']): string {
  const base = 'rounded-full px-2 py-0.5 text-[10px]';
  if (status === 'started')
    return `${base} bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200`;
  if (status === 'completed' || status === 'attached')
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200`;
  if (status === 'failed')
    return `${base} bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200`;
  return `${base} bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400`;
}
