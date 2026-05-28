import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import ePub from 'epubjs';
import {
  BookA,
  BookOpenText,
  Braces,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Film,
  Grid3X3,
  Hash,
  Highlighter,
  LayoutGrid,
  Languages,
  Link,
  List,
  Loader2,
  MessageCircle,
  Minus,
  NotebookPen,
  PanelLeft,
  PanelRight,
  Pause,
  Play,
  RotateCcw,
  Rows3,
  Search,
  Send,
  Settings2,
  Sigma,
  Sparkles,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon
} from 'lucide-react';
import { Document as PdfDocument, Page as PdfPage, pdfjs } from 'react-pdf';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject
} from 'react';
import type { LibraryItem } from '@shared/library';
import type { ChatAction, RuntimeErrorPayload, RuntimeMessagePayload } from '@shared/chat-protocol';
import type { ConversationTurn } from '@shared/conversation';
import type {
  AnnotationRecord,
  AnnotationTargetRef,
  AnnotationViewState,
  CreateAnnotationInput
} from '@shared/annotation';
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

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type ReaderMode = 'reading' | 'space';
type ReaderHighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
type RichReaderTheme = 'light' | 'sepia' | 'dark';
type RichReaderWidth = 'narrow' | 'medium' | 'wide' | 'full';
type RichReaderTab = 'toc' | 'search' | 'info';

