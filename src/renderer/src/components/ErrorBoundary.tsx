import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * Top-level React error boundary. Catches render/lifecycle errors, shows a
 * friendly fallback, and forwards the crash record to main for NDJSON
 * logging alongside main-process crashes.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info });
    try {
      void window.orbit?.workspace.reportCrash({
        origin: 'renderer',
        message: error.message,
        stack: error.stack,
        extra: { componentStack: info.componentStack }
      });
    } catch {
      /* ignore */
    }
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleCopy = async (): Promise<void> => {
    const { error, info } = this.state;
    const body = [
      `Orbit crash`,
      `time: ${new Date().toISOString()}`,
      `message: ${error?.message ?? 'unknown'}`,
      '',
      'stack:',
      error?.stack ?? '(none)',
      '',
      'componentStack:',
      info?.componentStack ?? '(none)'
    ].join('\n');
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      /* ignore */
    }
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    const msg = this.state.error?.message ?? '未知错误';
    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center"
      >
        <div className="max-w-xl">
          <h1 className="mb-2 text-xl font-semibold">Orbit 遇到问题。</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            渲染进程出现异常。崩溃记录已写入 vault 的崩溃日志（未打开 vault 时写入
            userData）。你可以重新加载窗口继续使用。
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded border border-neutral-300 bg-neutral-100 p-3 text-left text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
            {msg}
          </pre>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded bg-sky-600 px-3 py-1 text-sm text-white hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            重新加载
          </button>
          <button
            type="button"
            onClick={() => void this.handleCopy()}
            className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            复制崩溃详情
          </button>
        </div>
      </div>
    );
  }
}
