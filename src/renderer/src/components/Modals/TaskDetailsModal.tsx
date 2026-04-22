import { useEffect } from 'react';

interface TaskDetailsModalProps {
  open: boolean;
  title: string;
  detail?: string;
  onClose(): void;
  children?: React.ReactNode;
}

const overlay =
  'fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm';
const panel =
  'flex h-[min(88vh,860px)] w-[min(1120px,96vw)] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900';

export function TaskDetailsModal({
  open,
  title,
  detail,
  onClose,
  children
}: TaskDetailsModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={overlay} onClick={onClose}>
      <div
        className={panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-start gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            {detail && (
              <p className="mt-0.5 truncate text-xs text-neutral-500">{detail}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Close
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
