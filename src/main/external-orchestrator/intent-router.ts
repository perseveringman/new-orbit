import {
  type ExternalGatewayCapability,
  type ExternalGatewayInboundRequest
} from '@shared/external-gateway-protocol';
import type { ExternalGatewayRouteDecision } from '@shared/external-gateway';

const URL_RE = /^https?:\/\/\S+$/i;

export async function routeExternalGatewayIntent(
  request: Extract<ExternalGatewayInboundRequest, { type: 'message.submit' }>
): Promise<ExternalGatewayRouteDecision> {
  const text = textFromExternalContent(request).trim();
  const lower = text.toLowerCase();
  if (request.content.kind === 'url' || URL_RE.test(text)) {
    return decision('library.save', { url: request.content.kind === 'url' ? request.content.url : text }, 1, 'URL content routes to Library.');
  }
  const command = parseCommand(text);
  if (command) return command;
  const keyword = keywordDecision(text, lower);
  if (keyword) return keyword;
  return decision('ask_anywhere', { text }, 0.55, 'Fallback to Ask-Anywhere for conversational input.');
}

export function textFromExternalContent(request: Extract<ExternalGatewayInboundRequest, { type: 'message.submit' }>): string {
  switch (request.content.kind) {
    case 'text':
      return request.content.text;
    case 'url':
      return request.content.url;
    case 'image':
      return request.content.caption ?? '';
    case 'file':
      return request.content.name;
  }
}

function parseCommand(text: string): ExternalGatewayRouteDecision | null {
  const capture = text.match(/^\/capture(?:@\w+)?\s+([\s\S]+)/i);
  if (capture?.[1]?.trim()) return decision('capture.note', { text: capture[1].trim() }, 1, 'Explicit /capture command.');
  const thought = text.match(/^\/thought(?:@\w+)?\s+([\s\S]+)/i);
  if (thought?.[1]?.trim()) return decision('capture.thought', { text: thought[1].trim() }, 1, 'Explicit /thought command.');
  const ask = text.match(/^\/ask(?:@\w+)?\s+([\s\S]+)/i);
  if (ask?.[1]?.trim()) return decision('ask_anywhere', { text: ask[1].trim() }, 1, 'Explicit /ask command.');
  if (/^\/summary(?:@\w+)?$/i.test(text)) {
    return decision('synthesis.run', { kind: 'summary.daily' }, 0.95, 'Explicit /summary command.');
  }
  const task = text.match(/^\/task(?:@\w+)?(?:\s+([\s\S]+))?$/i);
  if (task) return decision('task.query', { query: task[1]?.trim() ?? '' }, 1, 'Explicit /task command.');
  const inbox = text.match(/^\/inbox(?:@\w+)?(?:\s+([\s\S]+))?$/i);
  if (inbox) return decision('inbox.review', { query: inbox[1]?.trim() ?? '' }, 1, 'Explicit /inbox command.');
  const memory = text.match(/^\/memory(?:@\w+)?\s+([\s\S]+)/i);
  if (memory?.[1]?.trim()) return decision('memory.recall', { query: memory[1].trim() }, 1, 'Explicit /memory command.');
  const synth = text.match(/^\/synthesis(?:@\w+)?(?:\s+([\s\S]+))?$/i);
  if (synth) return decision('synthesis.run', { kind: synth[1]?.trim() || 'summary.daily' }, 0.9, 'Explicit /synthesis command.');
  const delegate = text.match(/^\/code(?:@\w+)?\s+([\s\S]+)/i);
  if (delegate?.[1]?.trim()) return decision('delegate.coding_agent', { prompt: delegate[1].trim() }, 1, 'Explicit /code delegate command.');
  if (text.startsWith('#')) return decision('capture.thought', { text: text.replace(/^#+\s*/, '') }, 0.9, 'Hash prefix routes to Thought capture.');
  return null;
}

function keywordDecision(text: string, lower: string): ExternalGatewayRouteDecision | null {
  if (/^(记一下|记住|保存一下|capture\b)/i.test(text)) {
    return decision('capture.note', { text: text.replace(/^(记一下|记住|保存一下|capture\b)\s*/i, '').trim() || text }, 0.75, 'Capture keyword matched.');
  }
  if (lower.includes('inbox') || lower.includes('审批') || lower.includes('待处理')) {
    return decision('inbox.review', { query: text }, 0.7, 'Inbox keyword matched.');
  }
  if (lower.includes('task') || lower.includes('任务')) {
    return decision('task.query', { query: text }, 0.7, 'Task keyword matched.');
  }
  if (lower.includes('memory') || lower.includes('记忆') || lower.includes('回忆')) {
    return decision('memory.recall', { query: text }, 0.7, 'Memory keyword matched.');
  }
  if (lower.includes('改代码') || lower.includes('代码') || lower.includes('bug') || lower.includes('pull request')) {
    return decision('delegate.coding_agent', { prompt: text }, 0.65, 'Coding keyword matched.');
  }
  return null;
}

function decision(
  capability: ExternalGatewayCapability,
  params: Record<string, unknown>,
  confidence: number,
  reasoning: string
): ExternalGatewayRouteDecision {
  return { capability, params, confidence, reasoning };
}

