import {
  BookA,
  BookOpenText,
  Braces,
  Copy,
  ExternalLink,
  FileText,
  Film,
  Grid3X3,
  Highlighter,
  LayoutGrid,
  Languages,
  Link,
  Minus,
  NotebookPen,
  RotateCcw,
  Rows3,
  Sigma,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject
} from 'react';
import type { LibraryItem } from '@shared/library';
import { StreamingMarkdown } from '../Timeline/StreamingMarkdown';
import {
  getLibraryReaderKind,
  getLibraryReaderSource,
  getYouTubeEmbedUrl,
  LIBRARY_ITEM_DRAG_MIME,
  readerKindLabel,
  readLibraryDragPayload,
  type SpatialPoint,
  type SpatialReaderKind,
  type SpatialReaderWindowState,
  type SpatialSize,
  type SpatialViewport
} from './reader-model';

type ReaderMode = 'reading' | 'space';
type ReaderHighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

interface LibrarySpatialReaderProps {
  items: LibraryItem[];
  activeItem: LibraryItem | null;
  className?: string;
  onActiveItemChange?(itemId: string): void;
  onAnnotate?(itemId: string, text: string): Promise<void> | void;
  onMarkRead?(itemId: string): void;
}

type SelectionActionId = 'translate' | 'explain' | 'formula' | 'related';

interface SelectionActionDefinition {
  id: SelectionActionId;
  label: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
  color: ReaderHighlightColor;
  buildContentMarkdown(text: string, item: LibraryItem): string;
}

interface ReaderQuoteAnchor {
  exact: string;
  prefix?: string;
  suffix?: string;
}

interface ReaderSelectionState {
  itemId: string;
  text: string;
  quote: ReaderQuoteAnchor;
  anchorRect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  sourceWindowId?: string;
  sourceNodeId?: string;
}

interface SpatialThoughtNode {
  id: string;
  itemId: string;
  actionId: SelectionActionId | 'note';
  label: string;
  sourceText: string;
  sourceQuote: ReaderQuoteAnchor;
  sourceWindowId?: string;
  sourceNodeId?: string;
  color: ReaderHighlightColor;
  contentMarkdown: string;
  position: SpatialPoint;
  size: SpatialSize;
  status: 'open' | 'minimized' | 'closed';
  zIndex: number;
  createdAt: string;
  updatedAt: string;
}

interface HighlightTextSegment {
  node: Text;
  text: string;
  start: number;
  end: number;
}

interface NormalizedHighlightText {
  text: string;
  map: Array<{
    rawStart: number;
    rawEnd: number;
  }>;
}

interface HighlightMatchRange {
  start: number;
  end: number;
}

interface ThoughtConnection {
  id: string;
  from: SpatialPoint;
  to: SpatialPoint;
  colorClass: string;
  zIndex: number;
}

const DEFAULT_VIEWPORT: SpatialViewport = { x: 0, y: 0, zoom: 1 };
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.7;
const DEFAULT_WINDOW_SIZE: SpatialSize = { width: 680, height: 520 };
const MIN_WINDOW_SIZE: SpatialSize = { width: 460, height: 320 };
const DEFAULT_THOUGHT_SIZE: SpatialSize = { width: 390, height: 310 };
const MIN_THOUGHT_SIZE: SpatialSize = { width: 300, height: 220 };
const WINDOW_HEADER_DOCK_Y = 42;
const HIGHLIGHT_SELECTOR = '[data-reader-annotation-id]';
const EMPTY_THOUGHT_NODES: SpatialThoughtNode[] = [];

const highlightClassByColor: Record<ReaderHighlightColor, string> = {
  yellow: 'rounded bg-yellow-200/80 px-0.5 text-inherit ring-1 ring-yellow-300/70',
  green: 'rounded bg-emerald-200/80 px-0.5 text-inherit ring-1 ring-emerald-300/70',
  blue: 'rounded bg-sky-200/80 px-0.5 text-inherit ring-1 ring-sky-300/70',
  pink: 'rounded bg-pink-200/80 px-0.5 text-inherit ring-1 ring-pink-300/70',
  purple: 'rounded bg-violet-200/80 px-0.5 text-inherit ring-1 ring-violet-300/70'
};

const connectionColorClassByAction: Record<SpatialThoughtNode['actionId'], string> = {
  note: 'stroke-yellow-400',
  translate: 'stroke-sky-400',
  explain: 'stroke-emerald-400',
  formula: 'stroke-violet-400',
  related: 'stroke-pink-400'
};

const THOUGHT_ACTIONS: SelectionActionDefinition[] = [
  {
    id: 'translate',
    label: '翻译',
    description: '把选区翻译成流畅中文',
    icon: Languages,
    iconClassName: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200',
    color: 'blue',
    buildContentMarkdown: (text, item) => buildThoughtContent('翻译', text, item, [
      '保留专有名词、协议名、代码标识符和关键术语。',
      '优先输出中文语义，不丢失原文限定条件。',
      '遇到不确定译法时在术语后保留原文。'
    ])
  },
  {
    id: 'explain',
    label: '名词解释',
    description: '解释概念、背景与隐含逻辑',
    icon: BookA,
    iconClassName: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200',
    color: 'green',
    buildContentMarkdown: (text, item) => buildThoughtContent('名词解释', text, item, [
      '这段选区的核心概念是什么。',
      '它在原资料里的作用和前后逻辑。',
      '可以沉淀到 Resource 或 Project 的关键判断。'
    ])
  },
  {
    id: 'formula',
    label: '公式解析',
    description: '拆解公式、结构或论证链',
    icon: Sigma,
    iconClassName: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-200',
    color: 'purple',
    buildContentMarkdown: (text, item) => buildThoughtContent('公式解析', text, item, [
      '如果包含公式，逐项解释变量、约束和结论。',
      '如果没有公式，抽取段落里的结构、因果链或分类关系。',
      '把可以验证的前提与推论分开。'
    ])
  },
  {
    id: 'related',
    label: '关联检索',
    description: '给出相关文献、关键词或延展问题',
    icon: Link,
    iconClassName: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-200',
    color: 'pink',
    buildContentMarkdown: (text, item) => buildThoughtContent('关联检索', text, item, [
      '相关关键词、同义表达与可检索英文术语。',
      '可能关联的项目、Area 或 Resource 主题。',
      '三个继续追问或补证的问题。'
    ])
  }
];

