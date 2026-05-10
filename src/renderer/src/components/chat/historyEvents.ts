import type { Conversation, ConversationTurn } from '@shared/conversation';
import { toolTraceToRuntimeEvents } from '@shared/agent-tools';
import type { RuntimeEvent, RuntimeMessageRole } from '@shared/chat-protocol';
import type { SDKInvocationMessage } from '@shared/runtime';

export function conversationTurnsToRuntimeEvents(conv: Conversation): RuntimeEvent[] {
  const out: RuntimeEvent[] = [];
  conv.turns.forEach((turn, turnIndex) => {
    if (turn.role === 'assistant' && turn.replayMessages && turn.replayMessages.length > 0) {
      out.push(...replayMessagesToRuntimeEvents(conv.id, turn));
      return;
    }

    if (turn.role === 'assistant' && turn.toolTrace && turn.toolTrace.length > 0) {
      out.push(
        ...toolTraceToRuntimeEvents(turn.toolTrace, {
          conversationId: conv.id,
          runId: `hist-${turn.id}`,
          idPrefix: `hist-${turn.id}`
        })
      );
    }

    out.push(buildMessageEvent(conv.id, turn, turnIndex));
  });
  return out;
}

function replayMessagesToRuntimeEvents(conversationId: string, turn: ConversationTurn): RuntimeEvent[] {
  const replayMessages = turn.replayMessages;
  if (!replayMessages || replayMessages.length === 0) return [];

  const runId = `hist-${turn.id}`;
  const prefix = `hist-${turn.id}`;
  const out: RuntimeEvent[] = [];
  const toolNameById = new Map<string, string>();

  replayMessages.forEach((message, messageIndex) => {
    const role = message.role;
    if (typeof message.content === 'string') {
      const text = message.content.trim();
      if (!text) return;
      out.push(buildReplayMessageEvent(conversationId, runId, prefix, role, text, turn.at, messageIndex, 0));
      return;
    }

    const blocks = message.content;
    let textParts: string[] = [];
    let textPartIndex = 0;
    const flushText = () => {
      const text = textParts.join('');
      textParts = [];
      if (!text.trim()) return;
      out.push(
        buildReplayMessageEvent(
          conversationId,
          runId,
          prefix,
          role,
          text,
          turn.at,
          messageIndex,
          textPartIndex
        )
      );
      textPartIndex += 1;
    };

    blocks.forEach((block, blockIndex) => {
      if (block.type === 'text') {
        textParts.push(block.text);
        return;
      }

      flushText();

      if (block.type === 'thinking' && role === 'assistant') {
        const thinkingText = block.thinking.trim();
        if (!thinkingText) return;
        out.push({
          id: `${prefix}-thinking-${messageIndex}-${blockIndex}`,
          at: turn.at,
          kind: 'runtime.thinking',
          conversationId,
          runId,
          spanId: `${runId}:thinking:${messageIndex}:${blockIndex}`,
          payload: { text: thinkingText }
        });
        return;
      }

      if (block.type === 'tool_use' && role === 'assistant') {
        const spanId = block.id || `${prefix}-tool-${messageIndex}-${blockIndex}`;
        toolNameById.set(spanId, block.name);
        out.push({
          id: `${prefix}-tool-use-${spanId}`,
          at: turn.at,
          kind: 'runtime.tool_use',
          conversationId,
          runId,
          spanId,
          payload: {
            toolName: block.name,
            toolInput: block.input,
            spanId
          }
        });
        return;
      }

      if (block.type === 'tool_result') {
        out.push({
          id: `${prefix}-tool-result-${block.tool_use_id}-${messageIndex}-${blockIndex}`,
          at: turn.at,
          kind: 'runtime.tool_result',
          conversationId,
          runId,
          spanId: `${prefix}-tr-${block.tool_use_id}-${messageIndex}-${blockIndex}`,
          parentSpanId: block.tool_use_id,
          payload: {
            toolName: toolNameById.get(block.tool_use_id) ?? 'tool',
            result: block.content,
            parentSpanId: block.tool_use_id,
            ...(block.is_error ? { isError: true } : {})
          }
        });
      }
    });

    flushText();
  });

  return out;
}

function buildMessageEvent(conversationId: string, turn: ConversationTurn, turnIndex: number): RuntimeEvent {
  return {
    id: `turn-${turn.id}`,
    at: turn.at,
    kind: 'runtime.message',
    conversationId,
    runId: `hist-${turn.id}`,
    spanId: `hist-msg-${turnIndex}`,
    payload: {
      text: turn.content,
      role: turn.role === 'user' ? 'user' : 'assistant',
      isFinal: true
    }
  };
}

function buildReplayMessageEvent(
  conversationId: string,
  runId: string,
  prefix: string,
  role: SDKInvocationMessage['role'],
  text: string,
  at: string,
  messageIndex: number,
  textPartIndex: number
): RuntimeEvent<'runtime.message'> {
  const spanId = `${prefix}-msg-${messageIndex}-${textPartIndex}`;
  return {
    id: spanId,
    at,
    kind: 'runtime.message',
    conversationId,
    runId,
    spanId,
    payload: {
      text,
      role: role as RuntimeMessageRole,
      isFinal: true
    }
  };
}
