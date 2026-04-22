interface ProjectLike {
  uid: string;
  slug: string;
  legacy: boolean;
}

interface NodeLike {
  isDir: boolean;
  relPath: string;
}

export type FileTreeActivation =
  | { kind: 'toggle-dir' }
  | { kind: 'project-room'; projectUid: string }
  | { kind: 'editor'; projectUid: string | null };

function projectUidFor(relPath: string, projects: ProjectLike[]): string | null {
  if (!relPath.startsWith('01_Projects/')) return null;
  const parts = relPath.split('/');
  if (parts.length < 2) return null;
  const slug = parts[1];
  if (!slug) return null;
  const hit = projects.find((project) => project.slug === slug && !project.legacy);
  return hit?.uid ?? null;
}

export function resolveFileTreeActivation(
  node: NodeLike,
  projects: ProjectLike[]
): FileTreeActivation {
  const uid = projectUidFor(node.relPath, projects);
  if (node.isDir) {
    return uid && node.relPath.split('/').length === 2
      ? { kind: 'project-room', projectUid: uid }
      : { kind: 'toggle-dir' };
  }

  return { kind: 'editor', projectUid: uid };
}
