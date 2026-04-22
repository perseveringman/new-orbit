export type TerminalShortcutAction =
  | 'new-tab'
  | 'close-pane'
  | 'split-right'
  | 'split-down'
  | 'focus-left'
  | 'focus-right'
  | 'focus-up'
  | 'focus-down'
  | 'toggle-zoom'
  | 'prev-tab'
  | 'next-tab'
  | 'switch-tab-1'
  | 'switch-tab-2'
  | 'switch-tab-3'
  | 'switch-tab-4'
  | 'switch-tab-5'
  | 'switch-tab-6'
  | 'switch-tab-7'
  | 'switch-tab-8'
  | 'switch-tab-9';

interface ShortcutEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function getTerminalShortcutAction(
  event: ShortcutEventLike
): TerminalShortcutAction | null {
  const mod = event.metaKey || event.ctrlKey;
  if (!mod) return null;

  const key = event.key.toLowerCase();

  if (key === 't' && !event.shiftKey && !event.altKey) return 'new-tab';
  if (key === 'w' && !event.shiftKey && !event.altKey) return 'close-pane';
  if (key === 'd' && !event.shiftKey && !event.altKey) return 'split-right';
  if (key === 'd' && event.shiftKey && !event.altKey) return 'split-down';
  if (event.altKey && key === 'arrowleft') return 'focus-left';
  if (event.altKey && key === 'arrowright') return 'focus-right';
  if (event.altKey && key === 'arrowup') return 'focus-up';
  if (event.altKey && key === 'arrowdown') return 'focus-down';
  if ((key === 'enter' || key === 'return') && event.shiftKey) return 'toggle-zoom';
  if (key === '[' && event.shiftKey) return 'prev-tab';
  if (key === ']' && event.shiftKey) return 'next-tab';

  if (!event.shiftKey && !event.altKey && key >= '1' && key <= '9') {
    return `switch-tab-${key}` as TerminalShortcutAction;
  }

  return null;
}
