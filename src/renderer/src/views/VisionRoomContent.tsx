import { useEffect, useState } from 'react';

interface Props {
  areaPath: string;
  hasVision: boolean;
}

export function VisionRoomContent({ areaPath, hasVision }: Props): JSX.Element {
  const [content, setContent] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    if (!hasVision) return;
    setContent(null);
    setLoadErr(null);
    void (async () => {
      try {
        const text = await window.orbit.fs.readFile(`${areaPath}/VISION.md`);
        setContent(text);
      } catch (e) {
        setLoadErr((e as Error).message);
      }
    })();
  }, [areaPath, hasVision]);

  if (!hasVision) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-4 rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-3xl">🔭</div>
          <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-100">
            Vision not initialized
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Open a terminal and run the Vision agent to initialize your vision.
          </p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('orbit:area-open-terminal'))}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            Open Terminal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-6">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Vision initialized. Open a terminal to continue refining your vision.
      </p>
      {loadErr ? (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
          {loadErr}
        </div>
      ) : content === null ? (
        <div className="text-xs text-neutral-400 dark:text-neutral-500">Loading VISION.md…</div>
      ) : (
        <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded border border-neutral-200 bg-neutral-50 p-4 font-mono text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          {content}
        </pre>
      )}
    </div>
  );
}
