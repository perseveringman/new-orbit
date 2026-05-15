import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getICloudInboxPath } from './config';
import { ingestCapture } from './ingest';

export interface MobileInboundWatcher {
  stop(): Promise<void>;
}

export interface MobileInboundWatcherOptions {
  scanIntervalMs?: number;
}

const DEFAULT_SCAN_INTERVAL_MS = 30_000;

export async function startMobileInboundWatcher(
  vaultPath: string,
  options: MobileInboundWatcherOptions = {}
): Promise<MobileInboundWatcher> {
  const inboxPath = await getICloudInboxPath();
  if (!inboxPath) {
    console.warn('[mobile_inbound] iCloud container not found, skipping');
    return { stop: () => Promise.resolve() };
  }
  await fs.mkdir(inboxPath, { recursive: true });

  const processing = new Set<string>();
  const processCaptureDir = (captureDir: string): void => {
    if (processing.has(captureDir)) return;
    processing.add(captureDir);
    void ingestCapture(vaultPath, captureDir)
      .catch((error: unknown) => {
        console.error('[mobile_inbound] ingest failed', error);
      })
      .finally(() => processing.delete(captureDir));
  };

  const scan = async (): Promise<void> => {
    for (const captureDir of await listCompleteCaptureDirs(inboxPath)) {
      processCaptureDir(captureDir);
    }
  };

  const watcher: FSWatcher = chokidar.watch(path.join(inboxPath, '*', '.complete'), {
    ignoreInitial: false,
    depth: 2,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100
    }
  });

  watcher.on('add', (completeMarkerPath) => {
    processCaptureDir(path.dirname(completeMarkerPath));
  });
  watcher.on('change', (completeMarkerPath) => {
    processCaptureDir(path.dirname(completeMarkerPath));
  });

  void scan();
  const scanInterval = setInterval(() => void scan(), options.scanIntervalMs ?? DEFAULT_SCAN_INTERVAL_MS);
  scanInterval.unref?.();

  return {
    async stop() {
      clearInterval(scanInterval);
      await watcher.close();
    }
  };
}

export async function listCompleteCaptureDirs(inboxPath: string): Promise<string[]> {
  const entries = await fs.readdir(inboxPath, { withFileTypes: true }).catch((error: unknown) => {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  });
  const dirs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const captureDir = path.join(inboxPath, entry.name);
        try {
          await fs.access(path.join(captureDir, '.complete'));
          return captureDir;
        } catch {
          return null;
        }
      })
  );
  return dirs.filter((dir): dir is string => Boolean(dir)).sort();
}