declare global {
  interface Window {
    YT?: {
      Player?: new (elementId: string, options: Record<string, unknown>) => {
        destroy(): void;
        getCurrentTime?(): number;
        seekTo?(seconds: number, allowSeekAhead: boolean): void;
        playVideo?(): void;
        pauseVideo?(): void;
      };
      PlayerState?: {
        PLAYING: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface LibrarySpatialReaderProps {
  items: LibraryItem[];
  activeItem: LibraryItem | null;
  className?: string;
  onActiveItemChange?(itemId: string): void;
  onMarkRead?(itemId: string): void;
}

type AnnotationSelectionActionId = 'translate' | 'explain' | 'formula' | 'related';
type SelectionActionId = AnnotationSelectionActionId | 'chat';

interface SelectionActionDefinition {
  id: AnnotationSelectionActionId;
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
  sourceScope?: 'selection' | 'resource';
  sourceText: string;
  sourceQuote: ReaderQuoteAnchor;
  sourceWindowId?: string;
  sourceNodeId?: string;
  color: ReaderHighlightColor;
  contentMarkdown: string;
  conversationId?: string;
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

interface ThoughtChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
}

const DEFAULT_VIEWPORT: SpatialViewport = { x: 0, y: 0, zoom: 1 };
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.7;
const DEFAULT_WINDOW_SIZE: SpatialSize = { width: 680, height: 520 };
const MIN_WINDOW_SIZE: SpatialSize = { width: 460, height: 320 };
const DEFAULT_THOUGHT_SIZE: SpatialSize = { width: 390, height: 310 };
const MIN_THOUGHT_SIZE: SpatialSize = { width: 300, height: 220 };
const WINDOW_HEADER_DOCK_Y = 42;
const SPATIAL_WINDOW_Z_OFFSET = 500;
const LIBRARY_READER_SPACE_ID = 'library-workbench';
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
  related: 'stroke-pink-400',
  chat: 'stroke-indigo-400'
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
  onMarkRead
}: LibrarySpatialReaderProps): JSX.Element {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const zIndexRef = useRef(140);
  const activeItemRef = useRef<LibraryItem | null>(activeItem);
  const thoughtNodesRef = useRef<SpatialThoughtNode[]>([]);
  const viewStatePersistTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const bodyPersistTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const bodyPersistDraftsRef = useRef<Map<string, string>>(new Map());
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

  useEffect(() => {
    thoughtNodesRef.current = thoughtNodes;
  }, [thoughtNodes]);

  useEffect(
    () => () => {
      viewStatePersistTimersRef.current.forEach((timer) => clearTimeout(timer));
      viewStatePersistTimersRef.current.clear();
      bodyPersistTimersRef.current.forEach((timer) => clearTimeout(timer));
      bodyPersistTimersRef.current.clear();
      bodyPersistDraftsRef.current.forEach((bodyMarkdown, nodeId) => {
        void window.orbit.annotation.update(nodeId, { body_markdown: bodyMarkdown }).catch((error) => {
          console.error('Failed to flush annotation body', error);
        });
      });
      bodyPersistDraftsRef.current.clear();
    },
    []
  );

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
  const openCanvasItems = useMemo(
    () =>
      Array.from(
        new Set(
          [
            activeItem?.frontmatter.id,
            ...windows
              .filter((windowState) => windowState.status === 'open')
              .map((windowState) => windowState.itemId)
          ].filter((itemId): itemId is string => Boolean(itemId))
        )
      )
        .map((itemId) => itemById.get(itemId))
        .filter((item): item is LibraryItem => Boolean(item)),
    [activeItem, itemById, windows]
  );
  const annotationItemIds = useMemo(
    () =>
      [
        ...new Set(
          [
            activeItem?.frontmatter.id,
            ...windows.map((windowState) => windowState.itemId)
          ].filter((itemId): itemId is string => Boolean(itemId))
        )
      ],
    [activeItem, windows]
  );

  useEffect(() => {
    let cancelled = false;
    if (annotationItemIds.length === 0) {
      setThoughtNodes([]);
      return;
    }

    async function loadAnnotations(): Promise<void> {
      const [viewStates, annotationGroups] = await Promise.all([
        window.orbit.annotation.listViewStates(LIBRARY_READER_SPACE_ID).catch(() => []),
        Promise.all(
          annotationItemIds.map((itemId) =>
            window.orbit.annotation.listForTarget(libraryAnnotationTarget(itemId)).catch(() => [])
          )
        )
      ]);
      if (cancelled) return;
      const viewStateById = new Map(viewStates.map((state) => [state.annotation_id, state]));
      const records = uniqueAnnotations(annotationGroups.flat());
      const recordNodes = records
        .map((record, index) =>
          annotationRecordToThoughtNode(record, itemById, viewStateById.get(record.id), index)
        )
        .filter((node): node is SpatialThoughtNode => Boolean(node));
      const legacyNodes = annotationItemIds.flatMap((itemId) =>
        legacyLibraryAnnotationsToThoughtNodes(itemById.get(itemId), viewStateById)
      );
      const nodes = mergeThoughtNodes(recordNodes, legacyNodes);
      const maxZIndex = Math.max(0, ...nodes.map((node) => node.zIndex));
      zIndexRef.current = Math.max(zIndexRef.current, maxZIndex);
      setThoughtNodes(nodes);
    }

    void loadAnnotations().catch((error) => {
      console.error('Failed to load annotations', error);
    });

    return () => {
      cancelled = true;
    };
  }, [annotationItemIds, itemById]);

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
    raisedNodeIds.forEach((id) => {
      const node = thoughtNodesRef.current.find((candidate) => candidate.id === id);
      const nextZIndex = zIndexById.get(id);
      if (node && nextZIndex) scheduleAnnotationViewStatePersist({ ...node, status: 'open', zIndex: nextZIndex });
    });
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
      sourceScope: 'selection',
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

  function scheduleAnnotationViewStatePersist(node: SpatialThoughtNode): void {
    const existing = viewStatePersistTimersRef.current.get(node.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      viewStatePersistTimersRef.current.delete(node.id);
      void window.orbit.annotation
        .updateViewState(LIBRARY_READER_SPACE_ID, node.id, {
          position: node.position,
          size: node.size,
          status: node.status,
          z_index: node.zIndex
        })
        .catch((error) => {
          console.error('Failed to persist annotation view state', error);
        });
    }, 180);
    viewStatePersistTimersRef.current.set(node.id, timer);
  }

  function appendPersistedThoughtNode(input: CreateAnnotationInput, fallbackNode: SpatialThoughtNode): void {
    void window.orbit.annotation
      .create(input)
      .then(async (record) => {
        const viewState = await window.orbit.annotation.updateViewState(LIBRARY_READER_SPACE_ID, record.id, {
          position: fallbackNode.position,
          size: fallbackNode.size,
          status: fallbackNode.status,
          z_index: fallbackNode.zIndex
        });
        const persistedNode =
          annotationRecordToThoughtNode(record, itemById, viewState) ?? {
            ...fallbackNode,
            id: record.id
          };
        setThoughtNodes((current) => mergeThoughtNodes(current, [persistedNode]));
      })
      .catch((error) => {
        console.error('Failed to create annotation', error);
      });
  }

  function buildSelectionAnnotationInput(
    nextSelection: ReaderSelectionState,
    node: SpatialThoughtNode,
    item: LibraryItem,
    type: 'comment' | 'ai_note',
    metadata?: Record<string, unknown>
  ): CreateAnnotationInput {
    const contextTarget = libraryAnnotationTarget(item.frontmatter.id, item.frontmatter.title);
    const parentAnnotationId = nextSelection.sourceNodeId;
    return {
      target: parentAnnotationId
        ? { kind: 'annotation', ref: parentAnnotationId }
        : contextTarget,
      context_target: contextTarget,
      anchor: {
        kind: parentAnnotationId ? 'annotation_body_range' : 'text_quote',
        quote: nextSelection.quote
      },
      type,
      color: node.color,
      title: node.label,
      body_markdown: node.contentMarkdown,
      ...(parentAnnotationId ? { parent_annotation_id: parentAnnotationId } : {}),
      metadata
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
    const item = itemById.get(selection.itemId);
    if (!item) return;
    const actionSelection = selection;
    const node = createThoughtNode(actionSelection, action);
    if (!node) return;
    const loadingNode = {
      ...node,
      contentMarkdown: buildAnnotationLoadingContent(action.label)
    };
    openSelectionContext(actionSelection);
    setThoughtNodes((current) => mergeThoughtNodes(current, [loadingNode]));
    void generateSelectionAnnotation(actionSelection, loadingNode, item, action);
    clearSelection();
  }

  function runAllSelectionActions(): void {
    if (!selection) return;
    const item = itemById.get(selection.itemId);
    if (!item) return;
    const nodes = THOUGHT_ACTIONS.map((action, index) => createThoughtNode(selection, action, index)).filter(
      (node): node is SpatialThoughtNode => Boolean(node)
    );
    if (nodes.length === 0) return;
    const actionSelection = selection;
    openSelectionContext(actionSelection);
    nodes.forEach((node) => {
      const action = THOUGHT_ACTIONS.find((candidate) => candidate.id === node.actionId);
      if (!action) return;
      const loadingNode = {
        ...node,
        contentMarkdown: buildAnnotationLoadingContent(action.label)
      };
      setThoughtNodes((current) => mergeThoughtNodes(current, [loadingNode]));
      void generateSelectionAnnotation(actionSelection, loadingNode, item, action);
    });
    clearSelection();
  }

  async function generateSelectionAnnotation(
    nextSelection: ReaderSelectionState,
    loadingNode: SpatialThoughtNode,
    item: LibraryItem,
    action: SelectionActionDefinition
  ): Promise<void> {
    try {
      const parentAnnotationId = nextSelection.sourceNodeId;
      const contextTarget = libraryAnnotationTarget(item.frontmatter.id, item.frontmatter.title);
      const result = await window.orbit.annotation.generate({
        action: action.id,
        target: parentAnnotationId ? { kind: 'annotation', ref: parentAnnotationId } : contextTarget,
        context_target: contextTarget,
        anchor: {
          kind: parentAnnotationId ? 'annotation_body_range' : 'text_quote',
          quote: nextSelection.quote
        },
        selected_text: nextSelection.text,
        canvas_item_ids: canvasItemIdsForSelection(item.frontmatter.id),
        color: action.color,
        ...(parentAnnotationId ? { parent_annotation_id: parentAnnotationId } : {})
      });
      const viewState = await window.orbit.annotation.updateViewState(LIBRARY_READER_SPACE_ID, result.annotation.id, {
        position: loadingNode.position,
        size: loadingNode.size,
        status: loadingNode.status,
        z_index: loadingNode.zIndex
      });
      const persistedNode =
        annotationRecordToThoughtNode(result.annotation, itemById, viewState) ?? {
          ...loadingNode,
          id: result.annotation.id,
          label: result.annotation.title,
          contentMarkdown: result.annotation.body_markdown
        };
      setThoughtNodes((current) => mergeThoughtNodes(current.filter((node) => node.id !== loadingNode.id), [persistedNode]));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateThoughtNode(loadingNode.id, {
        label: `${action.label}失败`,
        contentMarkdown: `AI 生成失败：${message}\n\n请检查 Settings -> AI Endpoints 是否已经配置可用模型。`
      });
    }
  }

  function canvasItemIdsForSelection(primaryItemId: string): string[] {
    return [
      ...new Set([
        primaryItemId,
        ...windows.filter((windowState) => windowState.status !== 'closed').map((windowState) => windowState.itemId)
      ])
    ];
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
      sourceScope: 'selection',
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
    appendPersistedThoughtNode(buildSelectionAnnotationInput(selection, noteNode, item, 'comment'), noteNode);
    clearSelection();
  }

  function createSelectionChat(): void {
    if (!selection) return;
    const item = itemById.get(selection.itemId);
    if (!item) return;
    const timestamp = new Date().toISOString();
    const chatNode: SpatialThoughtNode = {
      id: createThoughtId('chat'),
      itemId: item.frontmatter.id,
      actionId: 'chat',
      label: '划线对话',
      sourceScope: 'selection',
      sourceText: selection.text,
      sourceQuote: selection.quote,
      sourceWindowId: selection.sourceWindowId,
      sourceNodeId: selection.sourceNodeId,
      color: 'purple',
      contentMarkdown: buildSelectionChatContent(selection.text, item),
      position: getThoughtPosition(selection, 0, { width: 430, height: 360 }),
      size: { width: 430, height: 360 },
      status: 'open',
      zIndex: getNextZIndex(),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    openSelectionContext(selection);
    appendPersistedThoughtNode(
      buildSelectionAnnotationInput(selection, chatNode, item, 'ai_note', { action_id: 'chat' }),
      chatNode
    );
    clearSelection();
  }

  function bindThoughtConversation(nodeId: string, conversationId: string): void {
    updateThoughtNode(nodeId, { conversationId });
    const node = thoughtNodesRef.current.find((candidate) => candidate.id === nodeId);
    void window.orbit.annotation
      .update(nodeId, {
        metadata: {
          action_id: node?.actionId ?? 'chat',
          conversation_id: conversationId
        }
      })
      .catch((error) => {
        console.error('Failed to bind annotation conversation', error);
      });
  }

  function getResourceThoughtPosition(itemId: string, sourceWindowId?: string): SpatialPoint {
    const existingCount = thoughtNodes.filter(
      (node) => node.itemId === itemId && node.sourceScope === 'resource' && node.status !== 'closed'
    ).length;
    const offsetIndex = Math.min(existingCount, 6);
    const size = DEFAULT_THOUGHT_SIZE;
    const sourceWindow = sourceWindowId
      ? windows.find((window) => window.id === sourceWindowId)
      : null;

    if (sourceWindow) {
      return constrainThoughtPosition(
        {
          x: sourceWindow.position.x + sourceWindow.size.width + 34 + offsetIndex * 34,
          y: sourceWindow.position.y + 74 + offsetIndex * 38
        },
        size
      );
    }

    const rect = workspaceRef.current?.getBoundingClientRect();
    return constrainThoughtPosition(
      {
        x: rect ? Math.max(48, rect.width - size.width - 48) : 80,
        y: 72 + offsetIndex * 38
      },
      size,
      mode === 'reading' ? DEFAULT_VIEWPORT : viewport
    );
  }

  function createResourceNote(item: LibraryItem, sourceWindowId?: string): void {
    const timestamp = new Date().toISOString();
    const position = getResourceThoughtPosition(item.frontmatter.id, sourceWindowId);
    const zIndex = getNextZIndex();
    const node: SpatialThoughtNode = {
      id: createThoughtId('note'),
      itemId: item.frontmatter.id,
      actionId: 'note',
      label: '资料标注',
      sourceScope: 'resource',
      sourceText: `整篇资料：${item.frontmatter.title}`,
      sourceQuote: { exact: '' },
      sourceWindowId,
      color: 'yellow',
      contentMarkdown: buildResourceNoteContent(item),
      position,
      size: DEFAULT_THOUGHT_SIZE,
      status: 'open',
      zIndex,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    onActiveItemChange?.(item.frontmatter.id);
    appendPersistedThoughtNode(
      {
        target: libraryAnnotationTarget(item.frontmatter.id, item.frontmatter.title),
        anchor: { kind: 'whole_source' },
        type: 'resource_note',
        color: 'yellow',
        title: '资料标注',
        body_markdown: buildResourceNoteContent(item)
      },
      node
    );
  }

  function createResourceNoteForWindow(windowId: string): void {
    const sourceWindow = windows.find((window) => window.id === windowId);
    const item = sourceWindow ? itemById.get(sourceWindow.itemId) : null;
    if (!item) return;
    createResourceNote(item, windowId);
  }

  function updateThoughtNode(nodeId: string, patch: Partial<SpatialThoughtNode>): void {
    const currentNode = thoughtNodesRef.current.find((node) => node.id === nodeId);
    if (currentNode) scheduleAnnotationViewStatePersist({ ...currentNode, ...patch });
    setThoughtNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)));
  }

  function updateThoughtBody(nodeId: string, bodyMarkdown: string): void {
    updateThoughtNode(nodeId, { contentMarkdown: bodyMarkdown });
    if (!isPersistedAnnotationId(nodeId)) return;
    bodyPersistDraftsRef.current.set(nodeId, bodyMarkdown);
    const existing = bodyPersistTimersRef.current.get(nodeId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      persistThoughtBody(nodeId, bodyMarkdown);
    }, 300);
    bodyPersistTimersRef.current.set(nodeId, timer);
  }

  function flushThoughtBody(nodeId: string): void {
    const bodyMarkdown = bodyPersistDraftsRef.current.get(nodeId);
    if (typeof bodyMarkdown !== 'string') return;
    persistThoughtBody(nodeId, bodyMarkdown);
  }

  function persistThoughtBody(nodeId: string, bodyMarkdown: string): void {
    const existing = bodyPersistTimersRef.current.get(nodeId);
    if (existing) clearTimeout(existing);
    bodyPersistTimersRef.current.delete(nodeId);
    bodyPersistDraftsRef.current.delete(nodeId);
    void window.orbit.annotation
      .update(nodeId, { body_markdown: bodyMarkdown })
      .catch((error) => {
        console.error('Failed to persist annotation body', error);
      });
  }

  function activateThoughtNode(nodeId: string): void {
    const raisedNodeIds = getThoughtSubtreeNodeIdsInRaiseOrder(thoughtNodes, nodeId);
    const zIndexById = allocateZIndexBlock(raisedNodeIds);
    if (zIndexById.size === 0) return;
    raisedNodeIds.forEach((id) => {
      const node = thoughtNodesRef.current.find((candidate) => candidate.id === id);
      const nextZIndex = zIndexById.get(id);
      if (node && nextZIndex) scheduleAnnotationViewStatePersist({ ...node, status: 'open', zIndex: nextZIndex });
    });
    setThoughtNodes((current) =>
      current.map((node) => {
        const nextZIndex = zIndexById.get(node.id);
        return nextZIndex
          ? { ...node, status: 'open', zIndex: nextZIndex }
          : node;
      })
    );
  }

  function moveAttachedThoughtNodes(sourceWindowId: string, itemId: string, delta: SpatialPoint): void {
    if (delta.x === 0 && delta.y === 0) return;
    setThoughtNodes((current) => {
      const attachedNodeIds = new Set(
        current
          .filter(
            (node) =>
              !node.sourceNodeId &&
              (node.sourceWindowId === sourceWindowId ||
                (!node.sourceWindowId && node.itemId === itemId))
          )
          .map((node) => node.id)
      );
      const nodeIdsToMove = new Set(attachedNodeIds);
      attachedNodeIds.forEach((nodeId) => {
        getDescendantThoughtNodeIds(current, nodeId).forEach((descendantNodeId) => {
          nodeIdsToMove.add(descendantNodeId);
        });
      });

      return current.map((node) => {
        if (!nodeIdsToMove.has(node.id)) return node;
        const next = {
          ...node,
          position: {
            x: node.position.x + delta.x,
            y: node.position.y + delta.y
          }
        };
        scheduleAnnotationViewStatePersist(next);
        return next;
      });
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
    if (currentWindow) moveAttachedThoughtNodes(windowId, currentWindow.itemId, delta);
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
        if (node.id === nodeId) {
          const next = { ...node, position };
          scheduleAnnotationViewStatePersist(next);
          return next;
        }
        if (!descendantNodeIds.has(node.id) || delta.x === 0 && delta.y === 0) return node;
        const next = {
          ...node,
          position: {
            x: node.position.x + delta.x,
            y: node.position.y + delta.y
          }
        };
        scheduleAnnotationViewStatePersist(next);
        return next;
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
            <>
              <button
                type="button"
                onClick={() => createResourceNote(activeItem)}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950"
              >
                <NotebookPen size={14} />
                资料标注
              </button>
              <button
                type="button"
                onClick={() => onMarkRead?.(activeItem.frontmatter.id)}
                className="rounded border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-900"
              >
                标为已读
              </button>
            </>
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
          onCreateResourceNote={createResourceNoteForWindow}
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
          onUpdateThoughtBody={updateThoughtBody}
          onFlushThoughtBody={flushThoughtBody}
          onBindThoughtConversation={bindThoughtConversation}
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
          onUpdateThoughtBody={updateThoughtBody}
          onFlushThoughtBody={flushThoughtBody}
          canvasItems={openCanvasItems}
          onBindThoughtConversation={bindThoughtConversation}
        />
      ) : null}
      <SelectionActionBar
        selection={selection}
        actions={THOUGHT_ACTIONS}
        onDismiss={clearSelection}
        onCreateNote={createSelectionNote}
        onCreateChat={createSelectionChat}
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
  onReaderSelection,
  onUpdateThoughtBody,
  onFlushThoughtBody,
  canvasItems,
  onBindThoughtConversation
}: {
  item: LibraryItem;
  thoughtNodes: SpatialThoughtNode[];
  onActivateThought(nodeId: string): void;
  onMoveThought(nodeId: string, position: SpatialPoint): void;
  onResizeThought(nodeId: string, size: SpatialSize): void;
  onCloseThought(nodeId: string): void;
  onMinimizeThought(nodeId: string): void;
  onReaderSelection(selection: ReaderSelectionState): void;
  onUpdateThoughtBody(nodeId: string, bodyMarkdown: string): void;
  onFlushThoughtBody(nodeId: string): void;
  canvasItems: LibraryItem[];
  onBindThoughtConversation(nodeId: string, conversationId: string): void;
}): JSX.Element | null {
  const layerRef = useRef<HTMLDivElement>(null);
  const [thoughtDockOpen, setThoughtDockOpen] = useState(false);
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
            onUpdateBody={onUpdateThoughtBody}
            onFlushBody={onFlushThoughtBody}
            childThoughtNodes={childThoughtNodesBySourceId.get(node.id) ?? EMPTY_THOUGHT_NODES}
            onActivateThought={onActivateThought}
            canvasItems={canvasItems}
            onBindConversation={onBindThoughtConversation}
          />
        ))}
      </div>

      <ThoughtWindowDock
        nodes={visibleThoughtNodes}
        open={thoughtDockOpen}
        onOpenChange={setThoughtDockOpen}
        getSourceItem={() => item}
        onActivateThought={onActivateThought}
        className="left-3 top-16 z-[420]"
      />

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
  onCreateResourceNote,
  onDuplicateWindow,
  onReaderSelection,
  onActivateThought,
  onMoveThought,
  onResizeThought,
  onCloseThought,
  onMinimizeThought,
  onUpdateThoughtBody,
  onFlushThoughtBody,
  onBindThoughtConversation
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
  onCreateResourceNote(windowId: string): void;
  onDuplicateWindow(windowId: string): void;
  onReaderSelection(selection: ReaderSelectionState): void;
  onActivateThought(nodeId: string): void;
  onMoveThought(nodeId: string, position: SpatialPoint): void;
  onResizeThought(nodeId: string, size: SpatialSize): void;
  onCloseThought(nodeId: string): void;
  onMinimizeThought(nodeId: string): void;
  onUpdateThoughtBody(nodeId: string, bodyMarkdown: string): void;
  onFlushThoughtBody(nodeId: string): void;
  onBindThoughtConversation(nodeId: string, conversationId: string): void;
}): JSX.Element {
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportLayerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ pointer: SpatialPoint; viewport: SpatialViewport } | null>(null);
  const openedHighlightOnPointerDownRef = useRef<string | null>(null);
  const [panning, setPanning] = useState(false);
  const [thoughtDockOpen, setThoughtDockOpen] = useState(false);
  const openWindows = windows.filter((window) => window.status === 'open');
  const minimizedWindows = windows.filter((window) => window.status === 'minimized');
  const openThoughtNodes = thoughtNodes.filter((node) => node.status === 'open');
  const minimizedThoughtNodes = thoughtNodes.filter((node) => node.status === 'minimized');
  const visibleThoughtNodes = thoughtNodes.filter((node) => node.status !== 'closed');
  const openWindowIds = useMemo(() => openWindows.map((window) => window.id), [openWindows]);
  const canvasItems = useMemo(
    () =>
      Array.from(new Set(openWindows.map((window) => window.itemId)))
        .map((itemId) => itemById.get(itemId))
        .filter((item): item is LibraryItem => Boolean(item)),
    [itemById, openWindows]
  );
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
              onCreateResourceNote={onCreateResourceNote}
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
            onUpdateBody={onUpdateThoughtBody}
            onFlushBody={onFlushThoughtBody}
            childThoughtNodes={childThoughtNodesBySourceId.get(node.id) ?? EMPTY_THOUGHT_NODES}
            onActivateThought={onActivateThought}
            canvasItems={canvasItems}
            onBindConversation={onBindThoughtConversation}
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

      <ThoughtWindowDock
        nodes={visibleThoughtNodes}
        open={thoughtDockOpen}
        onOpenChange={setThoughtDockOpen}
        getSourceItem={(node) => itemById.get(node.itemId) ?? null}
        onActivateThought={onActivateThought}
        className="left-3 top-3 z-[400]"
      />

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

