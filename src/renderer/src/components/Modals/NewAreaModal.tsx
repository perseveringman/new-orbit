import { useEffect, useMemo, useState } from 'react';
import type { CreateAreaResultDTO } from '@shared/ipc';
import { isValidSlug, slugify } from '../../schemas/newProject';
import { useWorkspace } from '../../store/workspace';

const overlay =
  'fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm';
const panel =
  'w-[min(480px,92vw)] rounded-lg border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900';
const btn =
  'rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800';
const btnPrimary =
  'rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40';
const input =
  'w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:border-sky-500 dark:border-neutral-700 dark:bg-neutral-900';

export function NewAreaModal(): JSX.Element | null {
  const refreshAreas = useWorkspace((s) => s.refreshAreas);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [existingSlugs, setExistingSlugs] = useState<string[]>([]);

  useEffect(() => {
    function onOpen(): void {
      setOpen(true);
    }
    window.addEventListener('orbit:open-new-area', onOpen);
    return () => window.removeEventListener('orbit:open-new-area', onOpen);
  }, []);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setName('');
    setSlug('');
    setSlugTouched(false);
    setTagInput('');
    setErr(null);
    void (async () => {
      try {
        const areas = await window.orbit.area.list();
        setExistingSlugs(areas.map((a) => a.slug));
      } catch {
        /* ignore */
      }
    })();
  }, [open]);

  // Auto-derive slug from name
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const slugValid = isValidSlug(slug);
  const slugConflict = useMemo(() => existingSlugs.includes(slug), [existingSlugs, slug]);

  const tags = tagInput
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const canCreate = name.trim().length > 0 && slugValid && !slugConflict;

  function onClose(): void {
    if (busy) return;
    setOpen(false);
  }

  async function submit(): Promise<void> {
    if (!canCreate) return;
    setBusy(true);
    setErr(null);
    try {
      const result: CreateAreaResultDTO = await window.orbit.area.create({
        name: name.trim(),
        slug,
        tags: tags.length ? tags : undefined
      });
      await refreshAreas();
      window.dispatchEvent(new CustomEvent('orbit:area-created', { detail: result }));
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className={overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={panel} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <h2 className="text-sm font-semibold">New Area</h2>
          <button className={btn} onClick={onClose} disabled={busy}>
            ✕
          </button>
        </header>

        <div className="space-y-3 px-4 py-4 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Name</span>
            <input
              className={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Work, Health, Learning"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">
              Slug <span className="text-neutral-400">(auto from name, editable)</span>
            </span>
            <input
              className={
                input +
                ' ' +
                (!slugValid || slugConflict ? 'border-red-500 dark:border-red-500' : '')
              }
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              placeholder="kebab-case-slug"
            />
            {slug && !slugValid && (
              <p className="mt-1 text-[11px] text-red-500">
                Must be lowercase kebab-case ASCII, 1–64 chars, no `--`.
              </p>
            )}
            {slugValid && slugConflict && (
              <p className="mt-1 text-[11px] text-red-500">
                An area with this slug already exists.
              </p>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">
              Tags <span className="text-neutral-400">(comma-separated, optional)</span>
            </span>
            <input
              className={input}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="e.g. work, personal"
            />
          </label>

          {err && (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-600 dark:text-red-300">
              {err}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <button className={btn} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={btnPrimary} onClick={submit} disabled={!canCreate || busy}>
            {busy ? 'Creating…' : 'Create area'}
          </button>
        </footer>
      </div>
    </div>
  );
}
