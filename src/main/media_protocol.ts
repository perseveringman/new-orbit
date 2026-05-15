import { net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
      return await net.fetch(pathToFileURL(absPath).toString(), {
        headers: request.headers
      });
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
