import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

// Forward uncaught errors in the renderer to the main process crash log.
window.addEventListener('error', (ev) => {
  try {
    void window.orbit?.workspace.reportCrash({
      origin: 'renderer',
      message: ev.message || (ev.error as Error | undefined)?.message || 'window.onerror',
      stack: (ev.error as Error | undefined)?.stack
    });
  } catch {
    /* ignore */
  }
});
window.addEventListener('unhandledrejection', (ev) => {
  const reason = ev.reason as unknown;
  const err = reason instanceof Error ? reason : new Error(String(reason));
  try {
    void window.orbit?.workspace.reportCrash({
      origin: 'renderer',
      message: err.message,
      stack: err.stack
    });
  } catch {
    /* ignore */
  }
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
