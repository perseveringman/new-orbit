import { spawn, execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DetectResult } from '@shared/agent';

const CACHE_TTL_MS = 60_000;

let cached: { at: number; result: DetectResult } | null = null;

function candidatePaths(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.claude', 'local', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude'
  ];
}

async function exists(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isFile() || s.isSymbolicLink();
  } catch {
    return false;
  }
}

function whichClaude(): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn(process.platform === 'win32' ? 'where' : 'which', ['claude'], {
      env: process.env
    });
    let out = '';
    proc.stdout?.on('data', (d: Buffer) => (out += d.toString('utf8')));
    proc.on('close', () => {
      const first = out.split(/\r?\n/).find((l) => l.trim().length > 0);
      resolve(first?.trim() || null);
    });
    proc.on('error', () => resolve(null));
  });
}

function probeVersion(bin: string, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(bin, ['--version'], { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      resolve((stdout || '').trim());
    });
    child.on('error', (e) => reject(e));
  });
}

/**
 * Locate the `claude` binary and probe its version. Result is cached for
 * 60s so the UI can poll without hammering `which`.
 */
export async function detectClaude(force = false): Promise<DetectResult> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.result;
  }
  const overridePath = process.env['ORBIT_CLAUDE_PATH_OVERRIDE']?.trim();
  let binPath: string | null = overridePath || null;
  if (!binPath) {
    binPath = await whichClaude();
    if (!binPath) {
      for (const p of candidatePaths()) {
        if (await exists(p)) {
          binPath = p;
          break;
        }
      }
    }
  }
  let result: DetectResult;
  if (!binPath) {
    result = {
      available: false,
      error: 'claude binary not found in PATH or known install locations'
    };
  } else {
    try {
      const version = await probeVersion(binPath);
      result = { available: true, path: binPath, version };
    } catch (e) {
      result = { available: false, path: binPath, error: (e as Error).message };
    }
  }
  cached = { at: Date.now(), result };
  return result;
}

export function resetDetectCache(): void {
  cached = null;
}
