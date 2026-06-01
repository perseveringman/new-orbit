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

  it('repairs persisted SDK runtime selections and refreshes legacy DeepSeek defaults to flash', () => {
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
      model: 'deepseek-v4-flash',
      modelTier: 'default',
      track: 'sdk_agent',
      agentProfileId: 'creative-agent'
    });
  });

  it('keeps explicit DeepSeek heavy selections on pro', () => {
    const conversation = {
      id: 'c1',
      createdAt: '',
      updatedAt: '',
      status: 'active',
      anchors: [],
      runtimeSelection: {
        runtimeId: 'sdk:deepseek',
        model: 'deepseek-v4-pro',
        modelTier: 'heavy',
        track: 'sdk_agent'
      },
      turns: []
    } satisfies Conversation;

    expect(selectionFromConversation(conversation, {})).toEqual({
      runtimeId: 'sdk:deepseek',
      endpointId: 'deepseek',
      model: 'deepseek-v4-pro',
      modelTier: 'heavy',
      track: 'sdk_agent'
    });
  });

  it('normalizes merged fallback DeepSeek defaults after loading older conversations', () => {
    const conversation = {
      id: 'c1',
      createdAt: '',
      updatedAt: '',
      status: 'active',
      anchors: [],
      runtimeSelection: {
        model: 'claude-3-5-sonnet-latest',
        modelTier: 'default'
      },
      turns: []
    } satisfies Conversation;

    expect(
      selectionFromConversation(conversation, {
        track: 'sdk_agent',
        runtimeId: 'sdk:deepseek',
        endpointId: 'deepseek',
        model: 'deepseek-v4-flash',
        modelTier: 'default'
      })
    ).toEqual({
      track: 'sdk_agent',
      runtimeId: 'sdk:deepseek',
      endpointId: 'deepseek',
      model: 'deepseek-v4-flash',
      modelTier: 'default'
    });
  });
});
