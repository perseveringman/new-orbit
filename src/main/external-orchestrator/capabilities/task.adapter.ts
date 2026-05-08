import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { TaskRecord } from '@shared/schemas';
import { walkMarkdown } from '../../walk';
import { tasksOfFile } from '../../tasks';
import type { ExternalCapabilityContext } from '../capability-registry';
import { stringParam, throwIfAborted, type MessageSubmitRequest } from './helpers';
import type { ExternalGatewayOutboundEvent } from '@shared/external-gateway-protocol';
import type { ExternalGatewayRouteDecision } from '@shared/external-gateway';

export async function* handleTaskQuery(
  request: MessageSubmitRequest,
  decision: ExternalGatewayRouteDecision,
  context: ExternalCapabilityContext,
  signal: AbortSignal
): AsyncGenerator<ExternalGatewayOutboundEvent> {
  const query = stringParam(decision.params, 'query')?.toLowerCase() ?? '';
  const tasks: TaskRecord[] = [];
  for await (const abs of walkMarkdown(context.vaultPath)) {
    throwIfAborted(signal);
    const rel = path.relative(context.vaultPath, abs).replace(/\\/g, '/');
    const content = await fs.readFile(abs, 'utf8');
    tasks.push(...tasksOfFile(abs, rel, content));
  }
  const matches = tasks
    .filter((task) => !query || task.title.toLowerCase().includes(query) || task.status.includes(query))
    .filter((task) => task.status !== 'done')
    .slice(0, 10);
  const text = matches.length
    ? matches.map((task, index) => `${index + 1}. [${task.status}] ${task.title}`).join('\n')
    : 'No matching open tasks.';
  yield { type: 'text.delta', requestId: request.requestId, text };
  for (const task of matches.slice(0, 3)) {
    yield {
      type: 'artifact',
      requestId: request.requestId,
      kind: 'task',
      ref: task.uid ?? task.id,
      preview: { title: task.title, status: task.status, path: task.relPath }
    };
  }
  yield { type: 'request.completed', requestId: request.requestId, summary: `Found ${matches.length} open task(s).` };
}

