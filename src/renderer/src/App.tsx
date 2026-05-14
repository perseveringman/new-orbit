import { useEffect, useState } from 'react';
import { useWorkspace } from './store/workspace';
import { TopBar } from './components/TopBar';
import { WelcomeView } from './views/WelcomeView';
import { VaultView } from './views/VaultView';
import { Toasts } from './components/Toasts';
import { SettingsModal } from './components/SettingsModal';
import { QuickCaptureProvider } from './components/quick-capture/QuickCaptureProvider';
import { FloatingBall } from './components/ask-anywhere/FloatingBall';
import { AskAnywherePopover } from './components/ask-anywhere/AskAnywherePopover';

export function App(): JSX.Element {
  const { init, loading, vault, error } = useWorkspace();
  const [askAnywhereOpen, setAskAnywhereOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-50 text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
        Loading Orbit…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <TopBar />
      {error && (
        <div className="border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      )}
      <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {vault ? <VaultView /> : <WelcomeView />}
      </main>
      <Toasts />
      <QuickCaptureProvider />
      <SettingsModal />
      {vault && (
        <>
          <AskAnywherePopover open={askAnywhereOpen} onClose={() => setAskAnywhereOpen(false)} />
          <FloatingBall open={askAnywhereOpen} onToggle={() => setAskAnywhereOpen((v) => !v)} />
        </>
      )}
    </div>
  );
}
