import { useEffect, useRef, useState } from 'react';

interface QuickCaptureModalProps {
  open: boolean;
  saving?: boolean;
  error?: string | null;
  onSave(content: string, tags: string[]): void;
  onClose(): void;
}

export function QuickCaptureModal({ open, saving = false, error = null, onSave, onClose }: QuickCaptureModalProps): JSX.Element | null {
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setContent('');
    setTags('');
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [open]);

  if (!open) return null;

  function save(): void {
    const trimmed = content.trim();
    if (!trimmed || saving) return;
    onSave(trimmed, tags.split(',').map((tag) => tag.trim()).filter(Boolean));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-950/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div>
            <h2 className="text-sm font-semibold">Quick Capture</h2>
            <p className="text-xs text-neutral-500">Thought-only MVP · ⌘⇧I</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900">
            Esc
          </button>
        </div>
        <div className="space-y-3 p-4">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              const mod = event.metaKey || event.ctrlKey;
              if (mod && event.key === 'Enter') {
                event.preventDefault();
                save();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder="Capture a thought…"
            className="h-36 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-900"
          />
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="tags, comma separated"
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-950"
          />
          {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <button type="button" onClick={onClose} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium dark:border-neutral-700">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!content.trim() || saving}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save to Inbox'}
          </button>
        </div>
      </div>
    </div>
  );
}
