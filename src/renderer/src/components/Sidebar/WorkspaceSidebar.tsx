import { Sparkles } from 'lucide-react';
import { usePara, type WorkspaceView } from '../../store/para';

interface Item {
  label: string;
  view: WorkspaceView;
  icon: string;
}

const ITEMS: Item[] = [
  { label: 'Dashboard', view: { kind: 'dashboard' }, icon: '◎' },
  { label: 'AI Control', view: { kind: 'runtimes' }, icon: '◫' },
  { label: 'Tools', view: { kind: 'tools' }, icon: '⌘' },
  { label: 'Role Templates', view: { kind: 'agents' }, icon: '◌' },
  { label: 'Inbox', view: { kind: 'inbox' }, icon: '📥' },
  { label: 'Conversations', view: { kind: 'conversations' }, icon: '💬' },
  { label: 'Kanban', view: { kind: 'kanban', projectUid: null }, icon: '▦' }
];

const ASK_ANYWHERE_VIEW: WorkspaceView = { kind: 'askAnywhere' };

export function WorkspaceSidebar(): JSX.Element {
  const view = usePara((s) => s.view);
  const setView = usePara((s) => s.setView);

  return (
    <div className="space-y-4">
      <section>
        <h2 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-violet-500 dark:text-violet-300">
          AI
        </h2>
        <button
          onClick={() => setView(ASK_ANYWHERE_VIEW)}
          className={
            'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors ' +
            (view.kind === 'askAnywhere'
              ? 'border-violet-300 bg-violet-50 text-violet-900 shadow-sm dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-100'
              : 'border-violet-200/70 bg-violet-50/40 text-violet-800 hover:bg-violet-100/70 dark:border-violet-900/60 dark:bg-violet-950/20 dark:text-violet-200 dark:hover:bg-violet-950/40')
          }
        >
          <Sparkles size={16} className="shrink-0 text-violet-500 dark:text-violet-300" />
          <span className="font-medium">Ask Anywhere</span>
        </button>
      </section>
      <section>
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
      </section>
    </div>
  );
}
