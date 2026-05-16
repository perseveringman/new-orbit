import { useFiles } from '../../store/files';

export function BacklinksPanel(): JSX.Element {
  const backlinks = useFiles((s) => s.backlinks);
  const openPath = useFiles((s) => s.openPath);

  if (backlinks.length === 0) {
    return <p className="text-xs text-neutral-500">还没有反向链接。</p>;
  }

  return (
    <ul className="space-y-1 text-sm">
      {backlinks.map((b) => (
        <li key={b.path}>
          <button
            onClick={() => void openPath(b.path)}
            className="block w-full truncate rounded px-2 py-1 text-left text-neutral-700 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800/60"
            title={b.relPath}
          >
            {b.title}
            {b.count > 1 && (
              <span className="ml-2 text-xs text-neutral-500">×{b.count}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
