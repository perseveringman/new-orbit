export interface TerminalNavigationIntent {
  projectUid: string;
  paneId?: string;
  initialCommand?: string;
}

let pendingIntent: TerminalNavigationIntent | null = null;

export function queueTerminalNavigation(intent: TerminalNavigationIntent): void {
  pendingIntent = intent;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('orbit:terminal-navigation-queued', {
        detail: intent.projectUid
      })
    );
  }
}

export function consumePendingTerminalNavigation(
  projectUid: string
): TerminalNavigationIntent | null {
  if (!pendingIntent || pendingIntent.projectUid !== projectUid) return null;
  const next = pendingIntent;
  pendingIntent = null;
  return next;
}

export function clearPendingTerminalNavigation(): void {
  pendingIntent = null;
}
