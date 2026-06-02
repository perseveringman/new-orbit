import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import type { EvidenceNavigationTarget, EvidenceSelector } from '@shared/evidence';
import { useFiles } from '../../store/files';
import { usePara, type WorkspaceView } from '../../store/para';

type EvidenceReferenceTone = 'violet' | 'emerald' | 'sky' | 'neutral';

export function EvidenceReference({
  selector,
  label,
  tone = 'sky',
  variant = 'button'
}: {
  selector: EvidenceSelector;
  label?: string;
  tone?: EvidenceReferenceTone;
  variant?: 'button' | 'inline';
}): JSX.Element {
  const [target, setTarget] = useState<EvidenceNavigationTarget | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openFile = useFiles((store) => store.openPath);
  const toast = useFiles((store) => store.toast);
  const setView = usePara((store) => store.setView);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    void window.orbit.evidence.resolveNavigation(selector)
      .then((resolved) => {
        if (!cancelled) setTarget(resolved);
      })
      .catch(() => {
        if (!cancelled) setTarget(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selector]);

  const displayLabel = useMemo(() => {
    const value = label ?? target?.label ?? shortEvidenceLabel(selector);
    return value.length > 42 ? `${value.slice(0, 42)}...` : value;
  }, [label, selector, target?.label]);

  async function openReference(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const resolved = target ?? await window.orbit.evidence.resolveNavigation(selector);
      setTarget(resolved);
      if (!resolved.available) {
        throw new Error(resolved.reason ?? '这个来源暂时不可打开。');
      }
      if (resolved.kind === 'vault_file' && resolved.path) {
        await openFile(resolved.path);
        setView({ kind: 'editor' });
        return;
      }
      if (resolved.kind === 'workspace_view' && resolved.view) {
        setView(resolved.view as WorkspaceView);
        return;
      }
      const opened = await window.orbit.evidence.open(selector);
      if (!opened.opened && opened.message) throw new Error(opened.message);
    } catch (err) {
      const message = (err as Error).message || '打开来源失败。';
      setError(message);
      toast(message);
    } finally {
      setLoading(false);
    }
  }

  const Icon = target?.kind === 'external_url' || target?.kind === 'external_file' || target?.kind === 'connector_doc'
    ? ExternalLink
    : FileText;

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={() => void openReference()}
        disabled={loading}
        title={referenceTitle(target, selector)}
        className={`mx-0.5 inline-flex max-w-[18rem] items-center gap-1 align-baseline text-[0.95em] font-medium transition disabled:opacity-60 ${inlineToneClass(tone)}`}
      >
        <Icon size={13} className="shrink-0" />
        <span className="truncate">{loading ? '打开中' : displayLabel}</span>
      </button>
    );
  }

  return (
    <span className="inline-flex max-w-full flex-col gap-1">
      <button
        type="button"
        onClick={() => void openReference()}
        disabled={loading}
        title={referenceTitle(target, selector)}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] transition disabled:opacity-60 ${toneClass(tone)}`}
      >
        <Icon size={12} className="shrink-0" />
        <span className="truncate">{loading ? '打开中' : `打开来源 ${displayLabel}`}</span>
      </button>
      {error ? <span className="max-w-xs text-[11px] text-red-600 dark:text-red-300">{error}</span> : null}
    </span>
  );
}

export function evidenceSelectorKey(selector: EvidenceSelector): string {
  return `${selector.source_id}:${selector.kind}:${selector.range?.from ?? ''}:${selector.range?.to ?? ''}:${selector.content_view}`;
}

function referenceTitle(target: EvidenceNavigationTarget | null, selector: EvidenceSelector): string {
  if (!target) return selector.source_id;
  return [target.title, target.reason, target.path ?? target.url ?? target.doc_ref]
    .filter(Boolean)
    .join(' · ');
}

function shortEvidenceLabel(selector: EvidenceSelector): string {
  const id = selector.source_id.split(':').slice(-2).join(':') || selector.source_id;
  return id.length > 26 ? `${id.slice(0, 26)}...` : id;
}

function toneClass(tone: EvidenceReferenceTone): string {
  switch (tone) {
    case 'emerald':
      return 'border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-neutral-950 dark:text-emerald-300 dark:hover:bg-emerald-950/30';
    case 'violet':
      return 'border-violet-300 bg-white text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:bg-neutral-950 dark:text-violet-200 dark:hover:bg-violet-950/30';
    case 'neutral':
      return 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-900';
    case 'sky':
    default:
      return 'border-sky-300 bg-white text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:bg-neutral-950 dark:text-sky-300 dark:hover:bg-sky-950/30';
  }
}

function inlineToneClass(tone: EvidenceReferenceTone): string {
  switch (tone) {
    case 'emerald':
      return 'text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-100';
    case 'violet':
      return 'text-violet-700 hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-100';
    case 'neutral':
      return 'text-neutral-700 hover:text-neutral-950 dark:text-neutral-200 dark:hover:text-white';
    case 'sky':
    default:
      return 'text-sky-600 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-100';
  }
}
