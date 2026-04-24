import { FileCode2 } from 'lucide-react';
import { INSPECTOR_THEME } from '../inspectorTheme';
import { classifyPatch } from './diffFormatting';
import type { ChangeFile } from './buildChangeRows';

interface DiffViewerProps {
  file: ChangeFile | null;
}

export function DiffViewer({ file }: DiffViewerProps): JSX.Element {
  if (!file) {
    return (
      <div className={`flex flex-1 items-center justify-center text-sm ${INSPECTOR_THEME.textDim}`}>
        Select a file to preview the patch.
      </div>
    );
  }

  if (file.isUntracked && !file.patch) {
    return (
      <div className={`flex flex-1 flex-col items-center justify-center gap-2 text-sm ${INSPECTOR_THEME.textDim}`}>
        <FileCode2 size={18} />
        <p>Untracked file — stage it to generate a patch preview.</p>
      </div>
    );
  }

  if (file.binary) {
    return (
      <div className={`flex flex-1 items-center justify-center text-sm ${INSPECTOR_THEME.textDim}`}>
        Binary file — preview unavailable.
      </div>
    );
  }

  const lines = classifyPatch(file.patch);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`border-b border-inspector-border-subtle px-3 py-2 text-xs ${INSPECTOR_THEME.textSecondary}`}>
        {file.path}
      </div>
      <pre className="m-0 flex-1 overflow-auto font-mono text-xs leading-5">
        {lines.map((line) => {
          const bg =
            line.kind === 'add'
              ? 'bg-inspector-git-added/10'
              : line.kind === 'del'
                ? 'bg-inspector-git-deleted/10'
                : '';
          const fg =
            line.kind === 'hunk'
              ? INSPECTOR_THEME.textDim
              : line.kind === 'meta'
                ? INSPECTOR_THEME.textSecondary
                : INSPECTOR_THEME.textPrimary;
          return (
            <div key={`${line.n}:${line.text}`} className={`flex ${bg}`}>
              <span className="w-10 shrink-0 select-none border-r border-inspector-border-subtle px-2 text-right text-inspector-text-dim">
                {line.n}
              </span>
              <span className={`whitespace-pre px-2 ${fg}`}>{line.text || ' '}</span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}
