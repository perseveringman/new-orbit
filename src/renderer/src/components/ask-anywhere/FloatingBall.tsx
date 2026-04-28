import { Sparkles } from 'lucide-react';
import { usePara } from '../../store/para';

/**
 * 右下角悬浮球 — 打开/关闭 Ask-Anywhere 轻量弹层。
 */
export function FloatingBall({
  open,
  onToggle
}: {
  open: boolean;
  onToggle(): void;
}): JSX.Element | null {
  const view = usePara((s) => s.view);

  if (view.kind === 'askAnywhere') return null;

  return (
    <button
      type="button"
      onClick={onToggle}
      title={open ? 'Close Ask Anywhere' : 'Ask Anywhere'}
      aria-label={open ? 'Close Ask Anywhere' : 'Open Ask Anywhere'}
      aria-pressed={open}
      className={
        'fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg ring-1 ring-black/10 transition-transform hover:scale-105 active:scale-95 dark:from-indigo-400 dark:to-purple-500 ' +
        (open ? 'scale-105 shadow-violet-500/30' : '')
      }
    >
      <Sparkles size={22} />
    </button>
  );
}
