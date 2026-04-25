import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CreateThoughtInput, LinkThoughtInput, PromoteResult, PromoteThoughtInput, UpdateThoughtInput } from '@shared/capture';
import type { InboxItem, ThoughtPayload } from '@shared/inbox';
import { emitActivity, type ActivityEventInput } from '../../activity';
import { createInboxStore } from '../../inbox';
import { captureId, escapeMarkdown, safeVaultRelativePath, slugify, truncateText, writeTextFile } from '../common';

export interface ThoughtServiceOptions {
  now?: () => Date;
  emitActivity?: (input: ActivityEventInput) => unknown;
}

export class ThoughtService {
  private readonly now: () => Date;
  private readonly activity: (input: ActivityEventInput) => unknown;

  constructor(private readonly vaultPath: string, options: ThoughtServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.activity = options.emitActivity ?? emitActivity;
  }

  async create(input: CreateThoughtInput): Promise<InboxItem> {
    const actor = input.actor ?? (input.createdFrom === 'agent' ? 'agent' : 'user');
    const id = captureId('thought');
    const at = this.now().toISOString();
    const content = input.content.trim();
    if (!content) throw new Error('thought content is required');
    const tags = normalizeTags(input.tags ?? []);
    const item: InboxItem = {
      id,
      category: 'capture',
      subtype: 'thought',
      title: truncateText(content.split(/\r?\n/)[0] ?? 'Thought', 80) || 'Thought',
      summary: truncateText(content, 160),
      context: {
        thought_id: id,
        ...(input.actorId ? { actor_id: input.actorId } : {})
      },
      payload: {
        content,
        tags,
        created_from: input.createdFrom ?? (actor === 'agent' ? 'agent' : 'manual')
      },
      status: 'pending',
      created_at: at,
      updated_at: at
    };
    const stored = await createInboxStore(this.vaultPath).add(item);
    this.activity({
      actor,
      ...(input.actorId ? { actor_id: input.actorId } : {}),
      action: 'thought.created',
      context: { inbox_item_id: stored.id, thought_id: stored.id },
      payload: { tags, created_from: (stored.payload as ThoughtPayload).created_from },
      summary: `Created Thought: ${stored.title}`
    });
    return stored;
  }

  async list(): Promise<InboxItem[]> {
    const result = await createInboxStore(this.vaultPath).list({ category: 'capture', subtype: 'thought' });
    return result.items;
  }

  async get(id: string): Promise<InboxItem | null> {
    const item = await createInboxStore(this.vaultPath).get(id);
    return item?.subtype === 'thought' ? item : null;
  }

  async update(id: string, input: UpdateThoughtInput): Promise<InboxItem> {
    const store = createInboxStore(this.vaultPath);
    const item = await this.requireThought(id);
    const payload = item.payload as ThoughtPayload;
    const content = input.content?.trim() ?? payload.content;
    const tags = input.tags ? normalizeTags(input.tags) : payload.tags;
    const at = this.now().toISOString();
    const next: InboxItem = {
      ...item,
      title: truncateText(content.split(/\r?\n/)[0] ?? item.title, 80) || item.title,
      summary: truncateText(content, 160),
      updated_at: at,
      payload: { ...payload, content, tags }
    };
    return store.update(id, next);
  }

  async promote(id: string, input: PromoteThoughtInput = {}): Promise<PromoteResult> {
    const store = createInboxStore(this.vaultPath);
    const item = await this.requireThought(id);
    const payload = item.payload as ThoughtPayload;
    const at = this.now().toISOString();
    const relPath = safeVaultRelativePath(
      input.targetPath ?? '',
      '03_Resources',
      `${slugify(item.title)}.md`
    );
    const resourcePath = path.join(this.vaultPath, relPath);
    await writeTextFile(
      resourcePath,
      `---\ntype: resource\ntitle: ${JSON.stringify(item.title)}\nsource_thought_id: ${item.id}\npromoted_at: ${at}\ntags: ${JSON.stringify(payload.tags)}\n---\n\n# ${escapeMarkdown(item.title)}\n\n${payload.content.trim()}\n`
    );
    const processed: InboxItem = {
      ...item,
      status: 'processed',
      updated_at: at,
      resolved_at: at,
      resolved_by: input.actor ?? 'user',
      resolution_source: 'inbox'
    };
    const stored = await store.resolve(id, processed);
    this.activity({
      actor: input.actor ?? 'user',
      action: 'thought.promoted',
      context: { inbox_item_id: stored.id, thought_id: stored.id, resource_uid: relPath },
      payload: { resourcePath: relPath },
      summary: `Promoted Thought to Resource: ${stored.title}`
    });
    return { item: stored, resourcePath };
  }

  async link(id: string, input: LinkThoughtInput): Promise<InboxItem> {
    const item = await this.requireThought(id);
    const payload = item.payload as ThoughtPayload;
    const section = `\n\n## Inspiration\n\n- ${this.now().toISOString()} — ${payload.content.replace(/\s+/g, ' ').trim()}\n`;
    await fs.mkdir(path.dirname(input.projectReadmePath), { recursive: true });
    await fs.appendFile(input.projectReadmePath, section, 'utf8');
    return item;
  }

  async dismiss(id: string, actor: 'user' | 'agent' = 'user'): Promise<InboxItem> {
    const store = createInboxStore(this.vaultPath);
    const item = await this.requireThought(id);
    const at = this.now().toISOString();
    const dismissed: InboxItem = {
      ...item,
      status: 'dismissed',
      updated_at: at,
      resolved_at: at,
      resolved_by: actor,
      resolution_source: 'inbox'
    };
    const stored = await store.dismiss(id, dismissed);
    this.activity({
      actor,
      action: 'thought.dismissed',
      context: { inbox_item_id: stored.id, thought_id: stored.id },
      payload: { title: stored.title },
      summary: `Dismissed Thought: ${stored.title}`
    });
    return stored;
  }

  private async requireThought(id: string): Promise<InboxItem> {
    const item = await this.get(id);
    if (!item) throw new Error(`thought not found: ${id}`);
    return item;
  }
}

export function createThoughtService(vaultPath: string, options?: ThoughtServiceOptions): ThoughtService {
  return new ThoughtService(vaultPath, options);
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean))];
}
