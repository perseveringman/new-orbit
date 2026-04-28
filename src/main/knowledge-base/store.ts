import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  ActivateKnowledgeBaseInput,
  ImportKnowledgeBaseInput,
  KnowledgeBase,
  KnowledgeBaseActivationRecord,
  KnowledgeBaseSearchHit,
  OnboardingStatus,
  WelcomeAnalysisResult
} from '@shared/knowledge-base';
import type { Note } from '@shared/note';
import { assertInsideVault, toPosix } from '../pathGuard';
import { createNoteStore } from '../note/store';

interface RegistryFile {
  kbs: KnowledgeBase[];
  welcome_analysis?: WelcomeAnalysisResult;
  skipped?: boolean;
}

const KB_ROOT = 'knowledge-base';
const KB_META = '.orbit-kb-meta';

export class KnowledgeBaseStore {
  constructor(private readonly vaultPath: string) {}

  async list(): Promise<KnowledgeBase[]> {
    return (await this.readRegistry()).kbs;
  }

  async import(input: ImportKnowledgeBaseInput): Promise<KnowledgeBase> {
    const now = new Date().toISOString();
    const targetRel = await this.nextTargetPath(input.name);
    const targetAbs = path.join(this.vaultPath, targetRel);
    await fs.mkdir(path.dirname(targetAbs), { recursive: true });
    await fs.cp(input.sourcePath, targetAbs, { recursive: true });
    const kb: KnowledgeBase = {
      id: `kb-${randomUUID()}`,
      name: input.name.trim() || path.basename(input.sourcePath),
      path: targetRel,
      source_type: input.sourceType,
      imported_at: now,
      last_scanned_at: now,
      writable: input.writable ?? true,
      index_status: 'ready',
      item_count: await countMarkdown(targetAbs),
      welcome_analysis_done: false
    };
    const registry = await this.readRegistry();
    registry.kbs.push(kb);
    await this.writeRegistry(registry);
    return kb;
  }

  async remove(kbId: string, deleteFiles = false): Promise<void> {
    const registry = await this.readRegistry();
    const kb = registry.kbs.find((item) => item.id === kbId);
    if (!kb) throw new Error(`knowledge base not found: ${kbId}`);
    registry.kbs = registry.kbs.filter((item) => item.id !== kbId);
    await this.writeRegistry(registry);
    if (deleteFiles) await fs.rm(path.join(this.vaultPath, kb.path), { recursive: true, force: true });
  }

  async rescan(kbId: string): Promise<KnowledgeBase> {
    const registry = await this.readRegistry();
    const kb = registry.kbs.find((item) => item.id === kbId);
    if (!kb) throw new Error(`knowledge base not found: ${kbId}`);
    const next: KnowledgeBase = {
      ...kb,
      last_scanned_at: new Date().toISOString(),
      index_status: 'ready',
      item_count: await countMarkdown(path.join(this.vaultPath, kb.path))
    };
    registry.kbs = registry.kbs.map((item) => (item.id === kbId ? next : item));
    await this.writeRegistry(registry);
    return next;
  }

