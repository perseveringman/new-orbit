import { useEffect, useState } from 'react';
import { PencilLine } from 'lucide-react';
import { useWorkspace } from '../store/workspace';
import { useAgent } from '../store/agent';
import { useWorktrees } from '../store/worktrees';
import { AboutModal } from './AboutModal';
import { MigrationDialog } from './Modals/MigrationDialog';
import { requestQuickCaptureOpen } from './quick-capture/events';

export function TopBar(): JSX.Element {
  const { vault, settings, setTheme, closeVault } = useWorkspace();
  const projects = useWorkspace((s) => s.projects);
  const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
  const costToday = useAgent((s) => s.costToday);
  const runs = useAgent((s) => s.runs);
  const refreshCostToday = useAgent((s) => s.refreshCostToday);
  const openSettings = useAgent((s) => s.openSettings);
  const worktrees = useWorktrees((s) => s.list);
  const env = useWorktrees((s) => s.env);
  const activeWt = worktrees.filter((w) => w.status === 'active').length;
  const [aboutOpen, setAboutOpen] = useState(false);
  const [migrateOpen, setMigrateOpen] = useState(false);

  const legacyCount = projects.filter((p) => p.legacy).length;

  // Poll cost every 5s while any run is active.
  useEffect(() => {
    const anyActive = Object.values(runs).some(
      (r) => r.summary.status === 'running' || r.summary.status === 'starting'
    );
    if (!anyActive) return;
    const t = setInterval(() => void refreshCostToday(), 5000);
    return () => clearInterval(t);
  }, [runs, refreshCostToday]);

  const btn =
    'rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800';
  const primaryBtn =
    'inline-flex items-center gap-1.5 rounded-md border border-neutral-950 bg-neutral-950 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200';

  return (
    <>
      <header className="flex min-h-14 items-center justify-between border-b border-neutral-200 bg-white/85 pr-4 text-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/85">
        <div className="drag flex min-w-0 flex-1 items-center gap-3 py-2 pl-20 pr-6">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-white/70 text-xs font-semibold text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-200">
            O
          </div>
          <span className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Orbit
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2 py-2">
          {vault && (
            <button
              type="button"
              onClick={requestQuickCaptureOpen}
              title="快速捕获（⌘⇧I）"
              className={primaryBtn}
            >
              <PencilLine size={14} aria-hidden="true" />
              <span>快速捕获</span>
              <span className="hidden text-[10px] font-normal opacity-70 xl:inline">⌘⇧I</span>
            </button>
          )}
          {vault && (
            <span
              className="rounded-full border border-neutral-200 bg-white/70 px-2.5 py-1 text-[11px] text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-400"
              title={`安装：${env.active ? `运行中 ${env.active}` : '空闲'}，排队=${env.queued}`}
            >
              {env.active ? `安装 ${env.active}` : `${activeWt} 个 worktree`}
            </span>
          )}
          {vault && costToday && <BudgetMeter onClick={openSettings} />}
          <button
            onClick={() => setAboutOpen(true)}
            title="关于 Orbit"
            className={btn}
          >
            关于
          </button>
          <button
            onClick={openSettings}
            title="设置"
            className={btn}
          >
            ⚙
          </button>
          <button
            onClick={() => void setTheme(nextTheme)}
            className={btn}
          >
            {settings.theme === 'dark' ? '☾ 深色' : settings.theme === 'light' ? '☀ 浅色' : '⌘ 跟随系统'}
          </button>
          {vault && (
            <button
              onClick={() => void closeVault()}
              className={btn}
            >
              打开其他 vault
            </button>
          )}
        </div>
        <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      </header>
      {vault && legacyCount > 0 && (
        <button
          onClick={() => setMigrateOpen(true)}
          className="no-drag w-full border-b border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-left text-xs font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
        >
          发现 {legacyCount} 个旧格式项目，点击迁移为文件夹项目
        </button>
      )}
      <MigrationDialog open={migrateOpen} onClose={() => setMigrateOpen(false)} />
    </>
  );
}

function BudgetMeter({ onClick }: { onClick: () => void }): JSX.Element | null {
  const costToday = useAgent((s) => s.costToday);
  const budget = useAgent((s) => s.budget);
  if (!costToday) return null;
  const dailyUSD = budget.dailyUSD;
  const used = costToday.estUSD;
  const tokens = costToday.tokens.in + costToday.tokens.out;

  if (dailyUSD === null) {
    // Unlimited — just show the raw readout.
    return (
      <button
        onClick={onClick}
        title={`今日：${costToday.runs} 次运行，来源=${costToday.source}，每日上限：无限制`}
        className="rounded px-2 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
      >
        今日：${used.toFixed(4)} · {tokens} tok
      </button>
    );
  }

  const pct = dailyUSD === 0 ? 1 : used / dailyUSD;
  const warnPct = budget.warnAtPercent / 100;
  const color =
    pct >= 1
      ? 'bg-red-500'
      : pct >= warnPct
        ? 'bg-amber-500'
        : 'bg-emerald-500';
  const width = Math.min(100, Math.max(0, pct * 100));

  return (
    <button
      onClick={onClick}
      title={`今日：$${used.toFixed(4)} / $${dailyUSD.toFixed(2)}（${tokens.toLocaleString()} tok），来源=${costToday.source}。点击配置。`}
      className="flex items-center gap-2 rounded px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
    >
      <span className="tabular-nums">
        ${used.toFixed(2)} / ${dailyUSD.toFixed(0)}
      </span>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <span
          className={`block h-full ${color}`}
          style={{ width: `${width}%` }}
        />
      </span>
    </button>
  );
}
