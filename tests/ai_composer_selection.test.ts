import { describe, expect, it } from 'vitest';
import type { Conversation } from '@shared/conversation';
import { selectionFromConversation } from '../src/renderer/src/components/ai-composer/selection';

describe('ai composer runtime selection', () => {
  it('does not let legacy CLI hints override a concrete fallback SDK selection', () => {
    const conversation = {
      id: 'c1',
      createdAt: '',
      updatedAt: '',
      status: 'active',
      anchors: [],
      runtimeHint: 'claude',
      runtimeEndpointHint: undefined,
      runtimeModelHint: undefined,
      turns: []
    } satisfies Conversation;

    expect(
      selectionFromConversation(conversation, {
        track: 'sdk_agent',
        runtimeId: 'sdk-agent:deepseek',
        endpointId: 'deepseek',
        model: 'deepseek-v4-flash'
      })
    ).toEqual({
      track: 'sdk_agent',
      runtimeId: 'sdk-agent:deepseek',
      endpointId: 'deepseek',
      model: 'deepseek-v4-flash'
    });
  });

  it('repairs persisted SDK runtime selections that were stored as CLI track', () => {
    const conversation = {
      id: 'c1',
      createdAt: '',
      updatedAt: '',
      status: 'active',
      anchors: [],
      runtimeSelection: {
        runtimeId: 'sdk:deepseek',
        model: 'deepseek-v4-pro',
        modelTier: 'default',
        track: 'cli',
        agentProfileId: 'creative-agent'
      },
      turns: []
    } satisfies Conversation;

    expect(selectionFromConversation(conversation, {})).toEqual({
      runtimeId: 'sdk:deepseek',
      endpointId: 'deepseek',
      model: 'deepseek-v4-pro',
      modelTier: 'default',
      track: 'sdk_agent',
      agentProfileId: 'creative-agent'
    });
  });
});
