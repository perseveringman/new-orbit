import { useState } from 'react';
import type { ContextPacket, ContextSection } from '@shared/context';
import type { EvidenceReadResult, EvidenceSelector } from '@shared/evidence';
import type { Artifact, ConversationStage } from '@shared/stage';

export const PMIL_CONTEXT_ARTIFACT_KIND = 'pmil.context_packet';

export function PMILContextChips({ stage }: { stage: ConversationStage | null }): JSX.Element | null {
  const packet = latestContextPacket(stage);
  if (!packet) return null;
  const qaCount = packet.sections.filter((section) => section.kind === 'synthesis').length;
  return (
    <section className="border-b border-violet-200 bg-violet-50 px-4 py-2 text-xs text-violet-900 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">PMIL 上下文</span>
        <span className="rounded-full border border-violet-300 px-2 py-0.5 dark:border-violet-800">
          {packet.sections.length} 分区
        </span>
        <span className="rounded-full border border-violet-300 px-2 py-0.5 dark:border-violet-800">
          {packet.evidence.length} 证据
        </span>
        {qaCount ? (
          <span className="rounded-full border border-violet-300 px-2 py-0.5 dark:border-violet-800">
            个人 QA
          </span>
        ) : null}
        {packet.freshness.stale_sources?.length ? (
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            过期 {packet.freshness.stale_sources.length}
          </span>
        ) : null}
        <span className="min-w-0 truncate text-violet-700 dark:text-violet-200">
          {packet.sections.slice(0, 3).map((section) => section.title).join(' / ')}
        </span>
      </div>
    </section>
  );
}

export function PMILContextArtifactCard({ artifact }: { artifact: Artifact }): JSX.Element | null {
  const packet = contextPacketFromArtifact(artifact);
  if (!packet) return null;
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-100">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium">{artifact.title}</div>
          <p className="mt-1 text-xs text-violet-700 dark:text-violet-200">
            {packet.sections.length} 分区 · {packet.evidence.length} 证据 · {packet.budget.estimated_tokens}/{packet.budget.max_tokens} tokens
          </p>
        </div>
        <span className="rounded-full border border-violet-300 px-2 py-1 text-[11px] dark:border-violet-800">
          {packet.scope.kind}{packet.scope.ref ? `:${packet.scope.ref}` : ''}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {packet.sections.slice(0, 5).map((section) => (
          <PMILContextSection key={`${section.kind}:${section.title}`} section={section} />
        ))}
      </div>
    </div>
  );
}

function PMILContextSection({ section }: { section: ContextSection }): JSX.Element {
  return (
    <div className="rounded-lg border border-violet-200 bg-white/80 p-2 dark:border-violet-900/70 dark:bg-neutral-950/60">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-violet-300 px-2 py-0.5 text-[11px] text-violet-700 dark:border-violet-800 dark:text-violet-200">
          {section.kind}
        </span>
        <span className="text-[11px] text-neutral-500">{section.citations.length} 条引用</span>
      </div>
      <div className="mt-1 text-xs font-medium">{section.title}</div>
      <p className="mt-1 whitespace-pre-line text-xs leading-5 text-neutral-600 dark:text-neutral-300">
        {section.content.slice(0, 420)}
      </p>
      {section.citations.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {section.citations.slice(0, 3).map((selector) => (
            <EvidencePeekButton key={evidenceSelectorKey(selector)} selector={selector} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EvidencePeekButton({ selector }: { selector: EvidenceSelector }): JSX.Element {
  const [result, setResult] = useState<EvidenceReadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function readEvidence(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setResult(await window.orbit.evidence.read(selector));
    } catch (err) {
      setResult(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex max-w-full flex-col gap-1">
      <button
        type="button"
        onClick={() => void readEvidence()}
        disabled={loading}
        className="rounded-md border border-violet-300 px-2 py-0.5 text-[11px] text-violet-700 disabled:opacity-60 dark:border-violet-800 dark:text-violet-200"
      >
        {loading ? '读取中' : `查看证据 ${shortEvidenceLabel(selector)}`}
      </button>
      {error ? <span className="text-[11px] text-red-600 dark:text-red-300">{error}</span> : null}
      {result ? (
        <span className="rounded-md border border-violet-200 bg-white p-2 text-[11px] leading-5 text-neutral-600 dark:border-violet-900 dark:bg-neutral-950 dark:text-neutral-300">
          <span className="block font-medium text-neutral-800 dark:text-neutral-100">{result.source.title}</span>
          {result.excerpts[0]?.text.slice(0, 520) ?? '没有可用摘录。'}
        </span>
      ) : null}
    </span>
  );
}

function latestContextPacket(stage: ConversationStage | null): ContextPacket | null {
  const artifact = [...(stage?.artifacts ?? [])]
    .reverse()
    .find((item) => item.kind === PMIL_CONTEXT_ARTIFACT_KIND);
  return artifact ? contextPacketFromArtifact(artifact) : null;
}

function contextPacketFromArtifact(artifact: Artifact): ContextPacket | null {
  if (artifact.kind !== PMIL_CONTEXT_ARTIFACT_KIND) return null;
  const packet = artifact.payload as Partial<ContextPacket> | null;
  if (!packet || typeof packet !== 'object' || !packet.id || !Array.isArray(packet.sections)) {
    return null;
  }
  return packet as ContextPacket;
}

function evidenceSelectorKey(selector: EvidenceSelector): string {
  return `${selector.source_id}:${selector.kind}:${selector.range?.from ?? ''}:${selector.range?.to ?? ''}:${selector.content_view}`;
}

function shortEvidenceLabel(selector: EvidenceSelector): string {
  const id = selector.source_id.split(':').slice(-2).join(':') || selector.source_id;
  return id.length > 22 ? `${id.slice(0, 22)}...` : id;
}
