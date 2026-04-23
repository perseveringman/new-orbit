import { useCallback, useEffect, useState } from 'react';
import type { ExternalNotesPathInfoDTO } from '@shared/ipc';
import { useFiles } from '../store/files';

interface Props {
  onSkip(): void;
}

function notifyVaultConfigChanged(): void {
  window.dispatchEvent(new CustomEvent('orbit:vault-config-changed'));
}

export function NotesConnectPanel({ onSkip }: Props): JSX.Element {
  const toast = useFiles((s) => s.toast);
  const [paths, setPaths] = useState<ExternalNotesPathInfoDTO[]>([]);
  const [busy, setBusy] = useState<'link' | 'import' | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await window.orbit.vaultConfig.inspect();
      setPaths(next);
    } catch (error) {
      toast(`Load notes paths failed: ${(error as Error).message}`);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function linkExternalDirectory(): Promise<void> {
    setBusy('link');
    try {
      const updated = await window.orbit.vaultConfig.linkDirectory();
      if (updated) {
        await refresh();
        notifyVaultConfigChanged();
        toast('Linked external notes directory');
      }
    } catch (error) {
      toast(`Link notes directory failed: ${(error as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function importIntoVault(): Promise<void> {
    setBusy('import');
    try {
      const result = await window.orbit.vaultConfig.importDirectory();
      if (result) {
        await refresh();
        notifyVaultConfigChanged();
        toast(`Imported ${result.importedFiles} notes → ${result.relPath}`);
      }
    } catch (error) {
      toast(`Import notes failed: ${(error as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function unlink(dirPath: string): Promise<void> {
    try {
      await window.orbit.vaultConfig.unlinkDirectory(dirPath);
      await refresh();
      notifyVaultConfigChanged();
      toast('Removed linked notes directory');
    } catch (error) {
      toast(`Remove notes directory failed: ${(error as Error).message}`);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Step 1: 连接你的笔记（可选）
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            你可以把旧笔记导入 Orbit，也可以仅链接外部目录，让 Vision Agent 在访谈前做归纳。
          </p>
        </div>
        <button
          onClick={onSkip}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          跳过
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => void importIntoVault()}
          disabled={busy !== null}
          className="rounded-md bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {busy === 'import' ? '导入中…' : '📁 导入到 Vault'}
        </button>
        <button
          onClick={() => void linkExternalDirectory()}
          disabled={busy !== null}
          className="rounded-md border border-neutral-300 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          {busy === 'link' ? '链接中…' : '🔗 链接外部目录'}
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {paths.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 px-3 py-3 text-xs text-neutral-500 dark:border-neutral-700">
            还没有已链接的外部笔记目录。
          </div>
        ) : (
          paths.map((item) => (
            <div
              key={item.path}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-xs dark:border-neutral-800"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-neutral-800 dark:text-neutral-100">
                  {item.path}
                </div>
                <div className="mt-1 text-neutral-500">
                  {item.exists ? `已链接 · ${item.noteCount} 篇笔记` : '路径不存在'}
                </div>
              </div>
              <button
                onClick={() => void unlink(item.path)}
                className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-[11px] text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                移除
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
