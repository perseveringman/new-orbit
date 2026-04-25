import type { InboxItem, ThoughtPayload } from '@shared/inbox';

export function ThoughtRenderer({ item }: { item: InboxItem }): JSX.Element {
  const payload = item.payload as ThoughtPayload;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-fuchsia-500">Thought</p>
        <h2 className="mt-2 text-xl font-semibold">{item.title}</h2>
        {payload.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {payload.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="whitespace-pre-wrap text-sm leading-6">{payload.content}</p>
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Editing, linking and promote actions are honest placeholders until the Capture backends land.
      </p>
    </div>
  );
}
