import { promises as fs } from 'node:fs';
import path from 'node:path';
import { shell } from 'electron';
import type {
  ConnectConnectorInput,
  ConnectorConnection,
  ConnectorDocument,
  ConnectorDocumentContent,
  ConnectorOpenInput,
  ConnectorSearchHit
} from '@shared/connectors';
import type { ConnectorPlugin } from './plugin';

export function createObsidianConnectorPlugin(): ConnectorPlugin {
  return {
    definition: {
      id: 'obsidian',
      display_name: 'Obsidian',
      description: '连接本地 Obsidian vault，让 AI 可检索与引用外部 Markdown 笔记。',
      category: 'knowledge',
      capabilities: ['list', 'read', 'search', 'index', 'open_original'],
      built_in: true,
      config_schema: [
        {
          key: 'root_path',
          label: 'Vault 目录',
          type: 'directory',
          required: true,
          description: 'Obsidian vault 所在的本地文件夹。'
        }
      ]
    },

    async normalizeConfig(input: ConnectConnectorInput['config']): Promise<Record<string, unknown>> {
      const rootPath = stringValue(input['root_path'] ?? input['path']);
      if (!rootPath) throw new Error('obsidian_root_path_required');
      const resolved = path.resolve(rootPath);
      const stat = await fs.stat(resolved).catch(() => null);
      if (!stat?.isDirectory()) throw new Error('obsidian_root_path_must_be_directory');
      return { root_path: resolved };
    },

    listDocuments: listObsidianDocuments,

    readDocument: readObsidianDocument,

    async search(connection: ConnectorConnection, query: string, limit: number): Promise<ConnectorSearchHit[]> {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const root = rootPath(connection);
      const docs = await listObsidianDocuments(connection);
      const hits: ConnectorSearchHit[] = [];
      for (const doc of docs) {
        const content = await fs.readFile(resolveDocPath(root, doc.doc_ref), 'utf8').catch(() => '');
        const lower = `${doc.title}\n${content}`.toLowerCase();
        const idx = lower.indexOf(q);
        if (idx < 0) continue;
        hits.push({
          connection_id: connection.id,
          connector_id: connection.connector_id,
          doc_ref: doc.doc_ref,
          title: doc.title,
          excerpt: excerpt(content, Math.max(0, idx - doc.title.length - 1)),
          score: doc.title.toLowerCase().includes(q) ? 2 : 1,
          updated_at: doc.updated_at,
          metadata: doc.metadata
        });
      }
      return hits.sort((a, b) => b.score - a.score || b.updated_at.localeCompare(a.updated_at)).slice(0, limit);
    },

    async openDocument(connection: ConnectorConnection, input: ConnectorOpenInput): Promise<void> {
      await shell.openPath(resolveDocPath(rootPath(connection), input.doc_ref));
    }
  };
}

async function listObsidianDocuments(connection: ConnectorConnection): Promise<ConnectorDocument[]> {
  const root = rootPath(connection);
  const files = await walkMarkdown(root);
  const docs = await Promise.all(files.map((file) => documentForFile(connection, root, file)));
  return docs.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.title.localeCompare(b.title));
}

async function readObsidianDocument(
  connection: ConnectorConnection,
  docRef: string
): Promise<ConnectorDocumentContent | null> {
  const root = rootPath(connection);
  const file = resolveDocPath(root, docRef);
  const raw = await fs.readFile(file, 'utf8').catch(() => null);
  if (raw === null) return null;
  return {
    document: await documentForFile(connection, root, file, raw),
    content_markdown: raw
  };
}

function rootPath(connection: ConnectorConnection): string {
  const value = stringValue(connection.config['root_path']);
  if (!value) throw new Error(`connector_missing_root_path:${connection.id}`);
  return value;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function walkMarkdown(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (shouldSkipEntry(entry.name)) continue;
    const abs = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await walkMarkdown(abs)));
    else if (entry.isFile() && /\.(md|markdown|mdx)$/i.test(entry.name)) files.push(abs);
  }
  return files;
}

function shouldSkipEntry(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules' || name === 'tmp' || name === 'temp';
}

async function documentForFile(
  connection: ConnectorConnection,
  root: string,
  file: string,
  raw?: string
): Promise<ConnectorDocument> {
  const [stat, content] = await Promise.all([
    fs.stat(file),
    raw === undefined ? fs.readFile(file, 'utf8').catch(() => '') : Promise.resolve(raw)
  ]);
  const docRef = toPosix(path.relative(root, file));
  return {
    connection_id: connection.id,
    connector_id: connection.connector_id,
    doc_ref: docRef,
    title: titleFromMarkdown(content, docRef),
    canonical_ref: `obsidian:${connection.id}:${docRef}`,
    updated_at: stat.mtime.toISOString(),
    fingerprint: {
      algorithm: 'mtime-size',
      value: `${stat.mtimeMs}:${stat.size}`,
      size_bytes: stat.size,
      mtime: stat.mtime.toISOString()
    },
    excerpt: excerpt(content),
    metadata: {
      path: file,
      vault_path: root,
      relative_path: docRef,
      open_uri: obsidianOpenUri(root, docRef)
    }
  };
}

function resolveDocPath(root: string, docRef: string): string {
  const target = path.resolve(root, docRef);
  const rel = path.relative(path.resolve(root), target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('connector_doc_ref_outside_root');
  return target;
}

function titleFromMarkdown(raw: string, fallback: string): string {
  const heading = raw.match(/^#\s+(.+)$/mu)?.[1]?.trim();
  return heading || path.basename(fallback, path.extname(fallback));
}

function excerpt(raw: string, start = 0, limit = 220): string {
  const text = raw.replace(/^---[\s\S]*?---\s*/u, '').replace(/\s+/gu, ' ').trim();
  return text.slice(Math.max(0, start), Math.max(0, start) + limit);
}

function obsidianOpenUri(root: string, docRef: string): string {
  const vault = path.basename(root);
  const file = docRef.replace(/\.(md|markdown|mdx)$/i, '');
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file)}`;
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
