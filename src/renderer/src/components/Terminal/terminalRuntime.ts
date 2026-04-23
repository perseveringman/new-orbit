import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import type { TerminalRuntime, TerminalRuntimeHost } from './terminalRuntimeRegistry';

function getTheme(dark?: boolean) {
  return dark
    ? {
        background: '#0b0b0d',
        foreground: '#e5e5e5',
        cursor: '#e5e5e5',
        selectionBackground: '#3b3b3f'
      }
    : {
        background: '#ffffff',
        foreground: '#1f1f24',
        cursor: '#1f1f24',
        selectionBackground: '#c7e0ff'
      };
}

function isVisible(host: HTMLDivElement | null): boolean {
  return Boolean(host && host.clientWidth > 0 && host.clientHeight > 0);
}

export function createBrowserTerminalRuntime(args: {
  sessionKey: string;
  dark?: boolean;
}): TerminalRuntime {
  void args.sessionKey;

  const term = new Terminal({
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    fontSize: 12,
    cursorBlink: true,
    allowProposedApi: true,
    theme: getTheme(args.dark)
  });
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());

  const wrapper = document.createElement('div');
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';
  term.open(wrapper);

  let host: HTMLDivElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  const inputListeners = new Set<(data: string) => void>();

  const inputDisposable = term.onData((data) => {
    for (const listener of inputListeners) listener(data);
  });

  function refit(): void {
    if (!isVisible(host)) return;
    try {
      fitAddon.fit();
    } catch {
      /* ignore */
    }
  }

  return {
    attach(nextHost: TerminalRuntimeHost): void {
      const domHost = nextHost as HTMLDivElement;
      host = domHost;
      domHost.appendChild(wrapper);
      refit();
      term.refresh(0, Math.max(term.rows - 1, 0));
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(() => {
        refit();
      });
      resizeObserver.observe(domHost);
      term.focus();
    },
    detach(): void {
      resizeObserver?.disconnect();
      resizeObserver = null;
      wrapper.remove();
      host = null;
    },
    dispose(): void {
      resizeObserver?.disconnect();
      resizeObserver = null;
      wrapper.remove();
      inputDisposable.dispose();
      term.dispose();
      host = null;
    },
    write(data: string): void {
      term.write(data);
    },
    focus(): void {
      term.focus();
    },
    refit,
    clear(): void {
      term.clear();
    },
    selectAll(): void {
      term.selectAll();
    },
    getSelection(): string {
      return term.getSelection();
    },
    clearSelection(): void {
      term.clearSelection();
    },
    setTheme(dark?: boolean): void {
      term.options.theme = getTheme(dark);
      refit();
    },
    onInput(cb: (data: string) => void): () => void {
      inputListeners.add(cb);
      return () => {
        inputListeners.delete(cb);
      };
    }
  };
}
