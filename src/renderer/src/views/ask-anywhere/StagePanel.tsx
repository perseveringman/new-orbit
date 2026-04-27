import type { ConversationStage } from '@shared/stage';
import { ArtifactCard } from './ArtifactCard';

export function StagePanel({
  stage,
  onAction
}: {
  stage: ConversationStage | null;
  onAction(artifactId: string, actionId: string): void;
}): JSX.Element {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-neutral-200 bg-white/50 dark:border-neutral-800 dark:bg-neutral-950/30">
      <div className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Stage</h2>
        <p className="text-[11px] text-neutral-500">Artifacts created or referenced in this session.</p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {!stage || stage.artifacts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-xs text-neutral-500 dark:border-neutral-700">
            No artifacts yet.
          </div>
        ) : (
          stage.artifacts.map((artifact) => (
            <ArtifactCard key={artifact.id} artifact={artifact} onAction={onAction} />
          ))
        )}
      </div>
    </aside>
  );
}

