import type { InboxItem } from '@shared/inbox';
import { asRecord, stringValue } from './utils';

export function ApprovalDiffRenderer({ item }: { item: InboxItem }): JSX.Element {
  const payload = asRecord(item.payload);
  const proposalPayload = asRecord(payload['payload']);
  const ghostBranch = stringValue(proposalPayload['ghost_branch']) ?? stringValue(proposalPayload['branch']);
  const base = stringValue(proposalPayload['base']) ?? 'current branch';
  return (
    <div className="space-y-4">
      <StageHeader eyebrow="A1 · Merge approval" title={item.title} summary={item.summary} />
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
        Diff rendering is not wired in this Inbox foundation yet. Open the linked task or review
        workspace for the full diff before approving.
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Meta label="Ghost branch" value={ghostBranch ?? 'Not provided'} />
        <Meta label="Base" value={base} />
      </dl>
    </div>
  );
}

function StageHeader({ eyebrow, title, summary }: { eyebrow: string; title: string; summary: string }): JSX.Element {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-500">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold">{title}</h2>
      {summary && <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{summary}</p>}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
