import { describe, expect, it } from 'vitest';
import { mapAgentStreamEvent } from '../src/main/runtime/sdk/anthropic-sdk-adapter';

describe('mapAgentStreamEvent', () => {
  it('classifies tool_use content_block_start', () => {
    const out = mapAgentStreamEvent({
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'toolu_abc', name: 'orbit_search' }
    });
    expect(out).toEqual({
      index: 1,
      kind: 'block_start',
      blockType: 'tool_use',
      toolUse: { id: 'toolu_abc', name: 'orbit_search' }
    });
  });

  it('classifies text content_block_start', () => {
    const out = mapAgentStreamEvent({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text' }
    });
    expect(out).toEqual({ index: 0, kind: 'block_start', blockType: 'text' });
  });

  it('extracts text_delta', () => {
    const out = mapAgentStreamEvent({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'hello ' }
    });
    expect(out).toEqual({
      index: 0,
      kind: 'text_delta',
      blockType: 'text',
      text: 'hello '
    });
  });

  it('extracts input_json_delta', () => {
    const out = mapAgentStreamEvent({
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"que' }
    });
    expect(out).toEqual({
      index: 1,
      kind: 'input_json_delta',
      blockType: 'tool_use',
      partialJson: '{"que'
    });
  });

  it('extracts thinking and signature deltas', () => {
    expect(
      mapAgentStreamEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking' }
      })
    ).toEqual({ index: 0, kind: 'block_start', blockType: 'thinking' });

    expect(
      mapAgentStreamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: '先查项目' }
      })
    ).toEqual({
      index: 0,
      kind: 'thinking_delta',
      blockType: 'thinking',
      thinking: '先查项目'
    });

    expect(
      mapAgentStreamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'signature_delta', signature: 'sig_1' }
      })
    ).toEqual({
      index: 0,
      kind: 'signature_delta',
      blockType: 'thinking',
      signature: 'sig_1'
    });
  });

  it('catches content_block_stop', () => {
    const out = mapAgentStreamEvent({ type: 'content_block_stop', index: 1 });
    expect(out).toEqual({ index: 1, kind: 'block_stop', blockType: 'unknown' });
  });

  it('extracts message_delta stop_reason', () => {
    const out = mapAgentStreamEvent({
      type: 'message_delta',
      delta: { stop_reason: 'tool_use' }
    });
    expect(out).toEqual({
      index: -1,
      kind: 'message_delta_stop',
      blockType: 'unknown',
      stopReason: 'tool_use'
    });
  });

  it('returns null for unrelated events', () => {
    expect(mapAgentStreamEvent({ type: 'message_start', message: { id: 'msg_1' } })).toBeNull();
    expect(mapAgentStreamEvent({})).toBeNull();
    expect(mapAgentStreamEvent(null)).toBeNull();
  });
});
