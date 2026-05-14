import { useEffect } from 'react';
import { FilePlus, FoldVertical, FolderPlus, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FileNode, ProjectFileNode } from '@shared/types';
import { useWorkspaceInspector } from '../../../store/workspaceInspector';
import { useFiles } from '../../../store/files';
import { usePara } from '../../../store/para';
import { useWorkspace } from '../../../store/workspace';
import { INSPECTOR_THEME } from '../inspectorTheme';
import { applyFileQuery } from './buildFileRows';
import { FilesTree } from './FilesTree';

// ---------------------------------------------------------------------------
// Adapter: convert vault FileNode (vault-relative relPath) to ProjectFileNode
// shape so shared row-building logic can accept both without an unsafe cast.
// ---------------------------------------------------------------------------

function adaptVaultTree(node: FileNode): ProjectFileNode {
  return {
    name: node.name,
    path: node.path,
    relPath: node.relPath,
    isDir: node.isDir,
    children: node.children?.map(adaptVaultTree)
  };
}

// ---------------------------------------------------------------------------
// Small icon button used in the toolbar
// ---------------------------------------------------------------------------

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

function IconButton({ icon: Icon, label, onClick }: IconButtonProps): JSX.Element {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex shrink-0 items-center justify-center rounded p-1 ${INSPECTOR_THEME.tabInactive} hover:${INSPECTOR_THEME.tabActive} transition-colors`}
    >
      <Icon size={13} />
      <span className="sr-only">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// FilesPanel
// ---------------------------------------------------------------------------

export function FilesPanel(): JSX.Element {
  const state = useWorkspaceInspector();
  const fileQuery = state.fileQuery ?? '';
  const expanded = state.expanded ?? {};

  const vaultTree = useFiles((s) => s.tree);
  const projectTree = useFiles((s) => s.projectTree);
  const projectTreeError = useFiles((s) => s.projectTreeError);
  const refreshProjectTree = useFiles((s) => s.refreshProjectTree);

  const view = usePara((s) => s.view);
  const activeProjectUid = useWorkspace((s) => s.activeProjectUid);
  const projects = useWorkspace((s) => s.projects);

  const isProjectSurface = view.kind === 'project';
  const activeProject = isProjectSurface
    ? projects.find((p) => p.uid === activeProjectUid)
    : null;
  const activeProjectRoot = activeProject?.workdirPath ?? activeProject?.path;

  // Load the full project tree whenever we enter a project surface.
  useEffect(() => {
    if (isProjectSurface && activeProjectRoot) {
      void refreshProjectTree(activeProjectRoot);
    }
  }, [isProjectSurface, activeProjectRoot]);

  // Choose the tree source: project surfaces use the full project tree,
  // other surfaces use the existing vault markdown tree adapted to the shared shape.
  const rawTree: ProjectFileNode | null = isProjectSurface
    ? projectTree
    : vaultTree
      ? adaptVaultTree(vaultTree)
      : null;

  const filteredTree = rawTree ? applyFileQuery(rawTree, fileQuery) : null;

  function handleRefresh(): void {
    if (isProjectSurface && activeProjectRoot) {
      void refreshProjectTree(activeProjectRoot);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar: search + icon actions */}
      <div
        className={`flex shrink-0 items-center gap-1 border-b ${INSPECTOR_THEME.tabBar} px-2 py-1`}
      >
        <input
          type="search"
          value={fileQuery}
          onChange={(e) => state.setFileQuery?.(e.target.value)}
          placeholder="Search files..."
          aria-label="Search files"
          className={`min-w-0 flex-1 rounded bg-transparent px-1.5 py-0.5 text-xs outline-none placeholder:${INSPECTOR_THEME.textDim} ${INSPECTOR_THEME.textPrimary}`}
        />
        <IconButton icon={FilePlus} label="New File" onClick={() => {}} />
        <IconButton icon={FolderPlus} label="New Folder" onClick={() => {}} />
        <IconButton icon={RefreshCw} label="Refresh" onClick={handleRefresh} />
        <IconButton icon={FoldVertical} label="Collapse All" onClick={() => state.collapseAll?.()} />
      </div>

      {/* Tree body */}
      <div className={`flex-1 overflow-y-auto ${INSPECTOR_THEME.body}`}>
        {isProjectSurface && activeProject?.workdirMissing ? (
          <p className={`p-3 text-xs text-red-400`}>Linked workdir is missing.</p>
        ) : filteredTree ? (
          <FilesTree root={filteredTree} />
        ) : isProjectSurface && projectTreeError ? (
          <p className={`p-3 text-xs text-red-400`}>{projectTreeError}</p>
        ) : (
          <p className={`p-3 text-xs ${INSPECTOR_THEME.textDim}`}>Loading…</p>
        )}
      </div>
    </div>
  );
}
