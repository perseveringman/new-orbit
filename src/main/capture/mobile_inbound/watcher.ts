import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getICloudInboxPath } from './config';
import { ingestCapture } from './ingest';

export interface MobileInboundWatcher {
  stop(): Promise<void>;
}

export async function startMobileInboundWatcher(vaultPath: string): Promise<MobileInboundWatcher> {
  const inboxPath = await getICloudInboxPath();
  if (!inboxPath) {
    console.warn('[mobile_inbound] iCloud container not found, skipping');
    return { stop: () => Promise.resolve() };
  }
  await fs.mkdir(inboxPath, { recursive: true });

  const processing = new Set<string>();
  const watcher: FSWatcher = chokidar.watch(path.join(inboxPath, '*', '.complete'), {
    ignoreInitial: false,
    depth: 2,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100
    }
  });

  watcher.on('add', (completeMarkerPath) => {
    const captureDir = path.dirname(completeMarkerPath);
    if (processing.has(captureDir)) return;
    processing.add(captureDir);
    void ingestCapture(vaultPath, captureDir)
      .catch((error: unknown) => {
        console.error('[mobile_inbound] ingest failed', error);
      })
      .finally(() => processing.delete(captureDir));
  });

  return {
    async stop() {
      await watcher.close();
    }
  };
}
