import type { Artifact } from '@shared/stage';
import { PMILContextArtifactCard, PMIL_CONTEXT_ARTIFACT_KIND } from '../../components/conversation/PMILContextPanel';

export function ArtifactCard({
  artifact,
  onAction
}: {
  artifact: Artifact;
  onAction?(artifactId: string, actionId: string): void;
}): JSX.Element {
  if (artifact.kind === PMIL_CONTEXT_ARTIFACT_KIND) {
    return <PMILContextArtifactCard artifact={artifact} />;
  }
  return <DefaultArtifactCard artifact={artifact} onAction={onAction} />;
}

function DefaultArtifactCard({
  artifact,
  onAction
}: {
  artifact: Artifact;
  onAction?(artifactId: string, actionId: string): void;
}): JSX.Element {
  return (
    <div className={`rounded-xl border p-3 text-sm ${colorClass(artifact.kind, artifact.status)}`}>
      <div className="flex items-start gap-2">
        <span>{iconForArtifact(artifact.kind)}</span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{artifact.title}</div>
          {artifact.summary ? <p className="mt-1 text-xs opacity-80">{artifact.summary}</p> : null}
          {artifact.refs?.length ? (
            <div className="mt-2 space-y-1">
              {artifact.refs.slice(0, 5).map((ref) => (
                <div key={`${ref.kind}:${ref.ref}`} className="truncate rounded bg-white/50 px-2 py-1 text-[11px] dark:bg-black/20">
                  {ref.kind}: {ref.label ?? ref.ref}
                </div>
              ))}
            </div>
          ) : null}
          {artifact.actions?.length ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {artifact.actions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => onAction?.(artifact.id, action.id)}
                  className="rounded border border-current/20 px-2 py-0.5 text-[11px] hover:bg-white/50 dark:hover:bg-black/20"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function iconForArtifact(kind: string): string {
  if (kind.startsWith('note.')) return '📝';
  if (kind.startsWith('library.')) return '📚';
  if (kind.startsWith('scheduled_task.')) return '⏰';
  if (kind.startsWith('proposal.')) return '⚠️';
  if (kind.includes('retrieved')) return '🔍';
  if (kind === 'welcome_analysis.result') return '🌟';
  return '🎭';
}

function colorClass(kind: string, status: Artifact['status']): string {
  if (status === 'rejected') return 'border-neutral-200 bg-neutral-100 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900';
  if (kind.startsWith('proposal.')) return 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100';
  if (kind.includes('retrieved')) return 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900';
  return 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100';
}
