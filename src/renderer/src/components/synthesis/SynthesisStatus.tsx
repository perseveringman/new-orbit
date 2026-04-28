import type { SynthesisArtifact } from '@shared/synthesis';
import { SynthesisBadge } from './SynthesisBadge';

export function SynthesisStatus({
  artifact,
  generatedAt,
  sourceCount,
  onRefresh
}: {
  artifact?: SynthesisArtifact | null;
  generatedAt?: string;
  sourceCount?: number;
  onRefresh?: () => void;
}): JSX.Element {
  const timestamp = generatedAt ?? artifact?.provenance.generated_at ?? artifact?.created_at;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
      <SynthesisBadge artifact={artifact} />
      {timestamp ? <span>generated {new Date(timestamp).toLocaleString()}</span> : <span>not generated</span>}
      <span>{sourceCount ?? artifact?.sources.length ?? 0} source(s)</span>
      {artifact?.provenance.prompt_version ? <span>{artifact.provenance.prompt_version}</span> : null}
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          className="rounded border border-neutral-300 px-2 py-0.5 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Refresh
        </button>
      ) : null}
    </div>
  );
}

