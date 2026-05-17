import { useEffect, useMemo, useState } from 'react';

interface AnalysisProgressCardProps {
  title: string;
  description: string;
  steps: string[];
}

export function AnalysisProgressCard({ title, description, steps }: AnalysisProgressCardProps): JSX.Element {
  const safeSteps = useMemo(() => steps.length ? steps : ['正在整理上下文'], [steps]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (safeSteps.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % safeSteps.length);
    }, 1400);
    return () => window.clearInterval(timer);
  }, [safeSteps.length]);

  const visibleSteps = [0, 1, 2].map((offset) => {
    const index = (activeIndex + offset) % safeSteps.length;
    return { index, text: safeSteps[index] };
  });

  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950 shadow-sm dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-semibold text-white">
          AI
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">正在分析</p>
              <h2 className="mt-1 text-sm font-semibold">{title}</h2>
            </div>
            <span className="rounded-full border border-sky-300 px-2 py-1 text-xs text-sky-700 dark:border-sky-800 dark:text-sky-300">
              请稍等
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-sky-800/80 dark:text-sky-100/80">{description}</p>
          <div className="mt-3 h-20 overflow-hidden rounded-xl border border-sky-200 bg-white/70 p-2 dark:border-sky-900 dark:bg-neutral-950/40">
            <div className="flex flex-col gap-1">
              {visibleSteps.map((step, offset) => (
                <div
                  key={`${step.index}-${step.text}`}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-all ${
                    offset === 0
                      ? 'bg-sky-100 font-medium text-sky-950 dark:bg-sky-900/50 dark:text-sky-100'
                      : 'text-sky-800/60 dark:text-sky-100/55'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${offset === 0 ? 'bg-sky-600' : 'bg-sky-300 dark:bg-sky-700'}`} />
                  <span className="truncate">{step.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sky-100 dark:bg-sky-950">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-sky-500" />
          </div>
        </div>
      </div>
    </section>
  );
}
