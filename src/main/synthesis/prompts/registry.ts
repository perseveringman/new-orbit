import type { SynthesisKind } from '@shared/synthesis';
import { classifyAreaPrompt } from './classify.area.v1';
import { distillLibraryPrompt } from './distill.library.v1';
import { emergeResourcePrompt } from './emerge.resource.v1';
import { personalQAPrompt } from './qa.personal.v1';
import { relateNotesPrompt } from './relate.notes.v1';
import { searchAnswerPrompt } from './search.answer.v1';
import { summaryDailyPrompt } from './summary.daily.v1';
import { summaryEntityPrompt } from './summary.entity.v1';

export interface RenderedPrompt {
  system: string;
  user: string;
}

export interface SynthesisPromptTemplate<TOutput = unknown> {
  kind: SynthesisKind;
  version: string;
  defaultBudget: { input_tokens: number; output_tokens: number; usd?: number };
  render(input: unknown): RenderedPrompt;
  parse(response: unknown): TOutput;
}

const PROMPTS = [
  summaryDailyPrompt,
  summaryEntityPrompt,
  distillLibraryPrompt,
  emergeResourcePrompt,
  relateNotesPrompt,
  classifyAreaPrompt,
  searchAnswerPrompt,
  personalQAPrompt
] satisfies SynthesisPromptTemplate[];

export function getPromptTemplate(kind: SynthesisKind): SynthesisPromptTemplate {
  const template = PROMPTS.find((item) => item.kind === kind);
  if (!template) throw new Error(`synthesis_prompt_not_found:${kind}`);
  return template;
}

export function parseJsonResponse(response: unknown): unknown {
  const raw = typeof response === 'string' ? response : JSON.stringify(response);
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  return JSON.parse(body);
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