export function LibrarySpatialReader({
  items,
  activeItem,
  className,
  onActiveItemChange,
  onAnnotate,
  onMarkRead
}: LibrarySpatialReaderProps): JSX.Element {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const zIndexRef = useRef(140);
  const activeItemRef = useRef<LibraryItem | null>(activeItem);
  const [mode, setMode] = useState<ReaderMode>('reading');
  const [viewport, setViewport] = useState<SpatialViewport>(DEFAULT_VIEWPORT);
  const [windows, setWindows] = useState<SpatialReaderWindowState[]>([]);
  const [thoughtNodes, setThoughtNodes] = useState<SpatialThoughtNode[]>([]);
  const [selection, setSelection] = useState<ReaderSelectionState | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const itemById = useMemo(() => new Map(items.map((item) => [item.frontmatter.id, item])), [items]);
  const activeId = activeItem?.frontmatter.id ?? null;

  useEffect(() => {
    activeItemRef.current = activeItem;
  }, [activeItem]);

  const getNextZIndex = useCallback(() => {
    zIndexRef.current += 1;
    return zIndexRef.current;
  }, []);

  const openItemInSpace = useCallback(
    (item: LibraryItem, position?: SpatialPoint, duplicate = false) => {
      const itemId = item.frontmatter.id;
      const nextZIndex = getNextZIndex();
      setWindows((current) => {
        if (!duplicate) {
          const existing = current.find((window) => window.itemId === itemId && window.status !== 'closed');
          if (existing) {
            return current.map((window) =>
              window.id === existing.id
                ? { ...window, status: 'open', zIndex: nextZIndex }
                : window
            );
          }
        }

        const visibleCount = current.filter((window) => window.status !== 'closed').length;
        const fallbackPosition = {
          x: 56 + (visibleCount % 4) * 42,
          y: 72 + (visibleCount % 5) * 36
        };
        return [
          ...current,
          {
            id: createWindowId(itemId),
            itemId,
            position: position ?? fallbackPosition,
            size: DEFAULT_WINDOW_SIZE,
            status: 'open',
            zIndex: nextZIndex
          }
        ];
      });
      onActiveItemChange?.(itemId);
    },
    [getNextZIndex, onActiveItemChange]
  );

  useEffect(() => {
    const item = activeItemRef.current;
    if (!item) return;
    openItemInSpace(item);
  }, [activeId, openItemInSpace]);

  const openWindowCount = windows.filter((window) => window.status === 'open').length;
  const visibleThoughtNodeCount = thoughtNodes.filter((node) => node.status !== 'closed').length;
  const activeItemThoughtNodes = useMemo(
    () =>
      activeItem
        ? thoughtNodes.filter((node) => node.itemId === activeItem.frontmatter.id)
        : EMPTY_THOUGHT_NODES,
    [activeItem, thoughtNodes]
  );

  function switchMode(nextMode: ReaderMode): void {
    setMode(nextMode);
    if (nextMode === 'space' && activeItem) openItemInSpace(activeItem);
  }

  function updateWindow(windowId: string, patch: Partial<SpatialReaderWindowState>): void {
    setWindows((current) =>
      current.map((window) => (window.id === windowId ? { ...window, ...patch } : window))
    );
  }

  function allocateZIndexBlock(ids: string[]): Map<string, number> {
    const zIndexById = new Map<string, number>();
    ids.forEach((id) => {
      zIndexById.set(id, getNextZIndex());
    });
    return zIndexById;
  }

  function activateWindow(windowId: string): void {
    const target = windows.find((window) => window.id === windowId);
    if (target) onActiveItemChange?.(target.itemId);
    const raisedNodeIds = getReaderAttachedThoughtNodeIdsInRaiseOrder(
      thoughtNodes,
      windowId,
      target?.itemId
    );
    const zIndexById = allocateZIndexBlock(raisedNodeIds);
    updateWindow(windowId, { status: 'open', zIndex: getNextZIndex() });
    if (zIndexById.size === 0) return;
    setThoughtNodes((current) =>
      current.map((node) => {
        const nextZIndex = zIndexById.get(node.id);
        return nextZIndex
          ? { ...node, status: 'open', zIndex: nextZIndex }
          : node;
      })
    );
  }

  function arrangeWindows(layout: 'grid' | 'rows'): void {
    const openWindows = windows.filter((window) => window.status !== 'closed');
    if (openWindows.length === 0) return;
    const columns = layout === 'rows' ? 1 : Math.max(1, Math.ceil(Math.sqrt(openWindows.length)));
    const gap = 28;
    setWindows((current) =>
      current.map((window) => {
        const index = openWindows.findIndex((candidate) => candidate.id === window.id);
        if (index < 0) return window;
        const row = Math.floor(index / columns);
        const column = index % columns;
        return {
          ...window,
          status: 'open',
          position: {
            x: 48 + column * (DEFAULT_WINDOW_SIZE.width + gap),
            y: 74 + row * (DEFAULT_WINDOW_SIZE.height + gap)
          },
          size: DEFAULT_WINDOW_SIZE
        };
      })
    );
    setViewport(DEFAULT_VIEWPORT);
  }

  function openDroppedItem(itemId: string, client: SpatialPoint): void {
    const item = itemById.get(itemId);
    if (!item) return;
    const canvasPoint = clientPointToCanvasPoint(client, workspaceRef.current, viewport);
    setMode('space');
    openItemInSpace(item, {
      x: Math.max(24, canvasPoint.x - DEFAULT_WINDOW_SIZE.width / 2),
      y: Math.max(40, canvasPoint.y - 34)
    });
  }

  function handleReaderSelection(nextSelection: ReaderSelectionState): void {
    setSelection(nextSelection);
    onActiveItemChange?.(nextSelection.itemId);
  }

  function clearSelection(): void {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function getThoughtPosition(
    nextSelection: ReaderSelectionState,
    offsetIndex: number,
    size = DEFAULT_THOUGHT_SIZE
  ): SpatialPoint {
    const sourceNode = nextSelection.sourceNodeId
      ? thoughtNodes.find((node) => node.id === nextSelection.sourceNodeId)
      : null;
    if (sourceNode) {
      return constrainThoughtPosition(
        {
          x: sourceNode.position.x + sourceNode.size.width + 34 + offsetIndex * 34,
          y: sourceNode.position.y + 50 + offsetIndex * 42
        },
        size,
        mode === 'reading' ? DEFAULT_VIEWPORT : viewport
      );
    }

    const sourceWindow = nextSelection.sourceWindowId
      ? windows.find((window) => window.id === nextSelection.sourceWindowId)
      : null;

    if (sourceWindow) {
      return constrainThoughtPosition({
        x: sourceWindow.position.x + sourceWindow.size.width + 34 + offsetIndex * 34,
          y: sourceWindow.position.y + 56 + offsetIndex * 42
      }, size);
    }

    const placementViewport = mode === 'reading' ? DEFAULT_VIEWPORT : viewport;
    const anchor = clientPointToCanvasPoint(
      { x: nextSelection.anchorRect.right, y: nextSelection.anchorRect.top },
      workspaceRef.current,
      placementViewport
    );
    return constrainThoughtPosition({
      x: Math.max(36, anchor.x + 36 + offsetIndex * 34),
      y: Math.max(54, anchor.y + offsetIndex * 42)
    }, size, placementViewport);
  }

  function constrainThoughtPosition(
    position: SpatialPoint,
    size: SpatialSize,
    placementViewport = viewport
  ): SpatialPoint {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return position;
    const minX = (16 - placementViewport.x) / placementViewport.zoom;
    const minY = (64 - placementViewport.y) / placementViewport.zoom;
    const maxX = Math.max(minX, (rect.width - size.width - 16 - placementViewport.x) / placementViewport.zoom);
    const maxY = Math.max(minY, (rect.height - size.height - 16 - placementViewport.y) / placementViewport.zoom);
    return {
      x: clamp(position.x, minX, maxX),
      y: clamp(position.y, minY, maxY)
    };
  }

  function createThoughtNode(
    nextSelection: ReaderSelectionState,
    action: SelectionActionDefinition,
    offsetIndex = 0
  ): SpatialThoughtNode | null {
    const item = itemById.get(nextSelection.itemId);
    if (!item) return null;
    const timestamp = new Date().toISOString();
    return {
      id: createThoughtId(action.id),
      itemId: item.frontmatter.id,
      actionId: action.id,
      label: action.label,
      sourceText: nextSelection.text,
      sourceQuote: nextSelection.quote,
      sourceWindowId: nextSelection.sourceWindowId,
      sourceNodeId: nextSelection.sourceNodeId,
      color: action.color,
      contentMarkdown: action.buildContentMarkdown(nextSelection.text, item),
      position: getThoughtPosition(nextSelection, offsetIndex, DEFAULT_THOUGHT_SIZE),
      size: DEFAULT_THOUGHT_SIZE,
      status: 'open',
      zIndex: getNextZIndex(),
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  function openSelectionContext(nextSelection: ReaderSelectionState): void {
    const item = itemById.get(nextSelection.itemId);
    if (!item) return;
    if (mode === 'reading') return;
    setMode('space');
    if (nextSelection.sourceWindowId) {
      openItemInSpace(item);
      return;
    }
    const thoughtPosition = getThoughtPosition(nextSelection, 0);
    openItemInSpace(item, {
      x: Math.max(24, thoughtPosition.x - DEFAULT_WINDOW_SIZE.width - 42),
      y: Math.max(40, thoughtPosition.y - 60)
    });
  }

  function runSelectionAction(action: SelectionActionDefinition): void {
    if (!selection) return;
    const node = createThoughtNode(selection, action);
    if (!node) return;
    openSelectionContext(selection);
    setThoughtNodes((current) => [...current, node]);
    clearSelection();
  }

  function runAllSelectionActions(): void {
    if (!selection) return;
    const nodes = THOUGHT_ACTIONS.map((action, index) => createThoughtNode(selection, action, index)).filter(
      (node): node is SpatialThoughtNode => Boolean(node)
    );
    if (nodes.length === 0) return;
    openSelectionContext(selection);
    setThoughtNodes((current) => [...current, ...nodes]);
    clearSelection();
  }

  function createSelectionNote(): void {
    if (!selection) return;
    const item = itemById.get(selection.itemId);
    if (!item) return;
    const timestamp = new Date().toISOString();
    const noteNode: SpatialThoughtNode = {
      id: createThoughtId('note'),
      itemId: item.frontmatter.id,
      actionId: 'note',
      label: '标注',
      sourceText: selection.text,
      sourceQuote: selection.quote,
      sourceWindowId: selection.sourceWindowId,
      sourceNodeId: selection.sourceNodeId,
      color: 'yellow',
      contentMarkdown: buildNoteContent(selection.text, item),
      position: getThoughtPosition(selection, 0, { width: 340, height: 240 }),
      size: { width: 340, height: 240 },
      status: 'open',
      zIndex: getNextZIndex(),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    openSelectionContext(selection);
    setThoughtNodes((current) => [...current, noteNode]);
    void Promise.resolve(onAnnotate?.(selection.itemId, selection.text)).catch((error) => {
      console.error('Failed to persist library annotation', error);
    });
    clearSelection();
  }

  function updateThoughtNode(nodeId: string, patch: Partial<SpatialThoughtNode>): void {
    setThoughtNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)));
  }

  function activateThoughtNode(nodeId: string): void {
    const raisedNodeIds = getThoughtSubtreeNodeIdsInRaiseOrder(thoughtNodes, nodeId);
    const zIndexById = allocateZIndexBlock(raisedNodeIds);
    if (zIndexById.size === 0) return;
    setThoughtNodes((current) =>
      current.map((node) => {
        const nextZIndex = zIndexById.get(node.id);
        return nextZIndex
          ? { ...node, status: 'open', zIndex: nextZIndex }
          : node;
      })
    );
  }

  function moveAttachedThoughtNodes(sourceWindowId: string, delta: SpatialPoint): void {
    if (delta.x === 0 && delta.y === 0) return;
    setThoughtNodes((current) => {
      const attachedNodeIds = new Set(
        current
          .filter((node) => node.sourceWindowId === sourceWindowId && !node.sourceNodeId)
          .map((node) => node.id)
      );
      const nodeIdsToMove = new Set(attachedNodeIds);
      attachedNodeIds.forEach((nodeId) => {
        getDescendantThoughtNodeIds(current, nodeId).forEach((descendantNodeId) => {
          nodeIdsToMove.add(descendantNodeId);
        });
      });

      return current.map((node) =>
        nodeIdsToMove.has(node.id)
          ? {
              ...node,
              position: {
                x: node.position.x + delta.x,
                y: node.position.y + delta.y
              }
            }
          : node
      );
    });
  }

  function moveReaderWindowWithAttachedNodes(windowId: string, position: SpatialPoint): void {
    const currentWindow = windows.find((window) => window.id === windowId);
    const delta = currentWindow
      ? {
          x: position.x - currentWindow.position.x,
          y: position.y - currentWindow.position.y
        }
      : { x: 0, y: 0 };
    updateWindow(windowId, { position });
    moveAttachedThoughtNodes(windowId, delta);
  }

  function moveThoughtNodeWithDescendants(nodeId: string, position: SpatialPoint): void {
    setThoughtNodes((current) => {
      const currentNode = current.find((node) => node.id === nodeId);
      const delta = currentNode
        ? {
            x: position.x - currentNode.position.x,
            y: position.y - currentNode.position.y
          }
        : { x: 0, y: 0 };
      const descendantNodeIds = getDescendantThoughtNodeIds(current, nodeId);
      return current.map((node) => {
        if (node.id === nodeId) return { ...node, position };
        if (!descendantNodeIds.has(node.id) || delta.x === 0 && delta.y === 0) return node;
        return {
          ...node,
          position: {
            x: node.position.x + delta.x,
            y: node.position.y + delta.y
          }
        };
      });
    });
  }

  return (
    <section
      ref={workspaceRef}
      className={cx(
        'relative flex min-h-0 flex-1 flex-col overflow-hidden bg-neutral-100 dark:bg-neutral-950',
        className
      )}
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-3 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
            {activeItem ? readerIcon(getLibraryReaderKind(activeItem)) : <BookOpenText size={16} />}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {activeItem?.frontmatter.title ?? '资料阅读'}
            </div>
            <div className="truncate text-[11px] text-neutral-500">
              {activeItem ? readerKindLabel(getLibraryReaderKind(activeItem)) : '选择资料'}
              {mode === 'space' ? ` · ${openWindowCount} 个窗口` : ''}
              {visibleThoughtNodeCount > 0 ? ` · ${visibleThoughtNodeCount} 个标注窗口` : ''}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex rounded border border-neutral-200 bg-neutral-50 p-0.5 dark:border-neutral-800 dark:bg-neutral-900">
            <button
              type="button"
              onClick={() => switchMode('reading')}
              className={cx(
                'inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs',
                mode === 'reading'
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              )}
            >
              <Rows3 size={14} />
              阅读
            </button>
            <button
              type="button"
              onClick={() => switchMode('space')}
              className={cx(
                'inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs',
                mode === 'space'
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              )}
            >
              <Grid3X3 size={14} />
              空间
            </button>
          </div>
          {mode === 'space' ? (
            <>
              <IconButton label="并排窗口" onClick={() => arrangeWindows('grid')}>
                <LayoutGrid size={15} />
              </IconButton>
              <IconButton label="纵向排列" onClick={() => arrangeWindows('rows')}>
                <Rows3 size={15} />
              </IconButton>
              <IconButton label="重置画布" onClick={() => setViewport(DEFAULT_VIEWPORT)}>
                <RotateCcw size={15} />
              </IconButton>
            </>
          ) : activeItem ? (
            <button
              type="button"
              onClick={() => onMarkRead?.(activeItem.frontmatter.id)}
              className="rounded border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-900"
            >
              标为已读
            </button>
          ) : null}
        </div>
      </header>

      {mode === 'reading' ? (
        <ReadingMode
          item={activeItem}
          thoughtNodes={activeItemThoughtNodes}
          onReaderSelection={handleReaderSelection}
          onActivateThought={activateThoughtNode}
        />
      ) : (
        <SpaceCanvas
          itemById={itemById}
          windows={windows}
          thoughtNodes={thoughtNodes}
          viewport={viewport}
          dropActive={dropActive}
          onViewportChange={setViewport}
          onDropActiveChange={setDropActive}
          onDropItem={openDroppedItem}
          onActivateWindow={activateWindow}
          onMoveWindow={moveReaderWindowWithAttachedNodes}
          onResizeWindow={(windowId, size) => updateWindow(windowId, { size })}
          onCloseWindow={(windowId) => updateWindow(windowId, { status: 'closed' })}
          onMinimizeWindow={(windowId) => updateWindow(windowId, { status: 'minimized' })}
          onDuplicateWindow={(windowId) => {
            const source = windows.find((window) => window.id === windowId);
            const item = source ? itemById.get(source.itemId) : null;
            if (!source || !item) return;
            openItemInSpace(
              item,
              {
                x: source.position.x + 40,
                y: source.position.y + 34
              },
              true
            );
          }}
          onReaderSelection={handleReaderSelection}
          onActivateThought={activateThoughtNode}
          onMoveThought={moveThoughtNodeWithDescendants}
          onResizeThought={(nodeId, size) => updateThoughtNode(nodeId, { size })}
          onCloseThought={(nodeId) => updateThoughtNode(nodeId, { status: 'closed' })}
          onMinimizeThought={(nodeId) => updateThoughtNode(nodeId, { status: 'minimized' })}
        />
      )}
      {mode === 'reading' && activeItem ? (
        <ReadingThoughtLayer
          item={activeItem}
          thoughtNodes={activeItemThoughtNodes}
          onActivateThought={activateThoughtNode}
          onMoveThought={moveThoughtNodeWithDescendants}
          onResizeThought={(nodeId, size) => updateThoughtNode(nodeId, { size })}
          onCloseThought={(nodeId) => updateThoughtNode(nodeId, { status: 'closed' })}
          onMinimizeThought={(nodeId) => updateThoughtNode(nodeId, { status: 'minimized' })}
          onReaderSelection={handleReaderSelection}
        />
      ) : null}
      <SelectionActionBar
        selection={selection}
        actions={THOUGHT_ACTIONS}
        onDismiss={clearSelection}
        onCreateNote={createSelectionNote}
        onRunAction={runSelectionAction}
        onRunAll={runAllSelectionActions}
      />
    </section>
  );
}

function ReadingMode({
  item,
  thoughtNodes,
  onReaderSelection,
  onActivateThought
}: {
  item: LibraryItem | null;
  thoughtNodes: SpatialThoughtNode[];
  onReaderSelection(selection: ReaderSelectionState): void;
  onActivateThought(nodeId: string): void;
}): JSX.Element {
  if (!item) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-neutral-50 text-sm text-neutral-500 dark:bg-neutral-950">
        选择一个资料库条目。
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-white dark:bg-neutral-950">
      <LibraryReaderSurface
        item={item}
        spacious
        thoughtNodes={thoughtNodes}
        onReaderSelection={onReaderSelection}
        onActivateThought={onActivateThought}
      />
    </div>
  );
}

