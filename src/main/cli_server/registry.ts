import type { CliRequest, CliResponse } from '@shared/cli_protocol';
import { toCliServerError } from './errors';

export type CliHandler = (params: unknown) => Promise<unknown> | unknown;

export class CliHandlerRegistry {
  private readonly handlers = new Map<string, CliHandler>();

  register(method: string, handler: CliHandler): void {
    this.handlers.set(method, handler);
  }

  async handle(request: CliRequest): Promise<CliResponse> {
    const handler = this.handlers.get(request.method);
    if (!handler) {
      return {
        id: request.id,
        ok: false,
        error: { code: 'unknown_method', message: `Unknown CLI method: ${request.method}` }
      };
    }
    try {
      const data = await handler(request.params);
      return { id: request.id, ok: true, data };
    } catch (error) {
      return { id: request.id, ok: false, error: toCliServerError(error) };
    }
  }
}
