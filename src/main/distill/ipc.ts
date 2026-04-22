import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { AgentEvent } from '@shared/agent';
import { currentSession, onVaultFsEvent } from '../fs';
import { detectClaude } from '../agent/cli';
import { AgentRunner } from '../agent/runner';
import { distillProject, type DistillRunner, type DistillResult } from './distill';
import { getEmbedder } from '../vector/embed';
import type { VectorSearchHit } from '../vector/index';
import { VectorStore } from '../vector/index';
import { createIndexer, type VectorIndexer } from '../vector/indexer';
import { getInjection, WAKEUP_THRESHOLD } from './wakeup';

/** Singleton vector store + indexer, scoped to the currently open vault. */
let store: VectorStore | null = null;
let indexer: VectorIndexer | null = null;
let storeVault: string | null = null;
let unhook: (() => void) | null = null;

export async function ensureVectorStore(
  vault: string
): Promise<{ store: VectorStore; indexer: VectorIndexer }> {
  if (storeVault !== vault) {
    if (unhook) {
      unhook();
      unhook = null;
    }
    if (indexer) await indexer.dispose();
    store = new VectorStore(vault);
    await store.load();
    indexer = createIndexer(vault, store);
    storeVault = vault;
    unhook = onVaultFsEvent((ev) => {
      if (!indexer) return;
      if (!ev.path.toLowerCase().endsWith('.md')) return;
      if (ev.kind === 'unlink') indexer.removeByAbs(ev.path);
      else indexer.queue(ev.path);
    });
    // Kick off initial indexing in the background.
    void indexer.rebuildAll();
  }
  return { store: store!, indexer: indexer! };
}

export async function closeVectorStore(): Promise<void> {
  if (unhook) {
    unhook();
    unhook = null;
  }
  if (indexer) await indexer.dispose();
  indexer = null;
  store = null;
  storeVault = null;
}

export function getVectorStore(): VectorStore | null {
  return store;
}

export function getVectorIndexer(): VectorIndexer | null {
  return indexer;
}

/** Track active distill runners so we can cancel by runId. */
const activeDistillRunners = new Map<string, AgentRunner>();

/** Live runner adapter: spawns a real `claude` process. */
async function liveRunner(): Promise<DistillRunner> {
  return {
    async run(args): Promise<{ runId: string; finalText: string; events: AgentEvent[] }> {
      const detect = await detectClaude();
      if (!detect.available || !detect.path) {
        throw new Error(
          detect.error ??
            'Claude Code CLI not found. Install from https://docs.claude.com/claude-code'
        );
      }
      const runner = new AgentRunner({
        claudePath: detect.path,
        prompt: args.prompt,
        cwd: args.cwd,
        vaultPath: args.vaultPath,
        taskId: null,
        title: args.title
      });
      activeDistillRunners.set(runner.runId, runner);
      // Forward events to renderer over the standard agent channel.
      runner.on('event', (ev: AgentEvent) => {
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed()) {
            w.webContents.send(IPC.agent.event, { runId: runner.runId, event: ev });
          }
        }
      });
      await runner.start();
      await new Promise<void>((resolve) => runner.once('exit', () => resolve()));
      activeDistillRunners.delete(runner.runId);
      const snap = runner.snapshot();
      const finalText = snap.events
        .filter((e) => e.kind === 'message' || e.kind === 'text')
        .map((e) => e.text ?? '')
        .filter(Boolean)
        .join('\n');
      return { runId: runner.runId, finalText, events: snap.events };
    },
    async cancel(runId: string): Promise<void> {
      const r = activeDistillRunners.get(runId);
      if (r) await r.stop('cancelled');
    }
  };
}

let wired = false;

export function registerDistillIpc(): void {
  if (wired) return;
  wired = true;

  ipcMain.handle(
    IPC.distill.project,
    async (_e, projectUid: string): Promise<DistillResult> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault open');
      // Locate the archived file for this uid.
      const entity = sess.tasks
        .allEntities()
        .find((e) => e.uid === projectUid && e.type === 'archive');
      if (!entity) throw new Error(`no archive found for project uid ${projectUid}`);
      const runner = await liveRunner();
      return distillProject(
        { projectUid, archivedAbsPath: entity.path },
        { session: sess, runner }
      );
    }
  );

  ipcMain.handle(
    IPC.distill.cancel,
    async (_e, runId: string): Promise<void> => {
      const r = activeDistillRunners.get(runId);
      if (r) await r.stop('cancelled');
    }
  );

  ipcMain.handle(
    IPC.distill.suggest,
    async (_e, taskId: string): Promise<VectorSearchHit[]> => {
      const sess = currentSession();
      if (!sess) return [];
      const { store: s } = await ensureVectorStore(sess.vault);
      const task = sess.tasks.allTasks().find((t) => t.id === taskId);
      if (!task) return [];
      const entities = sess.tasks.allEntities();
      const proj =
        task.project_uid && entities.find((e) => e.uid === task.project_uid);
      const area = task.area_uid && entities.find((e) => e.uid === task.area_uid);
      const query = [
        task.title,
        proj ? proj.title : '',
        area ? area.title : '',
        ...(task.tags ?? [])
      ]
        .filter(Boolean)
        .join(' ');
      const vec = getEmbedder().embed(query);
      const hits = s.search(vec, 3, { kind: ['resource', 'archive'] });
      return hits.filter((h) => h.score >= WAKEUP_THRESHOLD);
    }
  );

  ipcMain.handle(IPC.distill.reindex, async (): Promise<{ count: number }> => {
    const sess = currentSession();
    if (!sess) return { count: 0 };
    const { store: s, indexer: idx } = await ensureVectorStore(sess.vault);
    s.clear();
    await s.flush();
    await idx.rebuildAll();
    return { count: s.size() };
  });

  ipcMain.handle(
    IPC.distill.experienceFor,
    async (_e, runId: string): Promise<VectorSearchHit[]> => {
      return getInjection(runId);
    }
  );
}
