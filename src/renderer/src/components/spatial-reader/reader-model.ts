import type { LibraryItem, LibraryKind } from '@shared/library';

export type SpatialReaderKind = 'article' | 'markdown' | 'pdf' | 'epub' | 'video' | 'podcast' | 'bookmark';

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
  const inferred = inferReaderKindFromSource(item);
  if (inferred) return inferred;
  if (
    kind === 'markdown' ||
    kind === 'pdf' ||
    kind === 'epub' ||
    kind === 'video' ||
    kind === 'podcast' ||
    kind === 'bookmark'
  ) {
    return kind;
  }
  return 'article';
}

export function readerKindLabel(kind: SpatialReaderKind | LibraryKind): string {
  if (kind === 'markdown') return 'Markdown 阅读器';
  if (kind === 'pdf') return 'PDF 阅读器';
  if (kind === 'epub') return 'EPUB 阅读器';
  if (kind === 'video') return '视频阅读器';
  if (kind === 'podcast') return '播客阅读器';
  if (kind === 'bookmark') return '书签阅读器';
  return '文章阅读器';
}

export function getLibraryReaderSource(item: LibraryItem, vaultRoot?: string | null): string | null {
  const localPath = item.frontmatter.local_path?.trim();
  if (localPath) return normalizeLibraryReaderSource(localPath, vaultRoot);
  const url = item.frontmatter.url?.trim() || item.frontmatter.source?.url?.trim();
  return url || null;
}

export function normalizeLibraryReaderSource(value: string, vaultRoot?: string | null): string {
  const clean = value.trim();
  const parts = splitTargetReference(clean);
  const pathPart = parts.path;
  const suffix = `${parts.query ?? ''}${parts.hash ?? ''}`;

  if (/^file:/i.test(clean)) {
    const vaultRelative = vaultRelativeFromFileUrl(clean, vaultRoot);
    return vaultRelative ? `${vaultMediaUrl(vaultRelative)}${suffix}` : clean;
  }
  if (/^(https?:|data:|blob:|orbit-media:)/i.test(clean)) return clean;
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean) && !isAbsolutePath(pathPart)) return clean;

  if (isAbsolutePath(pathPart)) {
    const vaultRelative = vaultRelativeFromAbsolutePath(pathPart, vaultRoot);
    return vaultRelative ? `${vaultMediaUrl(vaultRelative)}${suffix}` : `${pathToFileUrl(pathPart)}${suffix}`;
  }

  return `${vaultMediaUrl(pathPart)}${suffix}`;
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
  const source = [
    item.frontmatter.url,
    item.frontmatter.local_path,
    item.frontmatter.source?.parser_hint,
    item.frontmatter.source?.provider
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();
  const body = item.body.toLowerCase();
  if (/\.(epub)(?:$|[?#])/.test(source)) return 'epub';
  if (/\.(pdf)(?:$|[?#])/.test(source)) return 'pdf';
  if (/\.(md|markdown|mdx)(?:$|[?#])/.test(source)) return 'markdown';
  if (/\.(mp3|m4a|aac|wav|ogg|flac)(?:$|[?#])/.test(source)) return 'podcast';
  if (source.includes('podcast') || source.includes('podwise')) return 'podcast';
  if (/##\s+transcript/.test(body) && /\[[^\]]+\]\s+`\d+`/.test(body)) return 'podcast';
  if (/\.(mp4|mov|webm|m4v)(?:$|[?#])/.test(source)) return 'video';
  if (source.includes('youtube.com') || source.includes('youtu.be')) return 'video';
  return null;
}

function splitTargetReference(target: string): { path: string; query?: string; hash?: string } {
  const hashIndex = target.indexOf('#');
  const beforeHash = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const hash = hashIndex === -1 ? undefined : target.slice(hashIndex);
  const queryIndex = beforeHash.indexOf('?');
  if (queryIndex === -1) return { path: beforeHash, hash };
  return {
    path: beforeHash.slice(0, queryIndex),
    query: beforeHash.slice(queryIndex),
    hash
  };
}

function isAbsolutePath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/');
  return normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized);
}

function vaultMediaUrl(relativePath: string): string {
  const encoded = normalizePosixPath(relativePath)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `orbit-media://vault/${encoded}`;
}

function vaultRelativeFromFileUrl(value: string, vaultRoot?: string | null): string | null {
  if (!vaultRoot) return null;
  try {
    const url = new URL(value);
    return vaultRelativeFromAbsolutePath(decodeURIComponent(url.pathname), vaultRoot);
  } catch {
    return null;
  }
}

function vaultRelativeFromAbsolutePath(filePath: string, vaultRoot?: string | null): string | null {
  if (!vaultRoot) return null;
  const normalizedRoot = normalizeAbsolutePath(vaultRoot).replace(/\/+$/, '');
  const normalizedPath = normalizeAbsolutePath(filePath);
  const caseFold = /^[A-Za-z]:\//.test(normalizedRoot);
  const rootForCompare = caseFold ? normalizedRoot.toLowerCase() : normalizedRoot;
  const pathForCompare = caseFold ? normalizedPath.toLowerCase() : normalizedPath;
  if (pathForCompare === rootForCompare) return '';
  if (!pathForCompare.startsWith(`${rootForCompare}/`)) return null;
  return normalizePosixPath(normalizedPath.slice(normalizedRoot.length + 1));
}

function normalizeAbsolutePath(input: string): string {
  const normalized = input.replace(/\\/g, '/');
  return normalized.replace(/^\/([A-Za-z]:\/)/, '$1');
}

function normalizePosixPath(input: string): string {
  const output: string[] = [];
  for (const part of input.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') output.pop();
    else output.push(part);
  }
  return output.join('/');
}

function pathToFileUrl(filePath: string): string {
  let normalized = normalizeAbsolutePath(filePath);
  if (/^[A-Za-z]:\//.test(normalized)) normalized = `/${normalized}`;
  return `file://${encodeURI(normalized).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
}
