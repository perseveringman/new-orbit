import { useEffect, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import type { InboxItem, LibraryArticlePayload } from '@shared/inbox';
import { useFiles } from '../../../../store/files';

export function LibraryArticleRenderer({ item }: { item: InboxItem }): JSX.Element {
  const payload = item.payload as LibraryArticlePayload;
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef(0);
  const toast = useFiles((state) => state.toast);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void window.orbit.capture.library.readContent(item.id).then(
      (value) => {
        if (!cancelled) setContent(value);
      },
      (caught: unknown) => {
        if (!cancelled) setError((caught as Error).message);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  async function promote(): Promise<void> {
    await window.orbit.capture.library.promote(item.id, { noAiSummary: true });
    toast('Promoted article to Resources');
  }

  function onScroll(event: UIEvent<HTMLDivElement>): void {
    const target = event.currentTarget;
    const max = target.scrollHeight - target.clientHeight;
    if (max <= 0) return;
    const now = Date.now();
    if (now - lastSaved.current < 200) return;
    lastSaved.current = now;
    const scrollPosition = Math.min(1, Math.max(0, target.scrollTop / max));
    void window.orbit.capture.library.updateReading(item.id, { scrollPosition, readingSecondsDelta: 1 });
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">Library</p>
        <h2 className="mt-2 text-xl font-semibold">{payload.title ?? item.title}</h2>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{item.summary}</p>
        <a className="mt-2 block break-all text-sm text-sky-600 dark:text-sky-300" href={payload.url}>
          {payload.url}
        </a>
      </div>
      <div onScroll={onScroll} className="min-h-0 flex-1 overflow-auto rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-neutral-800 dark:text-neutral-100">{content || 'Loading article…'}</pre>
        )}
      </div>
      <button
        type="button"
        onClick={() => void promote()}
        className="self-start rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
      >
        Promote to Resource
      </button>
    </div>
  );
}
