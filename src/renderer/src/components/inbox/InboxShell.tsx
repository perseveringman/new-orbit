import { useEffect, useMemo, useState } from 'react';
import type { InboxCountSummary, InboxItem } from '@shared/inbox';
import type { InboxCaptureTab, InboxPrimaryTab } from '@shared/inbox_renderer';
import { InboxList } from './list/InboxList';
import { StageView } from './stage/StageView';
import { useInbox } from '../../store/inbox';

interface InboxShellContentProps {
  items: InboxItem[];
  counts: InboxCountSummary;
  loading?: boolean;
  error?: string | null;
  activePrimary: InboxPrimaryTab;
  activeCapture: InboxCaptureTab;
  selectedId: string | null;
  onPrimaryChange(tab: InboxPrimaryTab): void;
  onCaptureChange(tab: InboxCaptureTab): void;
  onSelect(item: InboxItem): void;
  onResolve?(item: InboxItem, decision?: 'approve' | 'reject' | 'done' | 'processed'): void;
  onDismiss?(item: InboxItem): void;
}

export function InboxShell(): JSX.Element {
  const init = useInbox((state) => state.init);
  const refresh = useInbox((state) => state.refresh);
  const items = useInbox((state) => state.items);
  const counts = useInbox((state) => state.counts);
  const loading = useInbox((state) => state.loading);
  const error = useInbox((state) => state.error);
  const [activePrimary, setActivePrimary] = useState<InboxPrimaryTab>('messages');
  const [activeCapture, setActiveCapture] = useState<InboxCaptureTab>('library');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    setSelectedId((current) => current ?? firstVisibleId(items, activePrimary, activeCapture));
  }, [activePrimary, activeCapture, items]);

  async function resolveItem(
    item: InboxItem,
    decision: 'approve' | 'reject' | 'done' | 'processed' = 'done'
  ): Promise<void> {
    await window.orbit.inbox.resolve(item.id, { decision, source: 'inbox' });
    setSelectedId(null);
    await refresh();
  }

  async function dismissItem(item: InboxItem): Promise<void> {
    await window.orbit.inbox.dismiss(item.id, { source: 'inbox' });
    setSelectedId(null);
    await refresh();
  }

  return (
    <InboxShellContent
      items={items}
      counts={counts}
      loading={loading}
      error={error}
      activePrimary={activePrimary}
      activeCapture={activeCapture}
      selectedId={selectedId}
      onPrimaryChange={(tab) => {
        setActivePrimary(tab);
        setSelectedId(firstVisibleId(items, tab, activeCapture));
      }}
      onCaptureChange={(tab) => {
        setActiveCapture(tab);
        setSelectedId(firstVisibleId(items, activePrimary, tab));
      }}
      onSelect={(item) => setSelectedId(item.id)}
      onResolve={(item, decision) => void resolveItem(item, decision)}
      onDismiss={(item) => void dismissItem(item)}
    />
  );
}

export function InboxShellContent({
  items,
  counts,
  loading = false,
  error = null,
  activePrimary,
  activeCapture,
  selectedId,
  onPrimaryChange,
  onCaptureChange,
  onSelect,
  onResolve,
  onDismiss
}: InboxShellContentProps): JSX.Element {
  const visibleItems = useMemo(
    () => filterVisibleItems(items, activePrimary, activeCapture),
    [items, activePrimary, activeCapture]
  );
  const selected = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Inbox v2</h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Capture + Messages + Archive with a right-side Stage View.
            </p>
          </div>
          {loading && <span className="text-xs text-neutral-500">Refreshing…</span>}
        </div>
        {error && (
          <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </div>
        )}
        <nav className="mt-4 flex flex-wrap gap-2">
          <PrimaryTabButton
            label="Capture"
            count={counts.captureLibraryUnread}
            active={activePrimary === 'capture'}
            onClick={() => onPrimaryChange('capture')}
          />
          <PrimaryTabButton
            label="Messages"
            count={counts.messagesPending}
            active={activePrimary === 'messages'}
            onClick={() => onPrimaryChange('messages')}
          />
          <PrimaryTabButton
            label="Archive"
            active={activePrimary === 'archive'}
            onClick={() => onPrimaryChange('archive')}
          />
        </nav>
        {activePrimary === 'capture' && (
          <nav className="mt-3 flex flex-wrap gap-2">
            <CaptureTabButton label="Feed" active={activeCapture === 'feed'} onClick={() => onCaptureChange('feed')} />
            <CaptureTabButton
              label="Library"
              count={counts.captureLibraryUnread}
              active={activeCapture === 'library'}
              onClick={() => onCaptureChange('library')}
            />
            <CaptureTabButton
              label="Thoughts"
              active={activeCapture === 'thoughts'}
              onClick={() => onCaptureChange('thoughts')}
            />
          </nav>
        )}
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,360px)_1fr] gap-4 overflow-hidden p-4">
        <InboxList items={visibleItems} selectedId={selected?.id ?? null} onSelect={onSelect} />
        <StageView item={selected} onResolve={onResolve} onDismiss={onDismiss} />
      </div>
    </div>
  );
}

function PrimaryTabButton({
  label,
  count,
  active,
  onClick
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick(): void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
        active
          ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-950'
          : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'
      }`}
    >
      {label}
      {count !== undefined && count > 0 ? <span className="ml-2">{count}</span> : null}
    </button>
  );
}

function CaptureTabButton({
  label,
  count,
  active,
  onClick
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick(): void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1 text-xs font-medium ${
        active
          ? 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200'
          : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900'
      }`}
    >
      {label}
      {count !== undefined && count > 0 ? <span className="ml-2">{count}</span> : null}
    </button>
  );
}

function firstVisibleId(
  items: InboxItem[],
  primary: InboxPrimaryTab,
  capture: InboxCaptureTab
): string | null {
  return filterVisibleItems(items, primary, capture)[0]?.id ?? null;
}

function filterVisibleItems(
  items: InboxItem[],
  primary: InboxPrimaryTab,
  capture: InboxCaptureTab
): InboxItem[] {
  if (primary === 'messages') {
    return items.filter((item) => item.category === 'message' && item.status === 'pending');
  }
  if (primary === 'archive') {
    return items.filter(
      (item) =>
        item.subtype !== 'feed_item' && ['resolved', 'processed', 'dismissed', 'archived'].includes(item.status)
    );
  }
  const subtype = capture === 'feed' ? 'feed_item' : capture === 'library' ? 'library_article' : 'thought';
  return items.filter(
    (item) =>
      item.category === 'capture' &&
      item.subtype === subtype &&
      !['processed', 'dismissed', 'archived'].includes(item.status)
  );
}
