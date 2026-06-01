import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { HyMemoryBackendConfig } from '@shared/memory';

const execFileAsync = promisify(execFile);

export async function resolveHyMemoryPython(config: HyMemoryBackendConfig): Promise<string> {
  if (await hasHyMemoryServer(config.pythonPath)) return config.pythonPath;
  if (!config.autoInstallRuntime) return config.pythonPath;
  const venvPython = getVenvPython(config.installDirectory);
  if (await hasHyMemoryServer(venvPython)) return venvPython;
  await fs.mkdir(config.installDirectory, { recursive: true });
  if (!(await exists(venvPython))) {
    const sysPython = await resolveSystemPython(config.pythonPath);
    await execFileAsync(sysPython, ['-m', 'venv', config.installDirectory], { timeout: 60_000 });
  }
  await execFileAsync(venvPython, ['-m', 'pip', 'install', '--quiet', '--index-url', config.pipIndexUrl, config.sdkPackage], {
    timeout: 300_000
  });
  return venvPython;
}

async function resolveSystemPython(preferred: string): Promise<string> {
  for (const candidate of [preferred, '/opt/homebrew/bin/python3', '/usr/local/bin/python3', '/usr/bin/python3', 'python3']) {
    try {
      await execFileAsync(candidate, ['--version'], { timeout: 10_000 });
      return candidate;
    } catch {
      /* try next candidate */
    }
  }
  return preferred;
}

async function hasHyMemoryServer(pythonPath: string): Promise<boolean> {
  try {
    await execFileAsync(pythonPath, ['-c', 'import hy_memory.server'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

function getVenvPython(installDirectory: string): string {
  return path.join(installDirectory, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
