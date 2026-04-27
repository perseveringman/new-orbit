import { usePara } from '../../store/para';

/**
 * 右下角悬浮球 — 一键打开 Ask-Anywhere 视图。
 * 设计参考：docs/thinking-trail/2026-04-29-chat-unification-decoupling D-3 入口要求
 */
export function FloatingBall(): JSX.Element | null {
  const view = usePara((s) => s.view);
  const setView = usePara((s) => s.setView);

  if (view.kind === 'askAnywhere') return null;

  return (
    <button
      type="button"
      onClick={() => setView({ kind: 'askAnywhere' })}
      title="Ask Anywhere (规划者)"
      aria-label="Open Ask Anywhere"
      className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xl text-white shadow-lg ring-1 ring-black/10 transition-transform hover:scale-105 active:scale-95 dark:from-indigo-400 dark:to-purple-500"
    >
      ✨
    </button>
  );
}
