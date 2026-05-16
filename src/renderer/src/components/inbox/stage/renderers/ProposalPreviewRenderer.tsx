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
        <p className="text-sm font-medium">授权链</p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          这张卡片通过 proposal_id 关联。这里处理后会更新共享提案存储，
          对话中的审批卡片也会从同一个状态源消失。
        </p>
      </div>
    </div>
  );
}
