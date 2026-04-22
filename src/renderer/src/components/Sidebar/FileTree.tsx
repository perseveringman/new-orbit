import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import type { FileNode } from '@shared/types';
import { useFiles } from '../../store/files';
import { useWorkspace } from '../../store/workspace';
import { usePara } from '../../store/para';

interface Props {
  root: FileNode;
}

export function FileTree({ root }: Props): JSX.Element {
  return (
    <div className="text-sm" role="tree">
      {root.children?.map((c) => (
        <TreeNode key={c.path} node={c} depth={0} />
      ))}
    </div>
  );
}

function InlineInput({
  defaultValue,
  placeholder,
  onSubmit,
  onCancel
}: {
  defaultValue?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue ?? '');

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  function handleKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (value.trim()) onSubmit(value.trim());
      else onCancel();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  }

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKey}
      onBlur={onCancel}
      placeholder={placeholder}
      className="w-full rounded border border-blue-400 bg-white px-2 py-0.5 text-xs outline-none dark:border-blue-600 dark:bg-neutral-800 dark:text-neutral-200"
    />
  );
}

function TreeNode({ node, depth }: { node: FileNode; depth: number }): JSX.Element {
  const [open, setOpen] = useState(depth < 1);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [inlineAction, setInlineAction] = useState<'create' | 'rename' | null>(null);
  const active = useFiles((s) => s.active);
  const openPath = useFiles((s) => s.openPath);
  const createFile = useFiles((s) => s.createFile);
  const rename = useFiles((s) => s.rename);
  const deletePath = useFiles((s) => s.deletePath);
  const projects = useWorkspace((s) => s.projects);
  const setActiveProjectUid = useWorkspace((s) => s.setActiveProjectUid);
  const setView = usePara((s) => s.setView);

  /**
   * Detect whether this node is a folder-backed project root or a descendant
   * of one. Clicking either should activate the Project Room so the kanban
   * + terminal slot show up instead of the generic vault editor.
   */
  function projectUidFor(relPath: string): string | null {
    if (!relPath.startsWith('01_Projects/')) return null;
    const parts = relPath.split('/');
    if (parts.length < 2) return null;
    const slug = parts[1];
    if (!slug) return null;
    const hit = projects.find((p) => p.slug === slug && !p.legacy);
    return hit?.uid ?? null;
  }

  function handleActivate(): void {
    if (node.isDir) {
      // Clicking the project folder itself: jump into the Project Room.
      const uid = projectUidFor(node.relPath);
      if (uid && node.relPath.split('/').length === 2) {
        setActiveProjectUid(uid);
        setView({ kind: 'project', projectUid: uid });
        setOpen(true);
        return;
      }
      setOpen((v) => !v);
      return;
    }
    // File click: open it. If it lives inside a project, enter the Room too.
    const uid = projectUidFor(node.relPath);
    if (uid) {
      setActiveProjectUid(uid);
      setView({ kind: 'project', projectUid: uid, pane: 'readme' });
    } else {
      setView({ kind: 'editor' });
    }
    void openPath(node.path);
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleActivate();
    } else if (e.key === 'ArrowRight' && node.isDir) {
      setOpen(true);
    } else if (e.key === 'ArrowLeft' && node.isDir) {
      setOpen(false);
    }
  }

  function onCreate(): void {
    setMenu(null);
    if (node.isDir) setOpen(true);
    setInlineAction('create');
  }

  async function handleCreate(name: string): Promise<void> {
    setInlineAction(null);
    const dir = node.isDir ? node.path : node.path.replace(/\/[^/]+$/, '');
    await createFile(dir, name);
  }

  function onRename(): void {
    setMenu(null);
    setInlineAction('rename');
  }

  async function handleRename(next: string): Promise<void> {
    setInlineAction(null);
    if (next === node.name) return;
    const newPath = node.path.replace(/[^/\\]+$/, next);
    await rename(node.path, newPath);
  }

  async function onDelete(): Promise<void> {
    setMenu(null);
    if (!window.confirm(`Move ${node.name} to trash?`)) return;
    await deletePath(node.path);
  }

  const view = usePara((s) => s.view);
  const isActive = active?.path === node.path && view.kind === 'editor';

  return (
    <div>
      <div
        role={node.isDir ? 'group' : 'treeitem'}
        tabIndex={0}
        onKeyDown={onKey}
        onClick={handleActivate}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        className={
          'flex cursor-pointer select-none items-center gap-1 rounded px-2 py-0.5 text-neutral-700 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800/60 ' +
          (isActive ? 'bg-neutral-200/80 dark:bg-neutral-800/80' : '')
        }
      >
        <span className="inline-block w-3 text-neutral-500">
          {node.isDir ? (open ? '▾' : '▸') : '·'}
        </span>
        {inlineAction === 'rename' ? (
          <InlineInput
            defaultValue={node.name}
            onSubmit={handleRename}
            onCancel={() => setInlineAction(null)}
          />
        ) : (
          <span className="truncate">
            {node.isDir ? node.name : node.name.replace(/\.md$/i, '')}
          </span>
        )}
      </div>
      {open &&
        node.children?.map((c) => <TreeNode key={c.path} node={c} depth={depth + 1} />)}
      {open && inlineAction === 'create' && (
        <div style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }} className="py-0.5">
          <InlineInput
            placeholder="filename"
            onSubmit={handleCreate}
            onCancel={() => setInlineAction(null)}
          />
        </div>
      )}
      {menu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-md border border-neutral-200 bg-white py-1 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          style={{ top: menu.y, left: menu.x }}
          onMouseLeave={() => setMenu(null)}
        >
          <MenuItem label="New file" onClick={onCreate} />
          {!node.isDir && <MenuItem label="Rename…" onClick={onRename} />}
          {!node.isDir && <MenuItem label="Delete" onClick={onDelete} danger />}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  danger
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={
        'block w-full px-3 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 ' +
        (danger ? 'text-red-600 dark:text-red-400' : '')
      }
    >
      {label}
    </button>
  );
}
