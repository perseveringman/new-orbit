import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR, ORBIT_GIT_LOG, ORBIT_LOGS_DIR } from '@shared/constants';

/**
 * Append a structured NDJSON entry to `<vault>/.orbit/logs/git.log`.
 * Never throws: logging failures are swallowed so they cannot break
 * IPC handlers.
 */
export async function appendGitLog(
  vault: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const dir = path.join(vault, ORBIT_DIR, ORBIT_LOGS_DIR);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, ORBIT_GIT_LOG);
    const line = JSON.stringify({ at: new Date().toISOString(), ...payload });
    await fs.appendFile(file, `${line}\n`, 'utf8');
  } catch {
    // swallow — logging must never break IPC handlers
  }
}
