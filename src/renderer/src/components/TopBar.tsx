import { useEffect, useState } from 'react';
import { useWorkspace } from '../store/workspace';
import { useAgent } from '../store/agent';
import { useWorktrees } from '../store/worktrees';
import { usePara } from '../store/para';
import { useNightShift } from '../store/nightShift';
import { AboutModal } from './AboutModal';
import { NewProjectModal } from './Modals/NewProjectModal';
import { MigrationDialog } from './Modals/MigrationDialog';

export function TopBar(): JSX.Element {
  const { vault, settings, setTheme, closeVault } = useWorkspace();
  const projects = useWorkspace((s) => s.projects);
  const activeProjectUid = useWorkspace((s) => s.activeProjectUid);
  const view = usePara((s) => s.view);
  const setView = usePara((s) => s.setView);
  const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
  const costToday = useAgent((s) => s.costToday);
  const runs = useAgent((s) => s.runs);
  const refreshCostToday = useAgent((s) => s.refreshCostToday);
  const openSettings = useAgent((s) => s.openSettings);
  const worktrees = useWorktrees((s) => s.list);
  const env = useWorktrees((s) => s.env);
  const activeWt = worktrees.filter((w) => w.status === 'active').length;
  const [aboutOpen, setAboutOpen] = useState(false);
  const [newProjOpen, setNewProjOpen] = useState(false);
  const [migrateOpen, setMigrateOpen] = useState(false);
  const nightShiftRun = useNightShift((s) => s.run);
  const subscribeNightShift = useNightShift((s) => s.subscribe);
  useEffect(() => {
    subscribeNightShift();
  }, [subscribeNightShift]);

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

  return (
    <>
      <header className="drag flex h-11 items-center justify-between border-b border-neutral-200 bg-white/80 pl-20 pr-4 text-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/80">
        <div className="flex items-center gap-3">
          <div className="flex h-5 w-5 items-center justify-center rounded-full border border-neutral-400 text-[10px] font-semibold dark:border-neutral-500">
            O
          </div>
          <span className="font-semibold tracking-tight">Orbit</span>
          {vault && (
            <span className="no-drag ml-4 truncate text-neutral-500 dark:text-neutral-400">
              {vault.path}
            </span>
          )}
        </div>

        <div className="no-drag flex items-center gap-2">
          {vault && (
            <nav className="flex items-center gap-1 rounded-md border border-neutral-200 p-0.5 text-[11px] dark:border-neutral-700">
              <TabBtn
                active={view.kind === 'inbox'}
                onClick={() => setView({ kind: 'inbox' })}
              >
                Inbox
              </TabBtn>
              <TabBtn
                active={view.kind === 'today'}
                onClick={() => setView({ kind: 'today' })}
              >
                Today
              </TabBtn>
              <TabBtn
                active={view.kind === 'dashboard'}
                onClick={() => setView({ kind: 'dashboard' })}
              >
                Dashboard
              </TabBtn>
              <TabBtn
                active={view.kind === 'journals'}
                onClick={() => setView({ kind: 'journals' })}
                title="Past Daily Reviews"
              >
                Journals
              </TabBtn>
              <TabBtn
                active={view.kind === 'project'}
                disabled={!activeProjectUid}
                onClick={() => {
                  if (activeProjectUid)
                    setView({ kind: 'project', projectUid: activeProjectUid });
                }}
              >
                Project
              </TabBtn>
            </nav>
          )}
          {vault && (
            <button
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('orbit:open-drawer', {
                    detail: 'night-shift-history'
                  })
                )
              }
              className={btn}
              title="Night Shift history"
            >
              🌙 History
            </button>
          )}
          {vault && (
            <button
              onClick={() => setNewProjOpen(true)}
              className="rounded-md bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-500"
              title="Create new project"
            >
              + New Project
            </button>
          )}
          {vault && (
            <span
              className="text-[11px] text-neutral-500 dark:text-neutral-400"
              title={`install: ${env.active ? `running ${env.active}` : 'idle'}, queued=${env.queued}`}
            >
              worktrees: {activeWt} active
            </span>
          )}
          {vault && costToday && <BudgetMeter onClick={openSettings} />}
          {nightShiftRun && nightShiftRun.status === 'running' && (
            <NightShiftPill />
          )}
          <button
            onClick={() => setAboutOpen(true)}
            title="About Orbit"
            className={btn}
          >
            About
          </button>
          <button
            onClick={openSettings}
            title="Settings"
            className={btn}
          >
            ⚙
          </button>
          <button
            onClick={() => void setTheme(nextTheme)}
            className={btn}
          >
            {settings.theme === 'dark' ? '☾ Dark' : settings.theme === 'light' ? '☀ Light' : '⌘ System'}
          </button>
          {vault && (
            <button
              onClick={() => void closeVault()}
              className={btn}
            >
              Switch vault
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
          发现 {legacyCount} 个旧格式项目，点击迁移 → folder-based projects
        </button>
      )}
      <NewProjectModal
        open={newProjOpen}
        onClose={() => setNewProjOpen(false)}
      />
      <MigrationDialog open={migrateOpen} onClose={() => setMigrateOpen(false)} />
    </>
  );
}

function TabBtn({
  active,
  disabled,
  onClick,
  title,
  children
}: {
  active: boolean;
  disabled?: boolean;
  onClick(): void;
  title?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded px-2 py-0.5 ${active ? 'bg-neutral-200 dark:bg-neutral-800' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'} ${disabled ? 'opacity-40' : ''}`}
    >
      {children}
    </button>
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
        title={`today: ${costToday.runs} run(s), source=${costToday.source}, daily cap: unlimited`}
        className="rounded px-2 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
      >
        Today: ${used.toFixed(4)} · {tokens} tok
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
      title={`today: $${used.toFixed(4)} / $${dailyUSD.toFixed(2)} (${tokens.toLocaleString()} tok), source=${costToday.source}. Click to configure.`}
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

function NightShiftPill(): JSX.Element | null {
  const run = useNightShift((s) => s.run);
  const cancel = useNightShift((s) => s.cancel);
  if (!run) return null;
  const done = run.tasks.filter(
    (t) => t.phase === 'done' || t.phase === 'blocked' || t.phase === 'cancelled'
  ).length;
  return (
    <button
      onClick={() => {
        if (confirm('Cancel Night Shift and kill all runners?')) void cancel();
      }}
      className="flex items-center gap-1 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-600 hover:bg-indigo-500/20 dark:text-indigo-300"
      title="Click to cancel"
    >
      🌙 Night Shift {done}/{run.tasks.length}
    </button>
  );
}
