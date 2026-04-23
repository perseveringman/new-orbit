import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AreaSummaryDTO } from '@shared/ipc';
import { usePara } from '../store/para';
import { useWorkspace } from '../store/workspace';
import { TerminalManager } from '../components/Terminal/TerminalManager';
import { VisionRoomContent } from './VisionRoomContent';

type AreaRoomOuterTab = 'overview' | 'terminal' | 'sessions';

function OuterTabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-4 py-2 text-sm transition-colors ${
        active
          ? 'border-sky-500 text-sky-600 dark:text-sky-400'
          : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
      }`}
    >
      {children}
    </button>
  );
}

export function AreaRoomView(): JSX.Element {
  const view = usePara((s) => s.view);
  const areas = useWorkspace((s) => s.areas);
  const vault = useWorkspace((s) => s.vault);
  const dark = useWorkspace((s) => s.settings.theme === 'dark');

  const areaUid = view.kind === 'areaRoom' ? view.areaUid : '';

  const area: AreaSummaryDTO | undefined = useMemo(
    () => areas.find((a) => a.uid === areaUid),
    [areas, areaUid]
  );

  const outerTabKey = `orbit.areaRoom.outerTab.${areaUid}`;
  const [outerTab, setOuterTabRaw] = useState<AreaRoomOuterTab>(() => {
    try {
      const v = localStorage.getItem(outerTabKey);
      return v === 'terminal' || v === 'sessions' ? v : 'overview';
    } catch {
      return 'overview';
    }
  });

  const setOuterTab = useCallback(
    (tab: AreaRoomOuterTab): void => {
      setOuterTabRaw(tab);
      try {
        localStorage.setItem(outerTabKey, tab);
      } catch {
        /* ignore */
      }
    },
    [outerTabKey]
  );

  // Reload persisted tab when area changes
  useEffect(() => {
    try {
      const key = `orbit.areaRoom.outerTab.${areaUid}`;
      const v = localStorage.getItem(key);
      setOuterTabRaw(v === 'terminal' || v === 'sessions' ? v : 'overview');
    } catch {
      setOuterTabRaw('overview');
    }
  }, [areaUid]);

  // Handle "open terminal" event from VisionRoomContent cold state
  useEffect(() => {
    function onOpenTerminal(): void {
      setOuterTab('terminal');
    }
    window.addEventListener('orbit:area-open-terminal', onOpenTerminal);
    return () => window.removeEventListener('orbit:area-open-terminal', onOpenTerminal);
  }, [setOuterTab]);

  if (!area) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Area not found.
      </div>
    );
  }

  const areaPath = vault ? `${vault.path}/02_Areas/${area.slug}` : '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-start gap-3 border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{area.name}</h1>
          {area.tags && area.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {area.tags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] dark:bg-neutral-800"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
          <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
            <span className="rounded border border-neutral-300 px-2 py-0.5 dark:border-neutral-700">
              {area.slug}
            </span>
            {area.hasVision && (
              <span className="rounded border border-emerald-300 px-2 py-0.5 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400">
                Vision ✓
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Outer tab bar */}
      <div className="flex shrink-0 border-b border-neutral-200 px-4 text-sm dark:border-neutral-800">
        <OuterTabButton active={outerTab === 'overview'} onClick={() => setOuterTab('overview')}>
          Overview
        </OuterTabButton>
        <OuterTabButton active={outerTab === 'terminal'} onClick={() => setOuterTab('terminal')}>
          Terminal
        </OuterTabButton>
        <OuterTabButton active={outerTab === 'sessions'} onClick={() => setOuterTab('sessions')}>
          Sessions
        </OuterTabButton>
      </div>

      {/* Overview tab */}
      <div className={`flex min-h-0 flex-1 ${outerTab === 'overview' ? 'flex' : 'hidden'}`}>
        <VisionRoomContent areaPath={areaPath} hasVision={area.hasVision} />
      </div>

      {/* Terminal tab */}
      <div className={`min-h-0 flex-1 ${outerTab === 'terminal' ? 'flex' : 'hidden'}`}>
        {vault && (
          <TerminalManager
            projectUid={area.uid}
            cwd={areaPath}
            dark={dark}
            env={{
              ORBIT_VAULT_PATH: vault.path,
              ORBIT_AREA_UID: area.uid,
              ORBIT_AREA_SLUG: area.slug,
              ORBIT_AREA_PATH: areaPath
            }}
          />
        )}
      </div>

      {/* Sessions tab */}
      <div className={`min-h-0 flex-1 ${outerTab === 'sessions' ? 'flex' : 'hidden'}`}>
        <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
          Sessions coming soon
        </div>
      </div>
    </div>
  );
}
