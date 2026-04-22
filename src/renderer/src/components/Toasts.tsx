import { useFiles } from '../store/files';

export function Toasts(): JSX.Element {
  const toasts = useFiles((s) => s.toasts);
  const dismiss = useFiles((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className="pointer-events-auto rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
