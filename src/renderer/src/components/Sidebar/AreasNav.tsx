import { usePara } from '../../store/para';
import { useWorkspace } from '../../store/workspace';
import type { AreaSummaryDTO } from '@shared/ipc';

function tagDotClass(tags: string[]): string {
  if (!tags.length) return 'bg-neutral-400';
  const tag = tags[0]!;
  if (tag.includes('work')) return 'bg-blue-500';
  if (tag.includes('personal')) return 'bg-green-500';
  if (tag.includes('health')) return 'bg-emerald-500';
  if (tag.includes('finance')) return 'bg-yellow-500';
  if (tag.includes('learn')) return 'bg-purple-500';
  return 'bg-sky-500';
}

function openNewArea(): void {
  window.dispatchEvent(new CustomEvent('orbit:open-new-area'));
}

function groupAreas(areas: AreaSummaryDTO[]): {
  pinned: AreaSummaryDTO[];
  groups: Array<{ title: string; areas: AreaSummaryDTO[] }>;
} {
  const pinned = areas.filter((area) => area.slug === 'vision');
  const grouped = new Map<string, AreaSummaryDTO[]>();
  for (const area of areas) {
    if (area.slug === 'vision') continue;
    const key = area.tags[0]?.trim() || '未分类';
    grouped.set(key, [...(grouped.get(key) ?? []), area]);
  }
  const groups = Array.from(grouped.entries())
    .sort(([a], [b]) => {
      if (a === '未分类') return 1;
      if (b === '未分类') return -1;
      return a.localeCompare(b, 'zh-CN');
    })
    .map(([title, groupedAreas]) => ({
      title,
      areas: groupedAreas.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    }));
  return { pinned, groups };
}

export function AreasNav(): JSX.Element {
  const view = usePara((s) => s.view);
  const setView = usePara((s) => s.setView);
  const areas = useWorkspace((s) => s.areas);
  const grouped = groupAreas(areas);

  function onClickArea(area: AreaSummaryDTO): void {
    setView({ kind: 'areaRoom', areaUid: area.uid });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Areas
        </h2>
        <button
          onClick={openNewArea}
          title="New area"
          className="rounded px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-300"
        >
          Create
        </button>
      </div>

      {areas.length === 0 ? (
        <div className="mt-2 flex flex-col items-center gap-3 px-2 text-center">
          <span className="text-xs text-neutral-400 dark:text-neutral-500">No areas yet</span>
          <button
            onClick={openNewArea}
            className="rounded bg-neutral-200/80 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-300/60 dark:bg-neutral-800/80 dark:text-neutral-300 dark:hover:bg-neutral-700/60"
          >
            Create area
          </button>
        </div>
      ) : (
        <div className="mt-1 space-y-2 text-sm">
          {grouped.pinned.length > 0 && (
            <ul className="space-y-0.5">
              {grouped.pinned.map((area) => {
                const active = view.kind === 'areaRoom' && view.areaUid === area.uid;
                return (
                  <li key={area.uid}>
                    <button
                      onClick={() => onClickArea(area)}
                      className={
                        'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-neutral-700 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800/60 ' +
                        (active ? 'bg-neutral-200/80 dark:bg-neutral-800/80' : '')
                      }
                    >
                      <span className="text-xs">📌</span>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${tagDotClass(area.tags)}`} />
                      <span className="flex-1 truncate">{area.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {grouped.groups.map((group) => (
            <div key={group.title}>
              <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                [{group.title}]
              </div>
              <ul className="space-y-0.5">
                {group.areas.map((area) => {
                  const active = view.kind === 'areaRoom' && view.areaUid === area.uid;
                  return (
                    <li key={area.uid}>
                      <button
                        onClick={() => onClickArea(area)}
                        className={
                          'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-neutral-700 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800/60 ' +
                          (active ? 'bg-neutral-200/80 dark:bg-neutral-800/80' : '')
                        }
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${tagDotClass(area.tags)}`} />
                        <span className="flex-1 truncate">{area.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
