import type { PaneKind } from './types';

export interface PaneRenderer<TData = unknown> {
  kind: PaneKind;
  defaultData?: () => TData;
  defaultTitle?: (data: TData) => string;
}

type StoredPaneRenderer = PaneRenderer<unknown>;

const registry = new Map<PaneKind, StoredPaneRenderer>();

export function registerPane<T>(renderer: PaneRenderer<T>): void {
  registry.set(renderer.kind, renderer as unknown as StoredPaneRenderer);
}

export function getPane(kind: PaneKind): PaneRenderer | undefined {
  return registry.get(kind);
}

export function listPanes(): PaneRenderer[] {
  return [...registry.values()];
}

export function _resetRegistry(): void {
  registry.clear();
}
