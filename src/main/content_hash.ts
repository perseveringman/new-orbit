import crypto from 'node:crypto';
import * as frontmatter from './frontmatter';

/**
 * Compute a stable SHA-1 fingerprint for the *body* of a markdown file,
 * ignoring the YAML frontmatter fence. UID changes and frontmatter edits
 * do not perturb the hash — this gives us a way to re-identify a task file
 * whose UID has been stripped or whose path has changed.
 *
 * The body is normalized to LF line endings and trimmed of trailing
 * whitespace on each line before hashing so identical content authored on
 * different platforms produces identical hashes.
 */
export function contentHash(raw: string): string {
  const { body } = frontmatter.read(raw);
  const normalized = body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n+$/, '\n');
  return crypto.createHash('sha1').update(normalized, 'utf8').digest('hex');
}
