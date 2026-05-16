import { ChevronDown, ChevronRight } from 'lucide-react';
import { INSPECTOR_THEME } from '../inspectorTheme';
import type { ChangeDisplayStatus, ChangeRow } from './buildChangeRows';

interface ChangesTreeProps {
  rows: ChangeRow[];
  expandedGroups: Record<string, boolean>;
  selectedPath: string | null;
  pendingDiscardPath: string | null;
  busyPath: string | null;
  onSelect(path: string): void;
  onToggleGroup(key: string): void;
  onStage(path: string): void;
  onUnstage(path: string): void;
  onDiscard(path: string): void;
  onConfirmDiscard(path: string): void;
  onCancelDiscard(): void;
}

const STATUS_META: Record<ChangeDisplayStatus, { label: string; className: string }> = {
  added: { label: 'A', className: INSPECTOR_THEME.gitAdded },
  modified: { label: 'M', className: INSPECTOR_THEME.gitModified },
  deleted: { label: 'D', className: INSPECTOR_THEME.gitDeleted },
  renamed: { label: 'R', className: INSPECTOR_THEME.gitRenamed },
  untracked: { label: 'U', className: INSPECTOR_THEME.gitAdded }
};

export function ChangesTree(props: ChangesTreeProps): JSX.Element {
  const {
    rows,
    expandedGroups,
    selectedPath,
    pendingDiscardPath,
    busyPath,
    onSelect,
    onToggleGroup,
    onStage,
    onUnstage,
    onDiscard,
    onConfirmDiscard,
    onCancelDiscard
  } = props;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {rows.map((row) => {
        if (row.type === 'group') {
          const expanded = expandedGroups[row.key] !== false;
          return (
            <button
              key={row.key}
              type="button"
              onClick={() => onToggleGroup(row.key)}
              className={`flex items-center justify-between border-b border-inspector-border-subtle px-3 py-2 text-left text-xs ${INSPECTOR_THEME.textSecondary}`}
            >
              <span className="flex items-center gap-2">
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>{row.label}</span>
              </span>
              <span>{row.count} 个文件</span>
            </button>
          );
        }

        const { file } = row;
        const status = STATUS_META[file.displayStatus];
        const active = file.path === selectedPath;
        const busy = busyPath === file.path;
        const needsConfirm = pendingDiscardPath === file.path;

        return (
          <div
            key={row.key}
            className={`border-b border-inspector-border-subtle ${active ? 'bg-inspector-surface-1' : ''}`}
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => onSelect(file.path)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className={`w-4 text-center text-[11px] font-semibold ${status.className}`}>
                  {status.label}
                </span>
                <span className={`min-w-0 flex-1 truncate text-xs ${INSPECTOR_THEME.textPrimary}`}>
                  {file.path}
                </span>
                <span className={`shrink-0 text-[11px] ${INSPECTOR_THEME.textSecondary}`}>
                  <span className={INSPECTOR_THEME.gitAdded}>+{file.additions}</span>
                  <span className="px-1 text-inspector-text-dim">/</span>
                  <span className={INSPECTOR_THEME.gitDeleted}>-{file.deletions}</span>
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-1 text-[11px]">
                {file.isStaged ? (
                  <button
                    type="button"
                    onClick={() => onUnstage(file.path)}
                    disabled={busy}
                    className="rounded border border-inspector-border-subtle px-2 py-1 disabled:opacity-50"
                  >
                    取消暂存
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onStage(file.path)}
                    disabled={busy}
                    className="rounded border border-inspector-border-subtle px-2 py-1 disabled:opacity-50"
                  >
                    暂存
                  </button>
                )}
                {needsConfirm ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onConfirmDiscard(file.path)}
                      disabled={busy}
                      className="rounded border border-red-500/40 px-2 py-1 text-red-400 disabled:opacity-50"
                    >
                      确认丢弃
                    </button>
                    <button
                      type="button"
                      onClick={onCancelDiscard}
                      disabled={busy}
                      className="rounded border border-inspector-border-subtle px-2 py-1 disabled:opacity-50"
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onDiscard(file.path)}
                    disabled={busy}
                    className="rounded border border-inspector-border-subtle px-2 py-1 disabled:opacity-50"
                  >
                    丢弃
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
