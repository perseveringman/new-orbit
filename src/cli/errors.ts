import type { CliErrorPayload } from '@shared/cli_protocol';

export const EXIT_SUCCESS = 0;
export const EXIT_BUSINESS_ERROR = 1;
export const EXIT_USAGE = 2;
export const EXIT_CONNECTION = 3;

export type CliExitCode =
  | typeof EXIT_SUCCESS
  | typeof EXIT_BUSINESS_ERROR
  | typeof EXIT_USAGE
  | typeof EXIT_CONNECTION;

export class CliError extends Error {
  readonly code: string;
  readonly exitCode: CliExitCode;

  constructor(code: string, message: string, exitCode: CliExitCode) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function usageError(message: string, code = 'usage_error'): CliError {
  return new CliError(code, message, EXIT_USAGE);
}

export function businessError(message: string, code = 'business_error'): CliError {
  return new CliError(code, message, EXIT_BUSINESS_ERROR);
}

export function unavailableError(message: string): CliError {
  return businessError(message, 'unavailable');
}

export function connectionError(
  message = 'Orbit main process not running. Please open Orbit first.'
): CliError {
  return new CliError('main_process_unavailable', message, EXIT_CONNECTION);
}

export function serverError(code: string, message: string): CliError {
  if (code === 'invalid_params' || code === 'unknown_method' || code === 'invalid_request') {
    return new CliError(code, message, EXIT_USAGE);
  }
  if (code === 'unavailable') return unavailableError(message);
  return businessError(message, code);
}

export function normalizeCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof Error) return businessError(error.message);
  return businessError(String(error));
}

export function errorPayload(error: unknown): CliErrorPayload {
  const normalized = normalizeCliError(error);
  return { code: normalized.code, message: normalized.message };
}
