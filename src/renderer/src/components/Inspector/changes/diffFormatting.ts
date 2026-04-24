export interface PatchLine {
  n: number;
  text: string;
  kind: 'add' | 'del' | 'hunk' | 'meta' | 'ctx';
}

export function formatShortSha(sha: string): string {
  if (!sha) return '';
  return sha.length >= 7 ? sha.slice(0, 7) : sha;
}

export function classifyPatch(patch: string): PatchLine[] {
  const lines = patch.split('\n');
  return lines.map((text, i) => {
    let kind: PatchLine['kind'] = 'ctx';
    if (text.startsWith('@@')) kind = 'hunk';
    else if (
      text.startsWith('diff --git') ||
      text.startsWith('index ') ||
      text.startsWith('--- ') ||
      text.startsWith('+++ ') ||
      text.startsWith('new file mode') ||
      text.startsWith('deleted file mode') ||
      text.startsWith('similarity index') ||
      text.startsWith('rename ')
    ) {
      kind = 'meta';
    } else if (text.startsWith('+')) kind = 'add';
    else if (text.startsWith('-')) kind = 'del';
    return { n: i + 1, text, kind };
  });
}
