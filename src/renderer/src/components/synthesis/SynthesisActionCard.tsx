import type { SynthesisArtifact } from '@shared/synthesis';
import { SynthesisStatus } from './SynthesisStatus';

export function SynthesisActionCard({
  artifact,
  title,
  description,
  primaryLabel = 'Accept',
  onPrimary,
  onRefresh
}: {
  artifact?: SynthesisArtifact | null;
  title: string;
  description?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  onRefresh?: () => void;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{title}</div>
          {description ? <p className="mt-1 text-xs opacity-80">{description}</p> : null}
          <div className="mt-2">
            <SynthesisStatus artifact={artifact} onRefresh={onRefresh} />
          </div>
        </div>
        {onPrimary ? (
          <button
            type="button"
            onClick={onPrimary}
            className="shrink-0 rounded bg-amber-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-700"
          >
            {primaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

