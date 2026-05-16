import { useEffect, useState } from 'react';
import type { JournalListItemDTO } from '@shared/ipc';
import { useFiles } from '../store/files';

/**
 * JournalHistoryView — lists every `02_Areas/Journal/*.md` file in reverse
 * chronological order. Clicking a row opens the journal in the editor pane.
 * Pure UI over the existing `review.list` IPC.
 */
export function JournalHistoryView(): JSX.Element {
  const openPath = useFiles((s) => s.openPath);
  const toast = useFiles((s) => s.toast);
  const [items, setItems] = useState<JournalListItemDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const r = await window.orbit.review.list();
        if (!cancelled) setItems(r);
      } catch (e) {
        if (!cancelled) toast(`加载日志失败：${(e as Error).message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800">
        <h2 className="font-semibold">日志历史</h2>
        <span className="text-xs text-neutral-500">
          02_Areas/Journal — 按日期倒序
        </span>
      </header>
      <div className="flex-1 overflow-auto p-4 text-sm">
        {loading && <p className="text-neutral-500">加载中…</p>}
        {!loading && items.length === 0 && (
          <p className="text-neutral-500">暂无日志。可从仪表盘生成每日复盘。</p>
        )}
        <ul className="space-y-1">
          {items.map((j) => (
            <li key={j.path}>
              <button
                onClick={() => void openPath(j.path)}
                className="w-full rounded border border-neutral-200 px-3 py-2 text-left hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{j.date}</span>
                  <span className="text-xs text-neutral-500">{j.relPath}</span>
                </div>
                {j.excerpt && (
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-300">
                    {j.excerpt}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
