import type { SynthesisArtifact } from '@shared/synthesis';

export function SynthesisBadge({ artifact }: { artifact?: Pick<SynthesisArtifact, 'status' | 'user_edited'> | null }): JSX.Element {
  const status = artifact?.status ?? 'stale';
  const tone =
    status === 'fresh'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
      : status === 'failed'
        ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200'
        : status === 'superseded'
          ? 'border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300'
          : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      AI · {artifact?.user_edited ? 'edited' : status}
    </span>
  );
}

