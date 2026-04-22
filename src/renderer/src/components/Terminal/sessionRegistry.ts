import type { TerminalSessionInfoDTO } from '@shared/ipc';

const map = new Map<string, TerminalSessionInfoDTO>();

export function getSession(key: string): TerminalSessionInfoDTO | null {
  return map.get(key) ?? null;
}

export function setSession(key: string, info: TerminalSessionInfoDTO): void {
  map.set(key, info);
}

export function clearSession(key: string): void {
  map.delete(key);
}

export async function disposeSession(key: string): Promise<void> {
  const info = map.get(key);
  if (info) {
    try {
      await window.orbit.terminal.kill(info.id);
    } catch {
      /* ignore */
    }
  }
  map.delete(key);
}

export async function disposeByPrefix(prefix: string): Promise<void> {
  const keys = Array.from(map.keys()).filter((k) => k.startsWith(prefix));
  await Promise.all(keys.map((k) => disposeSession(k)));
}

export function listKeys(): string[] {
  return Array.from(map.keys());
}
