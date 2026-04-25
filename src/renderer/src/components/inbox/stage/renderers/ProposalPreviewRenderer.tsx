import type { InboxItem } from '@shared/inbox';
import { asRecord, stringValue } from './utils';

export function ProposalPreviewRenderer({ item }: { item: InboxItem }): JSX.Element {
  const payload = asRecord(item.payload);
  const proposalPayload = asRecord(payload['payload']);
  const proposalType = stringValue(payload['proposal_type']) ?? 'proposal';
  const title = stringValue(proposalPayload['title']) ?? item.title;
  const description = stringValue(proposalPayload['description']) ?? item.summary;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-500">
          {item.subtype} · {proposalType}
        </p>
        <h2 className="mt-2 text-xl font-semibold">{title}</h2>
        {description && <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}
      </div>
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/50">
        <p className="text-sm font-medium">Authorization chain</p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          This card is linked by proposal_id. Resolving it here updates the shared proposal store,
          so chat approval cards disappear from the same state source.
        </p>
      </div>
    </div>
  );
}
