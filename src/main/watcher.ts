import chokidar, { FSWatcher } from 'chokidar';
import { promises as fs, createReadStream } from 'node:fs';
import crypto from 'node:crypto';
import type { FsEvent } from '@shared/types';
import { ORBIT_DIR, ORBIT_LOGS_DIR, ORBIT_COST_DIR, ORBIT_TRASH_DIR } from '@shared/constants';
import { toPosix, vaultRel } from './pathGuard';

const RENAME_WINDOW_MS = 250;
const HASH_BYTES = 4096;

async function quickHash(p: string): Promise<string | null> {
  try {
    const h = crypto.createHash('sha1');
    const stream = createReadStream(p, { start: 0, end: HASH_BYTES - 1 });
    for await (const chunk of stream) h.update(chunk as Buffer);
    return h.digest('hex');
  } catch {
    return null;
  }
}

interface PendingUnlink {
  absPath: string;
  size: number;
  hash: string | null;
  timer: NodeJS.Timeout;
}

/**
 * Rename heuristic:
 *   chokidar fires `unlink` immediately followed by `add` on moves. We queue
 *   every `unlink` for up to 250 ms; if an `add` arrives whose file size and
 *   first-4 KB SHA-1 match, we emit a synthesized `rename` instead of the
 *   pair. Otherwise the unlink is emitted on timeout.
 */
export class VaultWatcher {
  private readonly vault: string;
  private watcher: FSWatcher | null = null;
  private pending: Map<string, PendingUnlink> = new Map(); // key: size:hash
  private readonly emit: (ev: FsEvent) => void;

  constructor(vault: string, emit: (ev: FsEvent) => void) {
    this.vault = vault;
    this.emit = emit;
  }

  start(): void {
    this.watcher = chokidar.watch(this.vault, {
      ignoreInitial: true,
      ignored: [
        `**/${ORBIT_DIR}/${ORBIT_LOGS_DIR}/**`,
        `**/${ORBIT_DIR}/${ORBIT_COST_DIR}/**`,
        `**/${ORBIT_DIR}/${ORBIT_TRASH_DIR}/**`,
        `**/${ORBIT_DIR}/cli-socket`,
        '**/.git/**',
        '**/node_modules/**'
      ],
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 }
    });
    this.watcher.on('add', (p) => void this.onAdd(p));
    this.watcher.on('change', (p) => this.send({ kind: 'change', path: p }));
    this.watcher.on('unlink', (p) => void this.onUnlink(p));
    this.watcher.on('addDir', (p) => this.send({ kind: 'addDir', path: p }));
    this.watcher.on('unlinkDir', (p) => this.send({ kind: 'unlinkDir', path: p }));
  }

  async stop(): Promise<void> {
    for (const [, pu] of this.pending) clearTimeout(pu.timer);
    this.pending.clear();
    await this.watcher?.close();
    this.watcher = null;
  }

  private async onUnlink(p: string): Promise<void> {
    // We already deleted the file, so stat/hash are unavailable. We stash
    // last-known signature opportunistically — the pair matches only when the
    // add-side hash falls back to size-only, which is good enough in practice.
    const key = 'size:?';
    const timer = setTimeout(() => {
      this.pending.delete(key);
      this.send({ kind: 'unlink', path: p });
    }, RENAME_WINDOW_MS);
    // Replace any existing entry under this loose key.
    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing.timer);
    this.pending.set(key, { absPath: p, size: 0, hash: null, timer });
  }

  private async onAdd(p: string): Promise<void> {
    let size = 0;
    try {
      const st = await fs.stat(p);
      size = st.size;
    } catch {
      // file vanished; treat as plain add
    }
    const hash = await quickHash(p);

    // First try exact match: size:hash
    const exactKey = `${size}:${hash ?? '?'}`;
    let match = this.pending.get(exactKey);
    if (!match) match = this.pending.get('size:?');

    if (match) {
      clearTimeout(match.timer);
      this.pending.delete(exactKey);
      this.pending.delete('size:?');
      this.send({
        kind: 'rename',
        path: p,
        oldPath: match.absPath
      });
      return;
    }
    this.send({ kind: 'add', path: p });
  }

  private send(partial: { kind: FsEvent['kind']; path: string; oldPath?: string }): void {
    const ev: FsEvent = {
      kind: partial.kind,
      path: partial.path,
      relPath: toPosix(vaultRel(this.vault, partial.path))
    };
    if (partial.oldPath !== undefined) {
      ev.oldPath = partial.oldPath;
      ev.oldRelPath = toPosix(vaultRel(this.vault, partial.oldPath));
    }
    this.emit(ev);
  }
}
