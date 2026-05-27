import type { LibraryItem, LibraryKind } from '@shared/library';

export type SpatialReaderKind = 'article' | 'pdf' | 'video' | 'bookmark';

export interface SpatialPoint {
  x: number;
  y: number;
}

export interface SpatialSize {
  width: number;
  height: number;
}

export interface SpatialViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface SpatialReaderWindowState {
  id: string;
  itemId: string;
  position: SpatialPoint;
  size: SpatialSize;
  status: 'open' | 'minimized' | 'closed';
  zIndex: number;
}

export const LIBRARY_ITEM_DRAG_MIME = 'application/x-orbit-library-item';

export function getLibraryReaderKind(item: LibraryItem): SpatialReaderKind {
  const kind = item.frontmatter.kind;
  if (kind === 'pdf' || kind === 'video' || kind === 'bookmark') return kind;
  return inferReaderKindFromSource(item) ?? 'article';
}

export function readerKindLabel(kind: SpatialReaderKind | LibraryKind): string {
  if (kind === 'pdf') return 'PDF 阅读器';
  if (kind === 'video') return '视频阅读器';
  if (kind === 'bookmark') return '书签阅读器';
  return '文章阅读器';
}

export function getLibraryReaderSource(item: LibraryItem): string | null {
  const localPath = item.frontmatter.local_path?.trim();
  if (localPath) return pathLikeToUrl(localPath);
  const url = item.frontmatter.url?.trim() || item.frontmatter.source?.url?.trim();
  return url || null;
}

export function getYouTubeEmbedUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host !== 'youtube.com' && host !== 'm.youtube.com') return null;
    if (url.pathname === '/watch') {
      const id = url.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if ((parts[0] === 'embed' || parts[0] === 'shorts') && parts[1]) {
      return `https://www.youtube.com/embed/${parts[1]}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function makeLibraryDragPayload(itemId: string): string {
  return JSON.stringify({ type: 'orbit/library-item', itemId });
}

export function readLibraryDragPayload(dataTransfer: DataTransfer): string | null {
  const raw =
    dataTransfer.getData(LIBRARY_ITEM_DRAG_MIME) ||
    dataTransfer.getData('application/json') ||
    dataTransfer.getData('text/plain');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { type?: unknown; itemId?: unknown };
    if (parsed.type === 'orbit/library-item' && typeof parsed.itemId === 'string') {
      return parsed.itemId;
    }
  } catch {
    return raw.startsWith('lib-') ? raw : null;
  }
  return null;
}

function inferReaderKindFromSource(item: LibraryItem): SpatialReaderKind | null {
  const source = `${item.frontmatter.url ?? ''} ${item.frontmatter.local_path ?? ''}`.toLowerCase();
  if (/\.(pdf)(?:$|[?#])/.test(source)) return 'pdf';
  if (/\.(mp4|mov|webm|m4v)(?:$|[?#])/.test(source)) return 'video';
  if (source.includes('youtube.com') || source.includes('youtu.be')) return 'video';
  return null;
}

function pathLikeToUrl(value: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  const normalized = value.replace(/\\/g, '/');
  return `file://${encodeURI(normalized).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
}
