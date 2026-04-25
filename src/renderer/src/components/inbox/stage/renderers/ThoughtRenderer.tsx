import { useEffect, useState } from 'react';
import type { InboxItem, ThoughtPayload } from '@shared/inbox';
import { useFiles } from '../../../../store/files';

export function ThoughtRenderer({ item }: { item: InboxItem }): JSX.Element {
  const payload = item.payload as ThoughtPayload;
  const [content, setContent] = useState(payload.content);
  const [tags, setTags] = useState(payload.tags.join(', '));
  const toast = useFiles((state) => state.toast);

  useEffect(() => {
    setContent(payload.content);
    setTags(payload.tags.join(', '));
  }, [item.id, payload.content, payload.tags]);

  async function save(): Promise<void> {
    await window.orbit.capture.thought.update(item.id, {
      content,
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    });
    toast('Thought updated');
  }

  async function promote(): Promise<void> {
    await window.orbit.capture.thought.promote(item.id);
    toast('Promoted thought to Resources');
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-fuchsia-500">Thought</p>
        <h2 className="mt-2 text-xl font-semibold">{item.title}</h2>
      </div>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        className="h-56 w-full resize-none rounded-xl border border-neutral-200 bg-white p-4 text-sm leading-6 outline-none focus:border-fuchsia-400 dark:border-neutral-800 dark:bg-neutral-900"
      />
      <input
        value={tags}
        onChange={(event) => setTags(event.target.value)}
        placeholder="tags, comma separated"
        className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs outline-none focus:border-fuchsia-400 dark:border-neutral-800 dark:bg-neutral-950"
      />
      <div className="flex gap-2">
        <button type="button" onClick={() => void save()} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium dark:border-neutral-700">
          Save edits
        </button>
        <button type="button" onClick={() => void promote()} className="rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-fuchsia-500">
          Promote to Resource
        </button>
      </div>
    </div>
  );
}