  async search(kbId: string | 'all', query: string): Promise<KnowledgeBaseSearchHit[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const targets = (await this.list()).filter((kb) => kbId === 'all' || kb.id === kbId);
    const hits: KnowledgeBaseSearchHit[] = [];
    for (const kb of targets) {
      const root = path.join(this.vaultPath, kb.path);
      for (const file of await walkMarkdown(root)) {
        const raw = await fs.readFile(file, 'utf8');
        const lower = raw.toLowerCase();
        const idx = lower.indexOf(q);
        if (idx < 0 && !path.basename(file).toLowerCase().includes(q)) continue;
        const excerptStart = Math.max(0, idx - 80);
        hits.push({
          kbId: kb.id,
          path: toPosix(path.relative(this.vaultPath, file)),
          title: titleFromMarkdown(raw, file),
          excerpt: raw.slice(excerptStart, excerptStart + 220).replace(/\s+/g, ' ').trim(),
          score: idx >= 0 ? 2 : 1
        });
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, 50);
  }

  async activate(input: ActivateKnowledgeBaseInput): Promise<Note> {
    const kb = (await this.list()).find((item) => item.id === input.kbId);
    if (!kb) throw new Error(`knowledge base not found: ${input.kbId}`);
    const sourceAbs = assertInsideVault(this.vaultPath, input.sourceFile);
    const sourceRel = toPosix(path.relative(this.vaultPath, sourceAbs));
    if (!sourceRel.startsWith(`${kb.path}/`)) throw new Error(`source file is not inside knowledge base: ${input.sourceFile}`);
    const note = await createNoteStore(this.vaultPath).create({
      type: input.targetType ?? 'capture',
      title: titleFromMarkdown(input.userText || input.excerpt, sourceRel),
      body: [input.userText?.trim(), input.excerpt.trim()].filter(Boolean).join('\n\n> '),
      source: {
        kind: 'kb',
        ref: `${kb.id}/${sourceRel.slice(kb.path.length + 1)}`,
        excerpt: input.excerpt
      }
    });
    await this.appendActivation({
      id: `activation-${randomUUID()}`,
      at: new Date().toISOString(),
      kb_id: input.kbId,
      source_file: sourceRel,
      source_ref: `${kb.id}/${sourceRel.slice(kb.path.length + 1)}`,
      excerpt_hash: createHash('sha1').update(input.excerpt).digest('hex'),
      note_id: note.frontmatter.id,
      note_path: note.path
    });
    return note;
  }

  async status(): Promise<OnboardingStatus> {
    const registry = await this.readRegistry();
    const hasKnowledgeBase = registry.kbs.length > 0;
    const welcomeAnalysisDone = Boolean(registry.welcome_analysis || registry.skipped);
    return {
      hasKnowledgeBase,
      welcomeAnalysisDone,
      nextStep: !hasKnowledgeBase ? 'import_kb' : welcomeAnalysisDone ? 'ready' : 'welcome_analysis'
    };
  }

  async skipOnboarding(): Promise<void> {
    const registry = await this.readRegistry();
    registry.skipped = true;
    await this.writeRegistry(registry);
  }

  async runWelcomeAnalysis(kbIds: string[]): Promise<WelcomeAnalysisResult> {
    const kbs = (await this.list()).filter((kb) => kbIds.includes(kb.id));
    const sampleHits = await Promise.all(
      kbs.map((kb) => this.search(kb.id, '').catch(() => [] as KnowledgeBaseSearchHit[]))
    );
    const titles = kbs.map((kb) => kb.name);
    const result: WelcomeAnalysisResult = {
      generated_at: new Date().toISOString(),
      kb_ids: kbs.map((kb) => kb.id),
      headline: titles.length ? `Imported ${titles.join(', ')}` : 'Knowledge base is ready',
      summary:
        kbs.length === 0
          ? 'No imported knowledge base was selected. You can import one later.'
          : `Orbit found ${kbs.reduce((sum, kb) => sum + kb.item_count, 0)} markdown files across ${kbs.length} knowledge base(s).`,
      suggested_resources: kbs.slice(0, 5).map((kb, index) => ({
        title: kb.name,
        reason: `A reusable topic can emerge from ${kb.item_count} imported notes.`,
        source_refs: sampleHits[index]?.slice(0, 3).map((hit) => hit.path) ?? []
      })),
      suggested_areas: [],
      suggested_projects: []
    };
    const registry = await this.readRegistry();
    registry.welcome_analysis = result;
    registry.kbs = registry.kbs.map((kb) =>
      kbIds.includes(kb.id) ? { ...kb, welcome_analysis_done: true } : kb
    );
    await this.writeRegistry(registry);
    return result;
  }

  async applySuggestions(result: WelcomeAnalysisResult): Promise<void> {
    const registry = await this.readRegistry();
    registry.welcome_analysis = result;
    await this.writeRegistry(registry);
  }

  private registryPath(): string {
    return path.join(this.vaultPath, KB_ROOT, KB_META, 'registry.json');
  }

  private async readRegistry(): Promise<RegistryFile> {
    try {
      return JSON.parse(await fs.readFile(this.registryPath(), 'utf8')) as RegistryFile;
    } catch (error) {
      if (!isNotFound(error)) throw error;
      return { kbs: [] };
    }
  }

  private async writeRegistry(registry: RegistryFile): Promise<void> {
    await fs.mkdir(path.dirname(this.registryPath()), { recursive: true });
    await fs.writeFile(this.registryPath(), `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  }

  private async nextTargetPath(name: string): Promise<string> {
    const base = slugify(name || 'knowledge-base');
    let rel = path.posix.join(KB_ROOT, base);
    let index = 1;
    while (await exists(path.join(this.vaultPath, rel))) {
      index += 1;
      rel = path.posix.join(KB_ROOT, `${base}-${index}`);
    }
    return rel;
  }

  private async appendActivation(record: KnowledgeBaseActivationRecord): Promise<void> {
    const file = this.activationAnnotationPath(record.kb_id, record.source_file);
    let current: { activations: KnowledgeBaseActivationRecord[] } = { activations: [] };
    try {
      current = JSON.parse(await fs.readFile(file, 'utf8')) as { activations: KnowledgeBaseActivationRecord[] };
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    current.activations.push(record);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  }

  private activationAnnotationPath(kbId: string, sourceFile: string): string {
    const digest = createHash('sha1').update(sourceFile).digest('hex');
    return path.join(this.vaultPath, KB_ROOT, KB_META, 'annotations', kbId, `${digest}.json`);
  }
}

export function createKnowledgeBaseStore(vaultPath: string): KnowledgeBaseStore {
  return new KnowledgeBaseStore(vaultPath);
}

async function walkMarkdown(root: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const next = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await walkMarkdown(next)));
    else if (entry.isFile() && /\.(md|markdown|mdx)$/i.test(entry.name)) files.push(next);
  }
  return files;
}

async function countMarkdown(root: string): Promise<number> {
  return (await walkMarkdown(root)).length;
}

function titleFromMarkdown(raw: string, fallback: string): string {
  return raw.match(/^#\s+(.+)$/m)?.[1]?.trim().slice(0, 80) || path.basename(fallback).replace(/\.[^.]+$/, '');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'kb';
}

async function exists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(
    () => true,
    () => false
  );
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
