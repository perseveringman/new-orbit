import { X } from 'lucide-react';
import type { ConversationStage } from '@shared/stage';
import { ArtifactCard } from './ArtifactCard';

export function StageDrawer({
  stage,
  open,
  onClose,
  onAction
}: {
  stage: ConversationStage | null;
  open: boolean;
  onClose(): void;
  onAction(artifactId: string, actionId: string): void;
}): JSX.Element | null {
  if (!open || !stage || stage.artifacts.length === 0) return null;

  return (
    <aside className="absolute bottom-0 right-0 top-0 z-30 flex w-80 max-w-full flex-col border-l border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-start gap-3 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Stage</h2>
          <p className="text-[11px] text-neutral-500">
            {stage.artifacts.length} artifacts created or referenced in this session.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close Stage drawer"
          onClick={onClose}
          className="rounded-md border border-neutral-300 p-1 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          <X size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {stage.artifacts.map((artifact) => (
          <ArtifactCard key={artifact.id} artifact={artifact} onAction={onAction} />
        ))}
      </div>
    </aside>
  );
}
