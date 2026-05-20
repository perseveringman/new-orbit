import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getDashboardLayout,
  normalizeDashboardLayout,
  resetDashboardLayout,
  saveDashboardLayout
} from '../src/main/dashboard/layout';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'orbit-dashboard-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('dashboard widget layout', () => {
  it('falls back to the strategic default when no layout has been saved', async () => {
    const layout = await getDashboardLayout(tmp);

    expect(layout.version).toBe(1);
    expect(layout.preset).toBe('strategic');
    expect(layout.widgets.some((widget) => widget.widgetId === 'feed-radar')).toBe(true);
    expect(layout.widgets.every((widget, index) => widget.order === index)).toBe(true);
  });

  it('normalizes unknown widgets, duplicates and invalid sizes', () => {
    const layout = normalizeDashboardLayout({
      version: 1,
      preset: 'unexpected',
      widgets: [
        { widgetId: 'north-star', size: 'tiny', enabled: true, order: 2 },
        { widgetId: 'unknown-widget', size: 'wide', enabled: true, order: 1 },
        { widgetId: 'north-star', size: 'large', enabled: true, order: 0 },
        { widgetId: 'feed-radar', size: 'large', enabled: false, order: 3 }
      ]
    });

    expect(layout.preset).toBe('custom');
    expect(layout.widgets.map((widget) => widget.widgetId)).toEqual(['north-star', 'feed-radar']);
    expect(layout.widgets[0]).toMatchObject({
      widgetId: 'north-star',
      size: 'wide',
      enabled: true,
      order: 0
    });
    expect(layout.widgets[1]).toMatchObject({
      widgetId: 'feed-radar',
      size: 'large',
      enabled: false,
      order: 1
    });
  });

  it('persists layout as vault app state under .orbit/dashboard', async () => {
    const saved = await saveDashboardLayout(tmp, {
      version: 1,
      preset: 'custom',
      updatedAt: '2026-05-20T00:00:00.000Z',
      widgets: [
        {
          instanceId: 'library-digest:default',
          widgetId: 'library-digest',
          size: 'large',
          enabled: true,
          order: 0
        }
      ]
    });

    expect(saved.widgets).toHaveLength(1);
    const raw = await readFile(path.join(tmp, '.orbit', 'dashboard', 'layout.json'), 'utf8');
    expect(raw).toContain('"widgetId": "library-digest"');

    const reset = await resetDashboardLayout(tmp);
    expect(reset.preset).toBe('strategic');
    expect(reset.widgets.length).toBeGreaterThan(1);
  });
});
