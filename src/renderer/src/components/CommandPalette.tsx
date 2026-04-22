import { useEffect, useState } from 'react';
import type { SearchHit } from '@shared/types';
import { useFiles } from '../store/files';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props): JSX.Element | null {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [i, setI] = useState(0);
  const search = useFiles((s) => s.search);
  const openPath = useFiles((s) => s.openPath);

  useEffect(() => {
    if (!open) {
      setQ('');
      setHits([]);
      setI(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const r = await search(q);
      if (!cancelled) {
        setHits(r);
        setI(0);
      }
    }, 100);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [q, open, search]);

  if (!open) return null;

  function choose(hit: SearchHit | undefined): void {
    if (!hit) return;
    void openPath(hit.path);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-lg border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') setI((v) => Math.min(v + 1, hits.length - 1));
            else if (e.key === 'ArrowUp') setI((v) => Math.max(v - 1, 0));
            else if (e.key === 'Enter') choose(hits[i]);
          }}
          placeholder="Search files…"
          className="w-full border-b border-neutral-200 bg-transparent px-4 py-3 text-sm outline-none dark:border-neutral-700"
        />
        <ul className="max-h-72 overflow-auto py-1 text-sm">
          {hits.length === 0 && (
            <li className="px-4 py-2 text-xs text-neutral-500">No results.</li>
          )}
          {hits.map((h, idx) => (
            <li key={h.path}>
              <button
                onClick={() => choose(h)}
                className={
                  'block w-full truncate px-4 py-1.5 text-left ' +
                  (idx === i
                    ? 'bg-neutral-200/70 dark:bg-neutral-800/70'
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-800')
                }
              >
                <span className="font-medium">{h.title}</span>
                <span className="ml-2 text-xs text-neutral-500">{h.relPath}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
