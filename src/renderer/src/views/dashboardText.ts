export function cleanVisionExcerpt(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .split('\n')
    .map((line) =>
      line
        .replace(/^#+\s*/, '')
        .replace(/^>\s*/, '')
        .replace(/\*\*/g, '')
        .trim()
    )
    .filter((line) => line.length > 0 && !line.startsWith('---') && !/^\(.+\)$/.test(line))
    .slice(0, 4)
    .join(' / ');
}
