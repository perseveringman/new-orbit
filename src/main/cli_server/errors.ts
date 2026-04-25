export class CliServerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CliServerError';
    this.code = code;
  }
}

export function cliServerError(code: string, message: string): CliServerError {
  return new CliServerError(code, message);
}

export function toCliServerError(error: unknown): { code: string; message: string } {
  if (error instanceof CliServerError) return { code: error.code, message: error.message };
  if (error instanceof Error) return { code: 'handler_error', message: error.message };
  return { code: 'handler_error', message: String(error) };
}
