import { useWorkspace } from '../store/workspace';

export function WelcomeView(): JSX.Element {
  const { openVault, createVault } = useWorkspace();
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">欢迎使用 Orbit</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            一个由个人愿景驱动的 AI 协作工作台。你的知识会保存在普通 Markdown + Git
            中。打开已有 vault，或创建一个新的 vault 开始。
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => createVault()}
            className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            创建新 vault…
          </button>
          <button
            onClick={() => openVault()}
            className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-900 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
          >
            打开已有 vault…
          </button>
        </div>

        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          新 vault 会自动创建 PARA 文件夹（Projects、Areas、Resources、Archives）、
          <code>AGENT.md</code> 角色说明、<code>.orbit/</code> 配置文件夹，并生成初始 git
          commit。
        </p>
      </div>
    </div>
  );
}
