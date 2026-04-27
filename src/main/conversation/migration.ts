/**
 * Conversation migration — Chat 解耦 D-5（P1.3）。
 *
 * 一次性把旧 task-conversations（`.orbit/orchestration/conversations/<taskUid>.json`）
 * 迁移到新 ConversationStore（`.orbit/conversations/<id>.{meta.json,ndjson}`）。
 *
 * 幂等：
 *   - 通过 anchor `task:<taskUid>` 检测是否已迁移过
 *   - 已存在则跳过
 *   - 任何错误都吞掉（仅 console.warn），避免阻塞应用启动
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { TaskConversation } from '@shared/orchestration';
import { ConversationStore } from './store';
import { vaultConversationsDir } from '../orchestration/storage';

export async function migrateLegacyTaskConversations(vaultPath: string): Promise<{
  scanned: number;
  migrated: number;
  skipped: number;
  failed: number;
}> {
  const dir = vaultConversationsDir(vaultPath);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') {
      return { scanned: 0, migrated: 0, skipped: 0, failed: 0 };
    }
    console.warn('[conversation-migration] readdir failed', err);
    return { scanned: 0, migrated: 0, skipped: 0, failed: 0 };
  }

  const store = new ConversationStore(vaultPath);
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  let scanned = 0;

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    scanned += 1;
    const taskUid = entry.slice(0, -'.json'.length);
    try {
      const raw = await fs.readFile(path.join(dir, entry), 'utf8');
      const legacy = JSON.parse(raw) as TaskConversation;
      const existing = await store.findByAnchor('task', taskUid);
      if (existing.length > 0) {
        skipped += 1;
        continue;
      }
      const id = randomUUID();
      const created = await store.create({
        id,
        anchors: [{ kind: 'task', refId: taskUid, addedAt: legacy.createdAt }],
        runtimeHint: 'claude',
        title: `Task ${legacy.taskId}`
      });
      for (const t of legacy.turns ?? []) {
        await store.appendTurn(created.id, {
          id: t.id,
          at: t.createdAt,
          role: t.role === 'user' || t.role === 'assistant' ? t.role : 'system',
          content: t.content
        });
      }
      migrated += 1;
    } catch (err) {
      console.warn(`[conversation-migration] migrate ${entry} failed`, err);
      failed += 1;
    }
  }

  if (scanned > 0) {
    console.log(
      `[conversation-migration] scanned=${scanned} migrated=${migrated} skipped=${skipped} failed=${failed}`
    );
  }
  return { scanned, migrated, skipped, failed };
}
