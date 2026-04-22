import { z } from 'zod';

/**
 * Slugify a human-provided project name into a kebab-case, ASCII-safe slug
 * that matches the server-side `SLUG_RE`. Non-ASCII characters are dropped
 * (instead of transliterated) because we cannot guess a good romanization
 * without a runtime dependency.
 */
export function slugify(input: string): string {
  const ascii = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const collapsed = ascii.replace(/-{2,}/g, '-');
  return collapsed.slice(0, 64).replace(/^-+|-+$/g, '');
}

export function isValidSlug(slug: string): boolean {
  if (!slug) return false;
  if (slug.length > 64) return false;
  if (slug.includes('--')) return false;
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug);
}

export function slugConflicts(slug: string, existing: readonly string[]): boolean {
  return existing.includes(slug);
}

export const NewProjectForm = z.object({
  name: z.string().trim().min(1, 'name is required').max(80),
  description: z.string().max(2000).optional().default(''),
  template: z.string().min(1),
  slug: z.string().refine(isValidSlug, 'slug must be kebab-case lowercase ASCII'),
  area_uid: z.string().optional(),
  tags: z.array(z.string().min(1).max(32)).max(12).optional()
});
export type NewProjectForm = z.infer<typeof NewProjectForm>;
