import type { Conversation } from '@shared/conversation';

export function ContextPanel({ conversation }: { conversation: Conversation | null }): JSX.Element {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-neutral-200 bg-white/40 p-3 dark:border-neutral-800 dark:bg-neutral-950/30 xl:block">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Context</h2>
      <div className="mt-3 rounded-xl border border-neutral-200 p-3 text-xs dark:border-neutral-800">
        <div className="font-medium">Anchors</div>
        <div className="mt-2 space-y-1 text-neutral-500">
          {conversation?.anchors.map((anchor) => (
            <div key={`${anchor.kind}:${anchor.refId}`} className="truncate">
              {anchor.kind}: {anchor.refId}
            </div>
          )) ?? null}
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-neutral-200 p-3 text-xs dark:border-neutral-800">
        <div className="font-medium">Active skills</div>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-neutral-500">
          <li>orbit-capture</li>
          <li>orbit-retrieve</li>
          <li>orbit-scheduling</li>
          <li>orbit-welcome-analysis</li>
        </ul>
      </div>
    </aside>
  );
}

