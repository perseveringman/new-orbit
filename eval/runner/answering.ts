import type { ContextPacket } from '../../src/shared/context';
import type { EvidenceHit, PersonaOption } from './types';
import { bestSentence, overlapScore, tokens, truncate } from './text';

export function answerLongMemEval(question: string, packet: ContextPacket, hits: EvidenceHit[], memorySummaries: string[]): { text: string; option?: string } {
  const sectionTexts = packet.sections.map((section) => section.content);
  const text = bestSentence(question, [...hits.map((hit) => hit.text), ...memorySummaries, ...sectionTexts], 640);
  return { text: text || 'No answer found in memory context.' };
}

export function answerPersona(question: string, options: PersonaOption[], packet: ContextPacket, hits: EvidenceHit[], memorySummaries: string[]): { text: string; option?: string } {
  if (!options.length) return { text: answerLongMemEval(question, packet, hits, memorySummaries).text };
  const context = [
    question,
    ...hits.map((hit) => hit.text),
    ...memorySummaries,
    ...packet.sections.map((section) => section.content)
  ].join('\n');
  const queryTokens = new Set(tokens(context));
  const ranked = options
    .map((option) => ({
      option,
      score: optionScore(option.text, queryTokens, question)
    }))
    .sort((a, b) => b.score - a.score || a.option.label.localeCompare(b.option.label));
  const top = ranked[0]?.option;
  return {
    text: top ? truncate(top.text, 700) : 'No option selected.',
    ...(top ? { option: top.label } : {})
  };
}

function optionScore(optionText: string, contextTokens: Set<string>, question: string): number {
  const optionTokens = tokens(stripOptionLabel(optionText));
  const overlap = optionTokens.filter((token) => contextTokens.has(token)).length / Math.max(1, optionTokens.length);
  const questionPenalty = overlapScore(new Set(tokens(question)), optionText) * 0.08;
  const negationPenalty = /\b(dislike|avoid|hate|not interested|不喜欢|避免)\b/i.test(optionText) &&
    !/\b(dislike|avoid|hate|not interested|不喜欢|避免)\b/i.test(Array.from(contextTokens).join(' '))
    ? 0.18
    : 0;
  return overlap - questionPenalty - negationPenalty;
}

function stripOptionLabel(value: string): string {
  return value.replace(/^\([a-d]\)\s*/i, '');
}