function ThoughtWindowDock({
  nodes,
  open,
  onOpenChange,
  getSourceItem,
  onActivateThought,
  className
}: {
  nodes: SpatialThoughtNode[];
  open: boolean;
  onOpenChange(open: boolean): void;
  getSourceItem(node: SpatialThoughtNode): LibraryItem | null;
  onActivateThought(nodeId: string): void;
  className: string;
}): JSX.Element | null {
  if (nodes.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        data-spatial-interactive
        aria-label={`标注窗口，${nodes.length} 个，点击展开`}
        title="标注窗口"
        onClick={() => onOpenChange(true)}
        className={cx(
          'pointer-events-auto absolute inline-flex h-10 items-center gap-2 rounded-full border border-amber-200 bg-white/95 px-3 text-xs font-semibold text-amber-900 shadow-lg backdrop-blur hover:bg-amber-50 dark:border-amber-900/60 dark:bg-neutral-950/95 dark:text-amber-100 dark:hover:bg-amber-950/60',
          className
        )}
      >
        <NotebookPen size={15} />
        <span>标注</span>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {nodes.length}
        </span>
      </button>
    );
  }

  return (
    <div
      data-spatial-interactive
      className={cx(
        'pointer-events-auto absolute w-64 overflow-hidden rounded border border-amber-200 bg-white/95 text-amber-950 shadow-lg backdrop-blur dark:border-amber-900/60 dark:bg-neutral-950/95 dark:text-amber-100',
        className
      )}
    >
      <div className="flex h-9 items-center justify-between border-b border-amber-200 px-3 text-xs font-semibold dark:border-amber-900/60">
        <span>标注窗口</span>
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-100">
            {nodes.length}
          </span>
          <button
            type="button"
            aria-label="收起标注窗口列表"
            title="收起"
            onClick={() => onOpenChange(false)}
            className="flex h-6 w-6 items-center justify-center rounded text-amber-700 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-950"
          >
            <Minus size={13} />
          </button>
        </div>
      </div>
      <div className="max-h-52 overflow-y-auto p-1.5">
        {nodes.map((node) => {
          const Icon = thoughtIcon(node.actionId);
          const sourceItem = getSourceItem(node);
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => {
                onActivateThought(node.id);
                onOpenChange(false);
              }}
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
                  {clipText(getThoughtSourcePreview(node, sourceItem), 48)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
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
  onCreateResourceNote,
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
  onCreateResourceNote(windowId: string): void;
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
      data-reader-item-id={windowState.itemId}
      className={cx(
        'absolute flex min-h-[320px] min-w-[460px] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white text-neutral-950 shadow-[0_24px_70px_-34px_rgba(15,23,42,0.65),0_0_0_1px_rgba(229,229,229,0.7)] dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100',
        (dragging || resizing) && 'select-none'
      )}
      style={{
        left: windowState.position.x,
        top: windowState.position.y,
        width: windowState.size.width,
        height: windowState.size.height,
        zIndex: getSpatialWindowZIndex(windowState.zIndex)
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
        <IconButton label="标注整篇资料" onClick={() => onCreateResourceNote(windowState.id)}>
          <NotebookPen size={14} />
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
  onUpdateBody,
  onFlushBody,
  childThoughtNodes,
  onActivateThought,
  canvasItems,
  onBindConversation
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
  onUpdateBody(nodeId: string, bodyMarkdown: string): void;
  onFlushBody(nodeId: string): void;
  childThoughtNodes: SpatialThoughtNode[];
  onActivateThought(nodeId: string): void;
  canvasItems: LibraryItem[];
  onBindConversation(nodeId: string, conversationId: string): void;
}): JSX.Element {
  const dragStartRef = useRef<SpatialPoint | null>(null);
  const resizeStartRef = useRef<SpatialPoint | null>(null);
  const startPositionRef = useRef(node.position);
  const startSizeRef = useRef(node.size);
  const bodyRef = useRef<HTMLDivElement>(null);
  const chatConversationIdRef = useRef<string | null>(node.conversationId ?? null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [chatConversationId, setChatConversationId] = useState<string | null>(node.conversationId ?? null);
  const [chatMessages, setChatMessages] = useState<ThoughtChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  useEffect(() => {
    const conversationId = node.conversationId ?? null;
    chatConversationIdRef.current = conversationId;
    setChatConversationId(conversationId);
  }, [node.conversationId]);

  useEffect(() => {
    if (node.actionId !== 'chat' || !chatConversationId) return;
    let cancelled = false;
    void window.orbit.chat
      .getConversation(chatConversationId)
      .then((conversation) => {
        if (cancelled || !conversation) return;
        setChatMessages(conversation.turns.map(conversationTurnToThoughtChatMessage));
        setChatLoading(Boolean(conversation.currentRunId));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [chatConversationId, node.actionId]);

  useEffect(() => {
    if (node.actionId !== 'chat') return;
    const off = window.orbit.chat.onRuntimeEvent((event) => {
      if (!chatConversationIdRef.current || event.conversationId !== chatConversationIdRef.current) return;
      if (event.kind === 'runtime.message') {
        const payload = event.payload as RuntimeMessagePayload;
        if (payload.role === 'user') return;
        setChatMessages((current) => mergeAssistantRuntimeMessage(current, {
          id: event.id,
          runId: event.runId,
          text: payload.text,
          streaming: Boolean(payload.isStreaming),
          final: Boolean(payload.isFinal)
        }));
      }
      if (event.kind === 'runtime.done') {
        setChatLoading(false);
      }
      if (event.kind === 'runtime.error') {
        const payload = event.payload as RuntimeErrorPayload;
        setChatLoading(false);
        setChatError(payload.message);
      }
    });
    return off;
  }, [node.actionId]);

  useEffect(() => {
    if (node.actionId !== 'chat' || !chatLoading) return;
    const timer = setTimeout(() => {
      setChatLoading(false);
      setChatError('AI 响应超时。请检查设置里的 AI Endpoints，或稍后重试。');
    }, 60_000);
    return () => clearTimeout(timer);
  }, [chatLoading, node.actionId]);

  async function submitChatQuestion(): Promise<void> {
    const question = chatInput.trim();
    if (!question || chatLoading) return;
    setChatInput('');
    setChatError(null);
    setChatLoading(true);
    setChatMessages((current) => [
      ...current,
      { id: `local-user-${Date.now()}`, role: 'user', text: question }
    ]);
    try {
      let conversationId = chatConversationId;
      if (!conversationId) {
        const now = new Date().toISOString();
        const conversation = await window.orbit.chat.createConversation({
          anchor: {
            kind: 'ask_anywhere_session',
            refId: `reader-selection:${node.id}`,
            addedAt: now
          },
          scope: { kind: 'library', item_id: node.itemId },
          title: `划线对话 · ${sourceItem?.frontmatter.title ?? node.label}`,
          runtimeHint: 'claude'
        });
        conversationId = conversation.id;
        chatConversationIdRef.current = conversationId;
        setChatConversationId(conversationId);
        onBindConversation(node.id, conversationId);
      } else {
        chatConversationIdRef.current = conversationId;
      }
      const prompt = buildSelectionChatPrompt({
        question,
        node,
        currentItem: sourceItem,
        canvasItems
      });
      const action: ChatAction<'chat.send_message'> = {
        kind: 'chat.send_message',
        conversationId,
        payload: {
          text: prompt,
          draft: {
            text: prompt,
            clientMeta: {
              sourceSurface: 'unknown',
              submittedAt: new Date().toISOString()
            }
          }
        }
      };
      await window.orbit.chat.sendAction(action);
    } catch (error) {
      setChatLoading(false);
      setChatError(error instanceof Error ? error.message : String(error));
    }
  }

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
        zIndex: getSpatialWindowZIndex(node.zIndex)
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
        className={cx(
          'min-h-0 flex-1 overflow-auto text-sm leading-6',
          node.actionId === 'chat' ? 'p-3' : 'px-4 py-3'
        )}
        onPointerUp={captureThoughtSelection}
        onKeyUp={captureThoughtSelection}
      >
        {node.actionId === 'chat' ? (
          <SelectionChatPanel
            messages={chatMessages}
            value={chatInput}
            loading={chatLoading}
            error={chatError}
            onChange={setChatInput}
            onSubmit={() => void submitChatQuestion()}
          />
        ) : node.actionId === 'note' ? (
          <ThoughtNoteEditor
            node={node}
            sourceItem={sourceItem}
            onChange={(bodyMarkdown) => onUpdateBody(node.id, bodyMarkdown)}
            onFlush={() => onFlushBody(node.id)}
          />
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <StreamingMarkdown content={node.contentMarkdown} />
          </div>
        )}
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

function ThoughtNoteEditor({
  node,
  sourceItem,
  onChange,
  onFlush
}: {
  node: SpatialThoughtNode;
  sourceItem: LibraryItem | null;
  onChange(bodyMarkdown: string): void;
  onFlush(): void;
}): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(node.contentMarkdown);

  useEffect(() => {
    setDraft(node.contentMarkdown);
  }, [node.contentMarkdown, node.id]);

  useEffect(() => {
    if (!node.contentMarkdown.trim()) textareaRef.current?.focus();
  }, [node.contentMarkdown, node.id]);

  function updateDraft(value: string): void {
    setDraft(value);
    onChange(value);
  }

  return (
    <div data-spatial-interactive className="flex h-full min-h-0 flex-col gap-2">
      <blockquote className="shrink-0 border-l-2 border-amber-300 bg-white/60 py-1 pl-3 text-xs leading-5 text-amber-900/80 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100/80">
        {getThoughtSourcePreview(node, sourceItem)}
      </blockquote>
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => updateDraft(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onBlur={onFlush}
        placeholder="写下你的判断、问题或摘录..."
        className="min-h-0 flex-1 resize-none rounded border border-amber-200 bg-white/80 px-3 py-2 text-sm leading-6 text-amber-950 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-200 dark:border-amber-900/70 dark:bg-neutral-950/60 dark:text-amber-50 dark:focus:border-amber-700 dark:focus:ring-amber-900/60"
      />
    </div>
  );
}

function SelectionChatPanel({
  messages,
  value,
  loading,
  error,
  onChange,
  onSubmit
}: {
  messages: ThoughtChatMessage[];
  value: string;
  loading: boolean;
  error: string | null;
  onChange(value: string): void;
  onSubmit(): void;
}): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const messagesEl = messagesRef.current;
    if (!messagesEl) return;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }, [loading, messages]);

  return (
    <div
      data-spatial-interactive
      className="flex h-full min-h-0 flex-col rounded border border-indigo-200 bg-white/70 p-2 dark:border-indigo-900/70 dark:bg-neutral-950/50"
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-200">
        <MessageCircle size={13} />
        <span>划线对话</span>
        {loading ? <Loader2 size={12} className="animate-spin" /> : null}
      </div>
      <div ref={messagesRef} className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
        {messages.length === 0 ? (
          <div className="rounded bg-indigo-50 px-2 py-1.5 text-xs leading-5 text-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-100">
            输入问题开始对话。
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cx(
                'rounded px-2 py-1.5 text-xs leading-5',
                message.role === 'user'
                  ? 'ml-6 bg-indigo-600 text-white'
                  : 'mr-6 bg-amber-100 text-amber-950 dark:bg-amber-900/50 dark:text-amber-50'
              )}
            >
              {message.role === 'assistant' ? (
                <div className="prose prose-xs max-w-none dark:prose-invert">
                  <StreamingMarkdown content={message.text} />
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{message.text}</span>
              )}
              {message.streaming ? <span className="ml-1 opacity-60">▌</span> : null}
            </div>
          ))
        )}
      </div>
      {error ? (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}
      <form
        className="mt-2 flex shrink-0 items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onKeyUp={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder="针对划线提问..."
          rows={2}
          className="min-h-10 flex-1 resize-none rounded border border-neutral-200 bg-white px-2 py-1.5 text-xs leading-5 text-neutral-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-indigo-700 dark:focus:ring-indigo-900/60"
        />
        <button
          type="submit"
          disabled={!value.trim() || loading}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-indigo-200 bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-200 disabled:text-neutral-400 dark:border-indigo-900 dark:disabled:border-neutral-800 dark:disabled:bg-neutral-900 dark:disabled:text-neutral-600"
          aria-label="发送划线对话"
          title="发送"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </form>
    </div>
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
      <RichPdfReader
        item={item}
        spacious={spacious}
        sourceWindowId={sourceWindowId}
        thoughtNodes={readerThoughtNodes}
        onReaderSelection={onReaderSelection}
        onActivateThought={onActivateThought}
      />
    );
  }
  if (kind === 'epub') {
    return (
      <RichEpubReader
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
      <RichYouTubeReader
        item={item}
        spacious={spacious}
        sourceWindowId={sourceWindowId}
        thoughtNodes={readerThoughtNodes}
        onReaderSelection={onReaderSelection}
        onActivateThought={onActivateThought}
      />
    );
  }
  if (kind === 'podcast') {
    return (
      <RichPodcastReader
        item={item}
        spacious={spacious}
        sourceWindowId={sourceWindowId}
        thoughtNodes={readerThoughtNodes}
        onReaderSelection={onReaderSelection}
        onActivateThought={onActivateThought}
      />
    );
  }
  if (kind === 'markdown') {
    return (
      <RichMarkdownReader
        item={item}
        subtitle="Markdown 阅读器"
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
    <RichMarkdownReader
      item={item}
      subtitle="文章阅读器"
      spacious={spacious}
      sourceWindowId={sourceWindowId}
      thoughtNodes={readerThoughtNodes}
      onReaderSelection={onReaderSelection}
      onActivateThought={onActivateThought}
    />
  );
}

interface RichReaderSettings {
  theme: RichReaderTheme;
  fontSize: number;
  lineHeight: number;
  width: RichReaderWidth;
  showNavigation: boolean;
  showContext: boolean;
}

interface RichReaderTocItem {
  id: string;
  title: string;
  level: number;
}

interface RichReaderSearchResult {
  id: string;
  title: string;
  text: string;
  before?: string;
  after?: string;
}

interface RichReaderFrameProps {
  item: LibraryItem;
  subtitle: string;
  spacious?: boolean;
  toc?: RichReaderTocItem[];
  activeTocId?: string;
  searchQuery?: string;
  onSearchQueryChange?(query: string): void;
  searchResults?: RichReaderSearchResult[];
  onTocSelect?(id: string): void;
  onSearchResultSelect?(result: RichReaderSearchResult): void;
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
  context?: ReactNode;
  footer?: ReactNode;
  children(settings: RichReaderSettings): ReactNode;
}

const DEFAULT_RICH_READER_SETTINGS: RichReaderSettings = {
  theme: 'light',
  fontSize: 16,
  lineHeight: 1.75,
  width: 'medium',
  showNavigation: true,
  showContext: true
};

function RichReaderFrame({
  item,
  subtitle,
  spacious,
  toc = [],
  activeTocId,
  searchQuery = '',
  onSearchQueryChange,
  searchResults = [],
  onTocSelect,
  onSearchResultSelect,
  toolbarStart,
  toolbarEnd,
  context,
  footer,
  children
}: RichReaderFrameProps): JSX.Element {
  const [settings, setSettings] = useState<RichReaderSettings>(() => ({
    ...DEFAULT_RICH_READER_SETTINGS,
    showNavigation: Boolean(spacious),
    showContext: Boolean(spacious)
  }));
  const [activeTab, setActiveTab] = useState<RichReaderTab>(toc.length > 0 ? 'toc' : 'search');
  const source = getLibraryReaderSource(item);
  const hasNavigation = toc.length > 0 || Boolean(onSearchQueryChange);
  const showNavigation = settings.showNavigation && hasNavigation;
  const showContext = settings.showContext && Boolean(context);

  useEffect(() => {
    if (activeTab === 'toc' && toc.length === 0) setActiveTab('search');
  }, [activeTab, toc.length]);

  const cssVars = {
    '--rich-reader-font-size': `${settings.fontSize}px`,
    '--rich-reader-line-height': `${settings.lineHeight}`
  } as CSSProperties;

  return (
    <div
      className={cx(
        'flex h-full min-h-0 flex-col border-neutral-200 dark:border-neutral-800',
        richReaderThemeClass(settings.theme)
      )}
      style={cssVars}
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-current/10 bg-white/90 px-2 text-neutral-800 backdrop-blur dark:bg-neutral-950/90 dark:text-neutral-100">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-current/10 bg-current/[0.04]">
            {readerIcon(getLibraryReaderKind(item))}
          </span>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold">{item.frontmatter.title}</div>
            <div className="truncate text-[10px] opacity-60">{subtitle}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {toolbarStart}
          {hasNavigation ? (
            <RichIconButton
              label={showNavigation ? '隐藏目录与搜索' : '显示目录与搜索'}
              active={showNavigation}
              onClick={() => setSettings((current) => ({ ...current, showNavigation: !current.showNavigation }))}
            >
              <PanelLeft size={14} />
            </RichIconButton>
          ) : null}
          {context ? (
            <RichIconButton
              label={showContext ? '隐藏上下文' : '显示上下文'}
              active={showContext}
              onClick={() => setSettings((current) => ({ ...current, showContext: !current.showContext }))}
            >
              <PanelRight size={14} />
            </RichIconButton>
          ) : null}
          <RichReaderSettingsMenu settings={settings} onChange={setSettings} />
          {toolbarEnd}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {showNavigation ? (
          <aside className="hidden w-64 shrink-0 flex-col border-r border-current/10 bg-current/[0.025] lg:flex">
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-current/10 px-2">
              {toc.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('toc')}
                  className={cx(
                    'inline-flex h-6 items-center gap-1 rounded px-2 text-[11px]',
                    activeTab === 'toc' ? 'bg-current/10 font-semibold' : 'opacity-70 hover:bg-current/5'
                  )}
                >
                  <List size={12} />
                  目录
                </button>
              ) : null}
              {onSearchQueryChange ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('search')}
                  className={cx(
                    'inline-flex h-6 items-center gap-1 rounded px-2 text-[11px]',
                    activeTab === 'search' ? 'bg-current/10 font-semibold' : 'opacity-70 hover:bg-current/5'
                  )}
                >
                  <Search size={12} />
                  搜索
                </button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-2">
              {activeTab === 'toc' ? (
                toc.length > 0 ? (
                  <div className="space-y-1">
                    {toc.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onTocSelect?.(item.id)}
                        className={cx(
                          'block w-full rounded px-2 py-1 text-left text-xs leading-5 hover:bg-current/5',
                          activeTocId === item.id && 'bg-current/10 font-semibold'
                        )}
                        style={{ paddingLeft: `${Math.max(8, item.level * 10)}px` }}
                      >
                        <span className="line-clamp-2">{item.title}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-current/10 p-3 text-xs opacity-60">暂无目录</div>
                )
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-45" />
                    <input
                      value={searchQuery}
                      onChange={(event) => onSearchQueryChange?.(event.target.value)}
                      placeholder="搜索当前资料"
                      className="h-8 w-full rounded border border-current/10 bg-white/70 pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-sky-200 dark:bg-neutral-950/60 dark:focus:ring-sky-900"
                    />
                  </div>
                  <div className="space-y-1">
                    {searchQuery.trim() && searchResults.length === 0 ? (
                      <div className="rounded border border-current/10 p-3 text-xs opacity-60">没有匹配结果</div>
                    ) : null}
                    {searchResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => onSearchResultSelect?.(result)}
                        className="block w-full rounded border border-current/10 bg-white/50 p-2 text-left text-xs hover:bg-white dark:bg-neutral-950/40 dark:hover:bg-neutral-900"
                      >
                        <span className="block truncate font-semibold">{result.title}</span>
                        <span className="mt-1 block line-clamp-3 leading-5 opacity-70">
                          {result.before ? `${result.before} ` : ''}
                          <mark className="rounded bg-yellow-200 px-0.5 text-yellow-950">{result.text}</mark>
                          {result.after ? ` ${result.after}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        ) : null}

        <main className={cx('relative min-w-0 flex-1', spacious ? 'min-h-[520px]' : 'min-h-[320px]')}>
          {children(settings)}
        </main>

        {showContext ? (
          <aside className="hidden w-72 shrink-0 overflow-auto border-l border-current/10 bg-current/[0.025] p-3 text-xs lg:block">
            {context}
          </aside>
        ) : null}
      </div>

      <div className="flex min-h-8 shrink-0 items-center justify-between gap-3 border-t border-current/10 px-3 py-1.5 text-[11px] opacity-70">
        <span className="truncate">{source ?? item.frontmatter.status}</span>
        <span className="shrink-0">{footer}</span>
      </div>
    </div>
  );
}

function RichIconButton({
  label,
  active,
  onClick,
  children
}: {
  label: string;
  active?: boolean;
  onClick(): void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        'flex h-7 w-7 items-center justify-center rounded text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900',
        active && 'bg-neutral-100 text-neutral-950 dark:bg-neutral-900 dark:text-neutral-50'
      )}
    >
      {children}
    </button>
  );
}

function RichReaderSettingsMenu({
  settings,
  onChange
}: {
  settings: RichReaderSettings;
  onChange(settings: RichReaderSettings): void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <RichIconButton label="阅读设置" active={open} onClick={() => setOpen((current) => !current)}>
        <Settings2 size={14} />
      </RichIconButton>
      {open ? (
        <div
          data-spatial-interactive
          className="absolute right-0 top-8 z-[80] w-64 rounded border border-neutral-200 bg-white p-3 text-xs text-neutral-800 shadow-xl dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
        >
          <div className="mb-2 font-semibold">阅读设置</div>
          <label className="mb-2 block">
            <span className="mb-1 block opacity-60">主题</span>
            <select
              value={settings.theme}
              onChange={(event) => onChange({ ...settings, theme: event.target.value as RichReaderTheme })}
              className="h-8 w-full rounded border border-neutral-200 bg-white px-2 dark:border-neutral-800 dark:bg-neutral-950"
            >
              <option value="light">浅色</option>
              <option value="sepia">纸张</option>
              <option value="dark">深色</option>
            </select>
          </label>
          <label className="mb-2 block">
            <span className="mb-1 block opacity-60">正文宽度</span>
            <select
              value={settings.width}
              onChange={(event) => onChange({ ...settings, width: event.target.value as RichReaderWidth })}
              className="h-8 w-full rounded border border-neutral-200 bg-white px-2 dark:border-neutral-800 dark:bg-neutral-950"
            >
              <option value="narrow">窄</option>
              <option value="medium">中</option>
              <option value="wide">宽</option>
              <option value="full">全宽</option>
            </select>
          </label>
          <label className="mb-2 block">
            <span className="mb-1 block opacity-60">字号 {settings.fontSize}px</span>
            <input
              type="range"
              min={13}
              max={22}
              value={settings.fontSize}
              onChange={(event) => onChange({ ...settings, fontSize: Number(event.target.value) })}
              className="w-full"
            />
          </label>
          <label className="block">
            <span className="mb-1 block opacity-60">行高 {settings.lineHeight.toFixed(1)}</span>
            <input
              type="range"
              min={1.3}
              max={2.2}
              step={0.1}
              value={settings.lineHeight}
              onChange={(event) => onChange({ ...settings, lineHeight: Number(event.target.value) })}
              className="w-full"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function richReaderThemeClass(theme: RichReaderTheme): string {
  if (theme === 'dark') return 'bg-neutral-950 text-neutral-100';
  if (theme === 'sepia') return 'bg-[#f5eddd] text-[#3f2f1f]';
  return 'bg-white text-neutral-950';
}

function richReaderContentWidthClass(width: RichReaderWidth): string {
  if (width === 'narrow') return 'max-w-2xl';
  if (width === 'wide') return 'max-w-5xl';
  if (width === 'full') return 'max-w-none';
  return 'max-w-3xl';
}

interface MarkdownSection {
  id: string;
  title: string;
  level: number;
  markdown: string;
  text: string;
}

function RichMarkdownReader({
  item,
  subtitle,
  spacious,
  sourceWindowId,
  thoughtNodes,
  onReaderSelection,
  onActivateThought
}: {
  item: LibraryItem;
  subtitle: string;
  spacious?: boolean;
} & ReaderSelectionCaptureProps): JSX.Element {
  const sections = useMemo(() => parseMarkdownSections(item.body || `# ${item.frontmatter.title}`), [item.body, item.frontmatter.title]);
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? 'document-start');
  const [searchQuery, setSearchQuery] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveSectionId(sections[0]?.id ?? 'document-start');
  }, [sections]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const headings = Array.from(root.querySelectorAll<HTMLElement>('[data-reader-section-id]'));
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = visible[0]?.target.getAttribute('data-reader-section-id');
        if (id) setActiveSectionId(id);
      },
      { root, rootMargin: '-12% 0px -72% 0px' }
    );
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [sections]);

  const toc = useMemo(
    () => sections.filter((section) => section.level > 0).map((section) => ({ id: section.id, title: section.title, level: section.level })),
    [sections]
  );
  const searchResults = useMemo(
    () => searchMarkdownSections(sections, searchQuery),
    [searchQuery, sections]
  );

  function scrollToSection(id: string): void {
    contentRef.current?.querySelector<HTMLElement>(`[data-reader-section-id="${CSS.escape(id)}"]`)?.scrollIntoView({
      block: 'start',
      behavior: 'smooth'
    });
    setActiveSectionId(id);
  }

  return (
    <RichReaderFrame
      item={item}
      subtitle={subtitle}
      spacious={spacious}
      toc={toc}
      activeTocId={activeSectionId}
      onTocSelect={scrollToSection}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      searchResults={searchResults}
      onSearchResultSelect={(result) => scrollToSection(result.id)}
      context={<ReaderContextSummary item={item} sections={sections} />}
      footer={<span>{sections.length} 个段落</span>}
    >
      {(settings) => (
        <ReaderScroll
          itemId={item.frontmatter.id}
          sourceWindowId={sourceWindowId}
          spacious={spacious}
          thoughtNodes={thoughtNodes}
          onReaderSelection={onReaderSelection}
          onActivateThought={onActivateThought}
          rootRef={contentRef}
          className={cx('reader-rich-markdown', richReaderThemeClass(settings.theme))}
          contentClassName={cx('mx-auto', richReaderContentWidthClass(settings.width))}
          contentStyle={{
            fontSize: 'var(--rich-reader-font-size)',
            lineHeight: 'var(--rich-reader-line-height)'
          }}
        >
          {sections.length > 0 ? (
            <div className="space-y-8">
              {sections.map((section) => (
                <section key={section.id} data-reader-section-id={section.id} className="scroll-mt-6">
                  <div className="prose prose-neutral max-w-none dark:prose-invert">
                    <StreamingMarkdown content={section.markdown} />
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyReaderBody item={item} />
          )}
        </ReaderScroll>
      )}
    </RichReaderFrame>
  );
}

function ReaderContextSummary({
  item,
  sections
}: {
  item: LibraryItem;
  sections: MarkdownSection[];
}): JSX.Element {
  const source = getLibraryReaderSource(item);
  const words = item.body.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="space-y-3">
      <div>
        <h3 className="mb-1 text-xs font-semibold">资料信息</h3>
        <dl className="space-y-1 opacity-75">
          <div className="flex justify-between gap-2">
            <dt>类型</dt>
            <dd>{readerKindLabel(getLibraryReaderKind(item))}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>段落</dt>
            <dd>{sections.length}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>词数</dt>
            <dd>{words}</dd>
          </div>
        </dl>
      </div>
      {source ? (
        <a href={source} target="_blank" rel="noreferrer" className="flex items-start gap-2 rounded border border-current/10 p-2 hover:bg-current/5">
          <ExternalLink size={13} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-all">{source}</span>
        </a>
      ) : null}
    </div>
  );
}

function RichPdfReader({
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
  const contentRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [textByPage, setTextByPage] = useState<Record<number, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [scrollMode, setScrollMode] = useState<'paginated' | 'scrolled'>('paginated');
  const [pageWidth, setPageWidth] = useState(860);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    renderReaderQuoteHighlights(root, thoughtNodes ?? EMPTY_THOUGHT_NODES);
    if (onActivateThought) decorateThoughtHighlights(root, thoughtNodes ?? EMPTY_THOUGHT_NODES, onActivateThought);
  }, [onActivateThought, pageNumber, textByPage, thoughtNodes]);

  useEffect(() => {
    const root = contentRef.current?.parentElement;
    if (!root) return;
    const update = () => setPageWidth(Math.max(320, Math.min(1080, root.clientWidth - 72)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const searchResults = useMemo<RichReaderSearchResult[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return Object.entries(textByPage)
      .filter(([, text]) => text.toLowerCase().includes(query))
      .map(([page, text]) => {
        const lower = text.toLowerCase();
        const index = lower.indexOf(query);
        return {
          id: page,
          title: `第 ${page} 页`,
          text: text.slice(index, index + query.length),
          before: text.slice(Math.max(0, index - 44), index).trim(),
          after: text.slice(index + query.length, Math.min(text.length, index + query.length + 44)).trim()
        };
      });
  }, [searchQuery, textByPage]);

  async function handlePdfLoadSuccess(pdf: { numPages: number; getPage(page: number): Promise<{ getTextContent(): Promise<{ items: Array<{ str?: string }> }> }> }): Promise<void> {
    setNumPages(pdf.numPages);
    const entries = await Promise.all(
      Array.from({ length: pdf.numPages }, async (_, index) => {
        const page = await pdf.getPage(index + 1);
        const textContent = await page.getTextContent();
        return [
          index + 1,
          textContent.items
            .map((entry) => entry.str ?? '')
            .filter(Boolean)
            .join(' ')
        ] as const;
      })
    );
    setTextByPage(Object.fromEntries(entries));
  }

  function goToPage(nextPage: number): void {
    const page = clampNumber(nextPage, 1, Math.max(1, numPages || nextPage));
    setPageNumber(page);
    if (scrollMode === 'scrolled') {
      pageRefs.current[page]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function captureSelection(): void {
    if (!onReaderSelection) return;
    window.requestAnimationFrame(() => {
      const root = contentRef.current;
      if (!root) return;
      const selection = getReaderSelectionFromRoot(item.frontmatter.id, root, sourceWindowId);
      if (selection) onReaderSelection(selection);
    });
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (isNativeInteractive(event.target)) return;
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      goToPage(pageNumber - 1);
    }
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      goToPage(pageNumber + 1);
    }
  }

  if (!source) {
    return <ArticleReader item={item} spacious={spacious} sourceWindowId={sourceWindowId} thoughtNodes={thoughtNodes} onReaderSelection={onReaderSelection} onActivateThought={onActivateThought} />;
  }

  return (
    <RichReaderFrame
      item={item}
      subtitle="PDF 阅读器"
      spacious={spacious}
      toc={Array.from({ length: numPages }, (_, index) => ({ id: String(index + 1), title: `第 ${index + 1} 页`, level: 1 }))}
      activeTocId={String(pageNumber)}
      onTocSelect={(id) => goToPage(Number(id))}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      searchResults={searchResults}
      onSearchResultSelect={(result) => goToPage(Number(result.id))}
      toolbarStart={
        <>
          <RichIconButton label="上一页" onClick={() => goToPage(pageNumber - 1)}>
            <ChevronLeft size={14} />
          </RichIconButton>
          <span className="w-16 text-center text-[11px] tabular-nums">
            {pageNumber}/{numPages || '—'}
          </span>
          <RichIconButton label="下一页" onClick={() => goToPage(pageNumber + 1)}>
            <ChevronRight size={14} />
          </RichIconButton>
          <button
            type="button"
            onClick={() => setScrollMode((current) => (current === 'paginated' ? 'scrolled' : 'paginated'))}
            className="h-7 rounded px-2 text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            {scrollMode === 'paginated' ? '单页' : '连续'}
          </button>
        </>
      }
      context={<PdfContext item={item} pageNumber={pageNumber} numPages={numPages} text={textByPage[pageNumber] ?? ''} />}
      footer={<span>第 {pageNumber} / {numPages || '—'} 页</span>}
    >
      {(settings) => (
        <div
          tabIndex={0}
          className={cx('h-full overflow-auto p-5 outline-none', richReaderThemeClass(settings.theme))}
          onPointerUp={captureSelection}
          onKeyUp={captureSelection}
          onKeyDown={handleKeyDown}
        >
          <PdfDocument
            file={source}
            onLoadSuccess={(pdf) => void handlePdfLoadSuccess(pdf as Parameters<typeof handlePdfLoadSuccess>[0])}
            loading={<ReaderLoading label="正在加载 PDF..." />}
            error={<ReaderError label="PDF 加载失败，请检查文件或链接。" />}
          >
            <div
              ref={contentRef}
              data-spatial-reader-viewport
              data-reader-resource-id={item.frontmatter.id}
              className={cx(
                'flex min-h-full',
                scrollMode === 'scrolled' ? 'flex-col items-center gap-5' : 'items-start justify-center'
              )}
            >
              {(scrollMode === 'scrolled' ? Array.from({ length: numPages }, (_, index) => index + 1) : [pageNumber]).map((page) => (
                <div
                  key={page}
                  ref={(element) => {
                    pageRefs.current[page] = element;
                  }}
                  className="overflow-hidden rounded border border-neutral-200 bg-white shadow-sm dark:border-neutral-800"
                >
                  <PdfPage
                    pageNumber={page}
                    width={pageWidth}
                    onRenderTextLayerSuccess={() => {
                      renderReaderQuoteHighlights(contentRef.current, thoughtNodes ?? EMPTY_THOUGHT_NODES);
                    }}
                  />
                </div>
              ))}
            </div>
          </PdfDocument>
        </div>
      )}
    </RichReaderFrame>
  );
}

function PdfContext({
  item,
  pageNumber,
  numPages,
  text
}: {
  item: LibraryItem;
  pageNumber: number;
  numPages: number;
  text: string;
}): JSX.Element {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold">当前页面</h3>
      <dl className="space-y-1 opacity-75">
        <div className="flex justify-between gap-2">
          <dt>页码</dt>
          <dd>{pageNumber}/{numPages || '—'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>进度</dt>
          <dd>{numPages ? `${Math.round((pageNumber / numPages) * 100)}%` : '—'}</dd>
        </div>
      </dl>
      <div className="rounded border border-current/10 p-2">
        <div className="mb-1 font-semibold">页面文本</div>
        <p className="line-clamp-[12] leading-5 opacity-70">{text || item.body || 'PDF 文本提取中。'}</p>
      </div>
    </div>
  );
}

interface MediaChapter {
  id: string;
  title: string;
  seconds: number;
}

interface MediaTranscriptSegment {
  id: string;
  startMs: number;
  text: string;
  speaker?: string;
}

let youtubeApiPromise: Promise<NonNullable<Window['YT']>> | null = null;

function RichYouTubeReader({
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
  const videoId = getYouTubeVideoId(source) ?? getYouTubeVideoId(item.body);
  const playerId = useMemo(() => `orbit-youtube-${item.frontmatter.id.replace(/[^a-z0-9_-]/gi, '-')}-${Math.random().toString(36).slice(2)}`, [item.frontmatter.id]);
  const playerRef = useRef<InstanceType<NonNullable<NonNullable<Window['YT']>['Player']>> | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const media = useMemo(() => parseMediaDocument(item), [item]);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    let timer: number | null = null;
    void loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !YT.Player) return;
        playerRef.current = new YT.Player(playerId, {
          videoId,
          playerVars: { autoplay: 0, modestbranding: 1, rel: 0 },
          events: {
            onStateChange: (event: { data: number }) => {
              setIsPlaying(event.data === YT.PlayerState?.PLAYING);
            }
          }
        });
        timer = window.setInterval(() => {
          const seconds = playerRef.current?.getCurrentTime?.();
          if (typeof seconds === 'number') setCurrentTime(seconds * 1000);
        }, 500);
      })
      .catch(() => {
        // The fallback iframe is rendered below when the API cannot load.
      });
    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [playerId, videoId]);

  function seek(timeMs: number): void {
    setCurrentTime(timeMs);
    playerRef.current?.seekTo?.(timeMs / 1000, true);
  }

  return (
    <RichMediaReader
      item={item}
      subtitle="YouTube 阅读器"
      spacious={spacious}
      sourceWindowId={sourceWindowId}
      thoughtNodes={thoughtNodes}
      onReaderSelection={onReaderSelection}
      onActivateThought={onActivateThought}
      currentTime={currentTime}
      isPlaying={isPlaying}
      onSeek={seek}
      chapters={media.chapters}
      transcript={media.transcript}
      context={<MediaContext media={media} item={item} currentTime={currentTime} />}
      hero={
        videoId ? (
          <div className="aspect-video w-full overflow-hidden bg-black">
            <div id={playerId} className="h-full w-full" />
          </div>
        ) : source ? (
          <iframe
            src={getYouTubeEmbedUrl(source) ?? source}
            title={item.frontmatter.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="aspect-video w-full border-0 bg-black"
          />
        ) : (
          <ReaderError label="缺少 YouTube 链接。" />
        )
      }
    />
  );
}

function RichPodcastReader({
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
  const audioRef = useRef<HTMLAudioElement>(null);
  const source = getPodcastAudioSource(item);
  const youtubeId = getYouTubeVideoId(source);
  const media = useMemo(() => parseMediaDocument(item), [item]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const sync = () => {
      setCurrentTime(audio.currentTime * 1000);
      setIsPlaying(!audio.paused);
      setPlaybackRate(audio.playbackRate);
      setMuted(audio.muted || audio.volume === 0);
    };
    sync();
    audio.addEventListener('timeupdate', sync);
    audio.addEventListener('play', sync);
    audio.addEventListener('pause', sync);
    audio.addEventListener('ratechange', sync);
    audio.addEventListener('volumechange', sync);
    return () => {
      audio.removeEventListener('timeupdate', sync);
      audio.removeEventListener('play', sync);
      audio.removeEventListener('pause', sync);
      audio.removeEventListener('ratechange', sync);
      audio.removeEventListener('volumechange', sync);
    };
  }, [source]);

  function seek(timeMs: number): void {
    const audio = audioRef.current;
    if (audio) audio.currentTime = timeMs / 1000;
    setCurrentTime(timeMs);
  }

  function togglePlayback(): void {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  return (
    <RichMediaReader
      item={item}
      subtitle="播客阅读器"
      spacious={spacious}
      sourceWindowId={sourceWindowId}
      thoughtNodes={thoughtNodes}
      onReaderSelection={onReaderSelection}
      onActivateThought={onActivateThought}
      currentTime={currentTime}
      isPlaying={isPlaying}
      onSeek={seek}
      chapters={media.chapters}
      transcript={media.transcript}
      context={<MediaContext media={media} item={item} currentTime={currentTime} />}
      hero={
        <div className="space-y-3 rounded border border-current/10 bg-current/[0.03] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-current/10">
              <Volume2 size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{item.frontmatter.title}</div>
              <div className="mt-1 text-xs opacity-60">{media.summary || item.frontmatter.source?.source_title || '播客资料'}</div>
            </div>
          </div>
          {source && !youtubeId ? (
            <>
              <audio ref={audioRef} src={source} controls className="w-full" />
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button type="button" onClick={() => seek(Math.max(0, currentTime - 15_000))} className="inline-flex items-center gap-1 rounded border border-current/10 px-2 py-1 hover:bg-current/5">
                  <SkipBack size={13} />15s
                </button>
                <button type="button" onClick={togglePlayback} className="inline-flex items-center gap-1 rounded border border-current/10 px-2 py-1 hover:bg-current/5">
                  {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                  {isPlaying ? '暂停' : '播放'}
                </button>
                <button type="button" onClick={() => seek(currentTime + 15_000)} className="inline-flex items-center gap-1 rounded border border-current/10 px-2 py-1 hover:bg-current/5">
                  <SkipForward size={13} />15s
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const audio = audioRef.current;
                    if (!audio) return;
                    audio.muted = !audio.muted;
                    setMuted(audio.muted);
                  }}
                  className="inline-flex items-center gap-1 rounded border border-current/10 px-2 py-1 hover:bg-current/5"
                >
                  {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  声音
                </button>
                <select
                  value={playbackRate}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (audioRef.current) audioRef.current.playbackRate = next;
                    setPlaybackRate(next);
                  }}
                  className="h-7 rounded border border-current/10 bg-transparent px-2"
                >
                  {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <option key={rate} value={rate}>{rate}x</option>
                  ))}
                </select>
              </div>
            </>
          ) : youtubeId ? (
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}`}
              title={item.frontmatter.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="aspect-video w-full border-0 bg-black"
            />
          ) : (
            <ReaderError label="缺少可播放音频源。" />
          )}
        </div>
      }
    />
  );
}

function RichMediaReader({
  item,
  subtitle,
  spacious,
  sourceWindowId,
  thoughtNodes,
  onReaderSelection,
  onActivateThought,
  hero,
  chapters,
  transcript,
  currentTime,
  isPlaying,
  onSeek,
  context
}: {
  item: LibraryItem;
  subtitle: string;
  spacious?: boolean;
  hero: ReactNode;
  chapters: MediaChapter[];
  transcript: MediaTranscriptSegment[];
  currentTime: number;
  isPlaying: boolean;
  onSeek(timeMs: number): void;
  context: ReactNode;
} & ReaderSelectionCaptureProps): JSX.Element {
  const [mediaTab, setMediaTab] = useState<'chapters' | 'transcript'>(chapters.length > 0 ? 'chapters' : 'transcript');
  const activeTranscriptIndex = useMemo(() => findActiveTranscriptIndex(currentTime, transcript), [currentTime, transcript]);
  const activeChapterIndex = useMemo(() => findActiveChapterIndex(currentTime, chapters), [chapters, currentTime]);

  const toc = useMemo(
    () =>
      (chapters.length > 0 ? chapters : transcript).map((entry, index) => ({
        id: String(index),
        title: 'title' in entry ? entry.title : `${formatTime(entry.startMs)} ${entry.text}`,
        level: 1
      })),
    [chapters, transcript]
  );

  return (
    <RichReaderFrame
      item={item}
      subtitle={subtitle}
      spacious={spacious}
      toc={toc}
      activeTocId={String(mediaTab === 'chapters' ? activeChapterIndex : activeTranscriptIndex)}
      onTocSelect={(id) => {
        const index = Number(id);
        const chapter = chapters[index];
        const segment = transcript[index];
        onSeek(chapter ? chapter.seconds * 1000 : segment?.startMs ?? 0);
      }}
      toolbarStart={
        <span className="inline-flex items-center gap-1 rounded bg-current/5 px-2 py-1 text-[11px]">
          {isPlaying ? <Play size={11} /> : <Pause size={11} />}
          {formatTime(currentTime)}
        </span>
      }
      context={context}
      footer={<span>{formatTime(currentTime)}</span>}
    >
      {(settings) => (
        <div className={cx('h-full overflow-auto px-5 py-4', richReaderThemeClass(settings.theme))}>
          <div className={cx('mx-auto space-y-4', richReaderContentWidthClass(settings.width))}>
            {hero}
            <div className="flex items-center gap-1 rounded border border-current/10 bg-current/[0.03] p-1 text-xs">
              <button
                type="button"
                onClick={() => setMediaTab('chapters')}
                className={cx('rounded px-3 py-1.5', mediaTab === 'chapters' ? 'bg-current/10 font-semibold' : 'hover:bg-current/5')}
              >
                章节 {chapters.length}
              </button>
              <button
                type="button"
                onClick={() => setMediaTab('transcript')}
                className={cx('rounded px-3 py-1.5', mediaTab === 'transcript' ? 'bg-current/10 font-semibold' : 'hover:bg-current/5')}
              >
                转写 {transcript.length}
              </button>
            </div>
            <ReaderScroll
              itemId={item.frontmatter.id}
              sourceWindowId={sourceWindowId}
              compact
              thoughtNodes={thoughtNodes}
              onReaderSelection={onReaderSelection}
              onActivateThought={onActivateThought}
              className={cx('max-h-[52vh] rounded border border-current/10', richReaderThemeClass(settings.theme))}
              contentClassName="space-y-2"
              contentStyle={{
                fontSize: 'var(--rich-reader-font-size)',
                lineHeight: 'var(--rich-reader-line-height)'
              }}
            >
              {mediaTab === 'chapters' ? (
                chapters.length > 0 ? chapters.map((chapter, index) => (
                  <button
                    key={chapter.id}
                    type="button"
                    onClick={() => onSeek(chapter.seconds * 1000)}
                    className={cx(
                      'flex w-full items-start gap-3 rounded px-3 py-2 text-left hover:bg-current/5',
                      index === activeChapterIndex && 'bg-current/10'
                    )}
                  >
                    <span className="w-16 shrink-0 font-mono text-xs opacity-60">{formatTime(chapter.seconds * 1000)}</span>
                    <span className="font-medium">{chapter.title}</span>
                  </button>
                )) : <EmptyMediaState label="暂无章节信息" />
              ) : transcript.length > 0 ? (
                transcript.map((segment, index) => (
                  <button
                    key={segment.id}
                    type="button"
                    onClick={() => onSeek(segment.startMs)}
                    className={cx(
                      'flex w-full items-start gap-3 rounded px-3 py-2 text-left hover:bg-current/5',
                      index === activeTranscriptIndex && 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-200'
                    )}
                  >
                    <span className="w-16 shrink-0 font-mono text-xs opacity-60">{formatTime(segment.startMs)}</span>
                    <span className="min-w-0">
                      {segment.speaker ? <span className="mr-1 font-semibold opacity-70">{segment.speaker}</span> : null}
                      {segment.text}
                    </span>
                  </button>
                ))
              ) : (
                <EmptyMediaState label="暂无转写内容" />
              )}
            </ReaderScroll>
          </div>
        </div>
      )}
    </RichReaderFrame>
  );
}

function MediaContext({
  media,
  item,
  currentTime
}: {
  media: ReturnType<typeof parseMediaDocument>;
  item: LibraryItem;
  currentTime: number;
}): JSX.Element {
  const active = media.transcript[findActiveTranscriptIndex(currentTime, media.transcript)];
  return (
    <div className="space-y-3">
      <div className="rounded border border-current/10 p-2">
        <div className="mb-1 flex items-center gap-1 font-semibold"><Clock size={12} />当前位置</div>
        <div className="font-mono">{formatTime(currentTime)}</div>
        {active ? <p className="mt-2 leading-5 opacity-75">{active.text}</p> : null}
      </div>
      {media.summary ? (
        <div className="rounded border border-current/10 p-2">
          <div className="mb-1 font-semibold">摘要</div>
          <p className="leading-5 opacity-75">{media.summary}</p>
        </div>
      ) : null}
      {media.keywords.length > 0 ? (
        <div>
          <div className="mb-1 flex items-center gap-1 font-semibold"><Hash size={12} />关键词</div>
          <div className="flex flex-wrap gap-1">
            {media.keywords.map((keyword) => (
              <span key={keyword} className="rounded-full border border-current/10 px-2 py-0.5 opacity-75">{keyword}</span>
            ))}
          </div>
        </div>
      ) : null}
      {item.frontmatter.source?.published_at ? (
        <div className="flex items-center gap-1 opacity-60"><Calendar size={12} />{item.frontmatter.source.published_at}</div>
      ) : null}
    </div>
  );
}

function RichEpubReader({
  item,
  spacious,
  sourceWindowId,
  onReaderSelection
}: {
  item: LibraryItem;
  spacious?: boolean;
} & ReaderSelectionCaptureProps): JSX.Element {
  const source = getLibraryReaderSource(item);
  const containerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<{ display(target?: string): Promise<unknown>; prev(): Promise<unknown>; next(): Promise<unknown>; destroy(): void; themes?: { default(theme: Record<string, unknown>): void; select(name: string): void }; getContents?(): Array<{ document?: Document }> } | null>(null);
  const bookRef = useRef<{ destroy?(): void; ready?: Promise<unknown>; loaded?: { navigation?: Promise<{ toc?: Array<{ label: string; href: string; subitems?: Array<{ label: string; href: string }> }> }>; metadata?: Promise<{ title?: string }> } } | null>(null);
  const [toc, setToc] = useState<RichReaderTocItem[]>([]);
  const [location, setLocation] = useState('');
  const [visibleText, setVisibleText] = useState('');
  const [mode, setMode] = useState<'paginated' | 'scrolled'>('paginated');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!source || !containerRef.current) return;
    const epubSource = source;
    let cancelled = false;
    setLoadError(null);

    async function mount(): Promise<void> {
      try {
        const book = ePub(epubSource);
        bookRef.current = book as typeof bookRef.current;
        const rendition = book.renderTo(containerRef.current!, {
          width: '100%',
          height: '100%',
          manager: mode === 'scrolled' ? 'continuous' : 'default',
          flow: mode === 'scrolled' ? 'scrolled' : 'paginated',
          allowScriptedContent: false
        });
        renditionRef.current = rendition as unknown as typeof renditionRef.current;

        rendition.hooks?.content?.register?.((contents: { document: Document; window: Window; cfiFromRange?(range: Range): string }) => {
          const syncSelection = () => {
            contents.window.requestAnimationFrame(() => {
              const selected = contents.window.getSelection?.();
              const text = selected?.toString().trim() ?? '';
              if (!text || !selected || selected.rangeCount === 0) return;
              const range = selected.getRangeAt(0);
              const frameElement = contents.document.defaultView?.frameElement;
              const frameRect = frameElement instanceof Element ? frameElement.getBoundingClientRect() : null;
              const baseRect = getRangeAnchorRect(range);
              const rect = baseRect && frameRect
                ? {
                    ...baseRect,
                    left: baseRect.left + frameRect.left,
                    right: baseRect.right + frameRect.left,
                    top: baseRect.top + frameRect.top,
                    bottom: baseRect.bottom + frameRect.top
                  }
                : baseRect;
              if (!rect) return;
              onReaderSelection?.({
                itemId: item.frontmatter.id,
                text,
                quote: { exact: text },
                anchorRect: rect,
                sourceWindowId
              });
            });
          };
          contents.document.addEventListener('pointerup', syncSelection);
          contents.document.addEventListener('keyup', syncSelection);
        });

        rendition.on?.('relocated', (event: { start?: { cfi?: string } }) => {
          if (cancelled) return;
          const cfi = event.start?.cfi ?? '';
          setLocation(cfi);
          const text = rendition
            .getContents?.()
            ?.map((content: { document?: Document }) => content.document?.body?.innerText ?? '')
            .filter(Boolean)
            .join('\n\n')
            .trim() ?? '';
          setVisibleText(text);
        });

        await book.ready;
        const navigation = await book.loaded?.navigation;
        if (!cancelled) {
          setToc(flattenEpubToc(navigation?.toc ?? []));
        }
        await rendition.display();
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      }
    }

    void mount();
    return () => {
      cancelled = true;
      renditionRef.current?.destroy();
      bookRef.current?.destroy?.();
      renditionRef.current = null;
      bookRef.current = null;
    };
  }, [item.frontmatter.id, mode, onReaderSelection, source, sourceWindowId]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition?.themes) return;
    rendition.themes.default({
      body: {
        color: '#111827',
        background: '#ffffff',
        'font-size': '16px',
        'line-height': '1.7',
        'font-family': 'ui-serif, Georgia, serif'
      }
    });
    rendition.themes.select('default');
  }, [location]);

  if (!source) {
    return <ReaderError label="缺少 EPUB 文件来源。" />;
  }

  return (
    <RichReaderFrame
      item={item}
      subtitle="EPUB 阅读器"
      spacious={spacious}
      toc={toc}
      activeTocId={location}
      onTocSelect={(id) => {
        const target = toc.find((entry) => entry.id === id)?.id;
        if (target) void renditionRef.current?.display(target);
      }}
      toolbarStart={
        <>
          <RichIconButton label="上一页" onClick={() => void renditionRef.current?.prev()}>
            <ChevronLeft size={14} />
          </RichIconButton>
          <RichIconButton label="下一页" onClick={() => void renditionRef.current?.next()}>
            <ChevronRight size={14} />
          </RichIconButton>
          <button
            type="button"
            onClick={() => setMode((current) => (current === 'paginated' ? 'scrolled' : 'paginated'))}
            className="h-7 rounded px-2 text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            {mode === 'paginated' ? '分页' : '滚动'}
          </button>
        </>
      }
      context={
        <div className="space-y-3">
          <div className="rounded border border-current/10 p-2">
            <div className="mb-1 font-semibold">当前位置</div>
            <p className="break-all font-mono text-[10px] opacity-60">{location || '加载中'}</p>
          </div>
          <div className="rounded border border-current/10 p-2">
            <div className="mb-1 font-semibold">当前可见文本</div>
            <p className="line-clamp-[14] leading-5 opacity-70">{visibleText || '翻页后会显示当前章节文本。'}</p>
          </div>
        </div>
      }
      footer={<span>{location ? '已定位' : '加载中'}</span>}
    >
      {() => (
        <div className="h-full p-4">
          {loadError ? (
            <ReaderError label={`EPUB 加载失败：${loadError}`} />
          ) : (
            <div ref={containerRef} className="h-full w-full overflow-hidden rounded border border-neutral-200 bg-white dark:border-neutral-800" />
          )}
        </div>
      )}
    </RichReaderFrame>
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
  compact,
  rootRef: externalRootRef,
  className,
  contentClassName,
  contentStyle
}: {
  children: ReactNode;
  itemId: string;
  sourceWindowId?: string;
  onReaderSelection?(selection: ReaderSelectionState): void;
  onActivateThought?(nodeId: string): void;
  thoughtNodes?: SpatialThoughtNode[];
  spacious?: boolean;
  compact?: boolean;
  rootRef?: RefObject<HTMLDivElement>;
  className?: string;
  contentClassName?: string;
  contentStyle?: CSSProperties;
}): JSX.Element {
  const localRootRef = useRef<HTMLDivElement>(null);
  const rootRef = externalRootRef ?? localRootRef;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    renderReaderQuoteHighlights(root, thoughtNodes);
    if (onActivateThought) decorateThoughtHighlights(root, thoughtNodes, onActivateThought);
  }, [children, onActivateThought, rootRef, thoughtNodes]);

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
      data-reader-resource-id={itemId}
      className={cx(
        'h-full min-h-0 overflow-auto bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100',
        spacious ? 'px-8 py-8' : compact ? 'px-4 py-4' : 'px-5 py-5',
        className
      )}
      onPointerUp={captureSelection}
      onKeyUp={captureSelection}
    >
      {contentClassName || contentStyle ? (
        <div className={contentClassName} style={contentStyle}>
          {children}
        </div>
      ) : (
        children
      )}
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
  onCreateChat,
  onRunAction,
  onRunAll
}: {
  selection: ReaderSelectionState | null;
  actions: SelectionActionDefinition[];
  onDismiss(): void;
  onCreateNote(): void;
  onCreateChat(): void;
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
        label="笔记"
        icon={Highlighter}
        iconClassName="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
        onClick={onCreateNote}
      />
      <SelectionActionButton
        label="对话"
        title="针对划线提问"
        icon={MessageCircle}
        iconClassName="bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200"
        onClick={onCreateChat}
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
        label="全部分析"
        title="依次生成翻译、解释、公式解析和关联检索"
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
      if (node.sourceScope === 'resource') return null;
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

function getSpatialWindowZIndex(zIndex: number): number {
  return zIndex + SPATIAL_WINDOW_Z_OFFSET;
}

function getRectCenter(rect: DOMRect): SpatialPoint {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function getRectConnectionPoint(rect: DOMRect, target: SpatialPoint): SpatialPoint {
  if (target.x < rect.left) {
    return { x: rect.left, y: clamp(target.y, rect.top + 24, rect.bottom - 24) };
  }
  if (target.x > rect.right) {
    return { x: rect.right, y: clamp(target.y, rect.top + 24, rect.bottom - 24) };
  }
  if (target.y < rect.top) {
    return { x: clamp(target.x, rect.left + 24, rect.right - 24), y: rect.top };
  }
  return { x: clamp(target.x, rect.left + 24, rect.right - 24), y: rect.bottom };
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

function getReaderElementForThoughtNode(
  node: SpatialThoughtNode,
  readerWindowIds: string[]
): HTMLElement | null {
  if (node.sourceWindowId) {
    return document.getElementById(getSpatialReaderWindowElementId(node.sourceWindowId));
  }
  for (const readerWindowId of readerWindowIds) {
    const readerElement = document.getElementById(getSpatialReaderWindowElementId(readerWindowId));
    if (readerElement?.dataset.readerItemId === node.itemId) return readerElement;
  }
  return null;
}

function getVisibleReaderResourceAnchor(
  node: SpatialThoughtNode,
  readerWindowIds: string[]
): { point: SpatialPoint; zIndex: number } | null {
  const readerElement = getReaderElementForThoughtNode(node, readerWindowIds);
  if ((node.sourceWindowId || readerWindowIds.length > 0) && !readerElement) return null;
  const resourceElement =
    readerElement ??
    document.querySelector<HTMLElement>(
      `[data-reader-resource-id="${escapeCssIdent(node.itemId)}"]`
    );
  if (!resourceElement) return null;
  const targetElement = document.getElementById(getThoughtWindowElementId(node.id));
  if (!targetElement) return null;
  return {
    point: getRectConnectionPoint(
      resourceElement.getBoundingClientRect(),
      getElementCenter(targetElement)
    ),
    zIndex: readerElement ? getElementZIndex(readerElement) : 0
  };
}

function getVisibleReaderHighlight(
  node: SpatialThoughtNode,
  readerWindowIds: string[]
): { point: SpatialPoint; zIndex: number } | null {
  if (node.sourceScope === 'resource') return getVisibleReaderResourceAnchor(node, readerWindowIds);
  const readerElement = getReaderElementForThoughtNode(node, readerWindowIds);
  if ((node.sourceWindowId || readerWindowIds.length > 0) && !readerElement) return null;
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
    zIndex: getSpatialWindowZIndex(sourceNode.zIndex)
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
          const targetZIndex = getSpatialWindowZIndex(node.zIndex);
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
  void text;
  void item;
  return '';
}

function buildAnnotationLoadingContent(label: string): string {
  return `正在生成${label}...`;
}

function buildSelectionChatContent(text: string, item: LibraryItem): string {
  void text;
  void item;
  return '';
}

function buildResourceNoteContent(item: LibraryItem): string {
  void item;
  return '';
}

function getThoughtSourcePreview(node: SpatialThoughtNode, item?: LibraryItem | null): string {
  if (node.sourceScope === 'resource') {
    return `整篇资料：${item?.frontmatter.title ?? node.sourceText.replace(/^整篇资料：/, '')}`;
  }
  return node.sourceText;
}

function libraryAnnotationTarget(itemId: string, title?: string): AnnotationTargetRef {
  return {
    kind: 'library_item',
    ref: itemId,
    ...(title ? { title_snapshot: title } : {})
  };
}

function isPersistedAnnotationId(id: string): boolean {
  return id.startsWith('ann-');
}

function parseMarkdownSections(markdown: string): MarkdownSection[] {
  const lines = markdown.split('\n');
  const sections: MarkdownSection[] = [];
  let current: { id: string; title: string; level: number; lines: string[] } | null = null;
  const seen = new Map<string, number>();

  function pushCurrent(): void {
    if (!current) return;
    const chunk = current.lines.join('\n').trim();
    sections.push({
      id: current.id,
      title: current.title,
      level: current.level,
      markdown: chunk,
      text: stripMarkdown(chunk)
    });
  }

  lines.forEach((line) => {
    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (match) {
      pushCurrent();
      const title = match[2]?.trim() || 'Untitled';
      const base = slugifyReaderHeading(title);
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      current = {
        id: count === 0 ? base : `${base}-${count + 1}`,
        title,
        level: match[1]?.length ?? 1,
        lines: [line]
      };
      return;
    }
    if (!current) {
      current = {
        id: 'document-start',
        title: '正文',
        level: 0,
        lines: []
      };
    }
    current.lines.push(line);
  });
  pushCurrent();
  return sections.filter((section) => section.markdown.trim());
}

function searchMarkdownSections(sections: MarkdownSection[], query: string): RichReaderSearchResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return sections
    .filter((section) => section.text.toLowerCase().includes(normalized))
    .map((section, index) => {
      const lower = section.text.toLowerCase();
      const matchIndex = lower.indexOf(normalized);
      return {
        id: section.id,
        title: section.title || `匹配 ${index + 1}`,
        text: section.text.slice(matchIndex, matchIndex + normalized.length),
        before: section.text.slice(Math.max(0, matchIndex - 44), matchIndex).trim(),
        after: section.text.slice(matchIndex + normalized.length, Math.min(section.text.length, matchIndex + normalized.length + 44)).trim()
      };
    });
}

function slugifyReaderHeading(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMediaDocument(item: LibraryItem): {
  summary: string;
  description: string;
  takeaways: string[];
  keywords: string[];
  chapters: MediaChapter[];
  transcript: MediaTranscriptSegment[];
} {
  const body = item.body;
  return {
    summary: extractMarkdownSectionText(body, ['Summary', 'Video Summary', '内容摘要', '摘要']) || item.frontmatter.source?.note || '',
    description: extractMarkdownSectionText(body, ['Description', '内容简介', '简介']),
    takeaways: parseListItems(extractMarkdownSectionText(body, ['Takeaways', '核心要点', '要点'])),
    keywords: parseKeywordItems(extractMarkdownSectionText(body, ['Keywords', '关键词'])),
    chapters: parseMediaChapters(body),
    transcript: parseMediaTranscript(body)
  };
}

function extractMarkdownSectionText(markdown: string, names: string[]): string {
  const wanted = new Set(names.map((name) => name.trim().toLowerCase()));
  const lines = markdown.split('\n');
  let collecting = false;
  const collected: string[] = [];

  for (const line of lines) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const headingText = (heading[1] ?? '').trim().toLowerCase();
      if (collecting) break;
      collecting = wanted.has(headingText);
      continue;
    }
    if (collecting) collected.push(line);
  }

  return collected.join('\n').trim();
}

function parseListItems(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim().replace(/^(?:[-*]|\d+\.)\s+/, ''))
    .filter(Boolean);
}

function parseKeywordItems(text: string): string[] {
  return parseListItems(text)
    .flatMap((line) => line.split(/[,，、]/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMediaChapters(markdown: string): MediaChapter[] {
  const chapters: MediaChapter[] = [];
  const lines = markdown.split('\n');
  lines.forEach((line, index) => {
    const match = /(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:[–—-]\s*)?(.+)/.exec(line.trim());
    if (!match) return;
    const seconds = parseTimestampSeconds(match[1] ?? '');
    const title = (match[2] ?? '').replace(/^[-*]\s+/, '').trim();
    if (!Number.isFinite(seconds) || !title) return;
    chapters.push({ id: `chapter-${index}-${seconds}`, seconds, title });
  });
  return dedupeMediaChapters(chapters);
}

function parseMediaTranscript(markdown: string): MediaTranscriptSegment[] {
  const section = extractMarkdownSectionText(markdown, ['Transcript', '转写', '字幕']) || markdown;
  const lines = section.split('\n');
  const segments: MediaTranscriptSegment[] = [];
  let fallbackIndex = 0;
  lines.forEach((line, index) => {
    const trimmed = line.trim().replace(/&nbsp;/g, ' ');
    if (!trimmed || trimmed.startsWith('<!--')) return;
    const speakerMatch = /^\[([^\]]+)]\s+`?(\d{1,9})`?\s+(.+)$/.exec(trimmed);
    if (speakerMatch) {
      segments.push({
        id: `segment-${index}-${speakerMatch[2]}`,
        speaker: speakerMatch[1],
        startMs: Number(speakerMatch[2]),
        text: speakerMatch[3]?.trim() ?? ''
      });
      return;
    }
    const timeMatch = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/.exec(trimmed);
    if (timeMatch) {
      segments.push({
        id: `segment-${index}-${timeMatch[1]}`,
        startMs: parseTimestampSeconds(timeMatch[1] ?? '') * 1000,
        text: timeMatch[2]?.trim() ?? ''
      });
      return;
    }
    if (trimmed.length > 80 || section !== markdown) {
      segments.push({
        id: `segment-auto-${index}`,
        startMs: fallbackIndex * 30_000,
        text: trimmed
      });
      fallbackIndex += 1;
    }
  });
  return segments.filter((segment) => segment.text);
}

function dedupeMediaChapters(chapters: MediaChapter[]): MediaChapter[] {
  const seen = new Set<string>();
  return chapters.filter((chapter) => {
    const key = `${chapter.seconds}:${chapter.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseTimestampSeconds(value: string): number {
  const parts = value.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  return parts[0] ?? 0;
}

function findActiveTranscriptIndex(currentTimeMs: number, transcript: MediaTranscriptSegment[]): number {
  return transcript.findIndex((segment, index) => {
    const next = transcript[index + 1];
    return currentTimeMs >= segment.startMs && (!next || currentTimeMs < next.startMs);
  });
}

function findActiveChapterIndex(currentTimeMs: number, chapters: MediaChapter[]): number {
  const seconds = currentTimeMs / 1000;
  return chapters.findIndex((chapter, index) => {
    const next = chapters[index + 1];
    return seconds >= chapter.seconds && (!next || seconds < next.seconds);
  });
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getYouTubeVideoId(input: string | null | undefined): string | null {
  if (!input) return null;
  const match = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([^?&/#\s]+)/i.exec(input);
  return match?.[1] ?? null;
}

function getPodcastAudioSource(item: LibraryItem): string | null {
  const source = getLibraryReaderSource(item);
  const bodyAudio = /audio_url:\s*['"]?([^\s'"]+)/i.exec(item.body)?.[1];
  return bodyAudio ?? source;
}

function loadYouTubeIframeApi(): Promise<NonNullable<Window['YT']>> {
  if (window.YT?.Player) return Promise.resolve(window.YT as NonNullable<Window['YT']>);
  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT) resolve(window.YT as NonNullable<Window['YT']>);
      };
      if (document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) return;
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => reject(new Error('Failed to load YouTube iframe API'));
      document.head.appendChild(script);
    });
  }
  return youtubeApiPromise;
}

function flattenEpubToc(items: Array<{ label: string; href: string; subitems?: Array<{ label: string; href: string }> }>, depth = 1): RichReaderTocItem[] {
  return items.flatMap((item) => [
    { id: item.href, title: item.label, level: depth },
    ...flattenEpubToc(item.subitems ?? [], depth + 1)
  ]);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ReaderLoading({ label }: { label: string }): JSX.Element {
  return (
    <div className="flex min-h-64 items-center justify-center gap-2 text-sm opacity-60">
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  );
}

function ReaderError({ label }: { label: string }): JSX.Element {
  return (
    <div className="flex min-h-64 items-center justify-center rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
      {label}
    </div>
  );
}

function EmptyMediaState({ label }: { label: string }): JSX.Element {
  return <div className="rounded border border-current/10 p-4 text-sm opacity-60">{label}</div>;
}

function uniqueAnnotations(records: AnnotationRecord[]): AnnotationRecord[] {
  const byId = new Map<string, AnnotationRecord>();
  records.forEach((record) => byId.set(record.id, record));
  return [...byId.values()];
}

function mergeThoughtNodes(...groups: SpatialThoughtNode[][]): SpatialThoughtNode[] {
  const byId = new Map<string, SpatialThoughtNode>();
  groups.flat().forEach((node) => byId.set(node.id, node));
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function annotationRecordToThoughtNode(
  record: AnnotationRecord,
  itemById: Map<string, LibraryItem>,
  viewState?: AnnotationViewState,
  index = 0
): SpatialThoughtNode | null {
  const itemId = getAnnotationLibraryItemId(record);
  if (!itemId) return null;
  const item = itemById.get(itemId);
  const sourceScope = record.anchor.kind === 'whole_source' ? 'resource' : 'selection';
  const fallbackPosition = defaultAnnotationPosition(index, sourceScope);
  const quote = record.anchor.quote ?? { exact: '' };
  return {
    id: record.id,
    itemId,
    actionId: annotationActionId(record),
    label: record.title,
    sourceScope,
    sourceText:
      sourceScope === 'resource'
        ? `整篇资料：${item?.frontmatter.title ?? record.target.title_snapshot ?? record.title}`
        : quote.exact || record.title,
    sourceQuote: quote,
    sourceNodeId: record.parent_annotation_id ?? (record.target.kind === 'annotation' ? record.target.ref : undefined),
    color: record.color ?? 'yellow',
    contentMarkdown: record.body_markdown,
    ...(typeof record.metadata?.['conversation_id'] === 'string'
      ? { conversationId: record.metadata['conversation_id'] }
      : {}),
    position: viewState?.position ?? fallbackPosition,
    size: viewState?.size ?? DEFAULT_THOUGHT_SIZE,
    status: viewState?.status ?? 'open',
    zIndex: viewState?.z_index ?? 160 + index,
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

function getAnnotationLibraryItemId(record: AnnotationRecord): string | null {
  if (record.target.kind === 'library_item') return record.target.ref;
  if (record.context_target?.kind === 'library_item') return record.context_target.ref;
  return null;
}

function annotationActionId(record: AnnotationRecord): SpatialThoughtNode['actionId'] {
  const actionId = record.metadata?.['action_id'];
  return actionId === 'translate' || actionId === 'explain' || actionId === 'formula' || actionId === 'related' || actionId === 'chat'
    ? actionId
    : 'note';
}

function defaultAnnotationPosition(index: number, sourceScope: SpatialThoughtNode['sourceScope']): SpatialPoint {
  return {
    x: sourceScope === 'resource' ? 80 + (index % 4) * 34 : 120 + (index % 4) * 34,
    y: 90 + (index % 6) * 38
  };
}

function legacyLibraryAnnotationsToThoughtNodes(
  item: LibraryItem | undefined,
  viewStateById: Map<string, AnnotationViewState>
): SpatialThoughtNode[] {
  if (!item?.frontmatter.annotations?.length) return [];
  return item.frontmatter.annotations.map((annotation, index) => {
    const id = `legacy-${annotation.id}`;
    const viewState = viewStateById.get(id);
    return {
      id,
      itemId: item.frontmatter.id,
      actionId: 'note',
      label: annotation.comment ? '评论' : '标注',
      sourceScope: 'selection',
      sourceText: annotation.text,
      sourceQuote: { exact: annotation.text },
      color: parseAnnotationColor(annotation.color),
      contentMarkdown: annotation.comment
        ? buildThoughtContent('评论', annotation.text, item, [annotation.comment])
        : buildNoteContent(annotation.text, item),
      position: viewState?.position ?? defaultAnnotationPosition(index, 'selection'),
      size: viewState?.size ?? DEFAULT_THOUGHT_SIZE,
      status: viewState?.status ?? 'open',
      zIndex: viewState?.z_index ?? 120 + index,
      createdAt: annotation.at,
      updatedAt: annotation.at
    };
  });
}

function parseAnnotationColor(color: string | undefined): ReaderHighlightColor {
  return color === 'green' || color === 'blue' || color === 'pink' || color === 'purple' ? color : 'yellow';
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

function buildSelectionChatPrompt({
  question,
  node,
  currentItem,
  canvasItems
}: {
  question: string;
  node: SpatialThoughtNode;
  currentItem: LibraryItem | null;
  canvasItems: LibraryItem[];
}): string {
  const currentMaterial = currentItem
    ? renderMaterialContext(currentItem, 4200)
    : '当前资料不可用。';
  const canvasMaterialContext = canvasItems.length
    ? canvasItems.map((item, index) => `### ${index + 1}. ${renderMaterialContext(item, 1200)}`).join('\n\n')
    : '空间画布里目前没有打开的其他资料。';
  return [
    '你正在 Orbit 阅读器里回答一次“划线对话”。',
    '请严格基于以下三层上下文回答；如果信息不足，明确指出缺口，不要编造。',
    '',
    '<context_layer_1_selected_text>',
    node.sourceText,
    '</context_layer_1_selected_text>',
    '',
    '<context_layer_2_current_material>',
    currentMaterial,
    '</context_layer_2_current_material>',
    '',
    '<context_layer_3_canvas_materials>',
    canvasMaterialContext,
    '</context_layer_3_canvas_materials>',
    '',
    '<user_question>',
    question,
    '</user_question>',
    '',
    '回答要求：',
    '- 用中文回答，除非用户明确要求其他语言。',
    '- 先直接回答用户问题，再补充必要依据。',
    '- 如果引用上下文，请说明来自“划线”“当前资料”或“画布资料”。'
  ].join('\n');
}

function renderMaterialContext(item: LibraryItem, maxBodyLength: number): string {
  const source = getLibraryReaderSource(item);
  return [
    `标题：${item.frontmatter.title}`,
    `类型：${readerKindLabel(getLibraryReaderKind(item))}`,
    source ? `来源：${source}` : null,
    '',
    '正文摘录：',
    clipText(item.body, maxBodyLength)
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n');
}

function conversationTurnToThoughtChatMessage(turn: ConversationTurn): ThoughtChatMessage {
  return {
    id: turn.id,
    role: turn.role === 'assistant' ? 'assistant' : 'user',
    text: turn.role === 'user' ? extractUserQuestionFromPrompt(turn.content) : turn.content
  };
}

function extractUserQuestionFromPrompt(content: string): string {
  const match = content.match(/<user_question>\s*([\s\S]*?)\s*<\/user_question>/u);
  return match?.[1]?.trim() || content;
}

function mergeAssistantRuntimeMessage(
  current: ThoughtChatMessage[],
  next: { id: string; runId: string; text: string; streaming: boolean; final: boolean }
): ThoughtChatMessage[] {
  if (!next.text.trim()) return current;
  const last = current[current.length - 1];
  if (next.streaming) {
    if (last?.role === 'assistant' && last.streaming) {
      return [
        ...current.slice(0, -1),
        { ...last, text: `${last.text}${next.text}` }
      ];
    }
    return [
      ...current,
      { id: `assistant-${next.runId}`, role: 'assistant', text: next.text, streaming: true }
    ];
  }
  if (last?.role === 'assistant' && last.streaming) {
    return [
      ...current.slice(0, -1),
      {
        ...last,
        text: next.final && next.text.length >= last.text.length ? next.text : last.text,
        streaming: false
      }
    ];
  }
  return [
    ...current,
    { id: next.id, role: 'assistant', text: next.text }
  ];
}

function thoughtIcon(actionId: SpatialThoughtNode['actionId']): LucideIcon {
  if (actionId === 'translate') return Languages;
  if (actionId === 'explain') return BookA;
  if (actionId === 'formula') return Braces;
  if (actionId === 'related') return Link;
  if (actionId === 'chat') return MessageCircle;
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
