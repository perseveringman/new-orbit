import { terminalRuntimeRegistry } from './terminalRuntimeRegistry';
import { terminalPaneStatusRegistry } from './terminalPaneStatusRegistry';
import { disposeSession, listKeys } from './sessionRegistry';

export async function disposeTerminal(sessionKey: string): Promise<void> {
  terminalPaneStatusRegistry.clear(sessionKey);
  if (terminalRuntimeRegistry?.listKeys().includes(sessionKey)) {
    await terminalRuntimeRegistry.dispose(sessionKey);
    return;
  }
  await disposeSession(sessionKey);
}

export async function disposeTerminalsByPrefix(prefix: string): Promise<void> {
  const keys = new Set([
    ...listKeys().filter((key) => key.startsWith(prefix)),
    ...(terminalRuntimeRegistry?.listKeys().filter((key) => key.startsWith(prefix)) ?? [])
  ]);
  await Promise.all(Array.from(keys).map((key) => disposeTerminal(key)));
}
