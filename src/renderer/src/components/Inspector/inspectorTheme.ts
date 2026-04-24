/**
 * Semantic Tailwind class tokens for the Workspace Inspector panel.
 *
 * Each token maps to a CSS custom property defined in styles.css so that
 * light / dark themes are handled automatically via the `.dark` class on
 * the root element. The raw `neutral-*` classes are intentionally absent
 * from this file; consumers should use these semantic names instead.
 */

export const INSPECTOR_THEME = {
  // Container / surface hierarchy
  panel: 'bg-inspector-surface-0 border-inspector-border-subtle',
  tabBar: 'bg-inspector-surface-1 border-b border-inspector-border-subtle',
  body: 'bg-inspector-surface-0 text-inspector-text-primary',
  sectionHeader: 'text-inspector-text-dim text-xs font-medium uppercase tracking-wide',
  itemRow: 'hover:bg-inspector-surface-1 border-b border-inspector-border-subtle',

  // Tab states
  tabActive:
    'bg-inspector-surface-0 text-inspector-text-primary border-b-2 border-inspector-accent',
  tabInactive: 'text-inspector-text-secondary hover:text-inspector-text-primary',

  // Text hierarchy
  textPrimary: 'text-inspector-text-primary',
  textSecondary: 'text-inspector-text-secondary',
  textDim: 'text-inspector-text-dim',

  // Git status colours
  gitAdded: 'text-inspector-git-added',
  gitModified: 'text-inspector-git-modified',
  gitDeleted: 'text-inspector-git-deleted',
  gitRenamed: 'text-inspector-git-renamed',

  // Accent (active tab underline, selection highlight, etc.)
  accent: 'text-inspector-accent'
} as const;

export type InspectorThemeKey = keyof typeof INSPECTOR_THEME;
