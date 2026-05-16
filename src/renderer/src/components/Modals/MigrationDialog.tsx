import { useEffect, useState } from 'react';
import type { V3MigrationReport } from '@shared/ipc';
import { useFiles } from '../../store/files';
import { useWorkspace } from '../../store/workspace';

interface Props {
  open: boolean;
  onClose(): void;
}

const overlay =
  'fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm';
const panel =
  'w-[min(640px,94vw)] rounded-lg border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900';
const btn =
  'rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800';
const btnPrimary =
  'rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-40';

export function MigrationDialog({ open, onClose }: Props): JSX.Element | null {
  const [phase, setPhase] = useState<'preview' | 'running' | 'done' | 'error'>(
    'preview'
  );
  const [dryReport, setDryReport] = useState<V3MigrationReport | null>(null);
  const [realReport, setRealReport] = useState<V3MigrationReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refreshProjects = useWorkspace((s) => s.refreshProjects);
  const toast = useFiles((s) => s.toast);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && phase !== 'running') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, phase, onClose]);

  useEffect(() => {
    if (!open) return;
    setPhase('preview');
    setDryReport(null);
    setRealReport(null);
    setErr(null);
    void (async () => {
      try {
        const r = await window.orbit.migrations.runV3({ dryRun: true });
        setDryReport(r);
      } catch (e) {
        setErr((e as Error).message);
        setPhase('error');
      }
    })();
  }, [open]);

  async function confirm(): Promise<void> {
    setPhase('running');
    setErr(null);
    try {
      const r = await window.orbit.migrations.runV3();
      setRealReport(r);
      setPhase('done');
      await refreshProjects();
      toast(`已迁移 ${r.migrated.length} 个项目`);
    } catch (e) {
      setErr((e as Error).message);
      setPhase('error');
    }
  }

  if (!open) return null;

  const report = realReport ?? dryReport;

  return (
    <div className={overlay} role="dialog" aria-modal="true">
      <div className={panel}>
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <h2 className="text-sm font-semibold">
            {phase === 'done'
               ? '迁移完成'
               : phase === 'running'
                 ? '迁移中…'
                 : '迁移旧版项目 → 文件夹'}
          </h2>
          {phase !== 'running' && (
            <button className={btn} onClick={onClose}>
              ✕
            </button>
          )}
        </header>
        <div className="space-y-3 px-4 py-4 text-sm">
          {phase === 'preview' && !dryReport && !err && (
             <p className="text-neutral-500">正在分析 vault…</p>
          )}
          {report && (
            <>
              <p className="text-xs text-neutral-500">
                {phase === 'preview'
                   ? '将应用以下变更。每个项目都会成为带独立 git 仓库的文件夹。'
                   : phase === 'done'
                     ? '全部完成。现在可以在每个项目内创建任务。'
                    : ''}
              </p>
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase text-neutral-500">
                   将迁移（{report.migrated.length}）
                </h3>
                <ul className="max-h-40 overflow-auto rounded border border-neutral-200 bg-neutral-50 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-900/70">
                  {report.migrated.length === 0 && (
                     <li className="text-neutral-400">（无）</li>
                  )}
                  {report.migrated.map((m) => (
                    <li key={m} className="font-mono">
                      {m}
                    </li>
                  ))}
                </ul>
              </section>
              {report.skipped.length > 0 && (
                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase text-neutral-500">
                     已跳过（{report.skipped.length}）
                  </h3>
                  <ul className="max-h-32 overflow-auto rounded border border-neutral-200 bg-neutral-50 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-900/70">
                    {report.skipped.map((m) => (
                      <li key={m} className="font-mono text-neutral-500">
                        {m}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {report.snapshotSha && phase === 'done' && (
                <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                  已提交安全快照 <span className="font-mono">{report.snapshotSha.slice(0, 7)}</span>
                  ，如需回滚可在 vault 根执行 <span className="font-mono">git reset --hard {report.snapshotSha.slice(0, 7)}</span>
                </div>
              )}
              {report.failed && report.failed.length > 0 && (
                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase text-red-600 dark:text-red-400">
                     失败（{report.failed.length}）
                  </h3>
                  <ul className="max-h-32 overflow-auto rounded border border-red-500/30 bg-red-500/5 p-2 text-xs">
                    {report.failed.map((f) => (
                      <li key={f.slug} className="font-mono">
                        <span className="font-semibold">{f.slug}</span>
                        <span className="ml-2 text-red-600/80 dark:text-red-300/80">{f.error}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
          {phase === 'running' && (
            <div className="flex items-center gap-3 text-neutral-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
               正在迁移文件并创建 git 仓库…
            </div>
          )}
          {err && (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-600 dark:text-red-300">
              {err}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
          {phase === 'preview' && dryReport && (
            <>
              <button className={btn} onClick={onClose}>
                 暂不处理
              </button>
              <button
                className={btnPrimary}
                onClick={confirm}
                disabled={dryReport.migrated.length === 0}
              >
                 迁移 {dryReport.migrated.length} 个项目
              </button>
            </>
          )}
          {phase === 'done' && (
            <button className={btn} onClick={onClose}>
               关闭
            </button>
          )}
          {phase === 'error' && (
            <button className={btn} onClick={onClose}>
               关闭
            </button>
          )}
        </footer>
      </div>
      {phase === 'running' && (
        <div className="pointer-events-auto fixed inset-0 z-30 bg-transparent" />
      )}
    </div>
  );
}
