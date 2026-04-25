export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
