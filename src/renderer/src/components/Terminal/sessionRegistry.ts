import type { TerminalSessionInfoDTO } from '@shared/ipc';

const map = new Map<string, TerminalSessionInfoDTO>();
const inflight = new Map<string, Promise<TerminalSessionInfoDTO>>();

export function getSession(key: string): TerminalSessionInfoDTO | null {
  return map.get(key) ?? null;
}

export function setSession(key: string, info: TerminalSessionInfoDTO): void {
  map.set(key, info);
}

export function clearSession(key: string): void {
  map.delete(key);
}

export async function getOrCreateSession(
  key: string,
  open: () => Promise<TerminalSessionInfoDTO>
): Promise<TerminalSessionInfoDTO> {
  const existing = map.get(key);
  if (existing) return existing;

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = open()
    .then((info) => {
      map.set(key, info);
      return info;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
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

export function __resetSessionRegistryForTests(): void {
  map.clear();
  inflight.clear();
}