function ReadingThoughtLayer({
  item,
  thoughtNodes,
  onActivateThought,
  onMoveThought,
  onResizeThought,
  onCloseThought,
  onMinimizeThought,
  onReaderSelection
}: {
  item: LibraryItem;
  thoughtNodes: SpatialThoughtNode[];
  onActivateThought(nodeId: string): void;
  onMoveThought(nodeId: string, position: SpatialPoint): void;
  onResizeThought(nodeId: string, size: SpatialSize): void;
  onCloseThought(nodeId: string): void;
  onMinimizeThought(nodeId: string): void;
  onReaderSelection(selection: ReaderSelectionState): void;
}): JSX.Element | null {
  const layerRef = useRef<HTMLDivElement>(null);
  const openThoughtNodes = thoughtNodes.filter((node) => node.status === 'open');
  const minimizedThoughtNodes = thoughtNodes.filter((node) => node.status === 'minimized');
  const visibleThoughtNodes = thoughtNodes.filter((node) => node.status !== 'closed');
  const childThoughtNodesBySourceId = useMemo(() => {
    const children = new Map<string, SpatialThoughtNode[]>();
    thoughtNodes.forEach((node) => {
      if (!node.sourceNodeId) return;
      const current = children.get(node.sourceNodeId) ?? [];
      current.push(node);
      children.set(node.sourceNodeId, current);
    });
    return children;
  }, [thoughtNodes]);

  if (visibleThoughtNodes.length === 0) return null;

  return (
    <div
      data-spatial-canvas
      className="pointer-events-none absolute inset-0 z-[360] overflow-hidden"
    >
      <div ref={layerRef} className="absolute left-0 top-0 min-h-full min-w-full">
        <ThoughtConnectionLines
          nodes={visibleThoughtNodes}
          readerWindowIds={[]}
          coordinateRootRef={layerRef}
          canvasZoom={1}
        />
        {openThoughtNodes.map((node) => (
          <SpatialThoughtWindow
            key={node.id}
            node={node}
            viewport={DEFAULT_VIEWPORT}
            sourceItem={item}
            onActivate={onActivateThought}
            onMove={onMoveThought}
            onResize={onResizeThought}
            onClose={onCloseThought}
            onMinimize={onMinimizeThought}
            onReaderSelection={onReaderSelection}
            childThoughtNodes={childThoughtNodesBySourceId.get(node.id) ?? EMPTY_THOUGHT_NODES}
            onActivateThought={onActivateThought}
          />
        ))}
      </div>

      <div
        data-spatial-interactive
        className="pointer-events-auto absolute left-3 top-16 z-[420] w-64 overflow-hidden rounded border border-amber-200 bg-white/95 text-amber-950 shadow-lg backdrop-blur dark:border-amber-900/60 dark:bg-neutral-950/95 dark:text-amber-100"
      >
        <div className="flex h-9 items-center justify-between border-b border-amber-200 px-3 text-xs font-semibold dark:border-amber-900/60">
          <span>标注窗口</span>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-100">
            {visibleThoughtNodes.length}
          </span>
        </div>
        <div className="max-h-52 overflow-y-auto p-1.5">
          {visibleThoughtNodes.map((node) => {
            const Icon = thoughtIcon(node.actionId);
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => onActivateThought(node.id)}
                className="flex w-full min-w-0 items-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-amber-50 dark:hover:bg-amber-950/50"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-100">
                  <Icon size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium">{node.label}</span>
                    <span className="shrink-0 rounded border border-amber-200 px-1 py-0.5 text-[10px] text-amber-700 dark:border-amber-900 dark:text-amber-200">
                      {node.status === 'minimized' ? '最小化' : '打开'}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-amber-800/70 dark:text-amber-100/60">
                    {clipText(node.sourceText, 44)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {minimizedThoughtNodes.length > 0 ? (
        <div className="pointer-events-auto absolute bottom-3 left-3 z-[410] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
          {minimizedThoughtNodes.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => onActivateThought(node.id)}
              className="inline-flex max-w-64 items-center gap-2 truncate rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-lg hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-950"
            >
              <NotebookPen size={15} />
              <span className="truncate">{node.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SpaceCanvas({
  itemById,
  windows,
  thoughtNodes,
  viewport,
  dropActive,
  onViewportChange,
  onDropActiveChange,
  onDropItem,
  onActivateWindow,
  onMoveWindow,
  onResizeWindow,
  onCloseWindow,
  onMinimizeWindow,
  onDuplicateWindow,
  onReaderSelection,
  onActivateThought,
  onMoveThought,
  onResizeThought,
  onCloseThought,
  onMinimizeThought
}: {
  itemById: Map<string, LibraryItem>;
  windows: SpatialReaderWindowState[];
  thoughtNodes: SpatialThoughtNode[];
  viewport: SpatialViewport;
  dropActive: boolean;
  onViewportChange(viewport: SpatialViewport): void;
  onDropActiveChange(active: boolean): void;
  onDropItem(itemId: string, client: SpatialPoint): void;
  onActivateWindow(windowId: string): void;
  onMoveWindow(windowId: string, position: SpatialPoint): void;
  onResizeWindow(windowId: string, size: SpatialSize): void;
  onCloseWindow(windowId: string): void;
  onMinimizeWindow(windowId: string): void;
  onDuplicateWindow(windowId: string): void;
  onReaderSelection(selection: ReaderSelectionState): void;
  onActivateThought(nodeId: string): void;
  onMoveThought(nodeId: string, position: SpatialPoint): void;
  onResizeThought(nodeId: string, size: SpatialSize): void;
  onCloseThought(nodeId: string): void;
  onMinimizeThought(nodeId: string): void;
}): JSX.Element {
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportLayerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ pointer: SpatialPoint; viewport: SpatialViewport } | null>(null);
  const openedHighlightOnPointerDownRef = useRef<string | null>(null);
  const [panning, setPanning] = useState(false);
  const openWindows = windows.filter((window) => window.status === 'open');
  const minimizedWindows = windows.filter((window) => window.status === 'minimized');
  const openThoughtNodes = thoughtNodes.filter((node) => node.status === 'open');
  const minimizedThoughtNodes = thoughtNodes.filter((node) => node.status === 'minimized');
  const visibleThoughtNodes = thoughtNodes.filter((node) => node.status !== 'closed');
  const openWindowIds = useMemo(() => openWindows.map((window) => window.id), [openWindows]);
  const thoughtNodeIds = useMemo(() => new Set(thoughtNodes.map((node) => node.id)), [thoughtNodes]);
  const childThoughtNodesBySourceId = useMemo(() => {
    const children = new Map<string, SpatialThoughtNode[]>();
    thoughtNodes.forEach((node) => {
      if (!node.sourceNodeId) return;
      const current = children.get(node.sourceNodeId) ?? [];
      current.push(node);
      children.set(node.sourceNodeId, current);
    });
    return children;
  }, [thoughtNodes]);

  useEffect(() => {
    if (!panning) return;

    function onPointerMove(event: PointerEvent): void {
      const start = panStartRef.current;
      if (!start) return;
      onViewportChange({
        ...start.viewport,
        x: start.viewport.x + event.clientX - start.pointer.x,
        y: start.viewport.y + event.clientY - start.pointer.y
      });
    }

    function onPointerUp(): void {
      panStartRef.current = null;
      setPanning(false);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [onViewportChange, panning]);

  function zoom(nextZoom: number, anchor?: SpatialPoint): void {
    const rect = canvasRef.current?.getBoundingClientRect();
    const localAnchor = anchor ?? { x: (rect?.width ?? 1000) / 2, y: (rect?.height ?? 700) / 2 };
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const worldX = (localAnchor.x - viewport.x) / viewport.zoom;
    const worldY = (localAnchor.y - viewport.y) / viewport.zoom;
    onViewportChange({
      x: localAnchor.x - worldX * clampedZoom,
      y: localAnchor.y - worldY * clampedZoom,
      zoom: clampedZoom
    });
  }

  function hasLibraryDrag(event: React.DragEvent): boolean {
    return Array.from(event.dataTransfer.types).some((type) =>
      [LIBRARY_ITEM_DRAG_MIME, 'application/json', 'text/plain'].includes(type)
    );
  }

  return (
    <div
      ref={canvasRef}
      data-spatial-canvas
      className={cx(
        'relative min-h-0 flex-1 overflow-hidden bg-neutral-100 dark:bg-neutral-950',
        panning && 'cursor-grabbing'
      )}
      onWheel={(event) => {
        if (!(event.metaKey || event.ctrlKey)) return;
        event.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect();
        zoom(viewport.zoom * Math.exp(-event.deltaY * 0.001), {
          x: event.clientX - (rect?.left ?? 0),
          y: event.clientY - (rect?.top ?? 0)
        });
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || isSpatialInteractive(event.target)) return;
        panStartRef.current = {
          pointer: { x: event.clientX, y: event.clientY },
          viewport
        };
        setPanning(true);
      }}
      onPointerDownCapture={(event) => {
        if (event.button !== 0) return;
        const nodeId = getThoughtHighlightNodeId(event.target, thoughtNodeIds);
        if (!nodeId) return;
        event.preventDefault();
        event.stopPropagation();
        openedHighlightOnPointerDownRef.current = nodeId;
        onActivateThought(nodeId);
      }}
      onClickCapture={(event) => {
        const nodeId = getThoughtHighlightNodeId(event.target, thoughtNodeIds);
        if (!nodeId) return;
        event.preventDefault();
        event.stopPropagation();
        if (openedHighlightOnPointerDownRef.current === nodeId) {
          openedHighlightOnPointerDownRef.current = null;
          return;
        }
        onActivateThought(nodeId);
      }}
      onDragEnter={(event) => {
        if (!hasLibraryDrag(event)) return;
        event.preventDefault();
        onDropActiveChange(true);
      }}
      onDragOver={(event) => {
        if (!hasLibraryDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        onDropActiveChange(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        onDropActiveChange(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropActiveChange(false);
        const itemId = readLibraryDragPayload(event.dataTransfer);
        if (itemId) onDropItem(itemId, { x: event.clientX, y: event.clientY });
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(115,115,115,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(115,115,115,0.14) 1px, transparent 1px)',
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          backgroundSize: `${48 * viewport.zoom}px ${48 * viewport.zoom}px`
        }}
      />

      <div
        ref={viewportLayerRef}
        className="absolute left-0 top-0 min-h-full min-w-full"
        style={{
          transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
          transformOrigin: '0 0'
        }}
      >
        <ThoughtConnectionLines
          nodes={thoughtNodes}
          readerWindowIds={openWindowIds}
          coordinateRootRef={viewportLayerRef}
          canvasZoom={viewport.zoom}
        />
        {openWindows.map((windowState) => {
          const item = itemById.get(windowState.itemId);
          if (!item) return null;
          return (
            <SpatialReaderWindow
              key={windowState.id}
              windowState={windowState}
              item={item}
              viewport={viewport}
              onActivate={onActivateWindow}
              onMove={onMoveWindow}
              onResize={onResizeWindow}
              onClose={onCloseWindow}
              onMinimize={onMinimizeWindow}
              onDuplicate={onDuplicateWindow}
              onReaderSelection={onReaderSelection}
              thoughtNodes={thoughtNodes}
              onActivateThought={onActivateThought}
            />
          );
        })}
        {openThoughtNodes.map((node) => (
          <SpatialThoughtWindow
            key={node.id}
            node={node}
            viewport={viewport}
            sourceItem={itemById.get(node.itemId) ?? null}
            onActivate={onActivateThought}
            onMove={onMoveThought}
            onResize={onResizeThought}
            onClose={onCloseThought}
            onMinimize={onMinimizeThought}
            onReaderSelection={onReaderSelection}
            childThoughtNodes={childThoughtNodesBySourceId.get(node.id) ?? EMPTY_THOUGHT_NODES}
            onActivateThought={onActivateThought}
          />
        ))}
      </div>

      <div className="pointer-events-auto absolute right-3 top-3 z-[400] flex items-center gap-1 rounded border border-neutral-200 bg-white/95 px-1.5 py-1 text-neutral-700 shadow-lg backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95 dark:text-neutral-200">
        <IconButton label="缩小画布" onClick={() => zoom(viewport.zoom - 0.1)}>
          <ZoomOut size={15} />
        </IconButton>
        <span className="w-11 text-center text-[11px] font-semibold tabular-nums">
          {Math.round(viewport.zoom * 100)}%
        </span>
        <IconButton label="放大画布" onClick={() => zoom(viewport.zoom + 0.1)}>
          <ZoomIn size={15} />
        </IconButton>
      </div>

      {visibleThoughtNodes.length > 0 ? (
        <div
          data-spatial-interactive
          className="pointer-events-auto absolute left-3 top-3 z-[400] w-64 overflow-hidden rounded border border-amber-200 bg-white/95 text-amber-950 shadow-lg backdrop-blur dark:border-amber-900/60 dark:bg-neutral-950/95 dark:text-amber-100"
        >
          <div className="flex h-9 items-center justify-between border-b border-amber-200 px-3 text-xs font-semibold dark:border-amber-900/60">
            <span>标注窗口</span>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-100">
              {visibleThoughtNodes.length}
            </span>
          </div>
          <div className="max-h-52 overflow-y-auto p-1.5">
            {visibleThoughtNodes.map((node) => {
              const Icon = thoughtIcon(node.actionId);
              const sourceItem = itemById.get(node.itemId);
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => onActivateThought(node.id)}
                  className="flex w-full min-w-0 items-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-amber-50 dark:hover:bg-amber-950/50"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-100">
                    <Icon size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium">{node.label}</span>
                      <span className="shrink-0 rounded border border-amber-200 px-1 py-0.5 text-[10px] text-amber-700 dark:border-amber-900 dark:text-amber-200">
                        {node.status === 'minimized' ? '最小化' : '打开'}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-amber-800/70 dark:text-amber-100/60">
                      {sourceItem?.frontmatter.title ?? '资料'} · {clipText(node.sourceText, 36)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {minimizedWindows.length > 0 || minimizedThoughtNodes.length > 0 ? (
        <div className="pointer-events-auto absolute bottom-3 left-3 z-[390] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
          {minimizedWindows.map((windowState) => {
            const item = itemById.get(windowState.itemId);
            if (!item) return null;
            return (
              <button
                key={windowState.id}
                type="button"
                onClick={() => onActivateWindow(windowState.id)}
                className="inline-flex max-w-64 items-center gap-2 truncate rounded border border-neutral-200 bg-white px-3 py-2 text-xs shadow-lg hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800"
              >
                {readerIcon(getLibraryReaderKind(item))}
                <span className="truncate">{item.frontmatter.title}</span>
              </button>
            );
          })}
          {minimizedThoughtNodes.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => onActivateThought(node.id)}
              className="inline-flex max-w-64 items-center gap-2 truncate rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-lg hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-950"
            >
              <NotebookPen size={15} />
              <span className="truncate">{node.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {dropActive ? (
        <div className="pointer-events-none absolute inset-4 z-[420] rounded-lg border-2 border-dashed border-sky-400 bg-sky-500/10" />
      ) : null}
    </div>
  );
}

function SpatialReaderWindow({
  windowState,
  item,
  viewport,
  onActivate,
  onMove,
  onResize,
  onClose,
  onMinimize,
  onDuplicate,
  onReaderSelection,
  thoughtNodes,
  onActivateThought
}: {
  windowState: SpatialReaderWindowState;
  item: LibraryItem;
  viewport: SpatialViewport;
  onActivate(windowId: string): void;
  onMove(windowId: string, position: SpatialPoint): void;
  onResize(windowId: string, size: SpatialSize): void;
  onClose(windowId: string): void;
  onMinimize(windowId: string): void;
  onDuplicate(windowId: string): void;
  onReaderSelection(selection: ReaderSelectionState): void;
  thoughtNodes: SpatialThoughtNode[];
  onActivateThought(nodeId: string): void;
}): JSX.Element {
  const dragStartRef = useRef<SpatialPoint | null>(null);
  const resizeStartRef = useRef<SpatialPoint | null>(null);
  const startPositionRef = useRef(windowState.position);
  const startSizeRef = useRef(windowState.size);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const kind = getLibraryReaderKind(item);

  useEffect(() => {
    if (!dragging) return;
    function onPointerMove(event: PointerEvent): void {
      const start = dragStartRef.current;
      if (!start) return;
      onMove(windowState.id, {
        x: startPositionRef.current.x + (event.clientX - start.x) / viewport.zoom,
        y: startPositionRef.current.y + (event.clientY - start.y) / viewport.zoom
      });
    }
    function onPointerUp(): void {
      dragStartRef.current = null;
      setDragging(false);
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [dragging, onMove, viewport.zoom, windowState.id]);

  useEffect(() => {
    if (!resizing) return;
    function onPointerMove(event: PointerEvent): void {
      const start = resizeStartRef.current;
      if (!start) return;
      onResize(windowState.id, {
        width: Math.max(MIN_WINDOW_SIZE.width, startSizeRef.current.width + (event.clientX - start.x) / viewport.zoom),
        height: Math.max(MIN_WINDOW_SIZE.height, startSizeRef.current.height + (event.clientY - start.y) / viewport.zoom)
      });
    }
    function onPointerUp(): void {
      resizeStartRef.current = null;
      setResizing(false);
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [onResize, resizing, viewport.zoom, windowState.id]);

  return (
    <section
      id={getSpatialReaderWindowElementId(windowState.id)}
      data-spatial-window
      data-spatial-interactive
      className={cx(
        'absolute flex min-h-[320px] min-w-[460px] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white text-neutral-950 shadow-[0_24px_70px_-34px_rgba(15,23,42,0.65),0_0_0_1px_rgba(229,229,229,0.7)] dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100',
        (dragging || resizing) && 'select-none'
      )}
      style={{
        left: windowState.position.x,
        top: windowState.position.y,
        width: windowState.size.width,
        height: windowState.size.height,
        zIndex: windowState.zIndex
      }}
      onPointerDownCapture={() => onActivate(windowState.id)}
    >
      <header className="flex h-10 shrink-0 items-center border-b border-neutral-200 bg-white px-3 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mr-3 flex items-center gap-1.5">
          <WindowDot label="关闭阅读窗口" tone="red" onClick={() => onClose(windowState.id)}>
            <X size={9} />
          </WindowDot>
          <WindowDot label="最小化阅读窗口" tone="yellow" onClick={() => onMinimize(windowState.id)}>
            <Minus size={9} />
          </WindowDot>
          <WindowDot label="复制阅读窗口" tone="green" onClick={() => onDuplicate(windowState.id)}>
            <Copy size={9} />
          </WindowDot>
        </div>
        <div
          className="flex min-w-0 flex-1 cursor-grab items-center justify-center gap-2 active:cursor-grabbing"
          onPointerDown={(event) => {
            if (event.button !== 0 || isNativeInteractive(event.target)) return;
            event.preventDefault();
            event.stopPropagation();
            onActivate(windowState.id);
            dragStartRef.current = { x: event.clientX, y: event.clientY };
            startPositionRef.current = windowState.position;
            setDragging(true);
          }}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
            {readerIcon(kind)}
          </span>
          <div className="min-w-0 text-center">
            <div className="truncate text-[13px] font-medium leading-none text-neutral-700 dark:text-neutral-200">
              {item.frontmatter.title}
            </div>
            <div className="mt-0.5 truncate text-[10px] text-neutral-400">
              {readerKindLabel(kind)}
            </div>
          </div>
        </div>
        <IconButton label="复制阅读窗口" onClick={() => onDuplicate(windowState.id)}>
          <Copy size={14} />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <LibraryReaderSurface
          item={item}
          sourceWindowId={windowState.id}
          thoughtNodes={thoughtNodes}
          onReaderSelection={onReaderSelection}
          onActivateThought={onActivateThought}
        />
      </div>
      <div
        data-spatial-interactive
        className="absolute bottom-0 right-0 h-7 w-7 cursor-nwse-resize"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          resizeStartRef.current = { x: event.clientX, y: event.clientY };
          startSizeRef.current = windowState.size;
          setResizing(true);
        }}
        aria-label="调整窗口大小"
      >
        <div className="absolute bottom-1.5 right-1.5 h-3 w-3 rounded-br border-b-2 border-r-2 border-neutral-400/70" />
      </div>
    </section>
  );
}

function SpatialThoughtWindow({
  node,
  viewport,
  sourceItem,
  onActivate,
  onMove,
  onResize,
  onClose,
  onMinimize,
  onReaderSelection,
  childThoughtNodes,
  onActivateThought
}: {
  node: SpatialThoughtNode;
  viewport: SpatialViewport;
  sourceItem: LibraryItem | null;
  onActivate(nodeId: string): void;
  onMove(nodeId: string, position: SpatialPoint): void;
  onResize(nodeId: string, size: SpatialSize): void;
  onClose(nodeId: string): void;
  onMinimize(nodeId: string): void;
  onReaderSelection(selection: ReaderSelectionState): void;
  childThoughtNodes: SpatialThoughtNode[];
  onActivateThought(nodeId: string): void;
}): JSX.Element {
  const dragStartRef = useRef<SpatialPoint | null>(null);
  const resizeStartRef = useRef<SpatialPoint | null>(null);
  const startPositionRef = useRef(node.position);
  const startSizeRef = useRef(node.size);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    function onPointerMove(event: PointerEvent): void {
      const start = dragStartRef.current;
      if (!start) return;
      onMove(node.id, {
        x: startPositionRef.current.x + (event.clientX - start.x) / viewport.zoom,
        y: startPositionRef.current.y + (event.clientY - start.y) / viewport.zoom
      });
    }
    function onPointerUp(): void {
      dragStartRef.current = null;
      setDragging(false);
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [dragging, node.id, onMove, viewport.zoom]);

  useEffect(() => {
    if (!resizing) return;
    function onPointerMove(event: PointerEvent): void {
      const start = resizeStartRef.current;
      if (!start) return;
      onResize(node.id, {
        width: Math.max(MIN_THOUGHT_SIZE.width, startSizeRef.current.width + (event.clientX - start.x) / viewport.zoom),
        height: Math.max(MIN_THOUGHT_SIZE.height, startSizeRef.current.height + (event.clientY - start.y) / viewport.zoom)
      });
    }
    function onPointerUp(): void {
      resizeStartRef.current = null;
      setResizing(false);
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [node.id, onResize, resizing, viewport.zoom]);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    renderReaderQuoteHighlights(root, childThoughtNodes);
    decorateThoughtHighlights(root, childThoughtNodes, onActivateThought);
  }, [childThoughtNodes, node.contentMarkdown, onActivateThought]);

  function captureThoughtSelection(): void {
    window.requestAnimationFrame(() => {
      const root = bodyRef.current;
      if (!root) return;
      const selection = getReaderSelectionFromRoot(
        node.itemId,
        root,
        node.sourceWindowId,
        node.id
      );
      if (selection) onReaderSelection(selection);
    });
  }

  const Icon = thoughtIcon(node.actionId);

  return (
    <section
      id={getThoughtWindowElementId(node.id)}
      data-spatial-interactive
      data-spatial-window
      className={cx(
        'pointer-events-auto absolute flex min-h-[220px] min-w-[300px] flex-col overflow-hidden rounded-lg border border-amber-200 bg-amber-50 text-amber-950 shadow-[0_22px_60px_-34px_rgba(120,53,15,0.65),0_0_0_1px_rgba(251,191,36,0.35)] dark:border-amber-900/60 dark:bg-amber-950 dark:text-amber-50',
        (dragging || resizing) && 'select-none'
      )}
      style={{
        left: node.position.x,
        top: node.position.y,
        width: node.size.width,
        height: node.size.height,
        zIndex: node.zIndex + 500
      }}
      onPointerDownCapture={() => onActivate(node.id)}
    >
      <header className="flex h-10 shrink-0 items-center border-b border-amber-200 bg-amber-50 px-3 dark:border-amber-900/60 dark:bg-amber-950">
        <div className="mr-3 flex items-center gap-1.5">
          <WindowDot label="关闭标注窗口" tone="red" onClick={() => onClose(node.id)}>
            <X size={9} />
          </WindowDot>
          <WindowDot label="最小化标注窗口" tone="yellow" onClick={() => onMinimize(node.id)}>
            <Minus size={9} />
          </WindowDot>
          <span className="h-3 w-3 rounded-full border border-amber-300 bg-amber-200 dark:border-amber-800 dark:bg-amber-900" />
        </div>
        <div
          className="flex min-w-0 flex-1 cursor-grab items-center justify-center gap-2 active:cursor-grabbing"
          onPointerDown={(event) => {
            if (event.button !== 0 || isNativeInteractive(event.target)) return;
            event.preventDefault();
            event.stopPropagation();
            onActivate(node.id);
            dragStartRef.current = { x: event.clientX, y: event.clientY };
            startPositionRef.current = node.position;
            setDragging(true);
          }}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/70 text-amber-700 dark:bg-amber-900/70 dark:text-amber-100">
            <Icon size={15} />
          </span>
          <div className="min-w-0 text-center">
            <div className="truncate text-[13px] font-semibold leading-none">{node.label}</div>
            <div className="mt-0.5 truncate text-[10px] text-amber-700/75 dark:text-amber-200/70">
              {sourceItem?.frontmatter.title ?? '资料标注'}
            </div>
          </div>
        </div>
      </header>
      <div
        ref={bodyRef}
        data-thought-window-body
        className="min-h-0 flex-1 overflow-auto px-4 py-3 text-sm leading-6"
        onPointerUp={captureThoughtSelection}
        onKeyUp={captureThoughtSelection}
      >
        <blockquote className="mb-3 border-l-2 border-amber-300 bg-white/60 py-1 pl-3 text-xs leading-5 text-amber-900/80 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100/80">
          {node.sourceText}
        </blockquote>
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <StreamingMarkdown content={node.contentMarkdown} />
        </div>
      </div>
      <div
        data-spatial-interactive
        className="absolute bottom-0 right-0 h-7 w-7 cursor-nwse-resize"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          resizeStartRef.current = { x: event.clientX, y: event.clientY };
          startSizeRef.current = node.size;
          setResizing(true);
        }}
        aria-label="调整标注窗口大小"
      >
        <div className="absolute bottom-1.5 right-1.5 h-3 w-3 rounded-br border-b-2 border-r-2 border-amber-500/70" />
      </div>
    </section>
  );
}

interface ReaderSelectionCaptureProps {
  sourceWindowId?: string;
  thoughtNodes?: SpatialThoughtNode[];
  onReaderSelection?(selection: ReaderSelectionState): void;
  onActivateThought?(nodeId: string): void;
}

function LibraryReaderSurface({
  item,
  spacious = false,
  sourceWindowId,
  thoughtNodes,
  onReaderSelection,
  onActivateThought
}: {
  item: LibraryItem;
  spacious?: boolean;
} & ReaderSelectionCaptureProps): JSX.Element {
  const kind = getLibraryReaderKind(item);
  const readerThoughtNodes = useMemo(
    () =>
      (thoughtNodes ?? EMPTY_THOUGHT_NODES).filter(
        (node) => node.itemId === item.frontmatter.id && !node.sourceNodeId
      ),
    [item.frontmatter.id, thoughtNodes]
  );
  if (kind === 'pdf') {
    return (
      <PdfReader
        item={item}
        spacious={spacious}
        sourceWindowId={sourceWindowId}
        thoughtNodes={readerThoughtNodes}
        onReaderSelection={onReaderSelection}
        onActivateThought={onActivateThought}
      />
    );
  }
  if (kind === 'video') {
    return (
      <VideoReader
        item={item}
        spacious={spacious}
        sourceWindowId={sourceWindowId}
        thoughtNodes={readerThoughtNodes}
        onReaderSelection={onReaderSelection}
        onActivateThought={onActivateThought}
      />
    );
  }
  if (kind === 'bookmark') {
    return (
      <BookmarkReader
        item={item}
        spacious={spacious}
        sourceWindowId={sourceWindowId}
        thoughtNodes={readerThoughtNodes}
        onReaderSelection={onReaderSelection}
        onActivateThought={onActivateThought}
      />
    );
  }
  return (
    <ArticleReader
      item={item}
      spacious={spacious}
      sourceWindowId={sourceWindowId}
      thoughtNodes={readerThoughtNodes}
      onReaderSelection={onReaderSelection}
      onActivateThought={onActivateThought}
    />
  );
}

function ArticleReader({
  item,
  spacious,
  sourceWindowId,
  thoughtNodes,
  onReaderSelection,
  onActivateThought
}: {
  item: LibraryItem;
  spacious?: boolean;
} & ReaderSelectionCaptureProps): JSX.Element {
  return (
    <ReaderScroll
      itemId={item.frontmatter.id}
      sourceWindowId={sourceWindowId}
      spacious={spacious}
      thoughtNodes={thoughtNodes}
      onReaderSelection={onReaderSelection}
      onActivateThought={onActivateThought}
    >
      <ReaderTitle item={item} />
      {item.body.trim() ? (
        <div className="mx-auto max-w-3xl text-[15px] leading-7 text-neutral-800 dark:text-neutral-100">
          <StreamingMarkdown content={item.body} />
        </div>
      ) : (
        <EmptyReaderBody item={item} />
      )}
    </ReaderScroll>
  );
}

function PdfReader({
  item,
  spacious,
  sourceWindowId,
  thoughtNodes,
  onReaderSelection,
  onActivateThought
}: {
  item: LibraryItem;
  spacious?: boolean;
} & ReaderSelectionCaptureProps): JSX.Element {
  const source = getLibraryReaderSource(item);
  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-neutral-950">
      {source ? (
        <iframe
          src={source}
          title={item.frontmatter.title}
          className="min-h-0 flex-1 border-0 bg-neutral-100 dark:bg-neutral-900"
        />
      ) : null}
      <div className={cx('shrink-0 border-t border-neutral-200 dark:border-neutral-800', source ? 'max-h-[36%] overflow-auto' : 'min-h-0 flex-1 overflow-auto')}>
        <ReaderScroll
          itemId={item.frontmatter.id}
          sourceWindowId={sourceWindowId}
          spacious={spacious}
          compact={Boolean(source)}
          thoughtNodes={thoughtNodes}
          onReaderSelection={onReaderSelection}
          onActivateThought={onActivateThought}
        >
          <ReaderTitle item={item} />
          {item.body.trim() ? <StreamingMarkdown content={item.body} /> : <EmptyReaderBody item={item} />}
        </ReaderScroll>
      </div>
    </div>
  );
}

function VideoReader({
  item,
  spacious,
  sourceWindowId,
  thoughtNodes,
  onReaderSelection,
  onActivateThought
}: {
  item: LibraryItem;
  spacious?: boolean;
} & ReaderSelectionCaptureProps): JSX.Element {
  const source = getLibraryReaderSource(item);
  const embed = getYouTubeEmbedUrl(source);
  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-neutral-950">
      {embed ? (
        <iframe
          src={embed}
          title={item.frontmatter.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="aspect-video w-full shrink-0 border-0 bg-black"
        />
      ) : source ? (
        <video src={source} controls className="aspect-video w-full shrink-0 bg-black" />
      ) : null}
      <ReaderScroll
        itemId={item.frontmatter.id}
        sourceWindowId={sourceWindowId}
        spacious={spacious}
        compact
        thoughtNodes={thoughtNodes}
        onReaderSelection={onReaderSelection}
        onActivateThought={onActivateThought}
      >
        <ReaderTitle item={item} />
        {item.body.trim() ? <StreamingMarkdown content={item.body} /> : <EmptyReaderBody item={item} />}
      </ReaderScroll>
    </div>
  );
}

function BookmarkReader({
  item,
  spacious,
  sourceWindowId,
  thoughtNodes,
  onReaderSelection,
  onActivateThought
}: {
  item: LibraryItem;
  spacious?: boolean;
} & ReaderSelectionCaptureProps): JSX.Element {
  const source = getLibraryReaderSource(item);
  return (
    <ReaderScroll
      itemId={item.frontmatter.id}
      sourceWindowId={sourceWindowId}
      spacious={spacious}
      thoughtNodes={thoughtNodes}
      onReaderSelection={onReaderSelection}
      onActivateThought={onActivateThought}
    >
      <ReaderTitle item={item} />
      {source ? (
        <a
          href={source}
          target="_blank"
          rel="noreferrer"
          className="mx-auto mb-5 flex max-w-3xl items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm hover:bg-white dark:border-neutral-800 dark:bg-neutral-900/70 dark:hover:bg-neutral-900"
        >
          <ExternalLink size={16} className="mt-0.5 shrink-0 text-neutral-500" />
          <span className="min-w-0">
            <span className="block font-medium text-neutral-900 dark:text-neutral-100">{item.frontmatter.title}</span>
            <span className="mt-1 block break-all text-xs text-neutral-500">{source}</span>
          </span>
        </a>
      ) : null}
      {item.body.trim() ? (
        <div className="mx-auto max-w-3xl">
          <StreamingMarkdown content={item.body} />
        </div>
      ) : (
        <EmptyReaderBody item={item} />
      )}
    </ReaderScroll>
  );
}

function ReaderScroll({
  children,
  itemId,
  sourceWindowId,
  onReaderSelection,
  onActivateThought,
  thoughtNodes = EMPTY_THOUGHT_NODES,
  spacious,
  compact
}: {
  children: ReactNode;
  itemId: string;
  sourceWindowId?: string;
  onReaderSelection?(selection: ReaderSelectionState): void;
  onActivateThought?(nodeId: string): void;
  thoughtNodes?: SpatialThoughtNode[];
  spacious?: boolean;
  compact?: boolean;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    renderReaderQuoteHighlights(root, thoughtNodes);
    if (onActivateThought) decorateThoughtHighlights(root, thoughtNodes, onActivateThought);
  }, [children, onActivateThought, thoughtNodes]);

  function captureSelection(): void {
    if (!onReaderSelection) return;
    window.requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root) return;
      const selection = getReaderSelectionFromRoot(itemId, root, sourceWindowId);
      if (selection) onReaderSelection(selection);
    });
  }

  return (
    <div
      ref={rootRef}
      data-spatial-reader-viewport
      className={cx(
        'h-full min-h-0 overflow-auto bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100',
        spacious ? 'px-8 py-8' : compact ? 'px-4 py-4' : 'px-5 py-5'
      )}
      onPointerUp={captureSelection}
      onKeyUp={captureSelection}
    >
      {children}
    </div>
  );
}

function ReaderTitle({ item }: { item: LibraryItem }): JSX.Element {
  const source = getLibraryReaderSource(item);
  return (
    <div className="mx-auto mb-5 max-w-3xl">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
        <span className="rounded border border-neutral-200 px-2 py-0.5 dark:border-neutral-800">
          {readerKindLabel(getLibraryReaderKind(item))}
        </span>
        <span>{statusLabel(item.frontmatter.status)}</span>
        {typeof item.frontmatter.reading_progress === 'number' ? (
          <span>{Math.round(item.frontmatter.reading_progress * 100)}%</span>
        ) : null}
      </div>
      <h2 className="mt-2 text-xl font-semibold leading-7 text-neutral-950 dark:text-neutral-50">
        {item.frontmatter.title}
      </h2>
      {source ? (
        <a
          href={source}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate text-xs text-sky-600 hover:underline dark:text-sky-400"
        >
          <ExternalLink size={13} />
          <span className="truncate">{source}</span>
        </a>
      ) : null}
    </div>
  );
}

function EmptyReaderBody({ item }: { item: LibraryItem }): JSX.Element {
  return (
    <div className="mx-auto max-w-3xl rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/60">
      {item.frontmatter.url ? '当前条目只有来源链接，尚未保存可阅读正文。' : '当前条目没有正文。'}
    </div>
  );
}

function SelectionActionBar({
  selection,
  actions,
  onDismiss,
  onCreateNote,
  onRunAction,
  onRunAll
}: {
  selection: ReaderSelectionState | null;
  actions: SelectionActionDefinition[];
  onDismiss(): void;
  onCreateNote(): void;
  onRunAction(action: SelectionActionDefinition): void;
  onRunAll(): void;
}): JSX.Element | null {
  useEffect(() => {
    if (!selection) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onDismiss();
    }
    function onPointerDown(event: PointerEvent): void {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('[data-selection-action-bar]')) return;
      onDismiss();
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [onDismiss, selection]);

  if (!selection) return null;
  const position = getSelectionToolbarPosition(selection);

  return (
    <div
      className="fixed z-[1000] inline-flex max-w-[calc(100vw-2rem)] items-center gap-1.5 overflow-x-auto rounded-[18px] border border-neutral-200/90 bg-white/95 p-1 shadow-[0_14px_24px_-18px_rgba(15,23,42,0.28),0_6px_14px_-12px_rgba(15,23,42,0.16)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95"
      style={position}
      data-spatial-interactive
      data-selection-action-bar
    >
      <SelectionActionButton
        label="标记"
        icon={Highlighter}
        iconClassName="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
        onClick={onCreateNote}
      />
      {actions.map((action) => (
        <SelectionActionButton
          key={action.id}
          label={action.label}
          title={action.description}
          icon={action.icon}
          iconClassName={action.iconClassName}
          onClick={() => onRunAction(action)}
        />
      ))}
      <SelectionActionButton
        label="AI Explain"
        icon={Sparkles}
        iconClassName="bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200"
        onClick={onRunAll}
      />
    </div>
  );
}

function SelectionActionButton({
  label,
  title,
  icon: Icon,
  iconClassName,
  onClick
}: {
  label: string;
  title?: string;
  icon: LucideIcon;
  iconClassName: string;
  onClick(): void;
}): JSX.Element {
  function preserveSelection(event: ReactMouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      onMouseDown={preserveSelection}
      onClick={onClick}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-2.5 text-xs font-semibold text-neutral-600 shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/35 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
    >
      <span className={cx('flex h-6 w-6 items-center justify-center rounded-lg', iconClassName)}>
        <Icon size={15} />
      </span>
      {label}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  children
}: {
  label: string;
  onClick(): void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      {children}
    </button>
  );
}

function WindowDot({
  label,
  tone,
  onClick,
  children
}: {
  label: string;
  tone: 'red' | 'yellow' | 'green';
  onClick(): void;
  children: ReactNode;
}): JSX.Element {
  const toneClass =
    tone === 'red'
      ? 'border-[#e0443e] bg-[#ff5f56]'
      : tone === 'yellow'
        ? 'border-[#dea123] bg-[#ffbd2e]'
        : 'border-[#1aab29] bg-[#27c93f]';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cx(
        'flex h-3 w-3 items-center justify-center rounded-full border text-transparent transition hover:text-black/50',
        toneClass
      )}
    >
      {children}
    </button>
  );
}

function getReaderSelectionFromRoot(
  itemId: string,
  root: HTMLElement,
  sourceWindowId?: string,
  sourceNodeId?: string
): ReaderSelectionState | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const rawText = selection.toString();
  const text = rawText.trim();
  if (!text) return null;
  const rect = getRangeAnchorRect(range);
  if (!rect) return null;
  const quote = getRangeQuoteContext(root, range, rawText, text);
  return {
    itemId,
    text,
    quote,
    sourceWindowId,
    sourceNodeId,
    anchorRect: rect
  };
}

function getTextOffset(root: Node, target: Node, targetOffset: number): number | null {
  let offset = 0;
  let found = false;

  function visit(node: Node): boolean {
    if (node === target) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += targetOffset;
      } else {
        const children = Array.from(node.childNodes).slice(0, targetOffset);
        offset += children.reduce((sum, child) => sum + (child.textContent?.length ?? 0), 0);
      }
      found = true;
      return true;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length ?? 0;
      return false;
    }

    for (const child of Array.from(node.childNodes)) {
      if (visit(child)) return true;
    }
    return false;
  }

  visit(root);
  return found ? offset : null;
}

function getRangeQuoteContext(
  root: HTMLElement,
  range: Range,
  rawText: string,
  text: string
): ReaderQuoteAnchor {
  const wholeText = root.textContent ?? '';
  const startOffset = getTextOffset(root, range.startContainer, range.startOffset);
  const endOffset = getTextOffset(root, range.endContainer, range.endOffset);

  if (startOffset === null || endOffset === null) {
    return { exact: text };
  }

  const leadingTrim = rawText.length - rawText.trimStart().length;
  const trailingTrim = rawText.length - rawText.trimEnd().length;
  const startIndex = startOffset + leadingTrim;
  const endIndex = Math.max(startIndex, endOffset - trailingTrim);

  return {
    exact: wholeText.slice(startIndex, endIndex).trim() || text,
    prefix: wholeText.slice(Math.max(0, startIndex - 80), startIndex),
    suffix: wholeText.slice(endIndex, endIndex + 80)
  };
}

function getRangeAnchorRect(range: Range): ReaderSelectionState['anchorRect'] | null {
  const rangeRect = range.getBoundingClientRect();
  if (rangeRect.width > 0 || rangeRect.height > 0) return toPlainRect(rangeRect);

  for (const rect of Array.from(range.getClientRects())) {
    if (rect.width > 0 || rect.height > 0) return toPlainRect(rect);
  }
  return null;
}

function toPlainRect(rect: DOMRect): ReaderSelectionState['anchorRect'] {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };
}

function getSelectionToolbarPosition(selection: ReaderSelectionState): {
  left: number;
  top: number;
  transform: string;
} {
  const rect = selection.anchorRect;
  const above = rect.top > 80;
  return {
    left: rect.left + rect.width / 2,
    top: above ? rect.top - 12 : rect.bottom + 12,
    transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'
  };
}

function getThoughtHighlightElementId(nodeId: string): string {
  return `spatial-highlight-${nodeId}`;
}

function getThoughtWindowElementId(nodeId: string): string {
  return `spatial-thought-window-${nodeId}`;
}

function getSpatialReaderWindowElementId(windowId: string): string {
  return `spatial-reader-window-${windowId}`;
}

function escapeCssIdent(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function clearReaderHighlights(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(HIGHLIGHT_SELECTOR).forEach((node) => {
    const parent = node.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(node.textContent ?? ''), node);
    parent.normalize();
  });
}

function collectHighlightTextSegments(root: HTMLElement): HighlightTextSegment[] {
  const segments: HighlightTextSegment[] = [];
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(HIGHLIGHT_SELECTOR)) return NodeFilter.FILTER_REJECT;
      if (['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const text = node.textContent ?? '';
    segments.push({ node, text, start: offset, end: offset + text.length });
    offset += text.length;
  }
  return segments;
}

function normalizeHighlightText(text: string): NormalizedHighlightText {
  const normalizedChars: string[] = [];
  const map: NormalizedHighlightText['map'] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (/\s/.test(char)) {
      let whitespaceEnd = index + 1;
      while (whitespaceEnd < text.length && /\s/.test(text[whitespaceEnd])) {
        whitespaceEnd += 1;
      }
      if (normalizedChars.length > 0 && whitespaceEnd < text.length) {
        normalizedChars.push(' ');
        map.push({ rawStart: index, rawEnd: whitespaceEnd });
      }
      index = whitespaceEnd;
      continue;
    }
    normalizedChars.push(char);
    map.push({ rawStart: index, rawEnd: index + 1 });
    index += 1;
  }

  return { text: normalizedChars.join(''), map };
}

function rangesOverlap(a: HighlightMatchRange, b: HighlightMatchRange): boolean {
  return a.start < b.end && b.start < a.end;
}

function commonSuffixLength(a: string, b: string): number {
  let length = 0;
  while (
    length < a.length &&
    length < b.length &&
    a[a.length - 1 - length] === b[b.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}

function commonPrefixLength(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) {
    length += 1;
  }
  return length;
}

function scoreQuoteContext(
  normalizedContent: NormalizedHighlightText,
  matchIndex: number,
  quoteLength: number,
  context?: Pick<ReaderQuoteAnchor, 'prefix' | 'suffix'>
): number {
  const prefix = normalizeHighlightText(context?.prefix ?? '').text;
  const suffix = normalizeHighlightText(context?.suffix ?? '').text;
  let score = 0;

  if (prefix) {
    const before = normalizedContent.text.slice(0, matchIndex).trimEnd();
    if (!before.endsWith(prefix)) score += prefix.length - commonSuffixLength(before, prefix);
  }
  if (suffix) {
    const after = normalizedContent.text.slice(matchIndex + quoteLength).trimStart();
    if (!after.startsWith(suffix)) score += suffix.length - commonPrefixLength(after, suffix);
  }
  return score;
}

function findHighlightQuoteMatch(
  contentText: string,
  quote: string,
  claimedRanges: HighlightMatchRange[] = [],
  context?: Pick<ReaderQuoteAnchor, 'prefix' | 'suffix'>
): HighlightMatchRange | null {
  const normalizedContent = normalizeHighlightText(contentText);
  const normalizedQuote = normalizeHighlightText(quote).text;
  if (!normalizedQuote || normalizedContent.text.length === 0) return null;

  let searchStart = 0;
  let bestMatch: { match: HighlightMatchRange; score: number } | null = null;
  while (searchStart < normalizedContent.text.length) {
    const matchIndex = normalizedContent.text.indexOf(normalizedQuote, searchStart);
    if (matchIndex === -1) return bestMatch?.match ?? null;
    const first = normalizedContent.map[matchIndex];
    const last = normalizedContent.map[matchIndex + normalizedQuote.length - 1];
    if (!first || !last) return bestMatch?.match ?? null;
    const match = { start: first.rawStart, end: last.rawEnd };

    if (!claimedRanges.some((claimed) => rangesOverlap(claimed, match))) {
      const score = scoreQuoteContext(normalizedContent, matchIndex, normalizedQuote.length, context);
      if (!bestMatch || score < bestMatch.score) {
        bestMatch = { match, score };
        if (score === 0 || (!context?.prefix && !context?.suffix)) return match;
      }
    }
    searchStart = matchIndex + 1;
  }

  return bestMatch?.match ?? null;
}

function wrapHighlightSegment(
  node: Text,
  thoughtNode: SpatialThoughtNode,
  startOffset: number,
  endOffset: number
): void {
  if (!node.parentNode || startOffset >= endOffset) return;
  const targetNode = startOffset > 0 ? node.splitText(startOffset) : node;
  targetNode.splitText(endOffset - startOffset);

  const highlight = document.createElement('mark');
  highlight.dataset.readerAnnotationId = thoughtNode.id;
  highlight.className = `${highlightClassByColor[thoughtNode.color]} cursor-pointer`;
  highlight.textContent = targetNode.textContent;
  targetNode.parentNode?.replaceChild(highlight, targetNode);
}

function applyHighlightMatch(
  segments: HighlightTextSegment[],
  node: SpatialThoughtNode,
  match: HighlightMatchRange
): void {
  segments
    .filter((segment) => segment.end > match.start && segment.start < match.end)
    .sort((a, b) => b.start - a.start)
    .forEach((segment) => {
      const localStart = Math.max(0, match.start - segment.start);
      const localEnd = Math.min(segment.text.length, match.end - segment.start);
      wrapHighlightSegment(segment.node, node, localStart, localEnd);
    });
}

function renderReaderQuoteHighlights(root: HTMLElement | null, nodes: SpatialThoughtNode[]): void {
  if (!root) return;
  clearReaderHighlights(root);
  const segments = collectHighlightTextSegments(root);
  const contentText = segments.map((segment) => segment.text).join('');
  const claimedRanges: HighlightMatchRange[] = [];
  const plannedHighlights = nodes
    .map((node) => {
      const quote = node.sourceQuote.exact.trim();
      if (!quote) return null;
      const match = findHighlightQuoteMatch(contentText, quote, claimedRanges, {
        prefix: node.sourceQuote.prefix,
        suffix: node.sourceQuote.suffix
      });
      if (!match) return null;
      claimedRanges.push(match);
      return { node, match };
    })
    .filter((planned): planned is { node: SpatialThoughtNode; match: HighlightMatchRange } =>
      Boolean(planned)
    )
    .sort((a, b) => b.match.start - a.match.start);

  plannedHighlights.forEach(({ node, match }) => applyHighlightMatch(segments, node, match));
}

function decorateThoughtHighlights(
  root: HTMLElement | null,
  nodes: SpatialThoughtNode[],
  onOpenNode: (nodeId: string) => void
): void {
  if (!root) return;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const seen = new Set<string>();
  root.querySelectorAll<HTMLElement>(HIGHLIGHT_SELECTOR).forEach((element) => {
    const nodeId = element.dataset.readerAnnotationId;
    if (!nodeId || !nodeIds.has(nodeId)) return;
    element.dataset.readerThoughtId = nodeId;
    element.title = '点击打开对应标注窗口';
    if (!seen.has(nodeId)) {
      element.id = getThoughtHighlightElementId(nodeId);
      seen.add(nodeId);
    }
    element.onclick = (event) => {
      event.stopPropagation();
      onOpenNode(nodeId);
    };
  });
}

function getThoughtHighlightNodeId(target: EventTarget | null, nodeIds: Set<string>): string | null {
  if (!(target instanceof HTMLElement)) return null;
  if (target.closest('button, a, input, textarea, select')) return null;
  const highlight = target.closest<HTMLElement>(
    '[data-reader-thought-id], [data-reader-annotation-id]'
  );
  const nodeId = highlight?.dataset.readerThoughtId ?? highlight?.dataset.readerAnnotationId;
  return nodeId && nodeIds.has(nodeId) ? nodeId : null;
}

function getElementCenter(element: Element): SpatialPoint {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function getElementZIndex(element: Element): number {
  const zIndex = Number.parseInt(window.getComputedStyle(element).zIndex, 10);
  return Number.isFinite(zIndex) ? zIndex : 0;
}

function getRectCenter(rect: DOMRect): SpatialPoint {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function getDistanceSquared(a: SpatialPoint, b: SpatialPoint): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function intersects(a: DOMRect, b: DOMRect): boolean {
  return a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right;
}

function getHighlightElements(root: ParentNode, node: SpatialThoughtNode): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      [
        `#${escapeCssIdent(getThoughtHighlightElementId(node.id))}`,
        `[data-reader-thought-id="${escapeCssIdent(node.id)}"]`,
        `[data-reader-annotation-id="${escapeCssIdent(node.id)}"]`
      ].join(',')
    )
  );
}

function getNearestHighlightPoint(
  highlightRects: DOMRect[],
  targetElement: Element
): SpatialPoint | null {
  const targetCenter = getElementCenter(targetElement);
  if (highlightRects.length === 0) return null;
  const nearestRect = highlightRects.reduce((nearest, rect) =>
    getDistanceSquared(getRectCenter(rect), targetCenter) <
    getDistanceSquared(getRectCenter(nearest), targetCenter)
      ? rect
      : nearest
  );
  return getRectCenter(nearestRect);
}

function getVisibleHighlightInRoot({
  node,
  root,
  viewportRect,
  zIndex
}: {
  node: SpatialThoughtNode;
  root: ParentNode;
  viewportRect: DOMRect;
  zIndex: number;
}): { point: SpatialPoint; zIndex: number } | null {
  const highlightRects = getHighlightElements(root, node).flatMap((element) =>
    Array.from(element.getClientRects()).filter(
      (rect) => rect.width > 0 && rect.height > 0 && intersects(rect, viewportRect)
    )
  );
  const targetElement = document.getElementById(getThoughtWindowElementId(node.id));
  if (!targetElement) return null;
  const point = getNearestHighlightPoint(highlightRects, targetElement);
  return point ? { point, zIndex } : null;
}

function getReaderViewportRect(readerElement: HTMLElement): DOMRect {
  const viewportElement = readerElement.querySelector<HTMLElement>('[data-spatial-reader-viewport]');
  return (viewportElement ?? readerElement).getBoundingClientRect();
}

function getThoughtWindowViewportRect(windowElement: HTMLElement): DOMRect {
  const viewportElement = windowElement.querySelector<HTMLElement>('[data-thought-window-body]');
  return (viewportElement ?? windowElement).getBoundingClientRect();
}

function getVisibleReaderHighlight(
  node: SpatialThoughtNode,
  readerWindowIds: string[]
): { point: SpatialPoint; zIndex: number } | null {
  const readerWindowId = node.sourceWindowId ?? readerWindowIds[0];
  if (
    node.sourceWindowId &&
    readerWindowIds.length > 0 &&
    !readerWindowIds.includes(node.sourceWindowId)
  ) {
    return null;
  }
  const readerElement = readerWindowId
    ? document.getElementById(getSpatialReaderWindowElementId(readerWindowId))
    : null;
  if (readerWindowId && !readerElement && readerWindowIds.length > 0) return null;
  const searchRoot: ParentNode = readerElement ?? document;
  if (getHighlightElements(searchRoot, node).length === 0) return null;
  return getVisibleHighlightInRoot({
    node,
    root: searchRoot,
    viewportRect: readerElement ? getReaderViewportRect(readerElement) : new DOMRect(0, 0, window.innerWidth, window.innerHeight),
    zIndex: readerElement ? getElementZIndex(readerElement) : 0
  });
}

function getVisibleThoughtWindowHighlight(
  node: SpatialThoughtNode,
  sourceNode: SpatialThoughtNode
): { point: SpatialPoint; zIndex: number } | null {
  const sourceElement = document.getElementById(getThoughtWindowElementId(sourceNode.id));
  if (!sourceElement) return null;
  return getVisibleHighlightInRoot({
    node,
    root: sourceElement,
    viewportRect: getThoughtWindowViewportRect(sourceElement),
    zIndex: sourceNode.zIndex + 500
  });
}

function resolveConnectionSourceAnchor(
  node: SpatialThoughtNode,
  nodes: SpatialThoughtNode[],
  readerWindowIds: string[]
): { point: SpatialPoint; zIndex: number } | null {
  if (node.sourceNodeId) {
    const sourceNode = nodes.find((candidate) => candidate.id === node.sourceNodeId);
    if (!sourceNode || sourceNode.status !== 'open') return null;
    return getVisibleThoughtWindowHighlight(node, sourceNode);
  }
  return getVisibleReaderHighlight(node, readerWindowIds);
}

function screenPointToCanvasPoint(
  point: SpatialPoint,
  coordinateRoot: HTMLElement,
  canvasZoom: number
): SpatialPoint {
  const rootRect = coordinateRoot.getBoundingClientRect();
  const zoom = Math.max(0.2, canvasZoom);
  return {
    x: (point.x - rootRect.left) / zoom,
    y: (point.y - rootRect.top) / zoom
  };
}

function getWindowDockPoint(
  element: Element,
  source: SpatialPoint,
  canvasZoom: number
): SpatialPoint {
  const rect = element.getBoundingClientRect();
  const useRightEdge = source.x > rect.left + rect.width / 2;
  return {
    x: useRightEdge ? rect.right : rect.left,
    y: rect.top + WINDOW_HEADER_DOCK_Y * Math.max(0.2, canvasZoom)
  };
}

function getThoughtConnectionZIndex(sourceZIndex: number, targetZIndex: number): number {
  return targetZIndex < sourceZIndex ? Math.max(0, targetZIndex - 1) : sourceZIndex + 1;
}

function areConnectionsEqual(current: ThoughtConnection[], next: ThoughtConnection[]): boolean {
  if (current.length !== next.length) return false;
  return current.every((connection, index) => {
    const nextConnection = next[index];
    return (
      connection.id === nextConnection.id &&
      connection.colorClass === nextConnection.colorClass &&
      connection.zIndex === nextConnection.zIndex &&
      connection.from.x === nextConnection.from.x &&
      connection.from.y === nextConnection.from.y &&
      connection.to.x === nextConnection.to.x &&
      connection.to.y === nextConnection.to.y
    );
  });
}

function ThoughtConnectionLines({
  nodes,
  readerWindowIds,
  coordinateRootRef,
  canvasZoom
}: {
  nodes: SpatialThoughtNode[];
  readerWindowIds: string[];
  coordinateRootRef: RefObject<HTMLElement | null>;
  canvasZoom: number;
}): JSX.Element {
  const [connections, setConnections] = useState<ThoughtConnection[]>([]);

  useEffect(() => {
    let frameId = 0;
    const update = (): void => {
      frameId = 0;
      const coordinateRoot = coordinateRootRef.current;
      if (!coordinateRoot) {
        setConnections([]);
        return;
      }

      const nextConnections = nodes
        .filter((node) => node.status === 'open')
        .map((node): ThoughtConnection | null => {
          const targetElement = document.getElementById(getThoughtWindowElementId(node.id));
          if (!targetElement) return null;
          const source = resolveConnectionSourceAnchor(node, nodes, readerWindowIds);
          if (!source) return null;
          const from = screenPointToCanvasPoint(source.point, coordinateRoot, canvasZoom);
          const to = screenPointToCanvasPoint(
            getWindowDockPoint(targetElement, source.point, canvasZoom),
            coordinateRoot,
            canvasZoom
          );
          const targetZIndex = node.zIndex + 500;
          return {
            id: node.id,
            from,
            to,
            colorClass: connectionColorClassByAction[node.actionId],
            zIndex: getThoughtConnectionZIndex(source.zIndex, targetZIndex)
          };
        })
        .filter((connection): connection is ThoughtConnection => Boolean(connection));

      setConnections((current) =>
        areConnectionsEqual(current, nextConnections) ? current : nextConnections
      );
    };

    const scheduleUpdate = (): void => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(update);
    };

    scheduleUpdate();
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);
    const coordinateRoot = coordinateRootRef.current;
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleUpdate);
    if (coordinateRoot && resizeObserver) resizeObserver.observe(coordinateRoot);
    const mutationObserver =
      coordinateRoot && typeof MutationObserver !== 'undefined'
        ? new MutationObserver(scheduleUpdate)
        : null;
    if (coordinateRoot && mutationObserver) {
      mutationObserver.observe(coordinateRoot, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['id', 'data-reader-annotation-id', 'data-reader-thought-id', 'style']
      });
    }

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [canvasZoom, coordinateRootRef, nodes, readerWindowIds]);

  return (
    <>
      {connections.map((connection) => {
        const midX = connection.from.x + (connection.to.x - connection.from.x) / 2;
        const path = `M ${connection.from.x} ${connection.from.y} C ${midX} ${connection.from.y}, ${midX} ${connection.to.y}, ${connection.to.x} ${connection.to.y}`;
        return (
          <svg
            key={connection.id}
            className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-visible"
            style={{ zIndex: connection.zIndex }}
          >
            <path
              d={path}
              className={`${connection.colorClass} fill-none opacity-80 drop-shadow-sm`}
              strokeWidth={2.5}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        );
      })}
    </>
  );
}

function buildThoughtContent(
  label: string,
  text: string,
  item: LibraryItem,
  points: string[]
): string {
  const clipped = clipText(text, 900);
  return [
    `## ${label}`,
    '',
    `**来源**：${item.frontmatter.title}`,
    '',
    '### 选区',
    quoteMarkdown(clipped),
    '',
    '### 处理要点',
    ...points.map((point) => `- ${point}`)
  ].join('\n');
}

function buildNoteContent(text: string, item: LibraryItem): string {
  return [
    '## 标注',
    '',
    `**来源**：${item.frontmatter.title}`,
    '',
    quoteMarkdown(clipText(text, 900))
  ].join('\n');
}

function quoteMarkdown(text: string): string {
  return text
    .trim()
    .split(/\n+/)
    .map((line) => `> ${line}`)
    .join('\n');
}

function clipText(text: string, maxLength: number): string {
  const normalized = text.trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function thoughtIcon(actionId: SpatialThoughtNode['actionId']): LucideIcon {
  if (actionId === 'translate') return Languages;
  if (actionId === 'explain') return BookA;
  if (actionId === 'formula') return Braces;
  if (actionId === 'related') return Link;
  return NotebookPen;
}

function readerIcon(kind: SpatialReaderKind): JSX.Element {
  if (kind === 'pdf') return <FileText size={15} />;
  if (kind === 'video') return <Film size={15} />;
  if (kind === 'bookmark') return <ExternalLink size={15} />;
  return <BookOpenText size={15} />;
}

function statusLabel(status: LibraryItem['frontmatter']['status']): string {
  if (status === 'saved') return '已保存';
  if (status === 'reading') return '阅读中';
  if (status === 'read') return '已读';
  if (status === 'distilled') return '已提炼';
  if (status === 'archived') return '已归档';
  return status;
}

function clientPointToCanvasPoint(
  point: SpatialPoint,
  canvas: HTMLElement | null,
  viewport: SpatialViewport
): SpatialPoint {
  const rect = canvas?.getBoundingClientRect();
  return {
    x: (point.x - (rect?.left ?? 0) - viewport.x) / viewport.zoom,
    y: (point.y - (rect?.top ?? 0) - viewport.y) / viewport.zoom
  };
}

function getDescendantThoughtNodeIds(nodes: SpatialThoughtNode[], rootNodeId: string): Set<string> {
  const descendants = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    nodes.forEach((node) => {
      if (!node.sourceNodeId) return;
      if (node.sourceNodeId !== rootNodeId && !descendants.has(node.sourceNodeId)) return;
      if (descendants.has(node.id)) return;
      descendants.add(node.id);
      changed = true;
    });
  }
  return descendants;
}

function getThoughtSubtreeNodeIdsInRaiseOrder(
  nodes: SpatialThoughtNode[],
  rootNodeId: string
): string[] {
  const allowedNodeIds = new Set(
    nodes
      .filter((node) => node.id === rootNodeId || node.status !== 'closed')
      .map((node) => node.id)
  );
  if (!allowedNodeIds.has(rootNodeId)) return [];
  return getThoughtNodeIdsInPostOrder(nodes, [rootNodeId], allowedNodeIds);
}

function getReaderAttachedThoughtNodeIdsInRaiseOrder(
  nodes: SpatialThoughtNode[],
  sourceWindowId: string,
  itemId?: string
): string[] {
  const allowedNodeIds = new Set(
    nodes
      .filter((node) => {
        if (node.status === 'closed') return false;
        if (node.sourceWindowId === sourceWindowId) return true;
        return !node.sourceWindowId && Boolean(itemId) && node.itemId === itemId;
      })
      .map((node) => node.id)
  );
  if (allowedNodeIds.size === 0) return [];
  const rootNodeIds = nodes
    .filter((node) => {
      if (!allowedNodeIds.has(node.id)) return false;
      return !node.sourceNodeId || !allowedNodeIds.has(node.sourceNodeId);
    })
    .map((node) => node.id);
  return getThoughtNodeIdsInPostOrder(nodes, rootNodeIds, allowedNodeIds);
}

function getThoughtNodeIdsInPostOrder(
  nodes: SpatialThoughtNode[],
  rootNodeIds: string[],
  allowedNodeIds: Set<string>
): string[] {
  const childrenBySourceId = new Map<string, string[]>();
  nodes.forEach((node) => {
    if (!node.sourceNodeId || !allowedNodeIds.has(node.id)) return;
    const children = childrenBySourceId.get(node.sourceNodeId) ?? [];
    children.push(node.id);
    childrenBySourceId.set(node.sourceNodeId, children);
  });

  const orderedNodeIds: string[] = [];
  const visitedNodeIds = new Set<string>();

  function visit(nodeId: string): void {
    if (visitedNodeIds.has(nodeId) || !allowedNodeIds.has(nodeId)) return;
    visitedNodeIds.add(nodeId);
    (childrenBySourceId.get(nodeId) ?? []).forEach(visit);
    orderedNodeIds.push(nodeId);
  }

  rootNodeIds.forEach(visit);
  return orderedNodeIds;
}

function isSpatialInteractive(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    ? Boolean(target.closest('[data-spatial-interactive], button, a, input, textarea, select, iframe, video'))
    : false;
}

function isNativeInteractive(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    ? Boolean(target.closest('button, a, input, textarea, select, iframe, video'))
    : false;
}

function createWindowId(itemId: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `reader-${itemId}-${crypto.randomUUID()}`;
  }
  return `reader-${itemId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createThoughtId(actionId: SpatialThoughtNode['actionId']): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `thought-${actionId}-${crypto.randomUUID()}`;
  }
  return `thought-${actionId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
