import { app } from 'electron';
import { promises as fs, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';

export type CrashOrigin = 'main' | 'renderer' | 'preload';

export interface CrashRecord {
  ts: string; // ISO8601
  origin: CrashOrigin;
  version: string;
  message: string;
  stack?: string;
  extra?: Record<string, unknown>;
}

/** Resolve the directory where crash logs should be written. */
export function crashLogDir(vaultPath: string | null, userData: string): string {
  if (vaultPath) return path.join(vaultPath, '.orbit', 'crash');
  return path.join(userData, 'crash');
}

/** Build the absolute path to today's crash log file. */
export function crashLogFile(
  vaultPath: string | null,
  userData: string,
  now: Date = new Date()
): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return path.join(crashLogDir(vaultPath, userData), `${y}-${m}-${d}.log`);
}

/** Render a single NDJSON record. Always ends with a single newline. */
export function formatCrashRecord(rec: CrashRecord): string {
  return JSON.stringify(rec) + '\n';
}

/**
 * Append a crash record (NDJSON) to today's log file. Creates the directory
 * if needed. Tolerates filesystem errors so logging never throws.
 */
export async function writeCrashRecord(
  rec: CrashRecord,
  opts: { vaultPath: string | null; userData: string }
): Promise<string> {
  const file = crashLogFile(opts.vaultPath, opts.userData, new Date(rec.ts));
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, formatCrashRecord(rec), 'utf8');
  } catch {
    /* swallow — we're in a crash path; don't cascade. */
  }
  return file;
}

/** Synchronous variant for `process.on('exit')`-style code paths. */
export function writeCrashRecordSync(
  rec: CrashRecord,
  opts: { vaultPath: string | null; userData: string }
): string {
  const file = crashLogFile(opts.vaultPath, opts.userData, new Date(rec.ts));
  try {
    const dir = path.dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(file, formatCrashRecord(rec), 'utf8');
  } catch {
    /* swallow */
  }
  return file;
}

/** Describe an error value (Error or thrown non-Error) to a CrashRecord. */
export function describe(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message || err.name, stack: err.stack };
  }
  if (typeof err === 'string') return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: String(err) };
  }
}

/**
 * Install process-level hooks in the main process. Caller provides a
 * lookup for the currently-open vault path (may be `null`).
 */
export function installMainCrashHandlers(opts: {
  getVaultPath: () => string | null;
  userData: string;
  version: string;
}): void {
  const write = (origin: CrashOrigin, err: unknown): void => {
    const d = describe(err);
    const rec: CrashRecord = {
      ts: new Date().toISOString(),
      origin,
      version: opts.version,
      message: d.message,
      stack: d.stack
    };
    try {
      // eslint-disable-next-line no-console
      console.error(`[orbit:crash:${origin}]`, d.message, d.stack ?? '');
    } catch { /* noop */ }
    writeCrashRecordSync(rec, {
      vaultPath: opts.getVaultPath(),
      userData: opts.userData
    });
  };

  process.on('uncaughtException', (err) => write('main', err));
  process.on('unhandledRejection', (err) => write('main', err));

  // Electron-specific: crashes in the renderer bubble here too.
  app.on('render-process-gone', (_e, _wc, details) => {
    write('renderer', new Error(`render-process-gone: ${details.reason}`));
  });
  app.on('child-process-gone', (_e, details) => {
    write('main', new Error(`child-process-gone(${details.type}): ${details.reason}`));
  });
}
