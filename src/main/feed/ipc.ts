import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  CreateFeedSourceInput,
  FeedChangeEvent,
  FeedAiSubtitleTranslationInput,
  FeedItemFilter,
  SaveFeedToLibraryInput,
  UpdateFeedSourceInput
} from '@shared/feed';
import { publishTraceableEvent } from '../events/bus';
import { getSDKRuntime } from '../runtime/sdk/ipc';
import { onFeedChange } from './events';
import { createFeedStore } from './store';
import { getFeedTaskCenter } from './task-center';

let feedEventBroadcastRegistered = false;

export function registerFeedIpc(getVaultPath: () => string | null): void {
  ensureFeedEventBroadcast();

  const vaultPath = (): string => {
    const value = getVaultPath();
    if (!value) throw new Error('no vault open');
    return value;
  };
  const feedStore = () => {
    const vault = vaultPath();
    return createFeedStore(vault, { synthesisRouter: getSDKRuntime(vault).router });
  };

  ipcMain.handle(IPC.feeds.sourcesList, () => feedStore().listSources());
  ipcMain.handle(IPC.feeds.sourcesCreate, async (_event, input: CreateFeedSourceInput) => {
    const source = await feedStore().createSource(input);
    if (source.enabled) {
      await getFeedTaskCenter(vaultPath()).enqueueRefresh({
        source_id: source.id,
        kind: 'source.initial_fetch',
        priority: 'background'
      });
    }
    publishTraceableEvent({
      source: 'activity',
      kind: 'feed.source.added',
      summary: `Added Feed source: ${source.title}`,
      payload: { source_id: source.id, title: source.title, url: source.url }
    });
    return source;
  });
  ipcMain.handle(IPC.feeds.sourcesUpdate, async (_event, id: string, patch: UpdateFeedSourceInput) => {
    const source = await feedStore().updateSource(id, patch);
    if (patch.enabled === true) {
      await getFeedTaskCenter(vaultPath()).enqueueRefresh({
        source_id: source.id,
        kind: 'source.refresh',
        priority: 'background'
      });
    }
    return source;
  });
  ipcMain.handle(IPC.feeds.sourcesDelete, async (_event, id: string) => {
    const source = await feedStore().deleteSource(id);
    if (source) {
      await getFeedTaskCenter(vaultPath()).cancelSource(source.id);
      publishTraceableEvent({
        source: 'activity',
        kind: 'feed.source.removed',
        summary: `Removed Feed source: ${source.title}`,
        payload: { source_id: source.id, title: source.title, url: source.url }
      });
    }
    return source;
  });
  ipcMain.handle(IPC.feeds.fetch, async (_event, sourceId?: string) => {
    const results = await feedStore().fetch(sourceId);
    for (const result of results) {
      publishTraceableEvent({
        source: 'activity',
        kind: 'feed.items.fetched',
        summary: `Fetched ${result.created}/${result.fetched} Feed items`,
        payload: { source_id: result.source_id, fetched: result.fetched, created: result.created }
      });
    }
    return results;
  });
  ipcMain.handle(IPC.feeds.tasksList, () => getFeedTaskCenter(vaultPath()).list());
  ipcMain.handle(IPC.feeds.tasksEnqueue, (_event, input = {}) => getFeedTaskCenter(vaultPath()).enqueueRefresh(input));
  ipcMain.handle(IPC.feeds.tasksCancel, (_event, jobId: string) => getFeedTaskCenter(vaultPath()).cancel(jobId));
  ipcMain.handle(IPC.feeds.tasksRetry, (_event, jobId: string) => getFeedTaskCenter(vaultPath()).retry(jobId));
  ipcMain.handle(IPC.feeds.runsList, (_event, sourceId?: string) => feedStore().listFetchRuns(sourceId));
  ipcMain.handle(IPC.feeds.itemsList, (_event, filter?: FeedItemFilter) => feedStore().listItems(filter));
  ipcMain.handle(IPC.feeds.itemsContent, (_event, id: string) => feedStore().getItemContent(id));
  ipcMain.handle(IPC.feeds.itemsMarkSeen, async (_event, id: string) => {
    const item = await feedStore().markSeen(id);
    publishTraceableEvent({
      source: 'activity',
      kind: 'feed.item.seen',
      summary: `Seen Feed item: ${item.title}`,
      payload: { item_id: item.id, source_id: item.source_id, title: item.title, url: item.url }
    });
    return item;
  });
  ipcMain.handle(IPC.feeds.itemsIgnore, async (_event, id: string) => {
    const item = await feedStore().ignore(id);
    publishTraceableEvent({
      source: 'activity',
      kind: 'feed.item.ignored',
      summary: `Ignored Feed item: ${item.title}`,
      payload: { item_id: item.id, source_id: item.source_id, title: item.title, url: item.url }
    });
    return item;
  });
  ipcMain.handle(IPC.feeds.itemsSaveToLibrary, async (_event, id: string, input?: SaveFeedToLibraryInput) => {
    const result = await feedStore().saveToLibrary(id, input);
    publishTraceableEvent({
      source: 'activity',
      kind: 'feed.item.saved_to_library',
      summary: `Saved Feed item to Library: ${result.feed_item.title}`,
      payload: {
        item_id: result.feed_item.id,
        source_id: result.feed_item.source_id,
        library_item_id: result.library_item.frontmatter.id,
        title: result.feed_item.title,
        url: result.feed_item.url
      }
    });
    publishTraceableEvent({
      source: 'activity',
      kind: 'promote.feed_to_library',
      summary: `Promoted Feed item to Library: ${result.feed_item.title}`,
      payload: {
        item_id: result.feed_item.id,
        source_id: result.feed_item.source_id,
        library_item_id: result.library_item.frontmatter.id,
        title: result.feed_item.title,
        url: result.feed_item.url
      }
    });
    return result;
  });
  ipcMain.handle(IPC.feeds.itemsAttachAiSubtitleTranslation, async (_event, id: string, input: FeedAiSubtitleTranslationInput) => {
    const result = await feedStore().attachAiSubtitleTranslation(id, input);
    publishTraceableEvent({
      source: 'activity',
      kind: 'feed.youtube.subtitle.ai',
      summary: `Attached AI subtitle translation: ${result.feed_item.title}`,
      payload: {
        item_id: result.feed_item.id,
        source_id: result.feed_item.source_id,
        artifact_id: result.artifact.id,
        source_track_id: input.source_track_id,
        target_language: input.target_language
      }
    });
    return result;
  });
  ipcMain.handle(IPC.feeds.digest, (_event, date: string) => feedStore().digest(date));
  ipcMain.handle(IPC.feeds.cluster, (_event, scope?: string) => feedStore().cluster(scope));
  ipcMain.handle(IPC.feeds.report, (_event, date: string) => feedStore().dailyReport(date));
}

function ensureFeedEventBroadcast(): void {
  if (feedEventBroadcastRegistered) return;
  feedEventBroadcastRegistered = true;
  onFeedChange((event) => broadcast(event));
}

function broadcast(event: FeedChangeEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.feeds.event, event);
  }
}
