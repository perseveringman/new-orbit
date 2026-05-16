import { useEffect, useMemo, useState } from 'react';
import type { AreaConfigDTO } from '@shared/ipc';
import { useFiles } from '../../store/files';
import { usePara } from '../../store/para';
import { useWorkspace } from '../../store/workspace';

const input =
  'w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:border-sky-500 dark:border-neutral-700 dark:bg-neutral-900';

export function AreaConfigPanel(): JSX.Element {
  const view = usePara((s) => s.view);
  const areas = useWorkspace((s) => s.areas);
  const refreshAreas = useWorkspace((s) => s.refreshAreas);
  const toast = useFiles((s) => s.toast);
  const [config, setConfig] = useState<AreaConfigDTO | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  const area = useMemo(
    () => (view.kind === 'areaRoom' ? areas.find((item) => item.uid === view.areaUid) ?? null : null),
    [areas, view]
  );

  useEffect(() => {
    if (!area) {
      setConfig(null);
      setTagInput('');
      return;
    }
    let cancelled = false;
    void window.orbit.area
      .getConfig(area.path)
      .then((next) => {
        if (cancelled) return;
        setConfig(next);
        setTagInput(next.tags.join(', '));
      })
      .catch((error) => {
        if (!cancelled) toast(`加载 Area 配置失败：${(error as Error).message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [area, toast]);

  async function saveTags(): Promise<void> {
    if (!area || !config) return;
    setSaving(true);
    try {
      const nextTags = tagInput
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const updated = await window.orbit.area.setConfig(area.path, { tags: nextTags });
      setConfig(updated);
      setTagInput(updated.tags.join(', '));
      await refreshAreas();
      toast('Area 标签已更新');
    } catch (error) {
      toast(`保存 Area 标签失败：${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!area || !config) {
    return <div className="text-xs text-neutral-500">打开 Area 房间即可编辑标签。</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{config.name}</div>
        <div className="mt-1 text-xs text-neutral-500">
          <span className="font-mono">{config.slug}</span>
          {config.template ? ` · 模板：${config.template}` : ''}
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-500">
          标签
        </span>
        <input
          className={input}
          value={tagInput}
          onChange={(event) => setTagInput(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              void saveTags();
            }
          }}
          placeholder="例如：工作，健康"
        />
      </label>

      <div className="flex items-center justify-between text-[11px] text-neutral-500">
        <span>使用逗号分隔标签；侧边栏会按标签分组。</span>
        <button
          onClick={() => void saveTags()}
          disabled={saving}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
}
