import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { Conversation } from '@shared/conversation';

const DEFAULT_SKILLS = [
  'orbit-capture',
  'orbit-retrieve',
  'orbit-scheduling',
  'orbit-welcome-analysis'
];

export function ContextBar({ conversation }: { conversation: Conversation | null }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const anchors = conversation?.anchors ?? [];

  return (
    <section className="shrink-0 border-b border-neutral-200 bg-white/60 dark:border-neutral-800 dark:bg-neutral-950/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-900/60"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-semibold">上下文</span>
        <span className="text-neutral-400">·</span>
        <span>{anchors.length} 个锚点</span>
        <span className="text-neutral-400">·</span>
        <span>{DEFAULT_SKILLS.length} 个技能</span>
      </button>
      {expanded ? (
        <div className="grid max-h-[180px] gap-3 overflow-y-auto border-t border-neutral-200 px-4 py-3 text-xs dark:border-neutral-800 md:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-white/70 p-3 dark:border-neutral-800 dark:bg-neutral-900/40">
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
          <div className="rounded-xl border border-neutral-200 bg-white/70 p-3 dark:border-neutral-800 dark:bg-neutral-900/40">
            <div className="font-medium text-neutral-700 dark:text-neutral-200">启用技能</div>
            <p className="mt-1 text-[11px] text-neutral-400">当前使用默认集合；动态路由稍后接入。</p>
            <ul className="mt-2 grid gap-1 text-neutral-500 dark:text-neutral-400 sm:grid-cols-2">
              {DEFAULT_SKILLS.map((skill) => (
                <li key={skill} className="truncate rounded-md bg-neutral-100 px-2 py-1 dark:bg-neutral-800/70">
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
