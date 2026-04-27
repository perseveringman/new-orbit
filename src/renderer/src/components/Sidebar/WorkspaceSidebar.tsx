import { usePara, type WorkspaceView } from '../../store/para';

interface Item {
  label: string;
  view: WorkspaceView;
  icon: string;
}

const ITEMS: Item[] = [
  { label: 'Dashboard', view: { kind: 'dashboard' }, icon: '◎' },
  { label: 'Runtimes', view: { kind: 'runtimes' }, icon: '◫' },
  { label: 'Agents', view: { kind: 'agents' }, icon: '◌' },
  { label: 'Inbox', view: { kind: 'inbox' }, icon: '📥' },
  { label: 'Ask Anywhere', view: { kind: 'askAnywhere' }, icon: '✨' },
  { label: 'Today', view: { kind: 'today' }, icon: '☼' },
  { label: 'Kanban', view: { kind: 'kanban', projectUid: null }, icon: '▦' }
];

export function WorkspaceSidebar(): JSX.Element {
  const view = usePara((s) => s.view);
  const setView = usePara((s) => s.setView);

  return (
    <div>
      <h2 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        Workspace
      </h2>
      <ul className="space-y-0.5 text-sm">
        {ITEMS.map((it) => {
          const active = it.view.kind === view.kind;
          return (
            <li key={it.label}>
              <button
                onClick={() => setView(it.view)}
                className={
                  'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-neutral-700 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800/60 ' +
                  (active ? 'bg-neutral-200/80 dark:bg-neutral-800/80' : '')
                }
              >
                <span className="w-4 text-neutral-500">{it.icon}</span>
                <span>{it.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
