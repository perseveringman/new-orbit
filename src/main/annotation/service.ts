import { randomUUID } from 'node:crypto';
import type {
  AnnotationAiAction,
  AnnotationSynthesisPayload,
  GenerateAnnotationInput,
  GenerateAnnotationResult
} from '@shared/annotation';
import type { LibraryItem } from '@shared/library';
import type { SynthesisArtifact, SynthesisSource } from '@shared/synthesis';
import { createLibraryStore } from '../library/store';
import { getSDKRuntime } from '../runtime/sdk/ipc';
import { createSynthesisStore } from '../synthesis/store';
import { createSynthesisJob, SynthesisRunner } from '../synthesis/runner';
import { createAnnotationStore } from './store';

export async function generateAnnotation(
  vaultPath: string,
  input: GenerateAnnotationInput
): Promise<GenerateAnnotationResult> {
  const targetItemId = input.target.kind === 'library_item'
    ? input.target.ref
    : input.context_target?.kind === 'library_item'
      ? input.context_target.ref
      : null;
  if (!targetItemId) throw new Error('annotation_generate_requires_library_item');

  const library = createLibraryStore(vaultPath);
  const currentItem = await library.get(targetItemId);
  if (!currentItem) throw new Error(`library_item_not_found:${targetItemId}`);

  const canvasItems = (
    await Promise.all(
      [...new Set(input.canvas_item_ids ?? [])]
        .filter((itemId) => itemId !== targetItemId)
        .map((itemId) => library.get(itemId).catch(() => null))
    )
  ).filter((item): item is LibraryItem => Boolean(item));

  const sources = buildAnnotationSources(input, currentItem, canvasItems);
  const synthesisStore = createSynthesisStore(vaultPath);
  const runner = new SynthesisRunner(synthesisStore, {
    router: getSDKRuntime(vaultPath).router,
    requireSdk: true,
    maxBudgetUsd: 0.25,
    timeoutMs: 60_000
  });
  const artifact = (await runner.run(
    createSynthesisJob({
      kind: 'annotation.selection',
      scope_key: `annotation.selection:${input.action}:${targetItemId}:${randomUUID()}`,
      sources,
      priority: 'user-blocking',
      reason: 'manual',
      force: true,
      budget_usd: 0.12
    })
  )) as SynthesisArtifact<AnnotationSynthesisPayload>;

  if (artifact.status === 'failed') {
    throw new Error(artifact.error || 'annotation_ai_generation_failed');
  }

  const payload = artifact.payload;
  const annotation = await createAnnotationStore(vaultPath).create({
    target: input.parent_annotation_id ? { kind: 'annotation', ref: input.parent_annotation_id } : input.target,
    context_target: input.context_target ?? input.target,
    anchor: input.anchor,
    type: 'ai_note',
    color: input.color,
    title: payload.title || labelForAction(input.action),
    body_markdown: payload.body_markdown,
    created_by: 'agent',
    ...(input.parent_annotation_id ? { parent_annotation_id: input.parent_annotation_id } : {}),
    artifact_refs: [artifact.id],
    metadata: {
      action_id: input.action,
      synthesis_kind: 'annotation.selection',
      confidence: payload.confidence,
      warnings: payload.warnings ?? []
    }
  });

  return { annotation, artifact };
}

function buildAnnotationSources(
  input: GenerateAnnotationInput,
  currentItem: LibraryItem,
  canvasItems: LibraryItem[]
): SynthesisSource[] {
  return [
    {
      kind: 'library',
      ref: currentItem.frontmatter.id,
      title: currentItem.frontmatter.title,
      excerpt: currentItem.body.slice(0, 1800),
      weight: 1
    },
    ...canvasItems.map<SynthesisSource>((item) => ({
      kind: 'library',
      ref: item.frontmatter.id,
      title: item.frontmatter.title,
      excerpt: item.body.slice(0, 900),
      weight: 0.45
    })),
    {
      kind: 'raw',
      title: `annotation.${input.action}`,
      metadata: {
        action: input.action,
        selected_text: input.selected_text,
        anchor: input.anchor,
        current_item: materialContext(currentItem, 4200),
        canvas_items: canvasItems.map((item) => materialContext(item, 1400)),
        instruction: instructionForAction(input.action)
      }
    }
  ];
}

function materialContext(item: LibraryItem, maxBodyLength: number): Record<string, unknown> {
  return {
    id: item.frontmatter.id,
    title: item.frontmatter.title,
    kind: item.frontmatter.kind,
    url: item.frontmatter.url,
    source: item.frontmatter.source,
    body_excerpt: item.body.slice(0, maxBodyLength)
  };
}

function labelForAction(action: AnnotationAiAction): string {
  if (action === 'translate') return '翻译';
  if (action === 'explain') return '名词解释';
  if (action === 'formula') return '公式解析';
  return '关联检索';
}

function instructionForAction(action: AnnotationAiAction): string {
  if (action === 'translate') {
    return '把选区翻译成自然、准确的中文。只输出译文和必要术语说明，不输出上下文清单。';
  }
  if (action === 'explain') {
    return '解释选区中的概念、背景、隐含前提，以及它在当前资料中的作用。';
  }
  if (action === 'formula') {
    return '如果选区包含公式、结构或论证链，拆解变量、步骤、前提和结论；没有公式时分析论证结构。';
  }
  return '基于选区、当前资料和画布资料，给出相关概念、关键词、可能关联的主题和后续追问。';
}
