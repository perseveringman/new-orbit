import { useWorkspace } from '../store/workspace';

export function WelcomeView(): JSX.Element {
  const { openVault, createVault } = useWorkspace();
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Welcome to Orbit</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            A personal-vision AI collaboration workbench. Your knowledge lives in plain Markdown
            + Git. Start by opening a vault, or create a new one.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => createVault()}
            className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            Create new vault…
          </button>
          <button
            onClick={() => openVault()}
            className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-900 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
          >
            Open existing vault…
          </button>
        </div>

        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          New vaults are scaffolded with the PARA folders (Projects, Areas, Resources, Archives),
          an <code>AGENT.md</code> persona, a <code>.orbit/</code> config folder, and an initial
          git commit.
        </p>
      </div>
    </div>
  );
}
