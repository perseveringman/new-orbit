/**
 * ConversationStore — Conversation 持久化（D-5 Conversation 一等公民）。
 *
 * 存储布局：
 *   <vault>/.orbit/conversations/<id>.ndjson    — turns 追加日志
 *   <vault>/.orbit/conversations/<id>.meta.json — anchors + 元数据
 *
 * 参考：docs/thinking-trail/2026-04-29-chat-unification-decoupling/03-chat-runtime-protocol.md §6.1
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import type {
  Conversation,
  ConversationAnchor,
  ConversationScope,
  ConversationMeta,
  ConversationStatus,
  ConversationTurn
} from '@shared/conversation';
import { anchorToConversationScope, conversationScopeKey } from '@shared/conversation';

export function conversationsDir(vaultPath: string): string {
  return path.join(vaultPath, ORBIT_DIR, 'conversations');
}

export function conversationMetaPath(vaultPath: string, id: string): string {
  return path.join(conversationsDir(vaultPath), `${id}.meta.json`);
}

export function conversationTurnsPath(vaultPath: string, id: string): string {
  return path.join(conversationsDir(vaultPath), `${id}.ndjson`);
}

export function conversationIndexPath(vaultPath: string): string {
  return path.join(conversationsDir(vaultPath), 'index.json');
}

interface ConversationIndex {
  version: 1;
  lastActiveByScope: Record<string, string>;
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'ENOENT'
  );
}

export interface CreateConversationInput {
  id: string;
  anchors: ConversationAnchor[];
  scope?: ConversationScope;
  runtimeHint?: string;
  title?: string;
  tags?: string[];
}

export class ConversationStore {
  constructor(private readonly vaultPath: string) {}

  async create(input: CreateConversationInput): Promise<Conversation> {
    const now = new Date().toISOString();
    const meta: ConversationMeta = {
      id: input.id,
      createdAt: now,
      updatedAt: now,
      status: 'active',
      anchors: input.anchors,
      scope: input.scope ?? anchorToConversationScope(input.anchors[0] ?? { kind: 'ask_anywhere_session', refId: 'global', addedAt: now }),
      ...(input.runtimeHint ? { runtimeHint: input.runtimeHint } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.tags ? { tags: input.tags } : {})
    };
    await this.writeMeta(meta);
    await this.setLastActive(meta.scope ?? { kind: 'global' }, input.id);
    // 确保 ndjson 文件存在
    const turnsFile = conversationTurnsPath(this.vaultPath, input.id);
    await fs.mkdir(path.dirname(turnsFile), { recursive: true });
    try {
      await fs.access(turnsFile);
    } catch {
      await fs.writeFile(turnsFile, '', 'utf8');
    }
    return { ...meta, turns: [] };
  }

  async appendTurn(id: string, turn: ConversationTurn): Promise<void> {
    const file = conversationTurnsPath(this.vaultPath, id);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, `${JSON.stringify(turn)}\n`, 'utf8');
    const meta = await this.readMeta(id);
    if (meta) {
      const writtenAt = new Date().toISOString();
      meta.updatedAt = [meta.updatedAt, turn.at, writtenAt].sort().at(-1) ?? writtenAt;
      if (meta.scope) await this.setLastActive(meta.scope, id);
      await this.writeMeta(meta);
    }
  }

  async addAnchor(id: string, anchor: ConversationAnchor): Promise<void> {
    const meta = await this.readMeta(id);
    if (!meta) return;
    if (
      !meta.anchors.some((a) => a.kind === anchor.kind && a.refId === anchor.refId)
    ) {
      meta.anchors.push(anchor);
    }
    meta.updatedAt = new Date().toISOString();
    await this.writeMeta(meta);
  }

  async updateStatus(id: string, status: ConversationStatus): Promise<void> {
    const meta = await this.readMeta(id);
    if (!meta) return;
    meta.status = status;
    meta.updatedAt = new Date().toISOString();
    await this.writeMeta(meta);
  }

  async updateMeta(id: string, patch: {
    title?: string;
    summary?: string;
    tags?: string[];
    archived?: boolean;
    scope?: ConversationScope;
    status?: ConversationStatus;
  }): Promise<Conversation | null> {
    const meta = await this.readMeta(id);
    if (!meta) return null;
    const next: ConversationMeta = {
      ...meta,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    await this.writeMeta(next);
    if (next.scope && !next.archived) await this.setLastActive(next.scope, id);
    return this.get(id);
  }

  async archive(id: string): Promise<Conversation | null> {
    return this.updateMeta(id, { archived: true, status: 'ended' });
  }

  async updateRuntime(
    id: string,
    patch: {
      currentRunId?: string | null;
      runtimeHint?: string | null;
      vendorSessionId?: string | null;
    }
  ): Promise<void> {
    const meta = await this.readMeta(id);
    if (!meta) return;
    if (patch.currentRunId !== undefined) {
      if (patch.currentRunId === null) delete meta.currentRunId;
      else meta.currentRunId = patch.currentRunId;
    }
    if (patch.runtimeHint !== undefined) {
      if (patch.runtimeHint === null) delete meta.runtimeHint;
      else meta.runtimeHint = patch.runtimeHint;
    }
    if (patch.vendorSessionId !== undefined) {
      if (patch.vendorSessionId === null) delete meta.vendorSessionId;
      else meta.vendorSessionId = patch.vendorSessionId;
    }
    meta.updatedAt = new Date().toISOString();
    await this.writeMeta(meta);
  }

  async get(id: string): Promise<Conversation | null> {
    const meta = await this.readMeta(id);
    if (!meta) return null;
    const turns = await this.readTurns(id);
    return { ...meta, turns };
  }

  async list(): Promise<ConversationMeta[]> {
    const dir = conversationsDir(this.vaultPath);
    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      return [];
    }
    const metas: ConversationMeta[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.meta.json')) continue;
      const id = entry.slice(0, -'.meta.json'.length);
      const meta = await this.readMeta(id);
      if (meta) metas.push(meta);
    }
    metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return metas;
  }

  async findByAnchor(kind: string, refId: string): Promise<ConversationMeta[]> {
    const all = await this.list();
    return all.filter((m) => m.anchors.some((a) => a.kind === kind && a.refId === refId));
  }

  async lastActive(scope: ConversationScope): Promise<Conversation | null> {
    const index = await this.readIndex();
    const id = index.lastActiveByScope[conversationScopeKey(scope)];
    return id ? this.get(id) : null;
  }

  async setLastActive(scope: ConversationScope, id: string): Promise<void> {
    const index = await this.readIndex();
    index.lastActiveByScope[conversationScopeKey(scope)] = id;
    await this.writeIndex(index);
  }

  private async readIndex(): Promise<ConversationIndex> {
    try {
      const parsed = JSON.parse(await fs.readFile(conversationIndexPath(this.vaultPath), 'utf8')) as Partial<ConversationIndex>;
      return {
        version: 1,
        lastActiveByScope: parsed.lastActiveByScope && typeof parsed.lastActiveByScope === 'object'
          ? (parsed.lastActiveByScope as Record<string, string>)
          : {}
      };
    } catch (error) {
      if (isNotFoundError(error)) return { version: 1, lastActiveByScope: {} };
      throw error;
    }
  }

  private async writeIndex(index: ConversationIndex): Promise<void> {
    const file = conversationIndexPath(this.vaultPath);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  }

  private async readMeta(id: string): Promise<ConversationMeta | null> {
    try {
      const raw = await fs.readFile(conversationMetaPath(this.vaultPath, id), 'utf8');
      return JSON.parse(raw) as ConversationMeta;
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  private async writeMeta(meta: ConversationMeta): Promise<void> {
    const file = conversationMetaPath(this.vaultPath, meta.id);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(meta, null, 2), 'utf8');
  }

  private async readTurns(id: string): Promise<ConversationTurn[]> {
    try {
      const raw = await fs.readFile(conversationTurnsPath(this.vaultPath, id), 'utf8');
      const turns: ConversationTurn[] = [];
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        turns.push(JSON.parse(line) as ConversationTurn);
      }
      return turns;
    } catch (error) {
      if (isNotFoundError(error)) return [];
      throw error;
    }
  }
}
