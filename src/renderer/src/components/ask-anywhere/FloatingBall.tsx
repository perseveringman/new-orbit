import { Sparkles } from 'lucide-react';
import { usePara } from '../../store/para';

/**
 * 底部居中悬浮球 — 打开 Ask Anywhere 轻量输入栏。
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
  if (open) return null;

  return (
    <button
      type="button"
      onClick={onToggle}
      title="打开 Ask Anywhere"
      aria-label="打开 Ask Anywhere"
      aria-pressed={open}
      className="fixed bottom-6 left-1/2 z-50 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-neutral-950 text-white shadow-xl ring-1 ring-black/10 transition duration-200 hover:scale-105 active:scale-95 dark:bg-white dark:text-neutral-950"
    >
      <Sparkles size={22} />
    </button>
  );
}
