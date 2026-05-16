import type { ConversationStage } from '@shared/stage';
import { ArtifactCard } from '../../views/ask-anywhere/ArtifactCard';

export function ArtifactStage({
  stage,
  onAction
}: {
  stage: ConversationStage | null;
  onAction(artifactId: string, actionId: string): void;
}): JSX.Element {
  const artifacts = stage?.artifacts ?? [];
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          产物阶段
        </h2>
        <p className="text-[11px] text-neutral-500">{artifacts.length} 个产物</p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {artifacts.length === 0 ? (
          <p className="text-xs text-neutral-500">本对话暂无产物。</p>
        ) : (
          artifacts.map((artifact) => (
            <ArtifactCard key={artifact.id} artifact={artifact} onAction={onAction} />
          ))
        )}
      </div>
    </aside>
  );
}
