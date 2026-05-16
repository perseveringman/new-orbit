import type { InboxItem } from '@shared/inbox';
import { ApprovalDiffRenderer } from './renderers/ApprovalDiffRenderer';
import { DefaultRenderer } from './renderers/DefaultRenderer';
import { FeedItemRenderer } from './renderers/FeedItemRenderer';
import { HelpRequestRenderer } from './renderers/HelpRequestRenderer';
import { LibraryArticleRenderer } from './renderers/LibraryArticleRenderer';
import { ProposalPreviewRenderer } from './renderers/ProposalPreviewRenderer';
import { ThoughtRenderer } from './renderers/ThoughtRenderer';

interface StageViewProps {
  item: InboxItem | null;
  onResolve?(item: InboxItem, decision?: 'approve' | 'reject' | 'done' | 'processed'): void;
  onDismiss?(item: InboxItem): void;
}

export function StageView({ item, onResolve, onDismiss }: StageViewProps): JSX.Element {
  if (!item) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        选择一个收件箱条目以打开阶段视图。
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white/70 dark:border-neutral-800 dark:bg-neutral-900/60">
      <div className="min-h-0 flex-1 overflow-y-auto p-6">{renderItem(item)}</div>
      {isActionable(item.status) && (
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
          {item.category === 'message' && item.subtype.startsWith('A') && (
            <button
              type="button"
              onClick={() => onResolve?.(item, 'approve')}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
            >
              批准
            </button>
          )}
          {item.category === 'message' && item.subtype.startsWith('A') && (
            <button
              type="button"
              onClick={() => onResolve?.(item, 'reject')}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
            >
              拒绝
            </button>
          )}
          {item.category === 'message' && item.subtype === 'B3' && (
            <button
              type="button"
              onClick={() => void tryOtherRuntime(item, () => onResolve?.(item, 'done'))}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
            >
              尝试其他 Runtime
            </button>
          )}
          <button
            type="button"
            onClick={() => onResolve?.(item, item.category === 'capture' ? 'processed' : 'done')}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            完成处理
          </button>
          <button
            type="button"
            onClick={() => onDismiss?.(item)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            忽略
          </button>
        </div>
      )}
    </div>
  );
}

async function tryOtherRuntime(item: InboxItem, afterSwitch?: () => void): Promise<void> {
  const taskUid =
    item.context.task_uid ??
    (typeof item.payload === 'object' && item.payload !== null
      ? (item.payload as { task_uid?: unknown }).task_uid
      : undefined);
  if (typeof taskUid !== 'string' || !taskUid) return;
  const runtimes = await window.orbit.runtime.list();
  const runtime = runtimes.find((entry) => entry.status === 'online');
  if (!runtime) return;
  await window.orbit.conversation.switchRuntime(taskUid, runtime.runtimeId);
  afterSwitch?.();
}

function renderItem(item: InboxItem): JSX.Element {
  if (item.subtype === 'A1') return <ApprovalDiffRenderer item={item} />;
  if (item.subtype === 'A2' || item.subtype === 'A3' || item.subtype === 'A4' || item.subtype === 'D2') {
    return <ProposalPreviewRenderer item={item} />;
  }
  if (item.subtype === 'B1') return <HelpRequestRenderer item={item} />;
  if (item.subtype === 'feed_item') return <FeedItemRenderer item={item} />;
  if (item.subtype === 'library_article') return <LibraryArticleRenderer item={item} />;
  if (item.subtype === 'thought') return <ThoughtRenderer item={item} />;
  return <DefaultRenderer item={item} />;
}

function isActionable(status: InboxItem['status']): boolean {
  return !['resolved', 'processed', 'dismissed', 'archived'].includes(status);
}
