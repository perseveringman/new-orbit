import { ChevronDown, ChevronRight, File, Folder } from 'lucide-react';
import type { ProjectFileNode } from '@shared/types';
import { useWorkspaceInspector } from '../../../store/workspaceInspector';
import { useFiles } from '../../../store/files';
import { INSPECTOR_THEME } from '../inspectorTheme';
import { flattenFileTree, isBinaryFile } from './buildFileRows';

interface Props {
  root: ProjectFileNode;
}

export function FilesTree({ root }: Props): JSX.Element {
  const state = useWorkspaceInspector();
  const expanded = state.expanded ?? {};
  const selectedPath = state.selectedPath ?? null;
  const openPath = useFiles((s) => s.openPath);
  const toast = useFiles((s) => s.toast);

  const rows = flattenFileTree(root, expanded);

  return (
    <div role="tree" className="py-1 text-xs">
      {rows.map(({ node, depth }) => {
        const isExpanded = !!expanded[node.path];
        const isSelected = selectedPath === node.path;

        function handleClick(): void {
          state.setSelectedPath?.(node.path);
          if (node.isDir) {
            state.toggleExpanded?.(node.path);
          } else if (isBinaryFile(node.name)) {
            toast?.(`Cannot open binary file: ${node.name}`);
          } else {
            void openPath?.(node.path);
          }
        }

        return (
          <div
            key={node.path}
            role={node.isDir ? 'group' : 'treeitem'}
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
              }
            }}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            className={
              `flex cursor-pointer select-none items-center gap-1 rounded py-0.5 pr-2 ` +
              INSPECTOR_THEME.textPrimary +
              ' ' +
              (isSelected
                ? 'bg-inspector-surface-1'
                : `hover:bg-inspector-surface-1`)
            }
          >
            <span className="inline-flex w-3 shrink-0 items-center text-inspector-text-dim">
              {node.isDir ? (
                isExpanded ? (
                  <ChevronDown size={11} />
                ) : (
                  <ChevronRight size={11} />
                )
              ) : (
                <span className="w-3" />
              )}
            </span>
            <span className="inline-flex shrink-0 items-center text-inspector-text-secondary">
              {node.isDir ? <Folder size={11} /> : <File size={11} />}
            </span>
            <span className="truncate">{node.name}</span>
          </div>
        );
      })}
      {rows.length === 0 && (
        <p className={`px-3 py-2 ${INSPECTOR_THEME.textDim}`}>未找到文件。</p>
      )}
    </div>
  );
}
