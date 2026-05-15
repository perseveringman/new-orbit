import { protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

export const ORBIT_MEDIA_SCHEME = 'orbit-media';

export function registerOrbitMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ORBIT_MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true
      }
    }
  ]);
}

export function registerOrbitMediaProtocol(getVaultPath: () => string | null): void {
  protocol.handle(ORBIT_MEDIA_SCHEME, async (request) => {
    const vaultPath = getVaultPath();
    if (!vaultPath) return new Response('No Orbit vault is open.', { status: 404 });

    const relPath = vaultRelativePathFromUrl(request.url);
    if (!relPath) return new Response('Invalid media URL.', { status: 400 });

    const absPath = resolveInsideVault(vaultPath, relPath);
    if (!absPath) return new Response('Media path is outside the Orbit vault.', { status: 403 });

    try {
      return await fileResponse(absPath, request);
    } catch {
      return new Response('Media file not found.', { status: 404 });
    }
  });
}

function vaultRelativePathFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== `${ORBIT_MEDIA_SCHEME}:` || url.hostname !== 'vault') return null;
    const decoded = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const normalized = path.posix.normalize(decoded.replace(/\\/g, '/'));
    if (
      !normalized ||
      normalized === '.' ||
      normalized === '..' ||
      normalized.startsWith('../') ||
      path.posix.isAbsolute(normalized)
    ) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

function resolveInsideVault(vaultPath: string, relPath: string): string | null {
  const root = path.resolve(vaultPath);
  const target = path.resolve(root, relPath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null;
  return target;
}

async function fileResponse(filePath: string, request: Request): Promise<Response> {
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile()) return new Response('Media file not found.', { status: 404 });

  const size = stat.size;
  const range = parseRangeHeader(request.headers.get('range'), size);
  if (range === 'invalid') {
    return new Response(null, {
      status: 416,
      headers: {
        'accept-ranges': 'bytes',
        'content-range': `bytes */${size}`
      }
    });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? Math.max(0, size - 1);
  const contentLength = size === 0 ? 0 : end - start + 1;
  const headers = new Headers({
    'accept-ranges': 'bytes',
    'content-length': String(contentLength),
    'content-type': mimeTypeForPath(filePath) ?? 'application/octet-stream'
  });
  if (range) {
    headers.set('content-range', `bytes ${start}-${end}/${size}`);
  }

  if (request.method === 'HEAD') {
    return new Response(null, {
      status: range ? 206 : 200,
      headers
    });
  }

  const stream = size === 0 ? null : Readable.toWeb(fs.createReadStream(filePath, { start, end }));
  return new Response(stream as BodyInit | null, {
    status: range ? 206 : 200,
    headers
  });
}

function parseRangeHeader(header: string | null, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return 'invalid';

  const rawStart = match[1] ?? '';
  const rawEnd = match[2] ?? '';
  if (!rawStart && !rawEnd) return 'invalid';

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return 'invalid';
    return {
      start: Math.max(0, size - suffixLength),
      end: Math.max(0, size - 1)
    };
  }

  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
    return 'invalid';
  }
  return { start, end: Math.min(end, size - 1) };
}

function mimeTypeForPath(filePath: string): string | null {
  switch (path.extname(filePath).toLowerCase()) {
    case '.avif':
      return 'image/avif';
    case '.bmp':
      return 'image/bmp';
    case '.gif':
      return 'image/gif';
    case '.jpeg':
    case '.jpg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.svg':
      return 'image/svg+xml';
    case '.webp':
      return 'image/webp';
    case '.flac':
      return 'audio/flac';
    case '.m4a':
    case '.aac':
      return 'audio/mp4';
    case '.mp3':
      return 'audio/mpeg';
    case '.oga':
    case '.ogg':
    case '.opus':
      return 'audio/ogg';
    case '.wav':
      return 'audio/wav';
    case '.weba':
      return 'audio/webm';
    case '.3gp':
      return 'audio/3gpp';
    case '.m4v':
    case '.mp4':
      return 'video/mp4';
    case '.mkv':
      return 'video/x-matroska';
    case '.mov':
      return 'video/quicktime';
    case '.mpeg':
      return 'video/mpeg';
    case '.ogv':
      return 'video/ogg';
    case '.webm':
      return 'video/webm';
    case '.pdf':
      return 'application/pdf';
    default:
      return null;
  }
}
