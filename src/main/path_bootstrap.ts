import os from 'node:os';
import path from 'node:path';
import fixPath from 'fix-path';

const FALLBACK_SEGMENTS = ['/opt/homebrew/bin', '/usr/local/bin'] as const;

function dedupePathSegments(segments: string[]): string[] {
  const seen = new Set<string>();
  return segments.filter((segment) => {
    const normalized = segment.trim();
    if (!normalized) return false;
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function buildBootstrappedPath(
  existingPath: string | undefined,
  homeDir: string,
  delimiter = path.delimiter
): string {
  const fallbackSegments = [...FALLBACK_SEGMENTS, path.join(homeDir, '.local', 'bin')];
  const pathSegments = existingPath ? existingPath.split(delimiter) : [];
  return dedupePathSegments([...fallbackSegments, ...pathSegments]).join(delimiter);
}

type BootstrapOptions = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDir?: string;
  repairPath?: () => void;
  warn?: (message: string, error: unknown) => void;
};

export function bootstrapMainProcessPath(options: BootstrapOptions = {}): void {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  if (platform === 'win32') return;

  try {
    (options.repairPath ?? fixPath)();
  } catch (error) {
    (options.warn ?? console.warn)('[path-bootstrap] Failed to recover PATH from login shell.', error);
  }

  env.PATH = buildBootstrappedPath(env.PATH, options.homeDir ?? os.homedir());
}
