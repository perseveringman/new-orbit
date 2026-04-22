import { useEffect, useState } from 'react';
import { useFiles } from '../../store/files';
import { useWorkspace } from '../../store/workspace';

interface Props {
  open: boolean;
  onClose(): void;
}

const overlay =
  'fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm';
const panel =
  'w-[min(720px,94vw)] rounded-lg border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900';
const btn =
  'rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800';
const btnPrimary =
  'rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40';

export function VisionEditorModal({ open, onClose }: Props): JSX.Element | null {
  const toast = useFiles((s) => s.toast);
  const refreshVision = useWorkspace((s) => s.refreshVision);
  const [raw, setRaw] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setLoading(true);
    void (async () => {
      try {
        const v = await window.orbit.vision.get();
        setRaw(v.raw);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  async function save(): Promise<void> {
    setSaving(true);
    setErr(null);
    try {
      await window.orbit.vision.update(raw);
      await refreshVision();
      toast('Vision saved');
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className={overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={panel} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <h2 className="text-sm font-semibold">Edit Vision — your North Star</h2>
          <button className={btn} onClick={onClose} disabled={saving}>
            ✕
          </button>
        </header>
        <div className="space-y-2 px-4 py-4">
          <p className="text-xs text-neutral-500">
            Keep it aspirational but concrete — this is injected as the North Star section.
          </p>
          {loading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : (
            <textarea
              className="h-[50vh] w-full rounded border border-neutral-300 bg-white p-2 font-mono text-xs outline-none focus:border-sky-500 dark:border-neutral-700 dark:bg-neutral-950"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
          )}
          {err && (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-600 dark:text-red-300">
              {err}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <button className={btn} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className={btnPrimary} onClick={save} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save Vision'}
          </button>
        </footer>
      </div>
    </div>
  );
}
