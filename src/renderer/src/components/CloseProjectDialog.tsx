import { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  projectRelPath: string;
  defaultDistill?: boolean;
  onCancel(): void;
  onConfirm(opts: { distill: boolean }): void;
}

/**
 * Confirm-archive dialog with an option to generate a distillation summary.
 * Default ON so closure flow naturally produces a reusable resource.
 */
export function CloseProjectDialog(props: Props): JSX.Element | null {
  const [distill, setDistill] = useState<boolean>(props.defaultDistill ?? true);

  useEffect(() => {
    if (props.open) setDistill(props.defaultDistill ?? true);
  }, [props.open, props.defaultDistill]);

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-2 text-base font-semibold">Close project</h2>
        <p className="mb-4 text-xs text-neutral-600 dark:text-neutral-300">
          Archive <span className="font-mono">{props.projectRelPath}</span> — the file
          moves to <span className="font-mono">04_Archives/</span>, its{' '}
          <span className="font-mono">uid</span> is preserved, and backlinks continue to
          resolve.
        </p>
        <label className="mb-5 flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={distill}
            onChange={(e) => setDistill(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-semibold">Generate distillation summary</span> — spawn a
            dedicated agent to write a reusable knowledge note into{' '}
            <span className="font-mono">03_Resources/distilled/</span>. Costs a small
            agent run.
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <button
            onClick={props.onCancel}
            className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={() => props.onConfirm({ distill })}
            className="rounded bg-neutral-900 px-3 py-1 text-xs text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}
