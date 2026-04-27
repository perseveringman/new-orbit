import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  CreateResourceFromSuggestionInput,
  CreateResourceInput,
  LinkResourceRefInput,
  Resource,
  ResourceChangeEvent,
  ResourceEngagementInput,
  ResourceFilter,
  ResourceSuggestionOptions,
  UpdateResourceInput
} from '@shared/resource';
import { createResourceStore } from './store';
import { publishTraceableEvent } from '../events/bus';

export function registerResourceIpc(getVaultPath: () => string | null): void {
  const vaultPath = (): string => {
    const value = getVaultPath();
    if (!value) throw new Error('no vault open');
    return value;
  };
  const store = () => createResourceStore(vaultPath());

  ipcMain.handle(IPC.resources.list, (_event, filter?: ResourceFilter) => store().list(filter));
  ipcMain.handle(IPC.resources.get, (_event, resourceIdOrSlug: string) => store().get(resourceIdOrSlug));
  ipcMain.handle(IPC.resources.create, async (_event, input: CreateResourceInput) => {
    const resource = await store().create(input);
    publishResourceEvent('resource.created', resource, 'created');
    broadcast({ type: 'created', resource });
    return resource;
  });
  ipcMain.handle(IPC.resources.update, async (_event, resourceIdOrSlug: string, patch: UpdateResourceInput) => {
    const resource = await store().update(resourceIdOrSlug, patch);
    publishResourceEvent('resource.updated', resource, 'updated');
    broadcast({ type: 'updated', resource });
    return resource;
  });
  ipcMain.handle(IPC.resources.archive, async (_event, resourceIdOrSlug: string) => {
    const resource = await store().archive(resourceIdOrSlug);
    publishResourceEvent('resource.archived', resource, 'archived');
    broadcast({ type: 'archived', resource });
    return resource;
  });
  ipcMain.handle(IPC.resources.linkRef, async (_event, resourceIdOrSlug: string, input: LinkResourceRefInput) => {
    const resource = await store().linkRef(resourceIdOrSlug, input);
    publishResourceEvent('resource.ref.linked', resource, 'linked', {
      ref_kind: input.kind,
      ref: input.ref,
      section: input.section
    });
    broadcast({ type: 'linked', resource });
    return resource;
  });
  ipcMain.handle(IPC.resources.unlinkRef, async (_event, resourceIdOrSlug: string, refId: string) => {
    const resource = await store().unlinkRef(resourceIdOrSlug, refId);
    publishResourceEvent('resource.updated', resource, 'unlinked', { ref_id: refId });
    broadcast({ type: 'unlinked', resource });
    return resource;
  });
  ipcMain.handle(IPC.resources.engage, async (_event, resourceIdOrSlug: string, input?: ResourceEngagementInput) => {
    const engagement = await store().engage(resourceIdOrSlug, input);
    publishResourceEvent('resource.engagement', engagement.resource, 'engaged', {
      engagement_id: engagement.entry.id,
      title: engagement.entry.title
    });
    broadcast({ type: 'engaged', resource: engagement.resource });
    return engagement;
  });
  ipcMain.handle(IPC.resources.suggestFromNotes, (_event, options?: ResourceSuggestionOptions) =>
    store().suggestFromNotes(options)
  );
  ipcMain.handle(IPC.resources.createFromSuggestion, async (_event, input: CreateResourceFromSuggestionInput) => {
    const resource = await store().createFromSuggestion(input);
    publishResourceEvent('resource.created', resource, 'created', {
      source: 'suggestion',
      note_count: input.suggestion.note_count,
      tag: input.suggestion.tag
    });
    broadcast({ type: 'created', resource });
    return resource;
  });
}

function publishResourceEvent(
  kind: 'resource.created' | 'resource.updated' | 'resource.ref.linked' | 'resource.engagement' | 'resource.archived',
  resource: Resource,
  action: string,
  extra: Record<string, unknown> = {}
): void {
  publishTraceableEvent({
    source: 'activity',
    kind,
    summary: `Resource ${action}: ${resource.frontmatter.title}`,
    payload: {
      resource_id: resource.frontmatter.id,
      slug: resource.frontmatter.slug,
      title: resource.frontmatter.title,
      path: resource.path,
      status: resource.frontmatter.status,
      depth: resource.frontmatter.depth,
      engagement_count: resource.frontmatter.engagement_count,
      ...extra
    }
  });
}

function broadcast(event: ResourceChangeEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.resources.event, event);
  }
}
